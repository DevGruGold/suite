import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startUsageTracking } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'task-orchestrator';

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
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { action, data } = await req.json();
    console.log(`🎯 Task Orchestrator - Action: ${action}`);

    let result;

    switch (action) {
      case 'auto_assign_tasks':
        // Automatically assign pending tasks to idle agents
        const { data: pendingTasks } = await supabase
          .from('tasks')
          .select('*')
          .eq('status', 'PENDING')
          .order('priority', { ascending: false });

        const { data: idleAgents } = await supabase
          .from('agents')
          .select('*')
          .eq('status', 'IDLE');

        if (!pendingTasks || !idleAgents || idleAgents.length === 0) {
          result = { success: true, assignments: 0 };
          break;
        }

        const assignments = [];
        for (let i = 0; i < Math.min(pendingTasks.length, idleAgents.length); i++) {
          const task = pendingTasks[i];
          const agent = idleAgents[i];

          // Assign task to agent
          await supabase
            .from('tasks')
            .update({ 
              status: 'IN_PROGRESS',
              assignee_agent_id: agent.id 
            })
            .eq('id', task.id);

          // Update agent status
          await supabase
            .from('agents')
            .update({ status: 'BUSY' })
            .eq('id', agent.id);

          assignments.push({ task_id: task.id, agent_id: agent.id });

          // Log assignment
          await supabase.from('eliza_activity_log').insert({
            activity_type: 'task_assigned',
            title: `Auto-Assigned: ${task.title}`,
            description: `Assigned to ${agent.name}`,
            metadata: { task_id: task.id, agent_id: agent.id },
            status: 'completed'
          });
        }

        result = { success: true, assignments: assignments.length, details: assignments };
        break;

      case 'rebalance_workload':
        // Rebalance tasks among agents
        const { data: allAgents } = await supabase
          .from('agents')
          .select('id, name, status');

        const workloads = [];
        for (const agent of allAgents || []) {
          const { data: tasks } = await supabase
            .from('tasks')
            .select('*')
            .eq('assignee_agent_id', agent.id)
            .neq('status', 'COMPLETED');

          workloads.push({
            agent_id: agent.id,
            agent_name: agent.name,
            active_tasks: tasks?.length || 0,
            tasks: tasks || []
          });
        }

        // Sort by workload
        workloads.sort((a, b) => b.active_tasks - a.active_tasks);

        result = { 
          success: true, 
          workloads,
          imbalance: workloads[0]?.active_tasks - workloads[workloads.length - 1]?.active_tasks || 0
        };
        break;

      case 'identify_blockers':
        // Identify blocked tasks with detailed analysis
        const { data: blockedTasks } = await supabase
          .from('tasks')
          .select('*')
          .eq('status', 'BLOCKED');

        // Verify GitHub access is actually working
        const githubToken = Deno.env.get('GITHUB_TOKEN');
        const githubOwner = Deno.env.get('GITHUB_OWNER');
        const githubRepo = Deno.env.get('GITHUB_REPO');
        
        const hasGitHubAccess = githubToken && githubOwner && githubRepo;
        
        // Test GitHub connectivity if credentials exist
        let githubConnectionValid = false;
        if (hasGitHubAccess) {
          try {
            const testResponse = await fetch(`https://api.github.com/repos/${githubOwner}/${githubRepo}`, {
              headers: { 
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
              }
            });
            githubConnectionValid = testResponse.ok;
          } catch (e) {
            console.error('GitHub connectivity test failed:', e);
          }
        }

        const detailedBlockers = [];
        for (const task of blockedTasks || []) {
          // Analyze blocking reason with specificity
          let specificReason = task.blocking_reason || 'Unknown';
          let canClear = false;
          let clearAction = '';
          
          // Check if it's a false GitHub blockage
          if (specificReason.toLowerCase().includes('github') && githubConnectionValid) {
            specificReason = `FALSE ALARM: GitHub access is valid. Original reason: ${specificReason}. Task can be unblocked.`;
            canClear = true;
            clearAction = 'Update task status to PENDING';
          } else if (specificReason.toLowerCase().includes('github') && !hasGitHubAccess) {
            specificReason = `GitHub credentials missing: GITHUB_TOKEN=${!!githubToken}, GITHUB_OWNER=${!!githubOwner}, GITHUB_REPO=${!!githubRepo}`;
            clearAction = 'Set missing GitHub environment variables in Supabase Edge Function secrets';
          } else if (specificReason.toLowerCase().includes('github')) {
            specificReason = `GitHub connection failed: Credentials exist but API test failed. Check token permissions and repo access.`;
            clearAction = 'Verify GitHub token has correct scopes and repo access';
          }
          
          // Add more specific categorization
          if (specificReason.toLowerCase().includes('dependency')) {
            clearAction = 'Install missing dependencies or update package.json';
          } else if (specificReason.toLowerCase().includes('permission')) {
            clearAction = 'Update RLS policies or grant necessary permissions';
          } else if (specificReason.toLowerCase().includes('api')) {
            clearAction = 'Check API endpoint availability and credentials';
          }
          
          detailedBlockers.push({
            ...task,
            specific_blocking_reason: specificReason,
            can_auto_clear: canClear,
            clear_action: clearAction,
            github_status: githubConnectionValid ? 'CONNECTED' : 'DISCONNECTED'
          });
          
          // Log with specific details
          await supabase.from('eliza_activity_log').insert({
            activity_type: 'task_blocked',
            title: `⚠️ ${canClear ? 'FALSE BLOCK' : 'Task Blocked'}: ${task.title}`,
            description: `Specific Reason: ${specificReason}\nClear Action: ${clearAction}`,
            metadata: { 
              task_id: task.id,
              can_auto_clear: canClear,
              clear_action: clearAction,
              github_connected: githubConnectionValid,
              original_reason: task.blocking_reason
            },
            status: canClear ? 'info' : 'warning'
          });
          
          // Auto-clear false GitHub blocks
          if (canClear) {
            await supabase
              .from('tasks')
              .update({ 
                status: 'PENDING',
                blocking_reason: null
              })
              .eq('id', task.id);
            
            console.log(`✅ Auto-cleared false GitHub block for task: ${task.title}`);
          }
        }

        result = { 
          success: true, 
          blocked_count: blockedTasks?.length || 0, 
          auto_cleared: detailedBlockers.filter(t => t.can_auto_clear).length,
          tasks: detailedBlockers,
          github_status: {
            has_credentials: hasGitHubAccess,
            connection_valid: githubConnectionValid
          }
        };
        break;

      case 'performance_report':
        // Generate performance metrics
        const { data: completedTasks } = await supabase
          .from('tasks')
          .select('*, assignee_agent_id')
          .eq('status', 'COMPLETED')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        const { data: failedTasks } = await supabase
          .from('tasks')
          .select('*')
          .eq('status', 'FAILED')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        const agentStats = {};
        for (const task of completedTasks || []) {
          if (!agentStats[task.assignee_agent_id]) {
            agentStats[task.assignee_agent_id] = { completed: 0, failed: 0 };
          }
          agentStats[task.assignee_agent_id].completed++;
        }

        for (const task of failedTasks || []) {
          if (!agentStats[task.assignee_agent_id]) {
            agentStats[task.assignee_agent_id] = { completed: 0, failed: 0 };
          }
          agentStats[task.assignee_agent_id].failed++;
        }

        result = {
          success: true,
          metrics: {
            total_completed: completedTasks?.length || 0,
            total_failed: failedTasks?.length || 0,
            agent_performance: agentStats,
            success_rate: completedTasks?.length / (completedTasks?.length + failedTasks?.length || 1)
          }
        };
        break;

      case 'clear_all_blocked_tasks':
        // Clear all blocked tasks that are false positives
        const { data: allBlocked } = await supabase
          .from('tasks')
          .select('*')
          .eq('status', 'BLOCKED');

        let clearedCount = 0;
        for (const task of allBlocked || []) {
          // Only clear if blocking reason contains github (since we verified it's working)
          if (task.blocking_reason?.toLowerCase().includes('github')) {
            await supabase
              .from('tasks')
              .update({ 
                status: 'PENDING',
                blocking_reason: null
              })
              .eq('id', task.id);
            clearedCount++;
          }
        }

        result = { 
          success: true, 
          cleared_count: clearedCount,
          remaining_blocked: (allBlocked?.length || 0) - clearedCount
        };
        break;

      case 'bulk_update_task_status':
        // Update multiple tasks at once
        const { task_ids, new_status, new_stage } = data;
        const { data: bulkUpdated, error: bulkError } = await supabase
          .from('tasks')
          .update({ 
            status: new_status,
            ...(new_stage && { stage: new_stage })
          })
          .in('id', task_ids)
          .select();

        if (bulkError) throw bulkError;

        result = { 
          success: true, 
          updated_count: bulkUpdated?.length || 0,
          tasks: bulkUpdated
        };
        break;

      case 'clear_all_workloads':
        // Clear ALL tasks and reset ALL agents to IDLE
        console.log('🧹 Clearing all workloads...');
        
        // Delete all tasks
        const { error: deleteTasksError, count: deletedCount } = await supabase
          .from('tasks')
          .delete()
          .neq('id', ''); // Delete all rows
        
        if (deleteTasksError) {
          console.error('Error deleting tasks:', deleteTasksError);
          throw deleteTasksError;
        }
        
        // Reset all agents to IDLE
        const { error: resetAgentsError, count: resetCount } = await supabase
          .from('agents')
          .update({ status: 'IDLE' })
          .neq('id', ''); // Update all rows
        
        if (resetAgentsError) {
          console.error('Error resetting agents:', resetAgentsError);
          throw resetAgentsError;
        }
        
        // Log the cleanup
        await supabase.from('eliza_activity_log').insert({
          activity_type: 'cleanup',
          title: '🧹 Cleared All Workloads',
          description: `Deleted ${deletedCount || 0} tasks and reset ${resetCount || 0} agents to IDLE`,
          metadata: { 
            tasks_deleted: deletedCount || 0,
            agents_reset: resetCount || 0
          },
          status: 'completed'
        });
        
        console.log(`✅ Cleared ${deletedCount} tasks and reset ${resetCount} agents`);
        
        result = {
          success: true,
          tasks_deleted: deletedCount || 0,
          agents_reset: resetCount || 0,
          message: `Successfully cleared ${deletedCount || 0} tasks and reset ${resetCount || 0} agents to IDLE`
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await usageTracker.success({ result_summary: `${action} completed` });
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Task Orchestrator Error:', error);
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
