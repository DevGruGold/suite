import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// ─── Configuration ────────────────────────────────────────────────────────────
// PISTON_URL points to the Cloud Run python execution service (Flask app).
// This service has full library access (pandas, polars, requests, httpx, bs4, etc.)
// and supports stateful sessions with persistent working directories.
// For sandboxed/quick code with no network access, use python-executor instead.
const SERVICE_URL = Deno.env.get('PISTON_URL') || '';

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ─── Flask Service Helpers ────────────────────────────────────────────────────

function serviceHeaders() {
    return { 'Content-Type': 'application/json' };
}

/** POST /execute — runs code, optionally in a named session */
async function runCode(params: {
    code: string;
    sessionId?: string;
    stdin?: string;
    timeoutMs?: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number; sessionId?: string }> {
    if (!SERVICE_URL) throw new Error('PISTON_URL is not configured. Set it to the Cloud Run python service URL.');

    const res = await fetch(`${SERVICE_URL}/execute`, {
        method: 'POST',
        headers: serviceHeaders(),
        body: JSON.stringify({
            language: 'python',
            version: '3.11',
            files: [{ name: 'main.py', content: params.code }],
            stdin: params.stdin || '',
            session_id: params.sessionId || null,
            run_timeout: params.timeoutMs || 30000,
        }),
        signal: AbortSignal.timeout(params.timeoutMs || 35000),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Python service returned ${res.status}: ${text}`);
    }

    const data = await res.json();
    return {
        stdout: data.run?.stdout || '',
        stderr: data.run?.stderr || '',
        exitCode: data.run?.code ?? 1,
        sessionId: data.session_id || params.sessionId,
    };
}

/** POST /session — create a new persistent session, returns { session_id } */
async function createSession(): Promise<string> {
    if (!SERVICE_URL) throw new Error('PISTON_URL is not configured.');
    const res = await fetch(`${SERVICE_URL}/session`, {
        method: 'POST',
        headers: serviceHeaders(),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to create session: ${res.status} ${text}`);
    }
    const data = await res.json();
    return data.session_id as string;
}

/** DELETE /session/<id> — clean up a session */
async function deleteSession(sessionId: string): Promise<boolean> {
    if (!SERVICE_URL) return false;
    const res = await fetch(`${SERVICE_URL}/session/${sessionId}`, {
        method: 'DELETE',
        headers: serviceHeaders(),
    });
    return res.ok || res.status === 404;
}

/** GET /sessions — list active sessions on the service */
async function listSessions(): Promise<any[]> {
    if (!SERVICE_URL) return [];
    const res = await fetch(`${SERVICE_URL}/sessions`, { headers: serviceHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return data.sessions || [];
}

/** GET /health — check service availability and installed libraries */
async function checkHealth(): Promise<Record<string, any>> {
    if (!SERVICE_URL) {
        return { healthy: false, error: 'PISTON_URL not configured. Set it to the Cloud Run python service URL.' };
    }
    try {
        const res = await fetch(`${SERVICE_URL}/health`, {
            headers: serviceHeaders(),
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return { healthy: false, error: `Service returned ${res.status}` };
        const data = await res.json();
        return { healthy: data.status === 'ok', ...data, url: SERVICE_URL };
    } catch (err: any) {
        return { healthy: false, error: err.message };
    }
}

// ─── Get or create a named DB-tracked session ────────────────────────────────

async function getOrCreateNamedSession(namedId: string): Promise<string> {
    // Check DB for existing session
    const { data: existing } = await supabase
        .from('jupyter_sessions')
        .select('jupyter_session_id, last_used_at')
        .eq('session_name', namedId)
        .eq('status', 'active')
        .single();

    if (existing) {
        // Ping service to verify session still alive
        const sessions = await listSessions();
        const alive = sessions.some((s: any) => s.id === existing.jupyter_session_id);
        if (alive) {
            await supabase.from('jupyter_sessions')
                .update({ last_used_at: new Date().toISOString() })
                .eq('session_name', namedId);
            return existing.jupyter_session_id;
        }
        // Dead — remove from DB
        await supabase.from('jupyter_sessions').delete().eq('session_name', namedId);
    }

    // Create fresh session on service
    const newSessionId = await createSession();

    await supabase.from('jupyter_sessions').insert({
        session_name: namedId,
        jupyter_session_id: newSessionId,
        kernel_id: newSessionId,                   // Flask service uses session_id as both
        notebook_path: `sessions/${namedId}`,
        status: 'active',
        created_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
    });

    return newSessionId;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

async function logExecution(params: {
    code: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    executionTimeMs: number;
    source: string;
    purpose: string;
    agentId: string | null;
    taskId: string | null;
    sessionId: string | null;
    backend: string;
}) {
    const wasAutoFixed = params.source === 'autonomous-code-fixer';
    const success = params.exitCode === 0;

    await supabase.from('eliza_python_executions').insert({
        code: params.code,
        output: params.stdout || null,
        error_message: params.stderr || null,
        exit_code: params.exitCode,
        execution_time_ms: params.executionTimeMs,
        source: params.source,
        purpose: params.purpose || null,
        status: success ? 'completed' : 'error',
        metadata: {
            agent_id: params.agentId,
            task_id: params.taskId,
            language: 'python',
            version: '3.11',
            backend: params.backend,
            session_id: params.sessionId,
            was_auto_fixed: wasAutoFixed,
        },
    }).then(({ error }) => {
        if (error) console.error('❌ [DB] eliza_python_executions failed:', error.message);
    });

    await supabase.from('eliza_function_usage').insert({
        function_name: 'jupyter-executor',
        success,
        execution_time_ms: params.executionTimeMs,
        error_message: !success ? (params.stderr || 'Execution failed') : null,
        tool_category: 'python',
        context: JSON.stringify({
            source: 'jupyter-executor',
            purpose: params.purpose || null,
            code_length: params.code?.length || 0,
            agent_id: params.agentId,
            task_id: params.taskId,
            backend: params.backend,
        }),
        invoked_at: new Date().toISOString(),
        deployment_version: 'jupyter-executor-v2-flask',
    });

    const title = wasAutoFixed && success
        ? '🔧 Code Auto-Fixed and Executed (Cloud Run)'
        : success
            ? '✅ Code Executed (Cloud Run — Full Stack)'
            : '❌ Code Execution Failed (Cloud Run)';

    await supabase.from('eliza_activity_log').insert({
        activity_type: 'python_execution',
        title,
        description: `${params.purpose || 'Python execution'} — ${params.code.length} chars in ${params.executionTimeMs}ms`,
        metadata: {
            language: 'python',
            version: '3.11',
            execution_time_ms: params.executionTimeMs,
            exit_code: params.exitCode,
            was_auto_fixed: wasAutoFixed,
            source: params.source,
            backend: params.backend,
        },
        status: success ? 'completed' : 'failed',
    });

    if (!success && params.stderr) {
        supabase.functions.invoke('code-monitor-daemon', {
            body: { action: 'monitor', priority: 'immediate', source: 'jupyter-executor' },
        }).catch((err: Error) => console.error('❌ [AUTO-FIX] daemon trigger failed:', err.message));
    }
}

// ─── Action Handlers ──────────────────────────────────────────────────────────

async function handleExecute(body: Record<string, any>): Promise<Record<string, any>> {
    const { code, purpose = '', source = 'eliza', agent_id = null, task_id = null } = body;
    if (!code) return { success: false, error: 'No code provided' };
    if (!SERVICE_URL) return { success: false, error: 'PISTON_URL not configured. The Cloud Run python service URL is required.' };

    const startTime = Date.now();
    console.log(`🐍 [jupyter-executor] Stateless execute — ${code.length} chars`);

    const result = await runCode({ code });
    const executionTimeMs = Date.now() - startTime;

    await logExecution({
        code, stdout: result.stdout, stderr: result.stderr,
        exitCode: result.exitCode, executionTimeMs, source, purpose,
        agentId: agent_id, taskId: task_id, sessionId: null, backend: 'cloud-run-flask',
    });

    return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        language: 'python',
        version: '3.11',
        backend: 'cloud-run-flask',
    };
}

async function handleCreateSession(body: Record<string, any>): Promise<Record<string, any>> {
    const { session_id } = body;
    if (!session_id) return { success: false, error: 'session_id is required' };
    if (!SERVICE_URL) return { success: false, error: 'PISTON_URL not configured.' };

    const serviceSessionId = await getOrCreateNamedSession(session_id);
    return {
        success: true,
        session_id,
        service_session_id: serviceSessionId,
        message: `Session '${session_id}' ready`,
    };
}

async function handleRunInSession(body: Record<string, any>): Promise<Record<string, any>> {
    const { session_id, code, purpose = '', source = 'eliza', agent_id = null, task_id = null } = body;
    if (!session_id) return { success: false, error: 'session_id is required' };
    if (!code) return { success: false, error: 'code is required' };
    if (!SERVICE_URL) return { success: false, error: 'PISTON_URL not configured.' };

    const startTime = Date.now();
    const serviceSessionId = await getOrCreateNamedSession(session_id);
    const result = await runCode({ code, sessionId: serviceSessionId });
    const executionTimeMs = Date.now() - startTime;

    await logExecution({
        code, stdout: result.stdout, stderr: result.stderr,
        exitCode: result.exitCode, executionTimeMs, source, purpose,
        agentId: agent_id, taskId: task_id, sessionId: session_id, backend: 'cloud-run-flask-stateful',
    });

    return {
        success: result.exitCode === 0,
        session_id,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        backend: 'cloud-run-flask-stateful',
    };
}

async function handleGetSessionState(body: Record<string, any>): Promise<Record<string, any>> {
    const { session_id } = body;
    if (!session_id) return { success: false, error: 'session_id is required' };

    const { data } = await supabase
        .from('jupyter_sessions')
        .select('*')
        .eq('session_name', session_id)
        .single();

    if (!data) return { success: false, error: `Session '${session_id}' not found` };

    return {
        success: true,
        session_id,
        status: data.status,
        service_session_id: data.jupyter_session_id,
        notebook_path: data.notebook_path,
        created_at: data.created_at,
        last_used_at: data.last_used_at,
    };
}

async function handleCloseSession(body: Record<string, any>): Promise<Record<string, any>> {
    const { session_id } = body;
    if (!session_id) return { success: false, error: 'session_id is required' };

    const { data } = await supabase
        .from('jupyter_sessions')
        .select('jupyter_session_id')
        .eq('session_name', session_id)
        .single();

    if (data) {
        await deleteSession(data.jupyter_session_id);
        await supabase.from('jupyter_sessions')
            .update({ status: 'closed' })
            .eq('session_name', session_id);
    }

    return { success: true, session_id, message: `Session '${session_id}' closed` };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // Health check via GET
    if (req.method === 'GET') {
        const health = await checkHealth();
        return new Response(JSON.stringify(health), {
            status: health.healthy ? 200 : 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        let body: Record<string, any> = {};
        try { body = await req.json(); } catch { /* empty body ok */ }

        const action = body.action || 'execute';
        let result: Record<string, any>;

        switch (action) {
            case 'execute':
                result = await handleExecute(body);
                break;
            case 'create_session':
                result = await handleCreateSession(body);
                break;
            case 'run_in_session':
                result = await handleRunInSession(body);
                break;
            case 'get_session_state':
                result = await handleGetSessionState(body);
                break;
            case 'close_session':
                result = await handleCloseSession(body);
                break;
            case 'health':
                result = await checkHealth();
                break;
            default:
                result = { success: false, error: `Unknown action: '${action}'. Valid: execute, create_session, run_in_session, get_session_state, close_session, health` };
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err: any) {
        console.error('❌ [jupyter-executor] Unhandled error:', err);
        return new Response(JSON.stringify({
            success: false,
            error: err.message || 'Internal server error',
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
