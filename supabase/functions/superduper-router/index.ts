import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'superduper-router';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-eliza-key',
};

interface SuperDuperRequest {
  agent_name: string;
  action: string;
  params: Record<string, any>;
  context?: Record<string, any>;
  triggered_by?: string;
}

interface SuperDuperAgent {
  id: string;
  agent_name: string;
  display_name: string;
  edge_function_name: string;
  status: string;
  priority: number;
}

/**
 * SuperDuper Router - Central orchestration hub for all 10 SuperDuper agents
 * 
 * This function:
 * 1. Validates incoming requests
 * 2. Routes to the appropriate SuperDuper agent
 * 3. Logs all executions
 * 4. Updates agent statistics
 * 5. Provides error handling and fallbacks
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const INTERNAL_ELIZA_KEY = Deno.env.get('INTERNAL_ELIZA_KEY');

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Authentication check
    const elizaKey = req.headers.get('x-eliza-key');
    const isInternalCall = elizaKey === INTERNAL_ELIZA_KEY;
    
    if (!isInternalCall) {
      // Allow authenticated users
      const authHeader = req.headers.get('authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: 'Authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Parse request
    const requestData: SuperDuperRequest = await req.json();
    const { agent_name, action, params, context, triggered_by = 'user' } = requestData;

    console.log(`🎯 SuperDuper Router: ${agent_name} -> ${action}`);

    // Validate agent name
    if (!agent_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'agent_name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== SPECIAL CASE: List all agents =====
    if (action === 'list_agents') {
      const { data: agents, error } = await supabase
        .from('superduper_agents')
        .select('*')
        .order('priority', { ascending: false });

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          agents,
          total_count: agents.length,
          active_count: agents.filter((a: any) => a.status === 'active').length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== SPECIAL CASE: Get agent capabilities =====
    if (action === 'get_capabilities') {
      const { data: agent, error: agentError } = await supabase
        .from('superduper_agents')
        .select('*')
        .eq('agent_name', agent_name)
        .single();

      if (agentError || !agent) {
        return new Response(
          JSON.stringify({ success: false, error: `Agent ${agent_name} not found` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          agent: {
            name: agent.display_name,
            capabilities: agent.combined_capabilities,
            functions: agent.core_functions,
            use_cases: agent.use_cases,
            status: agent.status
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== FETCH AGENT FROM DATABASE =====
    const { data: agent, error: agentError } = await supabase
      .from('superduper_agents')
      .select('*')
      .eq('agent_name', agent_name)
      .single();

    if (agentError || !agent) {
      console.error(`❌ Agent not found: ${agent_name}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Agent ${agent_name} not found in registry`,
          hint: 'Use action=list_agents to see all available agents'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check agent status
    if (agent.status !== 'active') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Agent ${agent.display_name} is currently ${agent.status}`,
          agent_status: agent.status
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== CREATE EXECUTION LOG ENTRY (STARTED) =====
    const executionStartTime = Date.now();
    
    const { data: logEntry, error: logError } = await supabase
      .from('superduper_execution_log')
      .insert({
        agent_id: agent.id,
        agent_name: agent.agent_name,
        action,
        input_params: params,
        status: 'started',
        triggered_by,
        context
      })
      .select()
      .single();

    if (logError) {
      console.warn('Failed to create execution log:', logError);
    }

    // ===== ROUTE TO AGENT EDGE FUNCTION =====
    console.log(`🚀 Invoking ${agent.edge_function_name}...`);
    
    try {
      const { data: agentResponse, error: invokeError } = await supabase.functions.invoke(
        agent.edge_function_name,
        {
          body: {
            action,
            params,
            context
          },
          headers: {
            'x-eliza-key': INTERNAL_ELIZA_KEY || ''
          }
        }
      );

      const executionTime = Date.now() - executionStartTime;

      if (invokeError) {
        console.error(`❌ Agent execution failed: ${invokeError.message}`);
        
        // Update log entry with failure
        if (logEntry) {
          await supabase
            .from('superduper_execution_log')
            .update({
              status: 'failed',
              error_message: invokeError.message,
              execution_time_ms: executionTime
            })
            .eq('id', logEntry.id);
        }

        // Update agent stats
        await supabase.rpc('increment', {
          table_name: 'superduper_agents',
          row_id: agent.id,
          column_name: 'failure_count'
        });

        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Agent execution failed: ${invokeError.message}`,
            agent: agent.display_name,
            execution_time_ms: executionTime
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`✅ Agent execution completed in ${executionTime}ms`);

      // Update log entry with success
      if (logEntry) {
        await supabase
          .from('superduper_execution_log')
          .update({
            status: 'completed',
            output_result: agentResponse,
            execution_time_ms: executionTime
          })
          .eq('id', logEntry.id);
      }

      // Update agent stats
      await supabase
        .from('superduper_agents')
        .update({
          execution_count: agent.execution_count + 1,
          success_count: agent.success_count + 1,
          last_execution_at: new Date().toISOString(),
          avg_execution_time_ms: agent.avg_execution_time_ms 
            ? (agent.avg_execution_time_ms * agent.execution_count + executionTime) / (agent.execution_count + 1)
            : executionTime
        })
        .eq('id', agent.id);

      // Log to Eliza activity log
      await supabase
        .from('eliza_activity_log')
        .insert({
          activity_type: 'superduper_agent',
          title: `🚀 ${agent.display_name}`,
          description: `Executed ${action} successfully`,
          metadata: {
            agent_name: agent.agent_name,
            action,
            execution_time_ms: executionTime,
            triggered_by,
            success: true
          },
          status: 'completed'
        });

      await usageTracker.success({ agent_name, action, execution_time_ms: executionTime });
      return new Response(
        JSON.stringify({ 
          success: true, 
          result: agentResponse,
          agent: agent.display_name,
          execution_time_ms: executionTime,
          log_id: logEntry?.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (executionError: any) {
      const executionTime = Date.now() - executionStartTime;
      console.error(`❌ Agent execution exception:`, executionError);

      // Update log entry with failure
      if (logEntry) {
        await supabase
          .from('superduper_execution_log')
          .update({
            status: 'failed',
            error_message: executionError.message,
            execution_time_ms: executionTime
          })
          .eq('id', logEntry.id);
      }

      // Update agent stats
      await supabase
        .from('superduper_agents')
        .update({
          execution_count: agent.execution_count + 1,
          failure_count: agent.failure_count + 1,
          last_execution_at: new Date().toISOString()
        })
        .eq('id', agent.id);

      await usageTracker.failure(executionError.message, 500);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Agent execution exception: ${executionError.message}`,
          agent: agent.display_name,
          execution_time_ms: executionTime
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: any) {
    console.error('SuperDuper Router error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
