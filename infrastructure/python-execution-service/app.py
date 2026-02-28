
import os
import re
import sys
import ast
import uuid
import shutil
import tempfile
import logging
import json
import subprocess
import traceback
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s'
)
logger = logging.getLogger('xmrt-python-exec')

app = Flask(__name__)
CORS(app)

# In-memory session store: session_id -> { id, work_dir, created_at, cell_count }
sessions: dict = {}

# Maximum stdout/stderr captured per execution (2 MB). Prevents memory exhaustion.
MAX_OUTPUT_BYTES = 2 * 1024 * 1024  # 2 MB

# Maximum execution timeout (seconds). Hard cap regardless of caller request.
MAX_TIMEOUT_SEC = 120

# ─────────────────────────────────────────────────────────────────────────────
# Security: Import Blocklist
# ─────────────────────────────────────────────────────────────────────────────

# Modules that are entirely forbidden in user code.
# Using AST analysis + regex double-check for defense in depth.
BLOCKED_MODULES = frozenset({
    # System access — could escape sandbox or damage the host
    'subprocess', 'multiprocessing', 'ctypes', 'cffi', 'pty',
    'signal', 'resource', 'mmap', 'sysconfig', 'distutils',
    # Network raw sockets & servers (HTTP client libs like requests are ALLOWED)
    'socket', 'ssl', 'asyncio',  # agents should use requests/httpx instead
    # Filesystem manipulation beyond working dir
    'shutil',
    # Code execution / eval tricks
    'code', 'codeop', 'compileall', 'py_compile',
    # Dangerous builtins overrides
    'builtins',
    # C extension loaders
    'importlib',
})

# Specific attribute accesses that are blocked even through allowed modules
BLOCKED_PATTERNS = [
    r'os\s*\.\s*system\s*\(',
    r'os\s*\.\s*popen\s*\(',
    r'os\s*\.\s*execv',
    r'os\s*\.\s*fork\s*\(',
    r'os\s*\.\s*spawn',
    r'os\s*\.\s*kill\s*\(',
    r'shutil\s*\.\s*rmtree',
    r'__import__\s*\(',
    r'eval\s*\(',
    r'exec\s*\(',
    r'compile\s*\(',
    r'open\s*\(.*["\']w["\']',   # open() for writing outside work dir
    r'globals\s*\(\s*\)',
    r'locals\s*\(\s*\)',
]

COMPILED_BLOCKED_PATTERNS = [re.compile(p) for p in BLOCKED_PATTERNS]


def security_check(code: str) -> tuple[bool, str]:
    """
    Performs two-pass security check on user code:
    1. AST-based import analysis (catches `import X` and `from X import Y`)
    2. Regex pattern scan for dangerous attribute access

    Returns: (is_safe: bool, reason: str)
    """
    # Pass 1: AST import analysis
    try:
        tree = ast.parse(code)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    top_module = alias.name.split('.')[0]
                    if top_module in BLOCKED_MODULES:
                        return False, f"Security: import of '{alias.name}' is not permitted"
            elif isinstance(node, ast.ImportFrom):
                top_module = (node.module or '').split('.')[0]
                if top_module in BLOCKED_MODULES:
                    return False, f"Security: 'from {node.module} import ...' is not permitted"
    except SyntaxError as e:
        # Let the interpreter report the actual syntax error; don't block it here
        logger.debug(f"AST parse failed (syntax error, letting interpreter handle): {e}")

    # Pass 2: Regex pattern scan
    for pattern in COMPILED_BLOCKED_PATTERNS:
        if pattern.search(code):
            return False, f"Security: pattern '{pattern.pattern[:60]}' is not permitted"

    return True, ""


# ─────────────────────────────────────────────────────────────────────────────
# Session Management
# ─────────────────────────────────────────────────────────────────────────────

def get_or_create_session(session_id: str) -> dict:
    """Get existing or create new session with its working directory."""
    if session_id not in sessions:
        work_dir = tempfile.mkdtemp(prefix=f"session_{session_id[:8]}_")
        sessions[session_id] = {
            "id": session_id,
            "work_dir": work_dir,
            "created_at": datetime.utcnow().isoformat(),
            "cell_count": 0,
        }
        logger.info(f"Created session {session_id[:8]}... -> {work_dir}")
    return sessions[session_id]


def cleanup_session(session_id: str):
    """Clean up a session and its working directory."""
    if session_id in sessions:
        work_dir = sessions[session_id].get("work_dir")
        if work_dir and os.path.exists(work_dir):
            shutil.rmtree(work_dir, ignore_errors=True)
        del sessions[session_id]
        logger.info(f"Cleaned up session {session_id[:8]}...")


# ─────────────────────────────────────────────────────────────────────────────
# Core Execution
# ─────────────────────────────────────────────────────────────────────────────

def run_code(
    code: str,
    stdin: str = '',
    timeout_sec: float = 30.0,
    work_dir: str | None = None,
    stateless: bool = True,
) -> dict:
    """
    Execute Python code in a subprocess with resource constraints.

    Returns: { stdout, stderr, exit_code }
    """
    own_dir = False
    if work_dir is None:
        work_dir = tempfile.mkdtemp(prefix="exec_")
        own_dir = True

    script_path = os.path.join(work_dir, f"script_{uuid.uuid4().hex[:8]}.py")
    try:
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(code)

        env = os.environ.copy()
        env['PYTHONPATH'] = work_dir + os.pathsep + env.get('PYTHONPATH', '')
        # Isolate matplotlib temp dir to work_dir
        env['MPLCONFIGDIR'] = work_dir
        env['HOME'] = work_dir  # Prevent writes to /app by libraries
        # Strip credentials from subprocess environment
        for key in ('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'):
            env.pop(key, None)

        process = subprocess.Popen(
            [sys.executable, script_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=work_dir,
            env=env,
            text=True,
        )

        try:
            stdout, stderr = process.communicate(input=stdin or '', timeout=timeout_sec)
            exit_code = process.returncode
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
            stderr = (stderr or '') + f"\n⏱️ Execution timed out after {timeout_sec}s"
            exit_code = 124

        # Enforce output size limit
        if len(stdout.encode()) > MAX_OUTPUT_BYTES:
            stdout = stdout.encode()[:MAX_OUTPUT_BYTES].decode(errors='replace')
            stdout += "\n\n⚠️ [TRUNCATED] Output exceeded 2 MB limit."
        if len(stderr.encode()) > MAX_OUTPUT_BYTES:
            stderr = stderr.encode()[:MAX_OUTPUT_BYTES].decode(errors='replace')

        return {"stdout": stdout, "stderr": stderr, "exit_code": exit_code}

    finally:
        if os.path.exists(script_path):
            os.remove(script_path)
        if own_dir and stateless:
            shutil.rmtree(work_dir, ignore_errors=True)


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint — reports status and all installed library versions."""
    lib_status = {}
    # Check every library in the curated set
    check_libs = [
        'requests', 'httpx', 'aiohttp', 'bs4', 'lxml', 'html5lib',
        'numpy', 'pandas', 'polars', 'scipy', 'pyarrow', 'orjson',
        'matplotlib', 'seaborn', 'plotly', 'kaleido',
        'sklearn', 'PIL', 'imageio', 'skimage',
        'nltk', 'reportlab', 'pypdf2', 'svgwrite',
        'openpyxl', 'xlrd', 'tabulate', 'pydantic',
    ]
    for lib in check_libs:
        try:
            mod = __import__(lib)
            lib_status[lib] = getattr(mod, '__version__', 'installed')
        except ImportError:
            lib_status[lib] = None

    return jsonify({
        "status": "ok",
        "service": "xmrt-python-execution-service",
        "version": "v4-secure",
        "python": sys.version,
        "python_version": sys.version.split()[0],
        "mode": "stateful-sessions",
        "active_sessions": len(sessions),
        "libraries": lib_status,
        "security": {
            "blocked_modules": sorted(BLOCKED_MODULES),
            "max_output_bytes": MAX_OUTPUT_BYTES,
            "max_timeout_sec": MAX_TIMEOUT_SEC,
            "runs_as_root": os.getuid() == 0,
        },
        "timestamp": datetime.utcnow().isoformat(),
    }), 200


@app.route('/session', methods=['POST'])
def create_session():
    """Create a new persistent session."""
    session_id = str(uuid.uuid4())
    session = get_or_create_session(session_id)
    return jsonify({
        "session_id": session["id"],
        "created_at": session["created_at"],
        "status": "ready",
    }), 201


@app.route('/session/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Delete a persistent session and clean up its working directory."""
    cleanup_session(session_id)
    return jsonify({"status": "deleted", "session_id": session_id}), 200


@app.route('/sessions', methods=['GET'])
def list_sessions_route():
    """List all active sessions."""
    return jsonify({
        "sessions": [
            {"id": s["id"], "created_at": s["created_at"], "cell_count": s["cell_count"]}
            for s in sessions.values()
        ],
        "count": len(sessions),
    }), 200


@app.route('/execute', methods=['POST'])
def execute():
    """
    Execute Python code. Compatible with Piston API v2 structure.

    POST body:
    {
        "language": "python",          # optional, informational
        "version": "3.11",             # optional, informational
        "files": [{"name": "main.py", "content": "<code>"}],
        "stdin": "",                   # optional stdin
        "session_id": "<id>",          # optional — enables stateful sessions
        "run_timeout": 30000           # optional ms, max 120000
    }

    Returns Piston-compatible response:
    {
        "run": { "stdout": "...", "stderr": "...", "code": 0 },
        "language": "python",
        "version": "3.11.x",
        "session_id": "<id>"
    }
    """
    exec_id = uuid.uuid4().hex[:8]
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON payload provided"}), 400

        # Extract code from Piston format or direct format
        files = data.get('files', [])
        code = ''
        if files and isinstance(files, list):
            code = files[0].get('content', '')
        if not code:
            code = data.get('code', '')
        if not code:
            return jsonify({"error": "No code provided"}), 400

        stdin = data.get('stdin', '')
        timeout_ms = data.get('run_timeout', 30000)
        timeout_sec = min(timeout_ms / 1000.0, MAX_TIMEOUT_SEC)
        session_id = data.get('session_id', None)

        logger.info(f"[{exec_id}] Execute request: {len(code)} chars, session={session_id}, timeout={timeout_sec}s")

        # ── Security check ───────────────────────────────────────────────────
        is_safe, reason = security_check(code)
        if not is_safe:
            logger.warning(f"[{exec_id}] BLOCKED: {reason}")
            return jsonify({
                "run": {
                    "stdout": "",
                    "stderr": f"🔒 Execution blocked by security policy: {reason}",
                    "code": 1,
                },
                "language": "python",
                "version": sys.version.split()[0],
                "blocked": True,
                "reason": reason,
            }), 200  # Return 200 so agents get the guidance, not a generic error

        # ── Determine working directory ──────────────────────────────────────
        if session_id:
            session = get_or_create_session(session_id)
            work_dir = session["work_dir"]
            session["cell_count"] += 1
            stateless = False
        else:
            work_dir = None
            stateless = True

        # ── Execute ──────────────────────────────────────────────────────────
        result = run_code(
            code=code,
            stdin=stdin,
            timeout_sec=timeout_sec,
            work_dir=work_dir,
            stateless=stateless,
        )

        exit_code = result["exit_code"]
        logger.info(f"[{exec_id}] Done: exit_code={exit_code}, stdout={len(result['stdout'])}b, stderr={len(result['stderr'])}b")

        return jsonify({
            "run": {
                "stdout": result["stdout"],
                "stderr": result["stderr"],
                "code": exit_code,
            },
            "language": "python",
            "version": sys.version.split()[0],
            "session_id": session_id,
            "exec_id": exec_id,
        }), 200

    except Exception as e:
        logger.error(f"[{exec_id}] Internal error: {e}\n{traceback.format_exc()}")
        return jsonify({
            "run": {
                "stdout": "",
                "stderr": f"Internal Service Error: {str(e)}",
                "code": 1,
            },
            "language": "python",
            "version": sys.version.split()[0],
        }), 500


@app.route('/packages', methods=['GET'])
def list_packages():
    """List all installed packages with versions."""
    try:
        result = subprocess.run(
            [sys.executable, '-m', 'pip', 'list', '--format=json'],
            capture_output=True, text=True, timeout=30
        )
        packages = json.loads(result.stdout) if result.returncode == 0 else []
        return jsonify({"packages": packages, "count": len(packages)}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# NOTE: The /install endpoint has been intentionally REMOVED for security.
# All libraries must be pre-installed at build time via requirements.txt.
# Dynamic package installation at runtime was a critical vulnerability.


if __name__ == "__main__":
    port = int(os.environ.get('PORT', 8080))
    app.run(debug=False, host='0.0.0.0', port=port)
