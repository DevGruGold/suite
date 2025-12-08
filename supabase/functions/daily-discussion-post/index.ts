import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateTextWithFallback } from "../_shared/unifiedAIFallback.ts";

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

    console.log('💬 Eliza generating daily discussion post with AI fallback cascade...');
    
    const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') || Deno.env.get('GITHUB_TOKEN_PROOF_OF_LIFE');
    if (!GITHUB_TOKEN) {
      console.error('❌ GitHub token not configured');
      throw new Error('GITHUB_TOKEN not configured');
    }

    // ============= RICH DYNAMIC DATA FETCHING =============

    // Get today's report from activity log
    const { data: todayReport } = await supabase
      .from('eliza_activity_log')
      .select('*')
      .eq('activity_type', 'daily_report_generated')
      .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get blocked tasks with full details
    const { data: blockedTasks } = await supabase
      .from('tasks')
      .select('title, category, stage, blocking_reason, priority, created_at, assignee_agent_id')
      .eq('status', 'BLOCKED')
      .order('priority', { ascending: true });

    // Get recent activity with details
    const { data: recentActivity } = await supabase
      .from('eliza_activity_log')
      .select('title, activity_type, description, status, metadata, created_at')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(30);

    // Get function performance breakdown
    const { data: functionPerformance } = await supabase
      .from('eliza_function_usage')
      .select('function_name, success, execution_time_ms, error_message')
      .gte('invoked_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Get agent performance
    const { data: agents } = await supabase
      .from('agents')
      .select('name, status, current_workload');

    // Get governance proposals
    const { data: proposals } = await supabase
      .from('function_proposals')
      .select('function_name, status, created_at, category')
      .order('created_at', { ascending: false })
      .limit(5);

    // Get Python execution stats
    const { data: pythonStats } = await supabase
      .from('eliza_python_executions')
      .select('status, error_message, execution_time_ms')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Get community ideas
    const { data: communityIdeas } = await supabase
      .from('community_ideas')
      .select('title, status, category')
      .eq('status', 'pending')
      .limit(5);

    // ============= CALCULATE REAL METRICS =============

    const reportDate = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });

    // Function performance by name
    const functionBreakdown: Record<string, { calls: number; successes: number; failures: number; avgTime: number; errors: string[] }> = {};
    functionPerformance?.forEach(f => {
      if (!functionBreakdown[f.function_name]) {
        functionBreakdown[f.function_name] = { calls: 0, successes: 0, failures: 0, avgTime: 0, errors: [] };
      }
      functionBreakdown[f.function_name].calls++;
      if (f.success) {
        functionBreakdown[f.function_name].successes++;
      } else {
        functionBreakdown[f.function_name].failures++;
        if (f.error_message) functionBreakdown[f.function_name].errors.push(f.error_message);
      }
      functionBreakdown[f.function_name].avgTime += f.execution_time_ms || 0;
    });

    // Calculate averages and find problem functions
    const problemFunctions: string[] = [];
    const topFunctions: { name: string; calls: number; rate: string }[] = [];
    Object.entries(functionBreakdown).forEach(([name, stats]) => {
      stats.avgTime = Math.round(stats.avgTime / stats.calls);
      const successRate = (stats.successes / stats.calls) * 100;
      if (successRate < 90) problemFunctions.push(`${name} (${successRate.toFixed(0)}% success)`);
      topFunctions.push({ name, calls: stats.calls, rate: `${successRate.toFixed(0)}%` });
    });
    topFunctions.sort((a, b) => b.calls - a.calls);

    // Python stats
    const pythonTotal = pythonStats?.length || 0;
    const pythonSuccess = pythonStats?.filter(p => p.status === 'completed').length || 0;
    const pythonErrors = pythonStats?.filter(p => p.status === 'error') || [];
    const pythonSuccessRate = pythonTotal > 0 ? ((pythonSuccess / pythonTotal) * 100).toFixed(1) : 'N/A';

    // Activity breakdown
    const activityByType: Record<string, number> = {};
    recentActivity?.forEach(a => {
      activityByType[a.activity_type] = (activityByType[a.activity_type] || 0) + 1;
    });
    const failedActivities = recentActivity?.filter(a => a.status === 'failed') || [];

    // Agent status
    const busyAgents = agents?.filter(a => a.status === 'BUSY') || [];
    const totalWorkload = agents?.reduce((sum, a) => sum + (a.current_workload || 0), 0) || 0;

    // ============= BUILD DETAILED CONTEXT =============

    const blockedTasksText = blockedTasks && blockedTasks.length > 0
      ? blockedTasks.map(t => `  - **"${t.title}"** [${t.category}/${t.stage}]: ${t.blocking_reason || 'No reason specified'}`).join('\n')
      : '  ✅ No blocked tasks!';

    const topFunctionsText = topFunctions.slice(0, 5).map(f => 
      `  - \`${f.name}\`: ${f.calls} calls, ${f.rate} success`
    ).join('\n');

    const problemFunctionsText = problemFunctions.length > 0
      ? problemFunctions.map(f => `  - ⚠️ ${f}`).join('\n')
      : '  ✅ All functions performing well';

    const recentActivityText = recentActivity?.slice(0, 8).map(a => {
      const status = a.status === 'failed' ? '❌' : '✅';
      return `  - ${status} ${a.title || a.activity_type}`;
    }).join('\n') || '  No recent activity';

    const failedActivityText = failedActivities.length > 0
      ? failedActivities.slice(0, 3).map(a => `  - ❌ ${a.title}: ${a.description?.substring(0, 60) || 'No details'}`).join('\n')
      : '  ✅ No failures today';

    const proposalsText = proposals && proposals.length > 0
      ? proposals.map(p => `  - \`${p.function_name}\` (${p.status}) - ${p.category || 'general'}`).join('\n')
      : '  No recent proposals';

    const communityIdeasText = communityIdeas && communityIdeas.length > 0
      ? communityIdeas.map(i => `  - "${i.title}" [${i.category}]`).join('\n')
      : '  No pending community ideas';

    // ============= GENERATE DYNAMIC PROMPT =============

    const prompt = `Generate a thoughtful daily discussion post for the XMRT DAO ecosystem based on ACTUAL CURRENT SYSTEM DATA.

## REAL-TIME SYSTEM DATA (reference these specific facts):

**Date:** ${reportDate}
**Daily Report:** ${todayReport?.metadata?.issue_url || 'Not yet generated'}

### 📊 Today's Metrics
- **Total Activities (24h):** ${recentActivity?.length || 0}
- **Failed Activities:** ${failedActivities.length}
- **Python Executions:** ${pythonTotal} (${pythonSuccessRate}% success)
- **Edge Function Calls:** ${functionPerformance?.length || 0}

### 🚫 Blocked Tasks (${blockedTasks?.length || 0})
${blockedTasksText}

### 🔧 Function Performance (24h)
**Top Functions by Usage:**
${topFunctionsText}

**Problem Functions (< 90% success):**
${problemFunctionsText}

### ❌ Failed Activities Today
${failedActivityText}

### 🤖 Agent Status
- **Busy:** ${busyAgents.length} agents (${busyAgents.map(a => a.name.split(' - ')[0]).join(', ') || 'none'})
- **Total Workload:** ${totalWorkload} tasks across all agents

### 📜 Governance & Community
**Recent Proposals:**
${proposalsText}

**Pending Community Ideas:**
${communityIdeasText}

### 📈 Recent Activity
${recentActivityText}

---

## INSTRUCTIONS:
1. Reference ACTUAL numbers and specific function/task names from above
2. If blocked tasks exist, analyze WHY they might be blocked and propose specific solutions
3. If functions are failing (< 90% success), discuss what might be causing issues
4. If there are failed activities, acknowledge them and suggest follow-up
5. Mention specific busy agents by name
6. If community ideas or proposals exist, invite discussion on them
7. Be conversational and authentic - not corporate
8. Ask specific questions to the community based on the actual challenges shown
9. Don't be generic - respond to what the data actually shows

Format as GitHub markdown with emojis. Sign off as Eliza.`;

    // Static fallback for when all AI providers fail
    const staticFallback = `## 💡 Daily Thoughts - ${reportDate}

**Activities Today:** ${recentActivity?.length || 0}
**Blocked Tasks:** ${blockedTasks?.length || 0}
**Function Calls:** ${functionPerformance?.length || 0}
**Python Success Rate:** ${pythonSuccessRate}%

### 📊 Quick Overview
- ${busyAgents.length} agents currently busy
- ${failedActivities.length} failed activities today
- ${problemFunctions.length} functions need attention

Daily thoughts for ${reportDate}.

— Eliza 💬`;

    // Use AI fallback cascade: Lovable → DeepSeek → Kimi → Gemini
    let discussionBody: string;
    let aiProvider = 'static';
    
    try {
      console.log('🔄 Generating content with AI fallback cascade (Lovable → DeepSeek → Kimi → Gemini)...');
      const result = await generateTextWithFallback(prompt, undefined, {
        temperature: 0.85,
        maxTokens: 2048,
        useFullElizaContext: false
      });
      discussionBody = result.content;
      aiProvider = result.provider;
      console.log(`✅ Discussion generated using ${aiProvider} provider`);
    } catch (aiError) {
      console.warn('⚠️ All AI providers failed, using static template:', aiError);
      discussionBody = staticFallback;
    }

    // Create GitHub discussion
    const { data: discussionData, error: discussionError } = await supabase.functions.invoke('github-integration', {
      body: {
        action: 'create_discussion',
        executive: 'eliza',
        data: {
          repositoryId: 'R_kgDONfvCEw',
          categoryId: 'DIC_kwDONfvCE84Cl9qy',
          title: `💡 Eliza's Daily Thoughts - ${reportDate}`,
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
      activity_type: 'daily_discussion_posted',
      title: '💬 Daily Discussion Posted',
      description: `Posted daily discussion to GitHub: ${discussion?.url || 'N/A'}`,
      metadata: {
        discussion_url: discussion?.url,
        discussion_id: discussion?.id,
        discussion_title: discussion?.title,
        report_reference: todayReport?.metadata?.issue_url,
        blocked_tasks_count: blockedTasks?.length || 0,
        blocked_tasks: blockedTasks?.map(t => t.title),
        problem_functions: problemFunctions,
        failed_activities_count: failedActivities.length,
        python_success_rate: pythonSuccessRate,
        total_activities: recentActivity?.length || 0,
        busy_agents: busyAgents.map(a => a.name),
        ai_provider_used: aiProvider
      },
      status: 'completed'
    });

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
    console.error('Daily Discussion Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
