import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      throw new Error('Missing Supabase configuration');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🌙 Eliza generating evening summary...');
    
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY not configured');
      throw new Error('GEMINI_API_KEY not configured');
    }
    
    const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') || Deno.env.get('GITHUB_TOKEN_PROOF_OF_LIFE');
    if (!GITHUB_TOKEN) {
      console.error('❌ GitHub token not configured');
      throw new Error('GITHUB_TOKEN not configured');
    }

    // ============= RICH DYNAMIC DATA FETCHING =============

    // Get today's completed activities with details
    const { data: todayActivity } = await supabase
      .from('eliza_activity_log')
      .select('title, activity_type, description, status, metadata, created_at')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    // Get tasks completed TODAY specifically
    const { data: completedTasks } = await supabase
      .from('tasks')
      .select('title, category, stage, priority, assignee_agent_id, updated_at')
      .eq('status', 'COMPLETED')
      .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Get tasks that were unblocked today
    const { data: unblockedActivity } = await supabase
      .from('eliza_activity_log')
      .select('title, description, metadata')
      .ilike('activity_type', '%unblock%')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Get tomorrow's high priority tasks
    const { data: tomorrowTasks } = await supabase
      .from('tasks')
      .select('title, category, stage, priority, blocking_reason, assignee_agent_id')
      .in('status', ['PENDING', 'IN_PROGRESS', 'BLOCKED'])
      .order('priority', { ascending: true })
      .limit(10);

    // Get agent performance today
    const { data: agents } = await supabase
      .from('agents')
      .select('name, status, current_workload');

    // Get Python execution summary
    const { data: pythonToday } = await supabase
      .from('eliza_python_executions')
      .select('status, execution_time_ms')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Get function calls summary
    const { data: functionToday } = await supabase
      .from('eliza_function_usage')
      .select('function_name, success, execution_time_ms')
      .gte('invoked_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Get proposals that were approved/rejected today
    const { data: resolvedProposals } = await supabase
      .from('function_proposals')
      .select('function_name, status, category')
      .in('status', ['approved', 'rejected'])
      .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Get system health
    const { data: healthCheck } = await supabase
      .from('eliza_activity_log')
      .select('metadata')
      .eq('activity_type', 'system_health_check')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // ============= CALCULATE REAL METRICS =============

    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric'
    });

    // Activity breakdown
    const completedActivities = todayActivity?.filter(a => a.status === 'completed') || [];
    const failedActivities = todayActivity?.filter(a => a.status === 'failed') || [];
    
    // Activity by type
    const activityByType: Record<string, number> = {};
    todayActivity?.forEach(a => {
      activityByType[a.activity_type] = (activityByType[a.activity_type] || 0) + 1;
    });
    const topActivityTypes = Object.entries(activityByType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Python stats
    const pythonTotal = pythonToday?.length || 0;
    const pythonSuccess = pythonToday?.filter(p => p.status === 'completed').length || 0;
    const pythonSuccessRate = pythonTotal > 0 ? ((pythonSuccess / pythonTotal) * 100).toFixed(1) : 'N/A';

    // Function stats
    const functionTotal = functionToday?.length || 0;
    const functionSuccess = functionToday?.filter(f => f.success).length || 0;
    const functionSuccessRate = functionTotal > 0 ? ((functionSuccess / functionTotal) * 100).toFixed(1) : 'N/A';

    // Top functions by usage today
    const functionCounts: Record<string, number> = {};
    functionToday?.forEach(f => {
      functionCounts[f.function_name] = (functionCounts[f.function_name] || 0) + 1;
    });
    const topFunctions = Object.entries(functionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Agent summary
    const busyAgents = agents?.filter(a => a.status === 'BUSY') || [];
    const idleAgents = agents?.filter(a => a.status === 'IDLE') || [];

    // Tomorrow's blockers
    const tomorrowBlocked = tomorrowTasks?.filter(t => t.blocking_reason) || [];

    const healthScore = healthCheck?.metadata?.health_score || 'Unknown';

    // ============= BUILD DETAILED CONTEXT =============

    const completedTasksText = completedTasks && completedTasks.length > 0
      ? completedTasks.map(t => `  - ✅ "${t.title}" [${t.category}]`).join('\n')
      : '  No tasks completed today';

    const topActivitiesText = completedActivities.slice(0, 8).map(a => 
      `  - ${a.title || a.activity_type}`
    ).join('\n') || '  No completed activities';

    const failuresText = failedActivities.length > 0
      ? failedActivities.slice(0, 3).map(a => `  - ❌ ${a.title}: ${a.description?.substring(0, 50) || 'No details'}`).join('\n')
      : '  ✅ No failures!';

    const tomorrowTasksText = tomorrowTasks?.slice(0, 5).map(t => {
      const priority = t.priority <= 2 ? '🔴 HIGH' : t.priority <= 4 ? '🟡 MED' : '⚪ LOW';
      const blocked = t.blocking_reason ? ' ⚠️ BLOCKED' : '';
      return `  - ${priority} "${t.title}" [${t.stage}]${blocked}`;
    }).join('\n') || '  No pending tasks';

    const tomorrowBlockedText = tomorrowBlocked.length > 0
      ? tomorrowBlocked.map(t => `  - ⚠️ "${t.title}": ${t.blocking_reason}`).join('\n')
      : '  ✅ No blockers for tomorrow';

    const topFunctionsText = topFunctions.map(([name, count]) => 
      `  - \`${name}\`: ${count} calls`
    ).join('\n') || '  No function calls today';

    const resolvedProposalsText = resolvedProposals && resolvedProposals.length > 0
      ? resolvedProposals.map(p => `  - ${p.status === 'approved' ? '✅' : '❌'} \`${p.function_name}\` (${p.status})`).join('\n')
      : '  No proposals resolved today';

    // ============= GENERATE DYNAMIC PROMPT =============

    const prompt = `Generate a reflective evening wrap-up post for the XMRT DAO ecosystem based on ACTUAL TODAY'S ACCOMPLISHMENTS.

## REAL-TIME SYSTEM DATA (celebrate these specific achievements):

**Date:** ${today}
**System Health:** ${healthScore}/100

### ✅ Today's Accomplishments
- **Total Activities:** ${todayActivity?.length || 0} (${completedActivities.length} completed, ${failedActivities.length} failed)
- **Tasks Completed:** ${completedTasks?.length || 0}
- **Python Executions:** ${pythonTotal} (${pythonSuccessRate}% success)
- **Edge Function Calls:** ${functionTotal} (${functionSuccessRate}% success)

**Completed Tasks:**
${completedTasksText}

**Top Completed Activities:**
${topActivitiesText}

### 🔧 Most Used Functions Today
${topFunctionsText}

### ❌ Issues Encountered
${failuresText}

### 📜 Governance Progress
${resolvedProposalsText}

### 🤖 Agent Status at Day's End
- **Still Busy:** ${busyAgents.length} (${busyAgents.map(a => a.name.split(' - ')[0]).join(', ') || 'none'})
- **Now Idle:** ${idleAgents.length}

### 📋 Tomorrow's Focus (${tomorrowTasks?.length || 0} tasks pending)
${tomorrowTasksText}

**Blockers to Address Tomorrow:**
${tomorrowBlockedText}

---

## INSTRUCTIONS:
1. Celebrate ACTUAL accomplishments from the data - mention specific task/activity names
2. If tasks were completed, call them out by name
3. If there were failures, acknowledge them honestly and note what we learned
4. If agents are still busy, thank them by name for their continued work
5. Preview tomorrow based on the REAL pending tasks shown
6. If there are blockers for tomorrow, acknowledge them as priorities
7. Keep it warm, appreciative, and grounded in REAL data
8. Invite community to share their wins from today
9. Don't make up accomplishments - use what the data shows

Format as GitHub markdown with emojis. Sign off as Eliza.`;

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 2048 }
      })
    });

    const geminiData = await geminiResponse.json();
    const discussionBody = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || `## 🌙 Evening Wrap-up - ${today}

**Activities Today:** ${todayActivity?.length || 0}
**Tasks Completed:** ${completedTasks?.length || 0}
**Tomorrow's Tasks:** ${tomorrowTasks?.length || 0}

Evening wrap-up for ${today}.

— Eliza 🌙`;

    // Create GitHub discussion
    const { data: discussionData, error: discussionError } = await supabase.functions.invoke('github-integration', {
      body: {
        action: 'create_discussion',
        executive: 'eliza',
        data: {
          repositoryId: 'R_kgDONfvCEw',
          categoryId: 'DIC_kwDONfvCE84Cl9qy',
          title: `🌙 Evening Summary - ${today}`,
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
      activity_type: 'evening_summary_posted',
      title: '🌙 Evening Summary Posted',
      description: `Posted evening wrap-up to GitHub: ${discussion?.url || 'N/A'}`,
      metadata: {
        discussion_url: discussion?.url,
        discussion_id: discussion?.id,
        discussion_title: discussion?.title,
        today_activity_count: todayActivity?.length || 0,
        completed_activities_count: completedActivities.length,
        failed_activities_count: failedActivities.length,
        completed_tasks_count: completedTasks?.length || 0,
        completed_tasks: completedTasks?.map(t => t.title),
        tomorrow_tasks_count: tomorrowTasks?.length || 0,
        tomorrow_blocked_count: tomorrowBlocked.length,
        python_success_rate: pythonSuccessRate,
        function_success_rate: functionSuccessRate,
        health_score: healthScore
      },
      status: 'completed'
    });

    return new Response(
      JSON.stringify({
        success: true,
        discussion_url: discussion?.url,
        discussion_id: discussion?.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Evening Summary Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
