import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// Public Piston sandbox — sandboxed, limited libraries, NO network access from code.
// Falls back to public emkc.org if PISTON_URL is not set.
// For full library stack + network access, use jupyter-executor (Cloud Run service).
const PISTON_API_URL = Deno.env.get('PISTON_URL') || 'https://emkc.org/api/v2/piston';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (jsonError) {
      console.error('Failed to parse request body:', jsonError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const {
      code,
      language = 'python',
      version = '3.10.0',
      stdin = '',
      args = [],
      purpose = '',
      source = 'eliza',
      agent_id = null,
      task_id = null
    } = requestBody;

    if (!code) {
      return new Response(
        JSON.stringify({ error: 'No code provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🐍 [PYTHON-EXECUTOR] Source: ${source}, Purpose: ${purpose || 'none'}`);
    console.log(`📝 [CODE] ${code.length} chars — First 100: ${code.substring(0, 100)}...`);
    console.log(`⚙️ [CONFIG] Piston URL: ${PISTON_API_URL} (sandboxed, limited libs, no network from code)`);
    const startTime = Date.now();

    // ─── Call Piston /execute ──────────────────────────────────────────────────
    const pistonResponse = await fetch(`${PISTON_API_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language,
        version,
        files: [{ name: 'main.py', content: code }],
        stdin,
        args,
        run_timeout: 30000,
      }),
    });

    if (!pistonResponse.ok) {
      const errorText = await pistonResponse.text();
      console.error(`❌ [PISTON] HTTP ${pistonResponse.status}: ${errorText}`);
      return new Response(
        JSON.stringify({ error: 'Code execution service unavailable', details: errorText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pistonData = await pistonResponse.json();
    const executionTime = Date.now() - startTime;
    const exitCode = pistonData.run?.code ?? 1;
    const stdoutText = pistonData.run?.stdout || '';
    const stderrText = pistonData.run?.stderr || '';

    const result = {
      language: pistonData.language || language,
      version: pistonData.version || version,
      run: {
        stdout: stdoutText,
        stderr: stderrText,
        code: exitCode,
        output: stdoutText,
      }
    };

    console.log(`⏱️ [TIMING] Execution completed in ${executionTime}ms`);

    // ⚠️ Detect network errors in Python code (Piston sandbox has no network access)
    if (result.run?.stderr?.includes('urllib.request') ||
      result.run?.stderr?.includes('URLError') ||
      result.run?.stderr?.includes('socket.gaierror')) {
      console.warn('⚠️ Python code attempted network call — not supported in Piston sandbox. Use jupyter-executor instead.');

      return new Response(JSON.stringify({
        success: false,
        output: result.run?.stdout || '',
        error: '❌ Network calls not supported in Python sandbox. Use jupyter-executor for HTTP requests or invoke_edge_function for API calls.',
        exitCode: 1,
        language,
        version
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ─── Logging ───────────────────────────────────────────────────────────────
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'python_execution',
      title: purpose || 'Python Code Execution',
      description: `Executed Python code (${code.length} chars) in ${executionTime}ms`,
      metadata: {
        source, agent_id, task_id,
        execution_time_ms: executionTime,
        exit_code: exitCode,
        code_length: code.length,
        output_length: result.run?.stdout?.length || 0,
        has_error: !!result.run?.stderr,
        timestamp: new Date().toISOString()
      },
      status: exitCode === 0 ? 'completed' : 'failed'
    });

    console.log(`📊 [RESULT] Exit code: ${exitCode}`);
    console.log(`📤 [STDOUT] ${result.run?.stdout?.length || 0} chars: ${result.run?.stdout?.substring(0, 150) || '(empty)'}`);
    console.log(`❌ [STDERR] ${result.run?.stderr?.length || 0} chars: ${result.run?.stderr?.substring(0, 150) || '(empty)'}`);

    if (exitCode !== 0) {
      console.error(`🚨 [FAILURE] Python execution failed with exit code ${exitCode}`);
    } else {
      console.log(`✅ [SUCCESS] Python execution completed successfully`);
    }

    const wasAutoFixed = source === 'autonomous-code-fixer';

    const logResult = await supabase.from('eliza_python_executions').insert({
      code,
      output: result.run?.stdout || null,
      error_message: result.run?.stderr || null,
      exit_code: exitCode,
      execution_time_ms: executionTime,
      source,
      purpose: purpose || null,
      status: exitCode === 0 ? 'completed' : 'error',
      metadata: { agent_id, task_id, language, version, was_auto_fixed: wasAutoFixed }
    });

    if (logResult.error) {
      console.error('🚨 [DATABASE ERROR] Failed to log execution:', logResult.error);
    }

    await supabase.from('eliza_function_usage').insert({
      function_name: 'python-executor',
      success: exitCode === 0,
      execution_time_ms: executionTime,
      error_message: exitCode !== 0 ? (result.run?.stderr || 'Execution failed') : null,
      tool_category: 'python',
      context: JSON.stringify({
        source: 'python-executor-direct',
        purpose: purpose || null,
        code_length: code?.length || 0,
        agent_id, task_id, language, version, was_auto_fixed: wasAutoFixed
      }),
      invoked_at: new Date().toISOString(),
      deployment_version: 'python-executor-v3-piston'
    });

    const activityTitle = wasAutoFixed && exitCode === 0
      ? '🔧 Code Auto-Fixed and Executed Successfully'
      : exitCode === 0
        ? '✅ Code Executed Successfully (Piston)'
        : '❌ Code Execution Failed (Piston — try jupyter-executor for full stack)';

    await supabase.from('eliza_activity_log').insert({
      activity_type: wasAutoFixed ? 'python_fix_execution' : 'python_execution',
      title: activityTitle,
      description: code.substring(0, 150) + (code.length > 150 ? '...' : ''),
      metadata: { language, version, execution_time_ms: executionTime, exit_code: exitCode, was_auto_fixed: wasAutoFixed, source },
      status: exitCode === 0 ? 'completed' : 'failed'
    });

    // ─── Instant auto-fix trigger on failure ──────────────────────────────────
    if (exitCode === 1 && result.run?.stderr) {
      console.log('🔧 [AUTO-FIX] Triggering instant code monitor daemon...');
      supabase.functions.invoke('code-monitor-daemon', {
        body: { action: 'monitor', priority: 'immediate', source: 'python-executor' }
      }).then(() => {
        console.log('✅ [AUTO-FIX] Code monitor daemon triggered');
      }).catch(err => {
        console.error('❌ [AUTO-FIX] Failed to trigger:', err.message);
      });
    }

    return new Response(
      JSON.stringify({
        success: exitCode === 0,
        output: result.run?.stdout || '',
        error: result.run?.stderr || '',
        exitCode: result.run?.code || 0,
        language: result.language,
        version: result.version
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in python-executor:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
