import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// ─── Configuration ────────────────────────────────────────────────────────────
//
// python-executor v4 — Hybrid routing architecture
//
// TIER 1 — Piston (fast, sandboxed, stdlib-only, no network)
//   Best for: quick calculations, string manipulation, JSON processing,
//             pure Python logic, anything using only built-in modules.
//   Limitation: No external packages (pandas, requests, etc.), no network.
//
// TIER 2 — Cloud Run Flask service (full library stack, network-enabled)
//   Best for: data analysis (pandas/numpy/scipy), web scraping (requests/bs4),
//             image processing (Pillow/scikit-image), visualization (matplotlib/plotly),
//             ML (scikit-learn), document generation (reportlab/pypdf2), API calls.
//   Configured via: PISTON_URL env var pointing to the Cloud Run service URL.
//
// Smart routing: this function auto-detects which tier is needed by scanning
// import statements in the code. Stdlib-only → Tier 1 (fast). External libs → Tier 2.
// Force override: set `backend: "piston"` or `backend: "cloud_run"` in the request.
//
// ─────────────────────────────────────────────────────────────────────────────

const PISTON_PUBLIC_URL = 'https://emkc.org/api/v2/piston';
const CLOUD_RUN_URL = Deno.env.get('PISTON_URL') || '';  // Cloud Run Flask service

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ─── Python Standard Library Modules ─────────────────────────────────────────
// Used for smart routing: if ALL imports are from this set, use Piston (fast).
// Any import outside this set triggers Cloud Run routing.
const PYTHON_STDLIB = new Set([
  'abc', 'ast', 'asyncio', 'base64', 'binascii', 'builtins', 'calendar',
  'cmath', 'cmd', 'code', 'codecs', 'codeop', 'collections', 'colorsys',
  'compileall', 'concurrent', 'contextlib', 'contextvars', 'copy', 'copyreg',
  'csv', 'datetime', 'decimal', 'difflib', 'dis', 'email', 'enum',
  'errno', 'faulthandler', 'fnmatch', 'fractions', 'ftplib', 'functools',
  'gc', 'glob', 'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http',
  'imaplib', 'importlib', 'inspect', 'io', 'ipaddress', 'itertools',
  'json', 'keyword', 'linecache', 'locale', 'logging', 'lzma', 'math',
  'mimetypes', 'numbers', 'operator', 'os', 'pathlib', 'pickle',
  'platform', 'pprint', 'profile', 'queue', 'random', 're', 'readline',
  'shlex', 'signal', 'smtplib', 'socket', 'sqlite3', 'ssl', 'stat',
  'statistics', 'string', 'struct', 'sys', 'tarfile', 'tempfile',
  'textwrap', 'threading', 'time', 'timeit', 'tkinter', 'token',
  'tokenize', 'traceback', 'typing', 'unicodedata', 'unittest', 'urllib',
  'uuid', 'warnings', 'weakref', 'xml', 'xmlrpc', 'zipfile', 'zlib',
  'zipimport', 'zoneinfo', '__future__',
]);

// External packages available on the Cloud Run service
const CLOUD_RUN_PACKAGES = new Set([
  'requests', 'httpx', 'aiohttp', 'bs4', 'beautifulsoup4', 'lxml', 'html5lib',
  'numpy', 'pandas', 'polars', 'scipy', 'pyarrow', 'orjson', 'tabulate',
  'matplotlib', 'seaborn', 'plotly', 'kaleido',
  'sklearn', 'scikit_learn', 'scikit-learn',
  'PIL', 'Pillow', 'pillow', 'imageio', 'skimage', 'scikit_image',
  'nltk', 'reportlab', 'pypdf2', 'svgwrite',
  'openpyxl', 'xlrd', 'pydantic', 'flask', 'flask_cors',
]);

// ─── Routing Logic ────────────────────────────────────────────────────────────

/** Extract all top-level module names from import statements in code */
function extractImports(code: string): string[] {
  const imports: string[] = [];
  // Matches: import X, import X.Y, from X import Y, from X.Y import Z
  const importRe = /^\s*(?:import\s+([\w,\s.]+)|from\s+([\w.]+)\s+import)/gm;
  let match;
  while ((match = importRe.exec(code)) !== null) {
    if (match[1]) {
      // "import X, Y, Z" — split on commas
      for (const part of match[1].split(',')) {
        const mod = part.trim().split('.')[0].trim();
        if (mod) imports.push(mod);
      }
    } else if (match[2]) {
      // "from X.Y import ..."
      imports.push(match[2].split('.')[0]);
    }
  }
  return [...new Set(imports)];
}

type RoutingDecision = {
  backend: 'piston' | 'cloud_run';
  reason: string;
  externalImports: string[];
};

function decideBackend(
  code: string,
  forcedBackend: string | undefined,
  cloudRunAvailable: boolean,
): RoutingDecision {
  // Explicit override
  if (forcedBackend === 'piston') {
    return { backend: 'piston', reason: 'forced by caller', externalImports: [] };
  }
  if (forcedBackend === 'cloud_run' || forcedBackend === 'cloud-run') {
    if (!cloudRunAvailable) {
      return { backend: 'piston', reason: 'cloud_run forced but PISTON_URL not configured', externalImports: [] };
    }
    return { backend: 'cloud_run', reason: 'forced by caller', externalImports: [] };
  }

  // Auto-detect based on imports
  const allImports = extractImports(code);
  const externalImports = allImports.filter(m => !PYTHON_STDLIB.has(m));

  if (externalImports.length > 0 && cloudRunAvailable) {
    return {
      backend: 'cloud_run',
      reason: `detected external imports: ${externalImports.join(', ')}`,
      externalImports,
    };
  }

  if (externalImports.length > 0 && !cloudRunAvailable) {
    // Cloud Run not configured — warn but fall back to Piston
    return {
      backend: 'piston',
      reason: `external imports detected but PISTON_URL not set; falling back to Piston (may fail)`,
      externalImports,
    };
  }

  return { backend: 'piston', reason: 'stdlib-only code', externalImports: [] };
}

// ─── Executors ────────────────────────────────────────────────────────────────

async function executePiston(opts: {
  code: string;
  language: string;
  version: string;
  stdin: string;
  args: string[];
}): Promise<{ stdout: string; stderr: string; exitCode: number; backend: string }> {
  const resp = await fetch(`${PISTON_PUBLIC_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: opts.language,
      version: opts.version,
      files: [{ name: 'main.py', content: opts.code }],
      stdin: opts.stdin,
      args: opts.args,
      run_timeout: 30000,
    }),
    signal: AbortSignal.timeout(35000),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Piston HTTP ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  return {
    stdout: data.run?.stdout || '',
    stderr: data.run?.stderr || '',
    exitCode: data.run?.code ?? 1,
    backend: 'piston-public',
  };
}

async function executeCloudRun(opts: {
  code: string;
  stdin: string;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number; backend: string; blocked?: boolean; blockReason?: string }> {
  const resp = await fetch(`${CLOUD_RUN_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: 'python',
      version: '3.11',
      files: [{ name: 'main.py', content: opts.code }],
      stdin: opts.stdin,
      run_timeout: opts.timeoutMs,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs + 5000),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Cloud Run HTTP ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  return {
    stdout: data.run?.stdout || '',
    stderr: data.run?.stderr || '',
    exitCode: data.run?.code ?? 1,
    backend: 'cloud-run-flask',
    blocked: data.blocked || false,
    blockReason: data.reason || undefined,
  };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check (GET) — report both backends
  if (req.method === 'GET') {
    const cloudRunHealthy = CLOUD_RUN_URL
      ? await fetch(`${CLOUD_RUN_URL}/health`, { signal: AbortSignal.timeout(5000) })
        .then(r => r.ok)
        .catch(() => false)
      : false;

    let cloudRunLibs: Record<string, string> | null = null;
    if (cloudRunHealthy) {
      cloudRunLibs = await fetch(`${CLOUD_RUN_URL}/health`, { signal: AbortSignal.timeout(5000) })
        .then(r => r.json())
        .then(d => d.libraries || null)
        .catch(() => null);
    }

    return new Response(JSON.stringify({
      status: 'ok',
      version: 'python-executor-v4-hybrid',
      backends: {
        piston: { available: true, url: PISTON_PUBLIC_URL, libraries: 'stdlib only' },
        cloud_run: {
          available: cloudRunHealthy,
          url: CLOUD_RUN_URL || 'not configured',
          libraries: cloudRunLibs ? Object.keys(cloudRunLibs).filter(k => cloudRunLibs![k] !== null) : [],
        },
      },
      routing: 'auto (stdlib-only → piston, external imports → cloud_run)',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    let rawBody: Record<string, unknown>;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unwrap nested payload formats:
    //   Direct: { code, purpose, ... }       ← from execute_python tool
    //   Nested: { payload: { code, ... } }   ← from invoke_edge_function tool
    const body = (rawBody.payload as Record<string, unknown>) || rawBody;

    const {
      code,
      language = 'python',
      version = '3.10.0',
      stdin = '',
      args = [],
      purpose = '',
      source = 'eliza',
      agent_id = null,
      task_id = null,
      timeout_ms = 30000,
      backend: forcedBackend,  // optional: "piston" | "cloud_run"
    } = body as Record<string, any>;

    if (!code) {
      const cloudRunLibsList = CLOUD_RUN_URL
        ? Array.from(CLOUD_RUN_PACKAGES).join(', ')
        : 'n/a (PISTON_URL not configured)';
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No code provided',
          learning_point: [
            'python-executor requires a "code" field.',
            'Correct payload: { code: "print(\'hello\')", purpose: "description" }',
            'If calling via invoke_edge_function: { function_name: "python-executor", payload: { code: "...", purpose: "..." } }',
            '',
            '📦 BACKEND CAPABILITIES:',
            '  • Piston (default): stdlib only — math, json, re, datetime, os, etc.',
            '  • Cloud Run (auto-selected when external imports detected):',
            `    Libraries available: ${cloudRunLibsList}`,
            '',
            '🔀 ROUTING: The executor auto-detects which backend to use based on your imports.',
            '   Force a backend: add `backend: "cloud_run"` or `backend: "piston"` to your payload.',
          ].join('\n'),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cloudRunAvailable = Boolean(CLOUD_RUN_URL);
    const routing = decideBackend(code, forcedBackend, cloudRunAvailable);

    console.log(`🐍 [PYTHON-EXECUTOR v4] Source: ${source}, Purpose: ${purpose || 'none'}`);
    console.log(`📝 [CODE] ${String(code).length} chars — First 100: ${String(code).substring(0, 100)}`);
    console.log(`🔀 [ROUTING] Backend: ${routing.backend} — ${routing.reason}`);
    if (routing.externalImports.length > 0) {
      console.log(`📦 [IMPORTS] External: ${routing.externalImports.join(', ')}`);
    }

    const startTime = Date.now();
    let result: { stdout: string; stderr: string; exitCode: number; backend: string; blocked?: boolean; blockReason?: string };

    try {
      if (routing.backend === 'cloud_run') {
        result = await executeCloudRun({ code: String(code), stdin: String(stdin), timeoutMs: Number(timeout_ms) });
      } else {
        result = await executePiston({
          code: String(code),
          language: String(language),
          version: String(version),
          stdin: String(stdin),
          args: Array.isArray(args) ? args : [],
        });
      }
    } catch (execError: any) {
      // If Cloud Run fails, optionally fall back to Piston with a warning
      if (routing.backend === 'cloud_run') {
        console.warn(`⚠️ [CLOUD RUN] Failed (${execError.message}). Falling back to Piston.`);
        try {
          result = await executePiston({
            code: String(code),
            language: String(language),
            version: String(version),
            stdin: String(stdin),
            args: Array.isArray(args) ? args : [],
          });
          result.stderr = `⚠️ Cloud Run unavailable (${execError.message}); ran on Piston fallback.\n${result.stderr}`;
          result.backend = 'piston-fallback';
        } catch (fallbackErr: any) {
          throw new Error(`Both backends failed. Cloud Run: ${execError.message}. Piston: ${fallbackErr.message}`);
        }
      } else {
        throw execError;
      }
    }

    const executionTime = Date.now() - startTime;
    const { stdout: stdoutText, stderr: stderrText, exitCode, backend: usedBackend } = result;

    console.log(`⏱️ [TIMING] ${executionTime}ms on ${usedBackend}`);
    console.log(`📊 [RESULT] exit=${exitCode}, stdout=${stdoutText.length}b, stderr=${stderrText.length}b`);

    // ── Security block response (from Cloud Run) ──────────────────────────────
    if (result.blocked) {
      return new Response(JSON.stringify({
        success: false,
        output: '',
        error: stderrText,
        exitCode: 1,
        backend: usedBackend,
        blocked: true,
        learning_point: `Code blocked by security policy: ${result.blockReason}. Remove dangerous operations and retry.`,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Network error detection (Piston sandbox) ──────────────────────────────
    const hasNetworkError = usedBackend.startsWith('piston') && (
      stderrText.includes('URLError') ||
      stderrText.includes('socket.gaierror') ||
      stderrText.includes('ConnectionRefusedError') ||
      (stderrText.includes('ModuleNotFoundError') && routing.externalImports.length > 0)
    );
    if (hasNetworkError) {
      const missingLib = routing.externalImports[0] || 'external package';
      return new Response(JSON.stringify({
        success: false,
        output: stdoutText,
        error: stderrText,
        exitCode: 1,
        backend: usedBackend,
        learning_point: [
          `❌ This code needs external packages (${routing.externalImports.join(', ')}) not available on Piston.`,
          `💡 Set the PISTON_URL environment variable to the Cloud Run Flask service URL,`,
          `   or add backend: "cloud_run" to your payload if PISTON_URL is already configured.`,
          `   Available packages on Cloud Run: requests, httpx, pandas, numpy, scipy, matplotlib,`,
          `   seaborn, plotly, scikit-learn, Pillow, imageio, nltk, reportlab, pypdf2, and more.`,
        ].join('\n'),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Async logging (fire and forget) ──────────────────────────────────────
    const wasAutoFixed = source === 'autonomous-code-fixer';

    Promise.all([
      supabase.from('eliza_python_executions').insert({
        code,
        output: stdoutText || null,
        error_message: stderrText || null,
        exit_code: exitCode,
        execution_time_ms: executionTime,
        source,
        purpose: purpose || null,
        status: exitCode === 0 ? 'completed' : 'error',
        metadata: { agent_id, task_id, language, version, backend: usedBackend, was_auto_fixed: wasAutoFixed },
      }),
      supabase.from('eliza_function_usage').insert({
        function_name: 'python-executor',
        success: exitCode === 0,
        execution_time_ms: executionTime,
        error_message: exitCode !== 0 ? (stderrText || 'Execution failed') : null,
        tool_category: 'python',
        context: JSON.stringify({
          source, purpose: purpose || null, code_length: String(code).length,
          agent_id, task_id, backend: usedBackend, external_imports: routing.externalImports,
        }),
        invoked_at: new Date().toISOString(),
        deployment_version: 'python-executor-v4-hybrid',
      }),
      supabase.from('eliza_activity_log').insert({
        activity_type: wasAutoFixed ? 'python_fix_execution' : 'python_execution',
        title: exitCode === 0
          ? `✅ Python Executed (${usedBackend})`
          : `❌ Python Failed (${usedBackend})`,
        description: `${purpose || 'Python execution'} — ${String(code).length} chars in ${executionTime}ms`,
        metadata: { language, backend: usedBackend, execution_time_ms: executionTime, exit_code: exitCode, was_auto_fixed: wasAutoFixed, source },
        status: exitCode === 0 ? 'completed' : 'failed',
      }),
    ]).catch((err: Error) => console.error('❌ [DB] Logging failed:', err.message));

    // ── Trigger auto-fix daemon on failure ────────────────────────────────────
    if (exitCode !== 0 && stderrText) {
      supabase.functions.invoke('code-monitor-daemon', {
        body: { action: 'monitor', priority: 'immediate', source: 'python-executor', backend: usedBackend },
      }).catch((err: Error) => console.error('❌ [AUTO-FIX] Daemon trigger failed:', err.message));
    }

    return new Response(
      JSON.stringify({
        success: exitCode === 0,
        output: stdoutText,
        error: stderrText,
        exitCode,
        language: 'python',
        version: routing.backend === 'cloud_run' ? '3.11' : version,
        backend: usedBackend,
        routing: { decision: routing.backend, reason: routing.reason, external_imports: routing.externalImports },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ [PYTHON-EXECUTOR] Unhandled error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
