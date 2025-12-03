/**
 * eliza-python-runtime: Direct Python execution with network access
 * 
 * This edge function runs Python code with full network access,
 * allowing Eliza to call all 84 edge functions without Piston limitations.
 * 
 * Uses Deno's subprocess API to run Python directly.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      code,
      purpose = '',
      source = 'eliza',
      agent_id = null,
      task_id = null,
      timeout_ms = 30000
    } = await req.json();

    if (!code) {
      return new Response(
        JSON.stringify({ error: 'No code provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🐍 [ELIZA-RUNTIME] Source: ${source}, Purpose: ${purpose}`);
    const startTime = Date.now();

    // Create temporary Python file
    const tempFile = await Deno.makeTempFile({ suffix: '.py' });
    
    // Inject Supabase environment variables into Python code
    const codeWithEnv = `
import os

# Supabase configuration (available to all Python code)
SUPABASE_URL = "${supabaseUrl}"
SUPABASE_SERVICE_KEY = "${supabaseServiceKey}"

# User's code starts here
${code}
`;

    await Deno.writeTextFile(tempFile, codeWithEnv);

    try {
      // Execute Python with network access
      const command = new Deno.Command('python3', {
        args: [tempFile],
        stdout: 'piped',
        stderr: 'piped',
      });

      const process = command.spawn();

      // Set up timeout
      const timeoutId = setTimeout(() => {
        process.kill('SIGTERM');
      }, timeout_ms);

      const { code: exitCode, stdout, stderr } = await process.output();
      clearTimeout(timeoutId);

      const executionTime = Date.now() - startTime;
      const output = new TextDecoder().decode(stdout);
      const error = new TextDecoder().decode(stderr);

      // Log execution to eliza_python_executions
      await supabase.from('eliza_python_executions').insert({
        code,
        output: output || null,
        error_message: error || null,  // FIXED: use error_message not error
        exit_code: exitCode,
        execution_time_ms: executionTime,
        source: source,
        purpose: purpose || null,
        status: exitCode === 0 ? 'completed' : 'error',  // Add explicit status
        metadata: {
          agent_id,
          task_id,
          runtime: 'eliza-python-runtime',
          network_enabled: true
        }
      });

      // ALSO log to eliza_function_usage for analytics visibility
      await supabase.from('eliza_function_usage').insert({
        function_name: 'execute_python',
        success: exitCode === 0,
        execution_time_ms: executionTime,
        error_message: exitCode !== 0 ? (error || 'Execution failed') : null,
        tool_category: 'python',
        context: JSON.stringify({
          source: 'eliza-python-runtime-direct',
          purpose: purpose,
          code_length: code?.length || 0,
          agent_id,
          task_id
        }),
        invoked_at: new Date().toISOString(),
        deployment_version: 'eliza-python-runtime-v2'
      });

      // Log to activity
      await supabase.from('eliza_activity_log').insert({
        activity_type: 'python_execution',
        description: `🐍 Eliza executed Python: ${purpose || 'No description'}`,
        metadata: {
          execution_time_ms: executionTime,
          exit_code: exitCode,
          source,
          agent_id,
          task_id
        },
        status: exitCode === 0 ? 'completed' : 'failed'
      });

      // Trigger auto-fix if failed
      if (exitCode !== 0 && error) {
        supabase.functions.invoke('code-monitor-daemon', {
          body: { action: 'monitor', priority: 'immediate', source: 'eliza-python-runtime' }
        }).catch(err => console.error('Failed to trigger auto-fix:', err));
      }

      return new Response(
        JSON.stringify({
          success: exitCode === 0,
          output,
          error,
          exitCode,
          executionTime
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } finally {
      // Cleanup temp file
      try {
        await Deno.remove(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }

  } catch (error) {
    console.error('Error in eliza-python-runtime:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
