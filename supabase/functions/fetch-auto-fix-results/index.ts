import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Fetch results from autonomous code-fixer and return formatted data for Eliza
 * This creates the feedback loop so Eliza gets results from auto-fixed code
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { original_execution_id } = await req.json();

    if (!original_execution_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'original_execution_id required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Find the auto-fix activity for this execution
    const { data: fixActivity, error: activityError } = await supabase
      .from('eliza_activity_log')
      .select('*')
      .eq('activity_type', 'python_fix_success')
      .contains('metadata', { original_execution_id })
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (activityError || !fixActivity) {
      // Auto-fix hasn't completed yet
      return new Response(JSON.stringify({
        success: true,
        status: 'pending',
        message: 'Auto-fix in progress, check back in 30 seconds'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get the fixed execution result
    const fixedExecutionId = fixActivity.metadata?.fixed_execution_id;
    if (!fixedExecutionId) {
      return new Response(JSON.stringify({
        success: true,
        status: 'completed',
        result: fixActivity.metadata?.fixed_code || 'Code was fixed but no execution data available'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: fixedExecution, error: execError } = await supabase
      .from('eliza_python_executions')
      .select('*')
      .eq('id', fixedExecutionId)
      .single();

    if (execError || !fixedExecution) {
      return new Response(JSON.stringify({
        success: true,
        status: 'completed',
        result: fixActivity.description
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Return the complete fixed execution result
    return new Response(JSON.stringify({
      success: true,
      status: 'completed',
      result: {
        code: fixedExecution.code,
        output: fixedExecution.output,
        exitCode: fixedExecution.exit_code,
        purpose: fixedExecution.purpose,
        executedAt: fixedExecution.created_at,
        fixDescription: fixActivity.description
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error fetching auto-fix results:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});