import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { action, agent_id, task_data } = await req.json();
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    let result;
    
    switch (action) {
      case "register_agent":
        result = await registerAgent(supabase, agent_id, task_data);
        break;
      case "request_task":
        result = await assignTask(supabase, agent_id);
        break;
      case "report_completion":
        result = await taskCompleted(supabase, agent_id, task_data);
        break;
      case "check_conflicts":
        result = await checkTaskConflicts(supabase, task_data);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    return new Response(
      JSON.stringify(result),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function registerAgent(supabase: any, agent_id: string, data: any) {
  const { data: existing } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agent_id)
    .single();
  
  if (existing) {
    await supabase
      .from("agents")
      .update({ 
        last_seen: new Date().toISOString(), 
        heartbeat_ms: Date.now() 
      })
      .eq("id", agent_id);
  } else {
    await supabase.from("agents").insert({
      id: agent_id,
      name: data.name,
      role: data.role,
      skills: data.skills,
      status: "active",
      last_seen: new Date().toISOString(),
      heartbeat_ms: Date.now()
    });
  }
  
  return { registered: true };
}

async function assignTask(supabase: any, agent_id: string) {
  const { data: agent } = await supabase
    .from("agents")
    .select("skills, current_workload, max_concurrent_tasks")
    .eq("id", agent_id)
    .single();
  
  if (agent.current_workload >= agent.max_concurrent_tasks) {
    return { task: null, reason: "at_capacity" };
  }
  
  // Find matching task
  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .limit(1)
    .single();
  
  if (task) {
    await supabase
      .from("tasks")
      .update({ status: "assigned", assigned_to: agent_id })
      .eq("id", task.id);
    
    await supabase
      .from("agents")
      .update({ current_workload: agent.current_workload + 1 })
      .eq("id", agent_id);
  }
  
  return { task };
}

async function taskCompleted(supabase: any, agent_id: string, task_data: any) {
  const { task_id, result, execution_time } = task_data;
  
  await supabase
    .from("tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      result
    })
    .eq("id", task_id);
  
  const { data: agent } = await supabase
    .from("agents")
    .select("current_workload")
    .eq("id", agent_id)
    .single();
  
  await supabase
    .from("agents")
    .update({ current_workload: Math.max(0, agent.current_workload - 1) })
    .eq("id", agent_id);
  
  return { success: true };
}

async function checkTaskConflicts(supabase: any, task_data: any) {
  const { data: conflicts } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "assigned");
  
  return { conflicts };
}
