import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// ─── Configuration ───────────────────────────────────────────────────────────
const JUPYTER_URL = Deno.env.get('JUPYTER_URL') || '';
const JUPYTER_TOKEN = Deno.env.get('JUPYTER_TOKEN') || '';

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ─── Jupyter REST API helpers ─────────────────────────────────────────────────

function jupyterHeaders() {
    return {
        'Authorization': `token ${JUPYTER_TOKEN}`,
        'Content-Type': 'application/json',
    };
}

/** Create a new kernel and return its id */
async function createKernel(kernelName = 'python3'): Promise<string> {
    const res = await fetch(`${JUPYTER_URL}/api/kernels`, {
        method: 'POST',
        headers: jupyterHeaders(),
        body: JSON.stringify({ name: kernelName }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to create kernel: ${res.status} ${text}`);
    }
    const data = await res.json();
    return data.id as string;
}

/** Start a session (notebook + kernel) and return { sessionId, kernelId, notebookPath } */
async function createSession(notebookPath: string, kernelName = 'python3') {
    const res = await fetch(`${JUPYTER_URL}/api/sessions`, {
        method: 'POST',
        headers: jupyterHeaders(),
        body: JSON.stringify({
            kernel: { name: kernelName },
            name: notebookPath,
            path: notebookPath,
            type: 'notebook',
        }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to create session: ${res.status} ${text}`);
    }
    const data = await res.json();
    return {
        sessionId: data.id as string,
        kernelId: data.kernel?.id as string,
        notebookPath: data.path as string,
    };
}

/** Delete a session (shuts down the kernel) */
async function deleteSession(sessionId: string) {
    const res = await fetch(`${JUPYTER_URL}/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: jupyterHeaders(),
    });
    // 404 is fine — session may already be gone
    return res.ok || res.status === 404;
}

/** Get or create a named session from the sessions table */
async function getOrCreateNamedSession(namedId: string): Promise<{ sessionId: string; kernelId: string }> {
    // Check DB for existing session
    const { data: existing } = await supabase
        .from('jupyter_sessions')
        .select('jupyter_session_id, kernel_id, last_used_at')
        .eq('session_name', namedId)
        .eq('status', 'active')
        .single();

    if (existing) {
        // Verify kernel is still alive
        const res = await fetch(`${JUPYTER_URL}/api/kernels/${existing.kernel_id}`, {
            headers: jupyterHeaders(),
        });
        if (res.ok) {
            // Refresh last_used_at
            await supabase.from('jupyter_sessions')
                .update({ last_used_at: new Date().toISOString() })
                .eq('session_name', namedId);
            return { sessionId: existing.jupyter_session_id, kernelId: existing.kernel_id };
        }
        // Kernel dead — clean up
        await supabase.from('jupyter_sessions').delete().eq('session_name', namedId);
    }

    // Create fresh session
    const notebookPath = `sessions/${namedId}.ipynb`;
    const { sessionId, kernelId } = await createSession(notebookPath);

    // Persist to DB
    await supabase.from('jupyter_sessions').insert({
        session_name: namedId,
        jupyter_session_id: sessionId,
        kernel_id: kernelId,
        notebook_path: notebookPath,
        status: 'active',
        created_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
    });

    return { sessionId, kernelId };
}

/**
 * Execute code on a kernel via WebSocket-like execute_request over the REST API.
 * Uses the /api/kernels/{kernel_id}/channels endpoint via the kernel messaging API.
 * 
 * For Cloud Run (stateless HTTP), we use the simpler approach:
 * POST to notebook server's execute_request via the kernel REST shim.
 */
async function executeOnKernel(
    kernelId: string,
    code: string,
    timeoutMs = 30000
): Promise<{ stdout: string; stderr: string; outputs: any[]; error: string | null; execution_count: number }> {
    // Use Jupyter's execute_request via the kernels/execute endpoint (available in jupyter-mcp-tools)
    // This is a synchronous HTTP wrapper around the async kernel protocol
    const res = await fetch(`${JUPYTER_URL}/api/kernels/${kernelId}/execute`, {
        method: 'POST',
        headers: jupyterHeaders(),
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
        // Fallback: try the standard kernel channels approach
        const text = await res.text();
        throw new Error(`Kernel execute failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return {
        stdout: data.stdout || '',
        stderr: data.stderr || '',
        outputs: data.outputs || [],
        error: data.error || null,
        execution_count: data.execution_count || 0,
    };
}

/** Log execution to supabase tables (mirrors python-executor logging) */
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

    // eliza_python_executions
    const { error: logErr } = await supabase.from('eliza_python_executions').insert({
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
    });
    if (logErr) console.error('❌ [DB] eliza_python_executions log failed:', logErr.message);

    // eliza_function_usage
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
        deployment_version: 'jupyter-executor-v1',
    });

    // eliza_activity_log
    const title = wasAutoFixed && success
        ? '🔧 Code Auto-Fixed and Executed via Jupyter'
        : success
            ? '✅ Jupyter Code Executed Successfully'
            : '❌ Jupyter Code Execution Failed';

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

    // Trigger auto-fix daemon on failure (same pattern as python-executor)
    if (!success && params.stderr) {
        console.log('🔧 [AUTO-FIX] Triggering code-monitor-daemon...');
        supabase.functions.invoke('code-monitor-daemon', {
            body: { action: 'monitor', priority: 'immediate', source: 'jupyter-executor' },
        }).then(() => {
            console.log('✅ [AUTO-FIX] code-monitor-daemon triggered');
        }).catch((err: Error) => {
            console.error('❌ [AUTO-FIX] Failed to trigger:', err.message);
        });
    }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleExecute(body: Record<string, any>): Promise<Record<string, any>> {
    const { code, purpose = '', source = 'eliza', agent_id = null, task_id = null } = body;

    if (!code) return { success: false, error: 'No code provided' };
    if (!JUPYTER_URL || !JUPYTER_TOKEN) {
        return { success: false, error: 'Jupyter service not configured (missing JUPYTER_URL or JUPYTER_TOKEN)' };
    }

    const startTime = Date.now();
    console.log(`🐍 [jupyter-executor] Stateless execute — ${code.length} chars`);

    // Create ephemeral session
    const { sessionId, kernelId } = await createSession(`tmp_${Date.now()}.ipynb`);

    try {
        const result = await executeOnKernel(kernelId, code);
        const executionTimeMs = Date.now() - startTime;
        const exitCode = result.error ? 1 : 0;

        await logExecution({
            code, stdout: result.stdout, stderr: result.stderr || result.error || '',
            exitCode, executionTimeMs, source, purpose, agentId: agent_id,
            taskId: task_id, sessionId: null, backend: 'jupyter',
        });

        return {
            success: exitCode === 0,
            output: result.stdout,
            error: result.stderr || result.error || '',
            exitCode,
            outputs: result.outputs,
            execution_count: result.execution_count,
            language: 'python',
            version: '3.11',
            backend: 'jupyter',
        };
    } finally {
        // Clean up ephemeral session (fire-and-forget)
        deleteSession(sessionId).catch(() => { });
    }
}

async function handleCreateSession(body: Record<string, any>): Promise<Record<string, any>> {
    const { session_id } = body;
    if (!session_id) return { success: false, error: 'session_id is required' };

    const { sessionId, kernelId } = await getOrCreateNamedSession(session_id);
    return {
        success: true,
        session_id,
        jupyter_session_id: sessionId,
        kernel_id: kernelId,
        message: `Session '${session_id}' ready`,
    };
}

async function handleRunInSession(body: Record<string, any>): Promise<Record<string, any>> {
    const { session_id, code, purpose = '', source = 'eliza', agent_id = null, task_id = null } = body;
    if (!session_id) return { success: false, error: 'session_id is required' };
    if (!code) return { success: false, error: 'code is required' };

    const startTime = Date.now();
    const { kernelId } = await getOrCreateNamedSession(session_id);

    const result = await executeOnKernel(kernelId, code);
    const executionTimeMs = Date.now() - startTime;
    const exitCode = result.error ? 1 : 0;

    await logExecution({
        code, stdout: result.stdout, stderr: result.stderr || result.error || '',
        exitCode, executionTimeMs, source, purpose, agentId: agent_id,
        taskId: task_id, sessionId: session_id, backend: 'jupyter-stateful',
    });

    return {
        success: exitCode === 0,
        session_id,
        output: result.stdout,
        error: result.stderr || result.error || '',
        exitCode,
        outputs: result.outputs,
        execution_count: result.execution_count,
        backend: 'jupyter-stateful',
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
        kernel_id: data.kernel_id,
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

async function handleHealthCheck(): Promise<Record<string, any>> {
    if (!JUPYTER_URL || !JUPYTER_TOKEN) {
        return { healthy: false, error: 'JUPYTER_URL or JUPYTER_TOKEN not configured' };
    }
    try {
        const res = await fetch(`${JUPYTER_URL}/api`, { headers: jupyterHeaders() });
        if (!res.ok) return { healthy: false, error: `Jupyter API returned ${res.status}` };
        const data = await res.json();
        return { healthy: true, version: data.version, url: JUPYTER_URL };
    } catch (err: any) {
        return { healthy: false, error: err.message };
    }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    if (req.method === 'GET') {
        const health = await handleHealthCheck();
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
                result = await handleHealthCheck();
                break;
            default:
                result = { success: false, error: `Unknown action: ${action}. Valid: execute, create_session, run_in_session, get_session_state, close_session, health` };
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
