import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Stage thresholds in hours
const STAGE_THRESHOLDS: Record<string, number> = {
  DISCUSS: 2,
  PLAN: 4,
  EXECUTE: 8,
  VERIFY: 2,
  INTEGRATE: 4,
};

const STAGE_ORDER = ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE'];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { action = 'auto_advance', task_id, force = false } = await req.json().catch(() => ({}));

    if (action === 'update_progress') {
      // Update progress percentage for all active tasks
      const { data: tasks, error: fetchError } = await supabase
        .from('tasks')
        .select('id, stage, stage_started_at, auto_advance_threshold_hours')
        .in('status', ['PENDING', 'IN_PROGRESS'])
        .not('stage_started_at', 'is', null);

      if (fetchError) throw fetchError;

      let updated = 0;
      for (const task of tasks || []) {
        const threshold = task.auto_advance_threshold_hours || STAGE_THRESHOLDS[task.stage] || 4;
        const stageStart = new Date(task.stage_started_at);
        const now = new Date();
        const elapsedHours = (now.getTime() - stageStart.getTime()) / 3600000;
        const progress = Math.min(100, Math.floor((elapsedHours / threshold) * 100));

        await supabase
          .from('tasks')
          .update({ progress_percentage: progress })
          .eq('id', task.id);
        updated++;
      }

      return new Response(
        JSON.stringify({ ok: true, action: 'update_progress', updated }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === 'auto_advance') {
      // Find tasks ready to auto-advance
      const { data: tasks, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .in('status', ['PENDING', 'IN_PROGRESS'])
        .is('blocking_reason', null)
        .gte('progress_percentage', 100);

      if (fetchError) throw fetchError;

      const advanced: Array<{ id: string; from: string; to: string }> = [];
      const notAdvanced: Array<{ id: string; reason: string }> = [];

      for (const task of tasks || []) {
        const currentStageIdx = STAGE_ORDER.indexOf(task.stage);
        
        // At INTEGRATE with 100% = COMPLETED
        if (currentStageIdx >= STAGE_ORDER.length - 1) {
          // Mark as COMPLETED instead of just skipping
          const { error: completeError } = await supabase
            .from('tasks')
            .update({
              status: 'COMPLETED',
              progress_percentage: 100,
              updated_at: new Date().toISOString(),
            })
            .eq('id', task.id);

          if (completeError) {
            notAdvanced.push({ id: task.id, reason: completeError.message });
            continue;
          }

          // Free up the agent's workload
          if (task.assignee_agent_id) {
            await supabase
              .from('agents')
              .update({ 
                current_workload: Math.max(0, (task.current_workload || 1) - 1)
              })
              .eq('id', task.assignee_agent_id);

            // Check if agent has remaining active tasks
            const { data: remainingTasks } = await supabase
              .from('tasks')
              .select('id')
              .eq('assignee_agent_id', task.assignee_agent_id)
              .in('status', ['PENDING', 'IN_PROGRESS', 'CLAIMED'])
              .neq('id', task.id)
              .limit(1);

            if (!remainingTasks?.length) {
              await supabase
                .from('agents')
                .update({ status: 'IDLE', current_workload: 0 })
                .eq('id', task.assignee_agent_id);
            }
          }

          // Log completion to activity feed
          await supabase.from('activity_feed').insert({
            type: 'task_completed',
            title: 'Task Completed',
            description: `"${task.title}" completed INTEGRATE stage`,
            data: { task_id: task.id, agent_id: task.assignee_agent_id }
          });

          // Log to eliza_activity_log for causality tracking
          await supabase.from('eliza_activity_log').insert({
            activity_type: 'task_completed',
            title: `Task Completed: ${task.title}`,
            description: `Automatically completed after INTEGRATE stage threshold`,
            status: 'completed',
            metadata: { task_id: task.id, agent_id: task.assignee_agent_id, from_stage: 'INTEGRATE', auto_completed: true }
          });

          advanced.push({ id: task.id, from: 'INTEGRATE', to: 'COMPLETED' });
          continue;
        }

        const nextStage = STAGE_ORDER[currentStageIdx + 1];
        const newThreshold = STAGE_THRESHOLDS[nextStage] || 4;

        // Advance the task
        const { error: updateError } = await supabase
          .from('tasks')
          .update({
            stage: nextStage,
            stage_started_at: new Date().toISOString(),
            progress_percentage: 0,
            auto_advance_threshold_hours: newThreshold,
            updated_at: new Date().toISOString(),
          })
          .eq('id', task.id);

        if (updateError) {
          notAdvanced.push({ id: task.id, reason: updateError.message });
          continue;
        }

        // Log activity for agent notification
        if (task.assignee_agent_id) {
          await supabase.from('agent_activities').insert({
            agent_id: task.assignee_agent_id,
            activity: `Task auto-advanced: "${task.title}" moved from ${task.stage} to ${nextStage}`,
            level: 'info'
          });

          // Update last_agent_notified_at
          await supabase
            .from('tasks')
            .update({ last_agent_notified_at: new Date().toISOString() })
            .eq('id', task.id);
        }

        // Log to activity feed
        await supabase.from('activity_feed').insert({
          type: 'task_auto_advanced',
          title: `Task auto-advanced to ${nextStage}`,
          description: `"${task.title}" automatically moved from ${task.stage} to ${nextStage} after reaching time threshold`,
          data: {
            task_id: task.id,
            from_stage: task.stage,
            to_stage: nextStage,
            agent_id: task.assignee_agent_id
          }
        });

        advanced.push({ id: task.id, from: task.stage, to: nextStage });
      }

      // Also notify agents of tasks at 75% and 90% thresholds
      const { data: urgentTasks } = await supabase
        .from('tasks')
        .select('id, title, stage, progress_percentage, assignee_agent_id, last_agent_notified_at')
        .in('status', ['PENDING', 'IN_PROGRESS'])
        .gte('progress_percentage', 75)
        .lt('progress_percentage', 100);

      let notified = 0;
      for (const task of urgentTasks || []) {
        // Only notify once per threshold crossing
        const lastNotified = task.last_agent_notified_at ? new Date(task.last_agent_notified_at) : null;
        const hoursSinceNotified = lastNotified ? (Date.now() - lastNotified.getTime()) / 3600000 : Infinity;
        
        // Notify at most once per hour
        if (hoursSinceNotified < 1) continue;
        
        if (task.assignee_agent_id) {
          const urgencyLevel = task.progress_percentage >= 90 ? 'warning' : 'info';
          const urgencyText = task.progress_percentage >= 90 ? 'URGENT' : 'Attention';
          
          await supabase.from('agent_activities').insert({
            agent_id: task.assignee_agent_id,
            activity: `${urgencyText}: Task "${task.title}" at ${task.progress_percentage}% of auto-advance threshold in ${task.stage}`,
            level: urgencyLevel
          });

          await supabase
            .from('tasks')
            .update({ last_agent_notified_at: new Date().toISOString() })
            .eq('id', task.id);
          
          notified++;
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          action: 'auto_advance',
          advanced,
          notAdvanced,
          agentsNotified: notified,
          executionTime: Date.now() - startTime
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === 'advance_single' && task_id) {
      // Manually advance a specific task
      const { data: task, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', task_id)
        .single();

      if (fetchError || !task) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Task not found' }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!force && task.blocking_reason) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Task is blocked', blocking_reason: task.blocking_reason }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const currentStageIdx = STAGE_ORDER.indexOf(task.stage);
      if (currentStageIdx >= STAGE_ORDER.length - 1) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Task is already at final stage' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const nextStage = STAGE_ORDER[currentStageIdx + 1];
      const newThreshold = STAGE_THRESHOLDS[nextStage] || 4;

      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          stage: nextStage,
          stage_started_at: new Date().toISOString(),
          progress_percentage: 0,
          auto_advance_threshold_hours: newThreshold,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task_id);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({
          ok: true,
          action: 'advance_single',
          task_id,
          from: task.stage,
          to: nextStage
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: 'Unknown action', validActions: ['auto_advance', 'update_progress', 'advance_single'] }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('[task-auto-advance] Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
