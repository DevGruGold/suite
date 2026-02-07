import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { generateTextWithFallback } from "../_shared/unifiedAIFallback.ts";
import { startUsageTracking } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'weekly-retrospective-post';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, 'cso', { method: req.method });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('📈 Eliza generating weekly retrospective with AI fallback cascade...');

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // ============= RICH DYNAMIC DATA FETCHING =============

    // Get this week's activity
    const { data: weekActivity } = await supabase
      .from('eliza_activity_log')
      .select('title, activity_type, description, status, metadata, created_at')
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: false });

    // Get last week's activity for comparison
    const { data: lastWeekActivity } = await supabase
      .from('eliza_activity_log')
      .select('title, activity_type, status')
      .gte('created_at', twoWeeksAgo.toISOString())
      .lt('created_at', weekAgo.toISOString());

    // Get week's completed tasks
    const { data: weekTasks } = await supabase
      .from('tasks')
      .select('title, category, stage, priority, assignee_agent_id, updated_at')
      .eq('status', 'COMPLETED')
      .gte('updated_at', weekAgo.toISOString());

    // Get last week's completed tasks for comparison
    const { data: lastWeekTasks } = await supabase
      .from('tasks')
      .select('title')
      .eq('status', 'COMPLETED')
      .gte('updated_at', twoWeeksAgo.toISOString())
      .lt('updated_at', weekAgo.toISOString());

    // Get agent performance metrics
    const { data: agentMetrics } = await supabase
      .from('agent_performance_metrics')
      .select('agent_id, metric_type, metric_value, time_window')
      .gte('recorded_at', weekAgo.toISOString());

    // Get agents for name mapping
    const { data: agents } = await supabase
      .from('agents')
      .select('id, name, status, current_workload');

    // Get workflow executions
    const { data: weekWorkflows } = await supabase
      .from('workflow_executions')
      .select('workflow_template_id, status, created_at')
      .gte('created_at', weekAgo.toISOString());

    // Get Python execution stats
    const { data: pythonStats } = await supabase
      .from('eliza_python_executions')
      .select('status, execution_time_ms')
      .gte('created_at', weekAgo.toISOString());

    // Get function performance
    const { data: functionStats } = await supabase
      .from('eliza_function_usage')
      .select('function_name, success, execution_time_ms')
      .gte('invoked_at', weekAgo.toISOString());

    // Get governance activity
    const { data: proposalsThisWeek } = await supabase
      .from('function_proposals')
      .select('function_name, status, category, created_at')
      .gte('created_at', weekAgo.toISOString());

    // Get community ideas
    const { data: ideasThisWeek } = await supabase
      .from('community_ideas')
      .select('title, status, category')
      .gte('created_at', weekAgo.toISOString());

    // Get current system health
    const { data: healthCheck } = await supabase
      .from('eliza_activity_log')
      .select('metadata')
      .eq('activity_type', 'system_health_check')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // ============= CALCULATE REAL METRICS =============

    const weekStart = weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekEnd = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Activity metrics
    const thisWeekTotal = weekActivity?.length || 0;
    const lastWeekTotal = lastWeekActivity?.length || 0;
    const activityChange = lastWeekTotal > 0 
      ? (((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100).toFixed(0)
      : 'N/A';
    const activityTrend = thisWeekTotal > lastWeekTotal ? '📈 UP' : thisWeekTotal < lastWeekTotal ? '📉 DOWN' : '➡️ STABLE';

    // Task metrics
    const thisWeekTasksCount = weekTasks?.length || 0;
    const lastWeekTasksCount = lastWeekTasks?.length || 0;
    const taskChange = lastWeekTasksCount > 0 
      ? (((thisWeekTasksCount - lastWeekTasksCount) / lastWeekTasksCount) * 100).toFixed(0)
      : 'N/A';
    const taskTrend = thisWeekTasksCount > lastWeekTasksCount ? '📈 UP' : thisWeekTasksCount < lastWeekTasksCount ? '📉 DOWN' : '➡️ STABLE';

    // Daily averages
    const avgTasksPerDay = (thisWeekTasksCount / 7).toFixed(1);
    const avgActivitiesPerDay = (thisWeekTotal / 7).toFixed(1);

    // Activity breakdown by type
    const activityByType: Record<string, number> = {};
    weekActivity?.forEach(a => {
      activityByType[a.activity_type] = (activityByType[a.activity_type] || 0) + 1;
    });
    const topActivityTypes = Object.entries(activityByType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Failures this week
    const failedActivities = weekActivity?.filter(a => a.status === 'failed') || [];
    const failureRate = thisWeekTotal > 0 
      ? ((failedActivities.length / thisWeekTotal) * 100).toFixed(1)
      : '0';

    // Python stats
    const pythonTotal = pythonStats?.length || 0;
    const pythonSuccess = pythonStats?.filter(p => p.status === 'completed').length || 0;
    const pythonSuccessRate = pythonTotal > 0 ? ((pythonSuccess / pythonTotal) * 100).toFixed(1) : 'N/A';

    // Function stats
    const functionTotal = functionStats?.length || 0;
    const functionSuccess = functionStats?.filter(f => f.success).length || 0;
    const functionSuccessRate = functionTotal > 0 ? ((functionSuccess / functionTotal) * 100).toFixed(1) : 'N/A';

    // Top functions by usage
    const functionCounts: Record<string, { calls: number; successes: number }> = {};
    functionStats?.forEach(f => {
      if (!functionCounts[f.function_name]) {
        functionCounts[f.function_name] = { calls: 0, successes: 0 };
      }
      functionCounts[f.function_name].calls++;
      if (f.success) functionCounts[f.function_name].successes++;
    });
    const topFunctions = Object.entries(functionCounts)
      .sort((a, b) => b[1].calls - a[1].calls)
      .slice(0, 8);

    // Problem functions (< 90% success with at least 5 calls)
    const problemFunctions = Object.entries(functionCounts)
      .filter(([, stats]) => stats.calls >= 5 && (stats.successes / stats.calls) < 0.9)
      .map(([name, stats]) => `${name} (${((stats.successes / stats.calls) * 100).toFixed(0)}%)`);

    // Workflow stats
    const workflowsCompleted = weekWorkflows?.filter(w => w.status === 'completed').length || 0;
    const workflowsFailed = weekWorkflows?.filter(w => w.status === 'failed').length || 0;

    // Agent performance - create name map
    const agentNameMap: Record<string, string> = {};
    agents?.forEach(a => { agentNameMap[a.id] = a.name.split(' - ')[0]; });

    // Tasks by category
    const tasksByCategory: Record<string, number> = {};
    weekTasks?.forEach(t => {
      tasksByCategory[t.category || 'general'] = (tasksByCategory[t.category || 'general'] || 0) + 1;
    });

    // Governance stats
    const proposalsApproved = proposalsThisWeek?.filter(p => p.status === 'approved').length || 0;
    const proposalsRejected = proposalsThisWeek?.filter(p => p.status === 'rejected').length || 0;
    const proposalsPending = proposalsThisWeek?.filter(p => p.status === 'pending').length || 0;

    const healthScore = healthCheck?.metadata?.health_score || 'Unknown';

    // ============= BUILD DETAILED CONTEXT =============

    const completedTasksText = weekTasks?.slice(0, 10).map(t => 
      `  - ✅ "${t.title}" [${t.category}]`
    ).join('\n') || '  No tasks completed';

    const tasksByCategoryText = Object.entries(tasksByCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `  - **${cat}:** ${count} tasks`)
      .join('\n');

    const topActivityTypesText = topActivityTypes.map(([type, count]) => 
      `  - \`${type}\`: ${count} occurrences`
    ).join('\n');

    const topFunctionsText = topFunctions.map(([name, stats]) => {
      const rate = ((stats.successes / stats.calls) * 100).toFixed(0);
      return `  - \`${name}\`: ${stats.calls} calls (${rate}% success)`;
    }).join('\n');

    const problemFunctionsText = problemFunctions.length > 0
      ? problemFunctions.map(f => `  - ⚠️ ${f}`).join('\n')
      : '  ✅ All functions performing well';

    const failuresText = failedActivities.length > 0
      ? failedActivities.slice(0, 5).map(a => `  - ❌ ${a.title || a.activity_type}`).join('\n')
      : '  ✅ No major failures';

    const governanceText = `
- **Proposals Submitted:** ${proposalsThisWeek?.length || 0}
- **Approved:** ${proposalsApproved}
- **Rejected:** ${proposalsRejected}
- **Pending:** ${proposalsPending}`;

    const communityIdeasText = ideasThisWeek && ideasThisWeek.length > 0
      ? ideasThisWeek.map(i => `  - "${i.title}" [${i.status}]`).join('\n')
      : '  No new community ideas this week';

    // ============= GENERATE DYNAMIC PROMPT =============

    const prompt = `Generate a comprehensive weekly retrospective for the XMRT DAO ecosystem based on ACTUAL WEEK'S DATA.

## REAL WEEKLY DATA (${weekStart} - ${weekEnd})

### 📊 Key Metrics Comparison

| Metric | This Week | Last Week | Trend |
|--------|-----------|-----------|-------|
| Activities | ${thisWeekTotal} | ${lastWeekTotal} | ${activityTrend} ${activityChange !== 'N/A' ? `(${activityChange}%)` : ''} |
| Tasks Completed | ${thisWeekTasksCount} | ${lastWeekTasksCount} | ${taskTrend} ${taskChange !== 'N/A' ? `(${taskChange}%)` : ''} |

### 📈 Performance Metrics
- **Daily Avg Tasks:** ${avgTasksPerDay}
- **Daily Avg Activities:** ${avgActivitiesPerDay}
- **Failure Rate:** ${failureRate}%
- **System Health:** ${healthScore}/100
- **Python Success Rate:** ${pythonSuccessRate}% (${pythonTotal} executions)
- **Function Success Rate:** ${functionSuccessRate}% (${functionTotal} calls)
- **Workflows:** ${workflowsCompleted} completed, ${workflowsFailed} failed

### ✅ Tasks Completed (${thisWeekTasksCount} total)
**By Category:**
${tasksByCategoryText || '  No categorized tasks'}

**Notable Completions:**
${completedTasksText}

### 🔧 Function Performance
**Most Used Functions:**
${topFunctionsText}

**Problem Functions (< 90% success):**
${problemFunctionsText}

### 📋 Activity Breakdown
**Top Activity Types:**
${topActivityTypesText}

### ❌ Issues This Week (${failedActivities.length} failures)
${failuresText}

### 📜 Governance Activity
${governanceText}

### 💡 Community Ideas
${communityIdeasText}

### 🤖 Agent Fleet Status
- **Total Agents:** ${agents?.length || 0}
- **Currently Busy:** ${agents?.filter(a => a.status === 'BUSY').length || 0}
- **Total Workload:** ${agents?.reduce((sum, a) => sum + (a.current_workload || 0), 0) || 0} tasks

---

## INSTRUCTIONS:
1. Create a data-driven retrospective using the ACTUAL numbers above
2. Highlight week-over-week trends (are we improving or declining?)
3. Celebrate specific accomplishments - mention actual task names
4. Analyze what's accelerating vs what needs attention based on the data
5. If functions are failing, call them out and suggest investigation
6. Include lessons learned based on the actual failures/successes shown
7. Set next week's focus based on current blockers and pending work
8. Thank specific areas that performed well
9. Be strategic and insightful, not generic
10. Don't make up numbers - use exactly what's provided

Format as GitHub markdown with emojis. This is a strategic document - make it substantive. Sign off as CSO (Chief Strategy Officer).`;

    // Static fallback for when all AI providers fail
    const staticFallback = `## 📈 Weekly Retrospective: ${weekStart} - ${weekEnd}

**Activities:** ${thisWeekTotal} (${activityTrend} from last week)
**Tasks Completed:** ${thisWeekTasksCount}
**System Health:** ${healthScore}/100
**Python Success Rate:** ${pythonSuccessRate}%
**Function Success Rate:** ${functionSuccessRate}%

Weekly retrospective for ${weekStart} to ${weekEnd}.

— CSO 📈`;

    // Use AI fallback cascade: Lovable → DeepSeek → Kimi → Gemini
    let discussionBody: string;
    let aiProvider = 'static';
    
    try {
      console.log('🔄 Generating content with AI fallback cascade (Lovable → DeepSeek → Kimi → Gemini)...');
      const result = await generateTextWithFallback(prompt, undefined, {
        temperature: 0.8,
        maxTokens: 3500,
        useFullElizaContext: false
      });
      discussionBody = result.content;
      aiProvider = result.provider;
      console.log(`✅ Weekly retrospective generated using ${aiProvider} provider`);
    } catch (aiError) {
      console.warn('⚠️ All AI providers failed, using static template:', aiError);
      discussionBody = staticFallback;
    }

    // Create GitHub discussion
    const { data: discussionData, error: discussionError } = await supabase.functions.invoke('github-integration', {
      body: {
        action: 'create_discussion',
        executive: 'cso',
        data: {
          repositoryId: 'R_kgDONfvCEw',
          categoryId: 'DIC_kwDONfvCE84Cl9qy',
          title: `📈 Weekly Retrospective - ${weekStart} to ${weekEnd}`,
          body: discussionBody
        }
      }
    });

    if (discussionError) {
      console.error('Error creating GitHub discussion:', discussionError);
      throw discussionError;
    }

    const discussion = discussionData?.data;

    // Log with rich metadata
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'weekly_retrospective_posted',
      title: '📈 Weekly Retrospective Posted',
      description: `Posted weekly retrospective to GitHub: ${discussion?.url || 'N/A'}`,
      metadata: {
        discussion_url: discussion?.url,
        discussion_id: discussion?.id,
        discussion_title: discussion?.title,
        week_start: weekStart,
        week_end: weekEnd,
        week_activity_count: thisWeekTotal,
        last_week_activity_count: lastWeekTotal,
        activity_change_percent: activityChange,
        week_tasks_count: thisWeekTasksCount,
        last_week_tasks_count: lastWeekTasksCount,
        task_change_percent: taskChange,
        failure_rate: failureRate,
        python_success_rate: pythonSuccessRate,
        function_success_rate: functionSuccessRate,
        problem_functions: problemFunctions,
        health_score: healthScore,
        proposals_approved: proposalsApproved,
        proposals_rejected: proposalsRejected,
        ai_provider_used: aiProvider
      },
      status: 'completed'
    });

    await usageTracker.success({ result_summary: 'retrospective_posted', provider: aiProvider });
    return new Response(
      JSON.stringify({
        success: true,
        discussion_url: discussion?.url,
        discussion_id: discussion?.id,
        ai_provider: aiProvider
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Weekly Retrospective Error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
