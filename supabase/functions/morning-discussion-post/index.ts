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

    console.log('🌅 Eliza generating morning discussion post with AI fallback cascade...');
    
    const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') || Deno.env.get('GITHUB_TOKEN_PROOF_OF_LIFE');
    if (!GITHUB_TOKEN) {
      console.error('❌ GitHub token not configured');
      throw new Error('GITHUB_TOKEN not configured');
    }

    // ============= RICH DYNAMIC DATA FETCHING =============
    
    // Get overnight activity with details
    const { data: overnightActivity } = await supabase
      .from('eliza_activity_log')
      .select('title, activity_type, description, status, metadata, created_at')
      .gte('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    // Get agent status with workload details
    const { data: agents } = await supabase
      .from('agents')
      .select('name, status, current_workload, role');

    // Get pending/active tasks with full details
    const { data: pendingTasks } = await supabase
      .from('tasks')
      .select('title, status, category, stage, priority, blocking_reason, assignee_agent_id')
      .in('status', ['PENDING', 'IN_PROGRESS', 'BLOCKED'])
      .order('priority', { ascending: true })
      .limit(15);

    // Get system health from recent health check
    const { data: healthCheck } = await supabase
      .from('eliza_activity_log')
      .select('metadata')
      .eq('activity_type', 'system_health_check')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get Python execution stats (last 24h)
    const { data: pythonStats } = await supabase
      .from('eliza_python_executions')
      .select('status')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Get function performance (last 24h)
    const { data: functionStats } = await supabase
      .from('eliza_function_usage')
      .select('function_name, success, execution_time_ms')
      .gte('invoked_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Get governance proposals status
    const { data: pendingProposals } = await supabase
      .from('function_proposals')
      .select('function_name, status, created_at')
      .eq('status', 'pending');

    // ============= CALCULATE REAL METRICS =============
    
    const busyAgents = agents?.filter(a => a.status === 'BUSY') || [];
    const idleAgents = agents?.filter(a => a.status === 'IDLE') || [];
    const blockedTasks = pendingTasks?.filter(t => t.status === 'BLOCKED') || [];
    const inProgressTasks = pendingTasks?.filter(t => t.status === 'IN_PROGRESS') || [];
    
    const pythonTotal = pythonStats?.length || 0;
    const pythonSuccess = pythonStats?.filter(p => p.status === 'completed').length || 0;
    const pythonSuccessRate = pythonTotal > 0 ? ((pythonSuccess / pythonTotal) * 100).toFixed(1) : 'N/A';
    
    const functionTotal = functionStats?.length || 0;
    const functionSuccess = functionStats?.filter(f => f.success).length || 0;
    const functionSuccessRate = functionTotal > 0 ? ((functionSuccess / functionTotal) * 100).toFixed(1) : 'N/A';
    const avgExecutionTime = functionTotal > 0 
      ? Math.round(functionStats!.reduce((sum, f) => sum + (f.execution_time_ms || 0), 0) / functionTotal)
      : 0;
    
    const healthScore = healthCheck?.metadata?.health_score || 'Unknown';

    // ============= BUILD DETAILED CONTEXT STRINGS =============
    
    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric'
    });

    // Agent status breakdown
    const agentStatusText = `
**BUSY (${busyAgents.length}):** ${busyAgents.map(a => a.name.split(' - ')[0]).join(', ') || 'None'}
**IDLE (${idleAgents.length}):** ${idleAgents.map(a => a.name.split(' - ')[0]).join(', ') || 'None'}`;

    // Task details with blocking reasons
    const taskDetails = pendingTasks?.slice(0, 8).map(t => {
      const status = t.status === 'BLOCKED' ? '🔴 BLOCKED' : t.status === 'IN_PROGRESS' ? '🟡 IN_PROGRESS' : '⚪ PENDING';
      const blockReason = t.blocking_reason ? ` — Blocked: ${t.blocking_reason}` : '';
      return `  - "${t.title}" [${t.category || 'general'}/${t.stage || 'N/A'}] ${status}${blockReason}`;
    }).join('\n') || '  No pending tasks';

    // Blocked tasks specifically
    const blockedTasksText = blockedTasks.length > 0 
      ? blockedTasks.map(t => `  - "${t.title}": ${t.blocking_reason || 'Unknown reason'}`).join('\n')
      : '  None - all clear!';

    // Overnight activity summary
    const overnightSummary = overnightActivity?.slice(0, 8).map(a => 
      `  - ${a.title || a.activity_type}: ${a.description?.substring(0, 80) || 'No description'}${a.status === 'failed' ? ' ❌' : ''}`
    ).join('\n') || '  Quiet night - no logged activity';

    // Count overnight successes/failures
    const overnightSuccesses = overnightActivity?.filter(a => a.status === 'completed').length || 0;
    const overnightFailures = overnightActivity?.filter(a => a.status === 'failed').length || 0;

    // ============= GENERATE DYNAMIC PROMPT =============
    
    const prompt = `Generate an energizing morning check-in post for the XMRT DAO ecosystem based on ACTUAL CURRENT SYSTEM STATE.

## REAL-TIME SYSTEM DATA (reference these specific numbers and facts):

**Date:** ${today}

### 📊 System Health
- **Overall Health Score:** ${healthScore}/100
- **Python Success Rate (24h):** ${pythonSuccessRate}% (${pythonTotal} executions)
- **Edge Function Success Rate (24h):** ${functionSuccessRate}% (${functionTotal} calls, avg ${avgExecutionTime}ms)

### 🤖 Agent Status (${agents?.length || 0} total)
${agentStatusText}

### 📋 Task Pipeline (${pendingTasks?.length || 0} active)
- **In Progress:** ${inProgressTasks.length}
- **Blocked:** ${blockedTasks.length}

**Active Tasks:**
${taskDetails}

### 🚫 Blocked Tasks (${blockedTasks.length})
${blockedTasksText}

### 🌙 Overnight Activity (${overnightActivity?.length || 0} events)
- Completed: ${overnightSuccesses} | Failed: ${overnightFailures}

**Recent Events:**
${overnightSummary}

### 📜 Governance
- Pending proposals: ${pendingProposals?.length || 0}

---

## INSTRUCTIONS:
1. Reference the ACTUAL numbers above - don't make up stats
2. Mention specific agent names that are BUSY vs IDLE
3. If blocked tasks exist, discuss them specifically and propose solutions
4. If system health < 95, acknowledge the issues and suggest what might help
5. If Python or function success rates are below 95%, flag this as concerning
6. Highlight overnight accomplishments OR acknowledge if it was a quiet night
7. Keep it energetic and motivating but GROUNDED IN REAL DATA
8. Don't be generic - be specific to what the data shows

Format as GitHub markdown with emojis. Sign off as Eliza.`;

    // Static fallback for when all AI providers fail
    const staticFallback = `## 🌅 Morning Check-in - ${today}

**System Health:** ${healthScore}/100
**Active Agents:** ${busyAgents.length} busy, ${idleAgents.length} idle
**Tasks:** ${pendingTasks?.length || 0} active (${blockedTasks.length} blocked)
**Python Success Rate:** ${pythonSuccessRate}%
**Function Success Rate:** ${functionSuccessRate}%

Morning check-in for ${today}.

— Eliza 🌅`;

    // Use AI fallback cascade: Lovable → DeepSeek → Kimi → Gemini
    let discussionBody: string;
    let aiProvider = 'static';
    
    try {
      console.log('🔄 Generating content with AI fallback cascade (Lovable → DeepSeek → Kimi → Gemini)...');
      const result = await generateTextWithFallback(prompt, undefined, {
        temperature: 0.8,
        maxTokens: 2048,
        useFullElizaContext: false
      });
      discussionBody = result.content;
      aiProvider = result.provider;
      console.log(`✅ Morning discussion generated using ${aiProvider} provider`);
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
          title: `🌅 Morning Check-in - ${today}`,
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
      activity_type: 'morning_discussion_posted',
      title: '🌅 Morning Discussion Posted',
      description: `Posted morning check-in to GitHub: ${discussion?.url || 'N/A'}`,
      metadata: {
        discussion_url: discussion?.url,
        discussion_id: discussion?.id,
        discussion_title: discussion?.title,
        overnight_activity_count: overnightActivity?.length || 0,
        overnight_successes: overnightSuccesses,
        overnight_failures: overnightFailures,
        pending_tasks_count: pendingTasks?.length || 0,
        blocked_tasks_count: blockedTasks.length,
        busy_agents: busyAgents.map(a => a.name),
        idle_agents: idleAgents.map(a => a.name),
        health_score: healthScore,
        python_success_rate: pythonSuccessRate,
        function_success_rate: functionSuccessRate,
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
    console.error('Morning Discussion Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
