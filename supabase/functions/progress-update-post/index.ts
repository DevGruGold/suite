import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { generateTextWithFallback } from "../_shared/unifiedAIFallback.ts";
import { startUsageTracking } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'progress-update-post';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, 'cao', { method: req.method });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      throw new Error('Missing Supabase configuration');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('📊 Eliza generating progress update with AI fallback cascade...');
    
    const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') || Deno.env.get('GITHUB_TOKEN_PROOF_OF_LIFE');
    if (!GITHUB_TOKEN) {
      console.error('❌ GitHub token not configured');
      throw new Error('GITHUB_TOKEN not configured');
    }

    // ============= RICH DYNAMIC DATA FETCHING =============

    // Get recent completions (last hour) with details
    const { data: recentCompletions } = await supabase
      .from('eliza_activity_log')
      .select('title, activity_type, description, status, metadata, created_at')
      .eq('status', 'completed')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    // Get recent failures
    const { data: recentFailures } = await supabase
      .from('eliza_activity_log')
      .select('title, activity_type, description')
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    // Get active agents with current tasks
    const { data: activeAgents } = await supabase
      .from('agents')
      .select('name, status, current_workload')
      .eq('status', 'BUSY');

    // Get idle agents
    const { data: idleAgents } = await supabase
      .from('agents')
      .select('name')
      .eq('status', 'IDLE');

    // Get blocked tasks with reasons
    const { data: blockedTasks } = await supabase
      .from('tasks')
      .select('title, blocking_reason, category, stage')
      .eq('status', 'BLOCKED');

    // Get current workflow executions
    const { data: runningWorkflows } = await supabase
      .from('workflow_executions')
      .select('workflow_template_id, status, start_time')
      .eq('status', 'running');

    // Get Python executions in last hour
    const { data: pythonRecent } = await supabase
      .from('eliza_python_executions')
      .select('status')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    // Get function calls in last hour
    const { data: functionRecent } = await supabase
      .from('eliza_function_usage')
      .select('function_name, success')
      .gte('invoked_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    // Get ALL active tasks (PENDING, CLAIMED, IN_PROGRESS)
    const { data: activeTasks } = await supabase
      .from('tasks')
      .select('title, stage, status, assignee_agent_id')
      .in('status', ['PENDING', 'CLAIMED', 'IN_PROGRESS'])
      .limit(10);

    // ============= CALCULATE REAL METRICS =============

    const time = new Date().toLocaleTimeString('en-US', { 
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Python stats
    const pythonTotal = pythonRecent?.length || 0;
    const pythonSuccess = pythonRecent?.filter(p => p.status === 'completed').length || 0;
    const pythonRate = pythonTotal > 0 ? ((pythonSuccess / pythonTotal) * 100).toFixed(0) : 'N/A';

    // Function stats
    const functionTotal = functionRecent?.length || 0;
    const functionSuccess = functionRecent?.filter(f => f.success).length || 0;
    const functionRate = functionTotal > 0 ? ((functionSuccess / functionTotal) * 100).toFixed(0) : 'N/A';

    // Determine overall status
    const blockedCount = blockedTasks?.length || 0;
    const activeCount = activeAgents?.length || 0;
    const completedCount = recentCompletions?.length || 0;
    const failedCount = recentFailures?.length || 0;

    let statusEmoji = '🟢';
    let statusText = 'All systems nominal';
    if (blockedCount > 3 || failedCount > 2) {
      statusEmoji = '🟡';
      statusText = 'Moderate issues - attention needed';
    }
    if (blockedCount > 5 || failedCount > 5) {
      statusEmoji = '🔴';
      statusText = 'Critical issues detected';
    }
    if (activeCount === 0 && completedCount === 0) {
      statusEmoji = '🔵';
      statusText = 'Quiet period - ready for new work';
    }

    // ============= BUILD DETAILED CONTEXT =============

    const completionsText = recentCompletions && recentCompletions.length > 0
      ? recentCompletions.slice(0, 5).map(c => `  - ✅ ${c.title || c.activity_type}`).join('\n')
      : '  No completions in the last hour';

    const failuresText = recentFailures && recentFailures.length > 0
      ? recentFailures.slice(0, 3).map(f => `  - ❌ ${f.title || f.activity_type}`).join('\n')
      : '  ✅ No failures';

    const activeAgentsText = activeAgents && activeAgents.length > 0
      ? activeAgents.map(a => `  - 🤖 ${a.name.split(' - ')[0]} (${a.current_workload} tasks)`).join('\n')
      : '  No agents currently busy';

    const blockedText = blockedTasks && blockedTasks.length > 0
      ? blockedTasks.slice(0, 3).map(t => `  - 🚫 "${t.title}": ${t.blocking_reason || 'Unknown'}`).join('\n')
      : '  ✅ No blockers';

    const activeTasksText = activeTasks && activeTasks.length > 0
      ? activeTasks.map(t => {
          const statusIcon = t.status === 'IN_PROGRESS' ? '🔄' : t.status === 'CLAIMED' ? '🟢' : '⚪';
          return `  - ${statusIcon} "${t.title}" [${t.stage}] (${t.status})`;
        }).join('\n')
      : '  No active tasks';

    const workflowsText = runningWorkflows && runningWorkflows.length > 0
      ? runningWorkflows.map(w => `  - ⚙️ ${w.workflow_template_id}`).join('\n')
      : '  No workflows running';

    // ============= GENERATE DYNAMIC PROMPT =============

    const prompt = `Generate a concise hourly progress update for the XMRT DAO ecosystem based on ACTUAL CURRENT STATE.

## REAL-TIME STATUS (${time} UTC)

### ${statusEmoji} Overall Status: ${statusText}

### 📊 Last Hour Metrics
- **Completions:** ${completedCount}
- **Failures:** ${failedCount}
- **Python Executions:** ${pythonTotal} (${pythonRate}% success)
- **Function Calls:** ${functionTotal} (${functionRate}% success)

### ✅ Recently Completed
${completionsText}

### ❌ Recent Failures
${failuresText}

### 🤖 Active Agents (${activeCount})
${activeAgentsText}

**Idle Agents:** ${idleAgents?.length || 0}

### 🔄 Active Tasks (${activeTasks?.length || 0})
${activeTasksText}

### 🚫 Blockers (${blockedCount})
${blockedText}

### ⚙️ Running Workflows (${runningWorkflows?.length || 0})
${workflowsText}

---

## INSTRUCTIONS:
1. Create a BRIEF status update (this is a pulse check, not a deep dive)
2. Reference the ACTUAL numbers and specific items above
3. If there are completions, highlight 1-2 notable ones
4. If there are blockers, flag them as priorities
5. If there are failures, acknowledge them briefly
6. Mention active agents by name
7. Keep it factual and concise - 150-250 words max
8. Include the status emoji and assessment

Format as GitHub markdown. Sign off as Eliza with the CAO (analytics) attribution.`;

    // Static fallback for when all AI providers fail
    const staticFallback = `## ${statusEmoji} Quick Status Update (${time} UTC)

**Status:** ${statusText}
**Completions:** ${completedCount} | **Failures:** ${failedCount}
**Active Agents:** ${activeCount} | **Blockers:** ${blockedCount}
**Python Success:** ${pythonRate}% | **Function Success:** ${functionRate}%

— Eliza 📊`;

    // Use AI fallback cascade: Lovable → DeepSeek → Kimi → Gemini
    let discussionBody: string;
    let aiProvider = 'static';
    
    try {
      console.log('🔄 Generating content with AI fallback cascade (Lovable → DeepSeek → Kimi → Gemini)...');
      const result = await generateTextWithFallback(prompt, undefined, {
        temperature: 0.7,
        maxTokens: 1024,
        useFullElizaContext: false
      });
      discussionBody = result.content;
      aiProvider = result.provider;
      console.log(`✅ Progress update generated using ${aiProvider} provider`);
    } catch (aiError) {
      console.warn('⚠️ All AI providers failed, using static template:', aiError);
      discussionBody = staticFallback;
    }

    // Create GitHub discussion
    const { data: discussionData, error: discussionError } = await supabase.functions.invoke('github-integration', {
      body: {
        action: 'create_discussion',
        executive: 'cao',
        data: {
          repositoryId: 'R_kgDONfvCEw',
          categoryId: 'DIC_kwDONfvCE84Cl9qy',
          title: `📊 Progress Update - ${time} UTC`,
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
      activity_type: 'progress_update_posted',
      title: '📊 Progress Update Posted',
      description: `Posted progress update to GitHub: ${discussion?.url || 'N/A'}`,
      metadata: {
        discussion_url: discussion?.url,
        discussion_id: discussion?.id,
        discussion_title: discussion?.title,
        status_emoji: statusEmoji,
        status_text: statusText,
        completions_count: completedCount,
        failures_count: failedCount,
        active_agents_count: activeCount,
        active_agents: activeAgents?.map(a => a.name),
        blocked_tasks_count: blockedCount,
        blocked_tasks: blockedTasks?.map(t => t.title),
        python_success_rate: pythonRate,
        function_success_rate: functionRate,
        ai_provider_used: aiProvider
      },
      status: 'completed'
    });

    await usageTracker.success({ result_summary: 'update_posted', provider: aiProvider });
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
    console.error('Progress Update Error:', error);
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
