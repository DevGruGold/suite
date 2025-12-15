/**
 * EVENT DISPATCHER - The Prefrontal Cortex
 * 
 * Purpose: Intelligent routing and decision-making based on event type
 * 
 * Flow:
 * 1. Receive validated event from event-router
 * 2. Query event_actions table for matching patterns
 * 3. Execute actions (trigger workflows, assign tasks, call functions, create issues)
 * 4. Log results back to webhook_logs
 * 5. Update event flow analytics
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EventAction {
  id: string;
  event_pattern: string;
  priority: number;
  actions: ActionDefinition[];
  conditions?: Record<string, any>;
  is_active: boolean;
}

interface ActionDefinition {
  type: 'trigger_workflow' | 'assign_task' | 'create_issue' | 'call_function';
  target: string;
  params: Record<string, any>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { event_id, event_source, event_type, priority, payload, metadata } = await req.json();

    console.log(`🎯 Dispatching event: ${event_type} (priority: ${priority})`);

    // Find matching event actions
    const { data: eventActions, error: actionError } = await supabase
      .from('event_actions')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (actionError) throw actionError;

    const matchingActions = eventActions.filter(action => 
      matchesPattern(action.event_pattern, event_type) &&
      meetsConditions(action.conditions || {}, payload, metadata)
    );

    console.log(`📋 Found ${matchingActions.length} matching action(s)`);

    if (matchingActions.length === 0) {
      await updateWebhookLog(supabase, event_id, {
        processing_status: 'completed',
        dispatcher_result: { message: 'No matching actions found', actions_executed: 0 }
      });

      return new Response(
        JSON.stringify({ success: true, message: 'No actions to execute' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Execute all matching actions
    const results = await Promise.all(
      matchingActions.flatMap(eventAction =>
        eventAction.actions.map(action =>
          executeAction(supabase, action, { event_type, payload, metadata })
        )
      )
    );

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`✅ Actions executed: ${successCount} success, ${failureCount} failed`);

    // Update webhook log with results
    await updateWebhookLog(supabase, event_id, {
      processing_status: failureCount === 0 ? 'dispatched' : 'partial_failure',
      dispatcher_result: {
        actions_executed: results.length,
        successful: successCount,
        failed: failureCount,
        results
      },
      dispatched_at: new Date().toISOString()
    });

    // Log activity
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'event_dispatch',
      title: `Event Dispatched: ${event_type}`,
      description: `Executed ${successCount}/${results.length} actions successfully`,
      status: failureCount === 0 ? 'completed' : 'partial_failure',
      metadata: {
        event_id,
        event_type,
        actions_executed: results.length,
        results
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        event_id,
        actions_executed: results.length,
        successful: successCount,
        failed: failureCount,
        results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Event dispatcher error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function matchesPattern(pattern: string, eventType: string): boolean {
  // Convert pattern to regex (support wildcards)
  const regexPattern = pattern
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(eventType);
}

function meetsConditions(conditions: Record<string, any>, payload: any, metadata: any): boolean {
  // Check label matches
  if (conditions.label_matches) {
    const labels = payload.issue?.labels?.map((l: any) => l.name) || [];
    const hasMatch = conditions.label_matches.some((label: string) => labels.includes(label));
    if (!hasMatch) return false;
  }

  // Check severity minimum
  if (conditions.severity_min) {
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    const payloadSeverity = payload.alert?.severity || payload.severity || 'low';
    const minIndex = severityOrder.indexOf(conditions.severity_min);
    const actualIndex = severityOrder.indexOf(payloadSeverity.toLowerCase());
    if (actualIndex < minIndex) return false;
  }

  return true;
}

async function executeAction(
  supabase: any,
  action: ActionDefinition,
  context: { event_type: string; payload: any; metadata: any }
): Promise<any> {
  console.log(`▶️ Executing action: ${action.type} -> ${action.target}`);

  try {
    switch (action.type) {
      case 'trigger_workflow':
        return await triggerGitHubWorkflow(supabase, action, context);
      
      case 'assign_task':
        return await assignTaskToAgent(supabase, action, context);
      
      case 'create_issue':
        return await createGitHubIssue(supabase, action, context);
      
      case 'call_function':
        return await callEdgeFunction(supabase, action, context);
      
      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (error) {
    console.error(`❌ Action failed:`, error);
    return { success: false, error: error.message, action: action.type };
  }
}

async function triggerGitHubWorkflow(supabase: any, action: ActionDefinition, context: any) {
  const params = interpolateParams(action.params, context);
  
  const result = await supabase.functions.invoke('github-integration', {
    body: {
      action: 'trigger_workflow',
      data: {
        owner: 'DevGruGold',
        repo: params.repo || 'XMRT-Ecosystem',
        workflow_file: action.target,
        ref: 'main',
        inputs: {
          ...params,
          event_type: context.event_type,
          event_source: context.metadata.event_source || 'event-dispatcher'
        }
      }
    }
  });

  return {
    success: !result.error,
    action_type: 'trigger_workflow',
    workflow: action.target,
    result: result.data,
    error: result.error?.message
  };
}

async function assignTaskToAgent(supabase: any, action: ActionDefinition, context: any) {
  const params = interpolateParams(action.params, context);
  
  // Default checklists by category
  const DEFAULT_CHECKLISTS: Record<string, string[]> = {
    GENERAL: ['Review request', 'Plan approach', 'Execute task', 'Verify completion'],
    CODE: ['Analyze requirements', 'Implement solution', 'Test changes', 'Document changes'],
    INFRA: ['Review current state', 'Plan changes', 'Apply changes', 'Verify deployment'],
    RESEARCH: ['Gather data', 'Analyze findings', 'Document insights', 'Create recommendations'],
    GOVERNANCE: ['Review proposal', 'Gather input', 'Make decision', 'Document rationale'],
  };
  
  const category = params.category || 'GENERAL';
  const checklist = DEFAULT_CHECKLISTS[category] || DEFAULT_CHECKLISTS.GENERAL;
  
  const task = {
    title: params.title || `Task from event: ${context.event_type}`,
    description: params.description || JSON.stringify(context.payload, null, 2),
    category,
    priority: params.priority || 5,
    status: 'PENDING',
    stage: 'DISCUSS',
    assignee_agent_id: action.target,
    metadata: {
      event_type: context.event_type,
      triggered_at: new Date().toISOString(),
      checklist,
      ...params.metadata
    },
    completed_checklist_items: []
  };

  const { data, error } = await supabase.from('tasks').insert(task).select().single();

  return {
    success: !error,
    action_type: 'assign_task',
    agent: action.target,
    task_id: data?.id,
    error: error?.message
  };
}

async function createGitHubIssue(supabase: any, action: ActionDefinition, context: any) {
  const params = interpolateParams(action.params, context);
  
  const result = await supabase.functions.invoke('github-integration', {
    body: {
      action: 'create_issue',
      data: {
        owner: 'DevGruGold',
        repo: action.target,
        title: params.title || `Event: ${context.event_type}`,
        body: params.body || JSON.stringify(context.payload, null, 2),
        labels: params.labels || ['automated', 'event-driven']
      }
    }
  });

  return {
    success: !result.error,
    action_type: 'create_issue',
    repo: action.target,
    issue_number: result.data?.issue?.number,
    error: result.error?.message
  };
}

async function callEdgeFunction(supabase: any, action: ActionDefinition, context: any) {
  const params = interpolateParams(action.params, context);
  
  const result = await supabase.functions.invoke(action.target, {
    body: {
      ...params,
      event_context: {
        event_type: context.event_type,
        payload: context.payload,
        metadata: context.metadata
      }
    }
  });

  return {
    success: !result.error,
    action_type: 'call_function',
    function: action.target,
    result: result.data,
    error: result.error?.message
  };
}

function interpolateParams(params: Record<string, any>, context: any): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.includes('{{')) {
      result[key] = value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
        return getNestedValue(context.payload, path) || value;
      });
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

async function updateWebhookLog(supabase: any, eventId: string, updates: Record<string, any>) {
  await supabase
    .from('webhook_logs')
    .update(updates)
    .eq('id', eventId);
}
