import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'eliza-self-evaluation';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🧠 Starting Eliza self-evaluation...');

    // STEP 1: Performance Review (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .gte('created_at', yesterday.toISOString());

    const completedTasks = tasks?.filter(t => t.status === 'completed') || [];
    const failedTasks = tasks?.filter(t => t.status === 'failed') || [];
    const successRate = tasks && tasks.length > 0 
      ? Math.round((completedTasks.length / tasks.length) * 100) 
      : 100;

    console.log(`📊 Tasks: ${completedTasks.length} completed, ${failedTasks.length} failed (${successRate}% success rate)`);

    // STEP 2: Pattern Recognition
    const { data: activityLogs } = await supabase
      .from('eliza_activity_log')
      .select('*')
      .gte('created_at', yesterday.toISOString());

    const successfulActions = activityLogs?.filter(l => l.status === 'completed') || [];
    const failedActions = activityLogs?.filter(l => l.status === 'failed') || [];

    // Identify patterns
    const patterns: any[] = [];

    // Successful tool execution patterns
    const toolSuccesses = successfulActions.filter(a => a.activity_type === 'tool_execution_success');
    if (toolSuccesses.length > 5) {
      const topTools = toolSuccesses.reduce((acc: any, log: any) => {
        const tool = log.metadata?.tool || 'unknown';
        acc[tool] = (acc[tool] || 0) + 1;
        return acc;
      }, {});

      const mostUsed = Object.entries(topTools).sort((a: any, b: any) => b[1] - a[1])[0];
      if (mostUsed) {
        patterns.push({
          pattern_type: 'efficient_approach',
          context: { tool: mostUsed[0], usage_count: mostUsed[1], period: '24h' },
          action_taken: { action: 'tool_execution', tool_name: mostUsed[0] },
          outcome: 'success',
          lesson_learned: `${mostUsed[0]} tool is highly effective, used ${mostUsed[1]} times successfully`,
          confidence_score: 0.9,
          times_applied: mostUsed[1] as number
        });
      }
    }

    // Failed patterns to avoid
    if (failedActions.length > 0) {
      const failureTypes = failedActions.reduce((acc: any, log: any) => {
        const type = log.activity_type;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      const topFailure = Object.entries(failureTypes).sort((a: any, b: any) => b[1] - a[1])[0];
      if (topFailure && topFailure[1] as number >= 3) {
        patterns.push({
          pattern_type: 'failed_attempt',
          context: { failure_type: topFailure[0], occurrences: topFailure[1] },
          action_taken: { action: topFailure[0] },
          outcome: 'failure',
          lesson_learned: `Avoid repeating ${topFailure[0]} - failed ${topFailure[1]} times in 24h`,
          confidence_score: 0.85,
          times_applied: topFailure[1] as number
        });
      }
    }

    // Store learned patterns
    if (patterns.length > 0) {
      await supabase.from('eliza_work_patterns').insert(patterns);
      console.log(`✅ Learned ${patterns.length} new patterns`);
    }

    // STEP 3: Capability Expansion - check for new components
    const { data: newFunctions } = await supabase
      .from('system_architecture_knowledge')
      .select('component_name')
      .eq('component_type', 'function')
      .gte('created_at', yesterday.toISOString());

    const capabilitiesExpanded = newFunctions?.length || 0;
    console.log(`🚀 Capabilities expanded: ${capabilitiesExpanded} new functions discovered`);

    // STEP 4: Goal Setting for next 24 hours
    const goals = {
      bugs_to_fix: Math.max(5, failedTasks.length * 2),
      optimizations_to_perform: 10,
      ideas_to_evaluate: 5,
      opportunities_to_discover: 20,
      target_success_rate: Math.min(100, successRate + 5)
    };

    console.log('🎯 Goals for next 24h:', goals);

    // Update performance metrics for yesterday
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('eliza_performance_metrics').upsert({
      metric_date: today,
      tasks_completed: completedTasks.length,
      new_patterns_learned: patterns.length,
      capabilities_expanded: capabilitiesExpanded
    }, { onConflict: 'metric_date' });

    // Log self-evaluation
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'self_evaluation',
      title: 'Daily Self-Evaluation Complete',
      description: `Success rate: ${successRate}%, Patterns learned: ${patterns.length}, Goals set for next 24h`,
      status: 'completed',
      metadata: {
        performance: { successRate, tasksCompleted: completedTasks.length, tasksFailed: failedTasks.length },
        patterns: patterns.length,
        goals
      }
    });

    await usageTracker.success({ success_rate: successRate, patterns_learned: patterns.length });
    return new Response(JSON.stringify({
      success: true,
      evaluation: {
        performance: { successRate, tasksCompleted: completedTasks.length, tasksFailed: failedTasks.length },
        patternsLearned: patterns.length,
        capabilitiesExpanded,
        goals
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Self-evaluation error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
