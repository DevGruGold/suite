import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// ─── Configuration ────────────────────────────────────────────────────────────
//
// python-executor v4.1 — Cloud Run primary, optional private Piston sandbox
//
// PRIMARY — Cloud Run Flask service (full library stack, network-enabled)
//   Best for: ALL code including stdlib-only, data analysis, web scraping,
//             image processing, visualization, ML, document generation, API calls.
//   Required: PISTON_URL env var set to the Cloud Run service URL.
//   Available libs: requests, httpx, pandas, numpy, scipy, matplotlib,
//     seaborn, plotly, scikit-learn, Pillow, imageio, nltk, reportlab,
//     beautifulsoup4, lxml, openpyxl, pydantic, and more.
//
// OPTIONAL SANDBOX — Private Piston instance (stdlib-only, no network)
//   Only used when PISTON_SANDBOX_URL is configured AND caller forces backend: "piston".
//   NOTE: The public Piston API (emkc.org) has been WHITELIST-ONLY since Feb 15 2026.
//         Do NOT use it. Set PISTON_SANDBOX_URL only if you host your own Piston.
//
// Smart routing: stdlib-only code → Cloud Run (fast path, no session needed)
//               external lib imports → Cloud Run (same service, richer env)
//               backend: "piston" override → private Piston (if PISTON_SANDBOX_URL set)
//
// ─────────────────────────────────────────────────────────────────────────────

// Cloud Run Flask service — primary executor (set via PISTON_URL secret in Supabase)
const CLOUD_RUN_URL = Deno.env.get('PISTON_URL') || '';
// Private Piston sandbox — optional, only used if caller forces backend: "piston"
// Do NOT set to the public emkc.org — it went whitelist-only Feb 15 2026
const PISTON_SANDBOX_URL = Deno.env.get('PISTON_SANDBOX_URL') || '';

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
  // Explicit Piston override — only works if PISTON_SANDBOX_URL is configured
  if (forcedBackend === 'piston') {
    if (!PISTON_SANDBOX_URL) {
      // No private Piston available — fall through to Cloud Run
      return { backend: 'cloud_run', reason: 'piston forced but no PISTON_SANDBOX_URL configured; using cloud_run', externalImports: [] };
    }
    return { backend: 'piston', reason: 'forced by caller (private Piston sandbox)', externalImports: [] };
  }
  if (forcedBackend === 'cloud_run' || forcedBackend === 'cloud-run') {
    return { backend: 'cloud_run', reason: 'forced by caller', externalImports: [] };
  }

  // Auto-detect: Cloud Run handles ALL code (stdlib and external alike)
  // It's the primary and preferred executor in all cases
  const allImports = extractImports(code);
  const externalImports = allImports.filter(m => !PYTHON_STDLIB.has(m));

  if (cloudRunAvailable) {
    const reason = externalImports.length > 0
      ? `detected external imports: ${externalImports.join(', ')}`
      : 'stdlib-only code (Cloud Run preferred as primary executor)';
    return { backend: 'cloud_run', reason, externalImports };
  }

  // Cloud Run not available — use private Piston if configured (stdlib only)
  if (PISTON_SANDBOX_URL) {
    return {
      backend: 'piston',
      reason: 'PISTON_URL not set; falling back to private Piston sandbox (stdlib only)',
      externalImports,
    };
  }

  // No backends available
  return { backend: 'cloud_run', reason: 'no backends configured', externalImports };
}

// ─── Executors ────────────────────────────────────────────────────────────────

async function executePiston(opts: {
  code: string;
  language: string;
  version: string;
  stdin: string;
  args: string[];
}): Promise<{ stdout: string; stderr: string; exitCode: number; backend: string }> {
  if (!PISTON_SANDBOX_URL) {
    throw new Error('No private Piston sandbox configured (PISTON_SANDBOX_URL not set). Use Cloud Run instead.');
  }
  const resp = await fetch(`${PISTON_SANDBOX_URL}/execute`, {
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
    backend: 'piston-private',
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

  // Health check (GET) — report backend status
  if (req.method === 'GET') {
    let cloudRunHealth: Record<string, unknown> = { available: false, url: CLOUD_RUN_URL || 'not configured' };
    if (CLOUD_RUN_URL) {
      try {
        const hr = await fetch(`${CLOUD_RUN_URL}/health`, { signal: AbortSignal.timeout(5000) });
        const hdata = hr.ok ? await hr.json() : null;
        cloudRunHealth = {
          available: hr.ok,
          url: CLOUD_RUN_URL,
          version: hdata?.version || null,
          python: hdata?.python_version || null,
          libraries: hdata?.libraries ? Object.keys(hdata.libraries).filter(k => hdata.libraries[k] !== null) : [],
          security: hdata?.security || null,
        };
      } catch (e: any) {
        cloudRunHealth = { available: false, url: CLOUD_RUN_URL, error: e.message };
      }
    }

    return new Response(JSON.stringify({
      status: 'ok',
      version: 'python-executor-v4.1-cloudrun-primary',
      backends: {
        cloud_run: cloudRunHealth,
        piston_sandbox: {
          available: Boolean(PISTON_SANDBOX_URL),
          url: PISTON_SANDBOX_URL || 'not configured (optional)',
          note: 'Private Piston only. Public emkc.org is whitelist-only since Feb 15 2026.',
        },
      },
      routing: 'Cloud Run is primary executor for all code. Private Piston sandbox optional for stdlib fallback.',
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

    if (!CLOUD_RUN_URL && !PISTON_SANDBOX_URL) {
      return new Response(JSON.stringify({
        success: false,
        output: '',
        error: 'No execution backend configured. Set the PISTON_URL secret to the Cloud Run Flask service URL in Supabase Edge Function settings.',
        exitCode: 1,
        backend: 'none',
        learning_point: 'The Python executor requires the PISTON_URL secret to be set to the Cloud Run service URL. Contact the system administrator.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
      if (routing.backend === 'cloud_run') {
        if (!CLOUD_RUN_URL) {
          throw new Error('PISTON_URL (Cloud Run) not configured');
        }
        result = await executeCloudRun({ code: String(code), stdin: String(stdin), timeoutMs: Number(timeout_ms) });
      } else {
        // Private Piston sandbox
        result = await executePiston({
          code: String(code),
          language: String(language),
          version: String(version),
          stdin: String(stdin),
          args: Array.isArray(args) ? args : [],
        });
      }
    } catch (execError: any) {
      // If Cloud Run fails and we have a private Piston for stdlib fallback
      if (routing.backend === 'cloud_run' && PISTON_SANDBOX_URL) {
        const allImports = extractImports(String(code));
        const hasExternalImports = allImports.some(m => !PYTHON_STDLIB.has(m));
        if (!hasExternalImports) {
          console.warn(`⚠️ [CLOUD RUN] Failed (${execError.message}). Falling back to private Piston for stdlib code.`);
          try {
            result = await executePiston({
              code: String(code), language: String(language), version: String(version),
              stdin: String(stdin), args: Array.isArray(args) ? args : [],
            });
            result.stderr = `⚠️ Cloud Run unavailable; ran on private Piston sandbox.\n${result.stderr}`;
            result.backend = 'piston-fallback';
          } catch (fbErr: any) {
            throw new Error(`Cloud Run: ${execError.message}. Piston fallback: ${fbErr.message}`);
          }
        } else {
          throw new Error(`Cloud Run unavailable: ${execError.message}. External imports (${allImports.filter(m => !PYTHON_STDLIB.has(m)).join(',')}) cannot run on Piston fallback.`);
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

    // ── Module not found detection (Piston fallback used, missing external lib) ───
    if (usedBackend.includes('piston') && stderrText.includes('ModuleNotFoundError') && routing.externalImports.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        output: stdoutText,
        error: stderrText,
        exitCode: 1,
        backend: usedBackend,
        learning_point: [
          `❌ This code needs external packages (${routing.externalImports.join(', ')}) not available in the Piston sandbox.`,
          `💡 The Cloud Run service (primary executor) is currently unavailable.`,
          `   Once Cloud Run recovers, this code will run automatically on the full-stack environment.`,
          `   Available Cloud Run packages: requests, httpx, pandas, numpy, scipy, matplotlib,`,
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
        deployment_version: 'python-executor-v4.1-cloudrun-primary',
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
