
import os
import sys
import subprocess
import traceback
import logging
import json
import uuid
import tempfile
import shutil
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# In-memory session store for Jupyter-like persistent state
# Each session has its own working directory that persists across calls
sessions = {}

# ─────────────────────────────────────────────
# Session Management
# ─────────────────────────────────────────────

def get_or_create_session(session_id: str) -> dict:
    """Get existing or create new session with its working directory."""
    if session_id not in sessions:
        work_dir = tempfile.mkdtemp(prefix=f"session_{session_id}_")
        sessions[session_id] = {
            "id": session_id,
            "work_dir": work_dir,
            "created_at": datetime.utcnow().isoformat(),
            "cell_count": 0,
        }
        logger.info(f"Created new session: {session_id} -> {work_dir}")
    return sessions[session_id]

def cleanup_session(session_id: str):
    """Clean up a session and its working directory."""
    if session_id in sessions:
        work_dir = sessions[session_id].get("work_dir")
        if work_dir and os.path.exists(work_dir):
            shutil.rmtree(work_dir, ignore_errors=True)
        del sessions[session_id]
        logger.info(f"Cleaned up session: {session_id}")

# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    available_libs = {}
    for lib in ['pandas', 'polars', 'numpy', 'scipy', 'sklearn', 'matplotlib', 'seaborn', 'bs4', 'requests', 'openpyxl']:
        try:
            __import__(lib)
            available_libs[lib] = True
        except ImportError:
            available_libs[lib] = False

    return jsonify({
        "status": "ok",
        "service": "xmrt-python-execution-service",
        "version": sys.version.split()[0],
        "python": sys.version,
        "mode": "jupyter-like",
        "active_sessions": len(sessions),
        "available_libraries": available_libs,
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
    """Delete a persistent session."""
    cleanup_session(session_id)
    return jsonify({"status": "deleted", "session_id": session_id}), 200

@app.route('/sessions', methods=['GET'])
def list_sessions():
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
        "language": "python",
        "version": "3.11",
        "files": [{"name": "main.py", "content": "<code>"}],
        "stdin": "",
        "session_id": "<optional_session_id for persistent state>",
        "run_timeout": 30000
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON payload provided"}), 400

        # Extract code from Piston format or direct format
        files = data.get('files', [])
        code = ""
        if files and isinstance(files, list) and len(files) > 0:
            code = files[0].get('content', '')
        if not code:
            code = data.get('code', '')
        if not code:
            return jsonify({"error": "No code provided"}), 400

        stdin = data.get('stdin', '')
        timeout_ms = data.get('run_timeout', 30000)
        timeout_sec = min(timeout_ms / 1000.0, 120)  # Max 120s
        session_id = data.get('session_id', None)

        logger.info(f"Executing code ({len(code)} chars), session={session_id}")

        # Determine working directory
        if session_id:
            session = get_or_create_session(session_id)
            work_dir = session["work_dir"]
            session["cell_count"] += 1
        else:
            # Stateless execution - use temp dir
            work_dir = tempfile.mkdtemp(prefix="exec_")

        # Write code to script file in the work_dir
        script_path = os.path.join(work_dir, "script.py")
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(code)

        # Build subprocess environment (inherit current env but ensure work_dir)
        env = os.environ.copy()
        env['PYTHONPATH'] = work_dir + os.pathsep + env.get('PYTHONPATH', '')

        process = subprocess.Popen(
            [sys.executable, script_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=work_dir,
            env=env,
            text=True
        )

        try:
            stdout, stderr = process.communicate(input=stdin, timeout=timeout_sec)
            exit_code = process.returncode
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
            stderr += f"\nTimeout expired after {timeout_sec} seconds."
            exit_code = 124

        # Only clean up script file, not working dir (if session-based)
        if os.path.exists(script_path):
            os.remove(script_path)
        if not session_id:
            shutil.rmtree(work_dir, ignore_errors=True)

        logger.info(f"Execution done, exit_code={exit_code}")

        return jsonify({
            "run": {
                "stdout": stdout,
                "stderr": stderr,
                "code": exit_code,
            },
            "language": "python",
            "version": sys.version.split()[0],
            "session_id": session_id,
        }), 200

    except Exception as e:
        logger.error(f"Internal error: {str(e)}\n{traceback.format_exc()}")
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
    """List all installed packages."""
    try:
        result = subprocess.run(
            [sys.executable, '-m', 'pip', 'list', '--format=json'],
            capture_output=True, text=True, timeout=30
        )
        packages = json.loads(result.stdout) if result.returncode == 0 else []
        return jsonify({"packages": packages, "count": len(packages)}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/install', methods=['POST'])
def install_package():
    """Dynamically install a Python package (use with caution)."""
    data = request.get_json()
    package = data.get('package', '') if data else ''
    if not package:
        return jsonify({"error": "No package specified"}), 400

    # Basic safety - only allow alphanumeric, dash and underscore
    if not all(c.isalnum() or c in '-_.' for c in package):
        return jsonify({"error": "Invalid package name"}), 400

    try:
        result = subprocess.run(
            [sys.executable, '-m', 'pip', 'install', '--quiet', package],
            capture_output=True, text=True, timeout=120
        )
        return jsonify({
            "status": "installed" if result.returncode == 0 else "failed",
            "package": package,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }), 200 if result.returncode == 0 else 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get('PORT', 8080))
    app.run(debug=False, host='0.0.0.0', port=port)
