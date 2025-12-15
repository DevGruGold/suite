import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startUsageTrackingWithRequest } from "../_shared/edgeFunctionUsageLogger.ts";
import { generateElizaSystemPrompt } from "../_shared/elizaSystemPrompt.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * COO (Chief Operations Officer) Chat
 * Specialized AI executive focused on operations, task pipeline, and agent orchestration
 * Has direct integration with STAE and agent-work-executor
 */

const COO_SYSTEM_PROMPT = `You are the Chief Operations Officer (COO) of the XMRT Executive Council.

YOUR IDENTITY:
- Title: COO (Chief Operations Officer)  
- Icon: ⚙️
- Color: Red
- Specialty: Operations & Agent Orchestration
- Model: STAE-Integrated AI

YOUR EXCLUSIVE RESPONSIBILITIES:
1. **Task Pipeline Management**: Monitor and optimize the flow of tasks through DISCUSS → PLAN → EXECUTE → VERIFY → INTEGRATE stages
2. **Agent Orchestration**: Assign tasks to agents, monitor their workload, ensure work is being documented
3. **STAE Oversight**: You are the primary interface to suite-task-automation-engine and agent-work-executor
4. **Operational Metrics**: Track task completion rates, agent efficiency, checklist progress
5. **Work Documentation**: Ensure agents are documenting their work via checklist items

YOUR PRIMARY TOOLS:
- suite-task-automation-engine: For task templates, automation rules, and progress tracking
- agent-work-executor: To make agents actually do work on their assigned tasks
- agent-manager: For spawning, assigning, and monitoring agents
- task-auto-advance: For advancing tasks through pipeline stages

OPERATIONAL PRINCIPLES:
- Tasks must have checklists defined in metadata
- Progress is measured by checklist completion, not just time elapsed
- Agents should actively document their work, not just hold tasks
- Every task movement should be traceable in the activity log
- Work that isn't documented didn't happen

WHEN USERS ASK ABOUT:
- "task status" / "pipeline" → Query tasks table, show stage distribution
- "agent status" / "workload" → Query agents table, show assignments
- "why isn't work getting done" → Check for tasks with 0% progress, missing checklists
- "make agents work" → Use agent-work-executor to trigger work on pending checklist items

${generateElizaSystemPrompt()}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const tracker = startUsageTrackingWithRequest('coo-chat', 'COO', req);
  
  try {
    const { messages, conversationHistory, userContext, miningStats, councilMode } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      tracker.failure("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "COO service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context-aware prompt
    let contextPrompt = COO_SYSTEM_PROMPT;
    
    // Add operational context
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Fetch current operational status
    const [tasksResult, agentsResult] = await Promise.all([
      supabase.from('tasks').select('stage, status, progress_percentage').limit(100),
      supabase.from('agents').select('name, status, current_workload').eq('archived_at', null)
    ]);
    
    if (tasksResult.data && agentsResult.data) {
      const stageDistribution: Record<string, number> = {};
      const statusDistribution: Record<string, number> = {};
      let totalProgress = 0;
      let taskCount = 0;
      
      tasksResult.data.forEach((t: any) => {
        stageDistribution[t.stage] = (stageDistribution[t.stage] || 0) + 1;
        statusDistribution[t.status] = (statusDistribution[t.status] || 0) + 1;
        totalProgress += t.progress_percentage || 0;
        taskCount++;
      });
      
      const avgProgress = taskCount > 0 ? Math.round(totalProgress / taskCount) : 0;
      
      const busyAgents = agentsResult.data.filter((a: any) => a.status === 'BUSY').length;
      const idleAgents = agentsResult.data.filter((a: any) => a.status === 'IDLE').length;
      
      contextPrompt += `\n\n**CURRENT OPERATIONAL STATUS:**
- Tasks by Stage: ${JSON.stringify(stageDistribution)}
- Tasks by Status: ${JSON.stringify(statusDistribution)}
- Average Task Progress: ${avgProgress}%
- Agents: ${busyAgents} BUSY, ${idleAgents} IDLE
- Total Active Tasks: ${taskCount}
`;
    }

    // Prepare messages for AI
    const aiMessages = [
      { role: 'system', content: contextPrompt },
      ...(conversationHistory || []),
      ...messages
    ];

    console.log(`⚙️ COO: Processing request${councilMode ? ' (council mode)' : ''}...`);

    // Call Lovable AI Gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
        temperature: 0.4, // Lower temperature for operational precision
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`⚙️ COO: AI Gateway error:`, response.status, errorText);
      tracker.failure(`AI Gateway error: ${response.status}`);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "COO service temporarily unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "Unable to generate operational response.";
    
    console.log(`⚙️ COO: Response generated successfully`);
    tracker.success();

    return new Response(
      JSON.stringify({
        success: true,
        response: content,
        content,
        executive: 'coo-chat',
        executiveTitle: 'Chief Operations Officer (COO)',
        executiveIcon: '⚙️',
        confidence: 90
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("⚙️ COO: Error:", error);
    tracker.failure(error instanceof Error ? error.message : String(error));
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
