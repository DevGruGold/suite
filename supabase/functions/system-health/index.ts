import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { EdgeFunctionLogger } from "../_shared/logging.ts";
import { formatSystemReport, SystemReport } from "../_shared/reportFormatter.ts";
import { calculateUnifiedHealthScore, extractCronMetrics, buildHealthMetrics, ESSENTIAL_API_SERVICES } from '../_shared/healthScoring.ts';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'system-health';
const logger = EdgeFunctionLogger(FUNCTION_NAME);
const QUERY_TIMEOUT_MS = 6000; // 6 second timeout per query batch

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache for health metrics (60 second TTL)
let healthCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 60000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    // Check cache for recent results
    if (healthCache && Date.now() - healthCache.timestamp < CACHE_TTL_MS) {
      console.log('📦 Returning cached system health (< 60s old)');
      await usageTracker.success({ cached: true });
      return new Response(JSON.stringify(healthCache.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { db: { schema: 'public' }, global: { headers: { 'x-statement-timeout': '8000' } } }
    );

    // Check if this is a scheduled snapshot
    const requestBody = await req.json().catch(() => ({}));
    const snapshotType = requestBody.snapshot_type || 'on-demand';
    const startTime = Date.now();

    console.log(`🏥 System Health - Generating ${snapshotType} health report...`);
    await logger.info(`Generating ${snapshotType} health report`, 'system_health');

    // Fetch all health metrics in parallel
    const [
      agentStats,
      taskStats,
      pythonExecStats,
      apiKeyHealth,
      recentActivity,
      skillGaps,
      learningSessions,
      workflowStats,
      conversationStats,
      deviceStats,
      chargingStats,
      popStats,
      commandStats,
      edgeFunctionStats
    ] = await Promise.all([
      // Agent stats
      supabase.from('agents').select('status').then(({ data }) => {
        const stats = { IDLE: 0, BUSY: 0, LEARNING: 0, BLOCKED: 0, ERROR: 0, OFFLINE: 0, total: 0 };
        data?.forEach(a => {
          stats[a.status] = (stats[a.status] || 0) + 1;
          stats.total++;
        });
        return stats;
      }),

      // Task stats
      supabase.from('tasks').select('status, priority').then(({ data }) => {
        const stats = { PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, BLOCKED: 0, total: 0, high_priority: 0 };
        data?.forEach(t => {
          stats[t.status] = (stats[t.status] || 0) + 1;
          stats.total++;
          if (t.priority >= 8) stats.high_priority++;
        });
        return stats;
      }),

      // Python execution stats (last 24h) - BY SOURCE
      supabase.from('eliza_python_executions')
        .select('exit_code, source')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .then(({ data }) => {
          const stats = { 
            total: data?.length || 0, 
            failed: 0, 
            success: 0,
            by_source: {
              eliza: { total: 0, failed: 0, success: 0 },
              autonomous_agent: { total: 0, failed: 0, success: 0 },
              'python-fixer-agent': { total: 0, failed: 0, success: 0 },
              'autonomous-code-fixer': { total: 0, failed: 0, success: 0 }
            }
          };
          data?.forEach(e => {
            const source = e.source || 'eliza';
            if (e.exit_code === 0) {
              stats.success++;
              if (stats.by_source[source]) stats.by_source[source].success++;
            } else {
              stats.failed++;
              if (stats.by_source[source]) stats.by_source[source].failed++;
            }
            if (stats.by_source[source]) stats.by_source[source].total++;
          });
          return stats;
        }),

      // API key health - only count ESSENTIAL services as unhealthy for health scoring
      supabase.from('api_key_health')
        .select('service_name, is_healthy, error_message')
        .order('last_checked', { ascending: false })
        .then(({ data }) => {
          // Only essential services count toward health deduction
          const essentialUnhealthy = data?.filter(k => 
            !k.is_healthy && ESSENTIAL_API_SERVICES.includes(k.service_name)
          ) || [];
          const allUnhealthy = data?.filter(k => !k.is_healthy) || [];
          return {
            total: data?.length || 0,
            healthy: data?.filter(k => k.is_healthy).length || 0,
            unhealthy: essentialUnhealthy.length, // Only essential services for health score
            all_unhealthy: allUnhealthy.length,   // For reporting purposes
            critical_issues: essentialUnhealthy.map(k => `${k.service_name}: ${k.error_message}`),
            non_essential_issues: allUnhealthy
              .filter(k => !ESSENTIAL_API_SERVICES.includes(k.service_name))
              .map(k => `${k.service_name}: ${k.error_message}`)
          };
        }),

      // Recent activity (last 1 hour)
      supabase.from('eliza_activity_log')
        .select('activity_type, status')
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .then(({ data }) => {
          const stats = { total: data?.length || 0, completed: 0, failed: 0, pending: 0 };
          data?.forEach(a => {
            stats[a.status] = (stats[a.status] || 0) + 1;
          });
          return stats;
        }),

      // Skill gaps
      supabase.from('skill_gap_analysis')
        .select('status, priority')
        .then(({ data }) => {
          const stats = { total: data?.length || 0, identified: 0, in_progress: 0, completed: 0, high_priority: 0 };
          data?.forEach(sg => {
            stats[sg.status] = (stats[sg.status] || 0) + 1;
            if (sg.priority >= 8) stats.high_priority++;
          });
          return stats;
        }),

      // Learning sessions
      supabase.from('learning_sessions')
        .select('status, progress_percentage')
        .then(({ data }) => {
          const stats = { total: data?.length || 0, in_progress: 0, completed: 0, avg_progress: 0 };
          let totalProgress = 0;
          data?.forEach(ls => {
            stats[ls.status] = (stats[ls.status] || 0) + 1;
            totalProgress += ls.progress_percentage || 0;
          });
          stats.avg_progress = data?.length ? Math.round(totalProgress / data.length) : 0;
          return stats;
        }),

      // Workflow stats
      supabase.from('workflow_executions')
        .select('status')
        .then(({ data }) => {
          const stats = { total: data?.length || 0, running: 0, completed: 0, failed: 0 };
          data?.forEach(w => {
            stats[w.status] = (stats[w.status] || 0) + 1;
          });
          return stats;
        }),

      // Conversation stats (last 24h)
      supabase.from('conversation_messages')
        .select('message_type')
        .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .then(({ data }) => {
          const stats = { total: data?.length || 0, user: 0, assistant: 0, system: 0 };
          data?.forEach(m => {
            stats[m.message_type] = (stats[m.message_type] || 0) + 1;
          });
          return stats;
        }),

      // XMRTCharger Device stats
      supabase.from('devices').select('is_active, device_type').then(({ data }) => {
        const stats = { 
          total: data?.length || 0, 
          active: data?.filter(d => d.is_active).length || 0,
          by_type: {} as Record<string, number>
        };
        data?.forEach(d => {
          const type = d.device_type || 'unknown';
          stats.by_type[type] = (stats.by_type[type] || 0) + 1;
        });
        return stats;
      }),

      // Active charging sessions (last 24h)
      supabase.from('charging_sessions')
        .select('efficiency_score, duration_seconds')
        .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .then(({ data }) => {
          const stats = {
            total: data?.length || 0,
            avg_efficiency: data?.length 
              ? Math.round(data.reduce((sum, s) => sum + (s.efficiency_score || 0), 0) / data.length)
              : 0,
            avg_duration_min: data?.length
              ? Math.round(data.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / data.length / 60)
              : 0
          };
          return stats;
        }),

      // PoP events (last 24h)
      supabase.from('pop_events_ledger')
        .select('pop_points, is_validated, is_paid_out')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .then(({ data }) => {
          const stats = {
            total: data?.length || 0,
            validated: data?.filter(e => e.is_validated).length || 0,
            paid_out: data?.filter(e => e.is_paid_out).length || 0,
            total_points: data?.reduce((sum, e) => sum + Number(e.pop_points || 0), 0) || 0
          };
          return stats;
        }),

      // Engagement commands (last 1 hour)
      supabase.from('engagement_commands')
        .select('status')
        .gte('issued_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .then(({ data }) => {
          const stats = { 
            total: data?.length || 0, 
            pending: 0, 
            executed: 0, 
            failed: 0 
          };
          data?.forEach(c => {
            stats[c.status] = (stats[c.status] || 0) + 1;
          });
          return stats;
        }),

      // Edge function error rate (last 24h)
      supabase.from('eliza_function_usage')
        .select('success')
        .gte('executed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .then(({ data }) => {
          const total = data?.length || 0;
          const failed = data?.filter(f => !f.success).length || 0;
          return {
            total,
            failed,
            error_rate: total > 0 ? (failed / total) * 100 : 0
          };
        })
    ]);

    // Fetch cron job health for unified scoring
    let cronStats = { failing: 0, stalled: 0 };
    try {
      const { data: cronJobs } = await supabase.rpc('get_cron_jobs_status');
      cronStats = extractCronMetrics(cronJobs || []);
    } catch (cronErr) {
      console.warn('⚠️ Could not fetch cron job status:', cronErr);
    }

    // Calculate overall health score using UNIFIED SCORING SYSTEM
    const healthMetrics = buildHealthMetrics({
      apiKeyHealth: { unhealthy: apiKeyHealth.unhealthy },
      pythonExecStats: { failed: pythonExecStats.failed },
      taskStats: { BLOCKED: taskStats.BLOCKED },
      cronStats,
      agentStats: { ERROR: agentStats.ERROR || 0 }, // Real agent error count
      edgeFunctionStats: { overall_error_rate: edgeFunctionStats.error_rate || 0 }, // Real error rate
      deviceStats: { total: deviceStats.total, active: deviceStats.active },
      chargingStats: { avg_efficiency: chargingStats.avg_efficiency, total: chargingStats.total },
      commandStats: { failed: commandStats.failed }
    });

    const healthResult = calculateUnifiedHealthScore(healthMetrics);
    const healthScore = healthResult.score;
    const status = healthResult.status;
    const issues = healthResult.issues.map(i => ({
      severity: i.severity,
      message: i.message,
      details: i.severity === 'critical' && apiKeyHealth.critical_issues ? apiKeyHealth.critical_issues : undefined
    }));

    const healthReport: SystemReport = {
      timestamp: new Date().toISOString(),
      overall_health: {
        score: Math.max(0, healthScore),
        status,
        issues
      },
      components: {
        agents: agentStats,
        tasks: taskStats,
        python_executions: pythonExecStats,
        api_keys: apiKeyHealth,
        recent_activity: recentActivity,
        skill_gaps: skillGaps,
        learning: learningSessions,
        workflows: workflowStats,
        conversations: conversationStats,
        xmrt_charger: {
          devices: deviceStats,
          charging_24h: chargingStats,
          pop_events_24h: popStats,
          commands_1h: commandStats
        }
      },
      recommendations: generateRecommendations(
        agentStats,
        taskStats,
        pythonExecStats,
        apiKeyHealth,
        skillGaps,
        deviceStats,
        chargingStats,
        popStats,
        commandStats
      )
    };

    // Generate formatted report
    const formattedReport = formatSystemReport(healthReport);

    const executionTime = Date.now() - startTime;

    // Store comprehensive performance snapshot in system_performance_logs
    await supabase.from('system_performance_logs').insert({
      snapshot_type: snapshotType,
      health_score: Math.max(0, healthScore),
      health_status: status,
      agent_stats: agentStats,
      task_stats: taskStats,
      python_execution_stats: pythonExecStats,
      api_health_stats: apiKeyHealth,
      conversation_stats: conversationStats,
      workflow_stats: workflowStats,
      learning_stats: learningSessions,
      skill_gap_stats: skillGaps,
      issues_detected: issues,
      recommendations: healthReport.recommendations.map(r => `[${r.priority}] ${r.action}: ${r.details}`),
      metadata: {
        execution_time_ms: executionTime,
        activity_1h: recentActivity,
        timestamp: healthReport.timestamp
      }
    });

    // Store metrics in system_metrics table for quick reference
    await supabase.from('system_metrics').insert([
      {
        metric_name: 'overall_health_score',
        metric_value: Math.max(0, healthScore),
        metric_category: 'health',
        metadata: { status, issues_count: issues.length, components: Object.keys(healthReport).length }
      },
      {
        metric_name: 'active_agents',
        metric_value: agentStats.total,
        metric_category: 'utilization',
        metadata: agentStats
      },
      {
        metric_name: 'task_completion_rate',
        metric_value: taskStats.total > 0 ? Math.round((taskStats.COMPLETED / taskStats.total) * 100) : 100,
        metric_category: 'performance',
        metadata: taskStats
      },
      {
        metric_name: 'python_success_rate',
        metric_value: pythonExecStats.total > 0 ? Math.round((pythonExecStats.success / pythonExecStats.total) * 100) : 100,
        metric_category: 'quality',
        metadata: pythonExecStats
      }
    ]);

    // Log API call for this health check
    await supabase.from('api_call_logs').insert({
      function_name: 'system-health',
      execution_time_ms: executionTime,
      status: 'success',
      caller_context: {
        snapshot_type: snapshotType,
        health_score: healthScore,
        issues_count: issues.length
      }
    });

    // Log health check to activity log
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'system_health_check',
      title: `System Health: ${status.toUpperCase()}`,
      description: `Health Score: ${healthScore}/100, ${issues.length} issue(s) detected`,
      status: 'completed',
      metadata: { health_score: healthScore, status, issues_count: issues.length }
    });

    // AUTO-CREATE TASK when health drops below threshold
    if (healthScore < 90 && issues.length > 0) {
      // Check if a health investigation task already exists
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('category', 'ops')
        .ilike('title', '%Health Investigation%')
        .in('status', ['PENDING', 'IN_PROGRESS', 'CLAIMED'])
        .limit(1)
        .single();

      if (!existingTask) {
        // Create a new task for health investigation
        const issueDescriptions = issues.map(i => `[${i.severity}] ${i.message}`).join('; ');
        
        const { data: newTask, error: taskError } = await supabase
          .from('tasks')
          .insert({
            title: `🔴 Health Investigation: Score ${healthScore}/100`,
            description: `Auto-generated task. Health score dropped to ${healthScore}. Issues: ${issueDescriptions}. Recommendations: ${healthReport.recommendations.slice(0, 3).map(r => r.action).join(', ')}`,
            category: 'ops',
            stage: 'DISCUSS',
            status: 'PENDING',
            priority: healthScore < 80 ? 9 : 7,
            metadata: {
              auto_generated: true,
              health_score: healthScore,
              issues: issues,
              recommendations: healthReport.recommendations
            }
          })
          .select()
          .single();

        if (newTask && !taskError) {
          // Find an agent with infra skills or lowest workload
          const { data: agents } = await supabase
            .from('agents')
            .select('id, name, status, current_workload')
            .eq('status', 'IDLE')
            .order('current_workload', { ascending: true })
            .limit(1);

          if (agents && agents.length > 0) {
            const agent = agents[0];
            await supabase
              .from('tasks')
              .update({ 
                assignee_agent_id: agent.id,
                status: 'CLAIMED'
              })
              .eq('id', newTask.id);

            await supabase
              .from('agents')
              .update({ 
                status: 'BUSY',
                current_workload: (agent.current_workload || 0) + 1
              })
              .eq('id', agent.id);

            // Log the auto-assignment with direct task_id and agent_id columns
            await supabase.from('eliza_activity_log').insert({
              activity_type: 'auto_task_assignment',
              title: `🔴 Health Task Created & Assigned to ${agent.name}`,
              description: `Health score ${healthScore}/100 - ${issues.length} issue(s). Assigned to ${agent.name}`,
              status: 'completed',
              task_id: newTask.id,
              agent_id: agent.id,
              metadata: { health_score: healthScore, issues: issues.map(i => i.message) }
            });

            console.log(`✅ Auto-created health task and assigned to ${agent.name}`);
          } else {
            // Log unassigned task with direct task_id column
            await supabase.from('eliza_activity_log').insert({
              activity_type: 'auto_task_creation',
              title: `🔴 Health Task Created (Unassigned)`,
              description: `Health score ${healthScore}/100 - ${issues.length} issue(s). No idle agents available.`,
              status: 'pending',
              task_id: newTask.id,
              metadata: { health_score: healthScore, issues: issues.map(i => i.message) }
            });

            console.log(`✅ Auto-created health task (no idle agents to assign)`);
          }
        }
      } else {
        console.log(`ℹ️ Health investigation task already exists, skipping creation`);
      }
    }

    console.log(formattedReport);

    await logger.info(`Health check complete - ${status} (${healthScore}/100)`, 'system_health', {
      healthScore,
      status,
      issuesCount: issues.length,
      executionTime
    });

    return new Response(
      JSON.stringify({ success: true, health: healthReport }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ System Health error:', error);
    await logger.error('Health check failed', error, 'system_health');
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function generateRecommendations(
  agentStats: any, 
  taskStats: any, 
  pythonStats: any, 
  apiKeyHealth: any, 
  skillGaps: any,
  deviceStats: any,
  chargingStats: any,
  popStats: any,
  commandStats: any
) {
  const recommendations = [];

  if (apiKeyHealth.unhealthy > 0) {
    recommendations.push({
      priority: 'critical',
      action: 'Fix API key issues immediately',
      details: Array.isArray(apiKeyHealth.critical_issues) 
        ? apiKeyHealth.critical_issues.join(', ') 
        : String(apiKeyHealth.critical_issues || '')
    });
  }

  if (pythonStats.failed > 5) {
    recommendations.push({
      priority: 'high',
      action: 'Review failed Python executions',
      details: 'autonomous-code-fixer should handle these, check its logs'
    });
  }

  if (taskStats.PENDING === 0 && agentStats.IDLE > 0) {
    recommendations.push({
      priority: 'medium',
      action: 'Generate new tasks for idle agents',
      details: 'Consider running ecosystem-monitor or task-orchestrator'
    });
  }

  if (skillGaps.high_priority > 0) {
    recommendations.push({
      priority: 'medium',
      action: `Address ${skillGaps.high_priority} high-priority skill gap(s)`,
      details: 'Create learning sessions for identified skill gaps'
    });
  }

  if (taskStats.BLOCKED > 0) {
    recommendations.push({
      priority: 'high',
      action: `Unblock ${taskStats.BLOCKED} blocked task(s)`,
      details: 'Review blocking reasons and provide required resources'
    });
  }

  // XMRTCharger recommendations
  if (deviceStats.active === 0 && deviceStats.total > 0) {
    recommendations.push({
      priority: 'medium',
      action: 'Investigate device connectivity issues',
      details: `${deviceStats.total} devices registered but none active`
    });
  }

  if (chargingStats.avg_efficiency < 70 && chargingStats.total > 10) {
    recommendations.push({
      priority: 'medium',
      action: 'Review charging optimization settings',
      details: `Average efficiency ${chargingStats.avg_efficiency}% below target 70%`
    });
  }

  if (popStats.total > 0 && popStats.validated / popStats.total < 0.8) {
    recommendations.push({
      priority: 'high',
      action: 'Review PoP validation process',
      details: `Only ${Math.round(popStats.validated / popStats.total * 100)}% of events validated`
    });
  }

  if (commandStats.failed > commandStats.executed) {
    recommendations.push({
      priority: 'critical',
      action: 'Fix engagement command failures',
      details: `${commandStats.failed} failed vs ${commandStats.executed} executed`
    });
  }

  return recommendations;
}
