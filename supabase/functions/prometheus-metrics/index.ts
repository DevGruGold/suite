import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateUnifiedHealthScore, extractCronMetrics, buildHealthMetrics } from '../_shared/healthScoring.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Prometheus metrics formatter
function formatPrometheusMetric(name: string, value: number, labels: Record<string, string> = {}, help: string = '') {
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  const labelPart = labelStr ? `{${labelStr}}` : '';
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name}${labelPart} ${value}\n`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('📊 Prometheus Metrics - Collecting metrics...');

    // Collect all metrics in parallel
    const [
      { data: agents },
      { data: tasks },
      { data: executions },
      { data: activityLogs },
      { data: conversations },
      { data: knowledgeEntities },
      { data: devices },
      { data: chargingSessions },
      { data: popEvents },
      { data: commands }
    ] = await Promise.all([
      supabase.from('agents').select('*'),
      supabase.from('tasks').select('*'),
      supabase.from('eliza_python_executions').select('*').gte('created_at', new Date(Date.now() - 3600000).toISOString()),
      supabase.from('eliza_activity_log').select('*').gte('created_at', new Date(Date.now() - 3600000).toISOString()),
      supabase.from('conversation_sessions').select('*'),
      supabase.from('knowledge_entities').select('*'),
      supabase.from('devices').select('is_active, device_type'),
      supabase.from('charging_sessions').select('efficiency_score').gte('started_at', new Date(Date.now() - 3600000).toISOString()),
      supabase.from('pop_events_ledger').select('pop_points, is_validated').gte('created_at', new Date(Date.now() - 3600000).toISOString()),
      supabase.from('engagement_commands').select('status').gte('issued_at', new Date(Date.now() - 3600000).toISOString())
    ]);

    // Build Prometheus metrics
    let metrics = '';

    // Agent metrics
    const agentsByStatus = agents?.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    metrics += formatPrometheusMetric('eliza_agents_total', agents?.length || 0, {}, 'Total number of agents');
    Object.entries(agentsByStatus).forEach(([status, count]) => {
      metrics += formatPrometheusMetric('eliza_agents_by_status', count, { status }, 'Agents by status');
    });

    // Task metrics
    const tasksByStatus = tasks?.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    metrics += formatPrometheusMetric('eliza_tasks_total', tasks?.length || 0, {}, 'Total number of tasks');
    Object.entries(tasksByStatus).forEach(([status, count]) => {
      metrics += formatPrometheusMetric('eliza_tasks_by_status', count, { status }, 'Tasks by status');
    });

    // Python execution metrics (last hour)
    const successfulExecs = executions?.filter(e => e.exit_code === 0).length || 0;
    const failedExecs = executions?.filter(e => e.exit_code !== 0).length || 0;
    const avgExecutionTime = executions?.length 
      ? executions.reduce((sum, e) => sum + (e.execution_time_ms || 0), 0) / executions.length 
      : 0;

    metrics += formatPrometheusMetric('eliza_python_executions_total', executions?.length || 0, { period: 'last_hour' }, 'Python executions in the last hour');
    metrics += formatPrometheusMetric('eliza_python_executions_successful', successfulExecs, { period: 'last_hour' }, 'Successful Python executions');
    metrics += formatPrometheusMetric('eliza_python_executions_failed', failedExecs, { period: 'last_hour' }, 'Failed Python executions');
    metrics += formatPrometheusMetric('eliza_python_execution_time_avg_ms', avgExecutionTime, {}, 'Average Python execution time in milliseconds');
    
    const successRate = executions?.length ? (successfulExecs / executions.length) * 100 : 0;
    metrics += formatPrometheusMetric('eliza_python_success_rate_percent', successRate, {}, 'Python execution success rate percentage');

    // Activity metrics (last hour)
    const activitiesByType = activityLogs?.reduce((acc, a) => {
      acc[a.activity_type] = (acc[a.activity_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    metrics += formatPrometheusMetric('eliza_activities_total', activityLogs?.length || 0, { period: 'last_hour' }, 'Total activities in the last hour');
    Object.entries(activitiesByType).forEach(([type, count]) => {
      metrics += formatPrometheusMetric('eliza_activities_by_type', count, { type, period: 'last_hour' }, 'Activities by type');
    });

    // Conversation metrics
    const activeConversations = conversations?.filter(c => c.is_active).length || 0;
    metrics += formatPrometheusMetric('eliza_conversations_total', conversations?.length || 0, {}, 'Total conversations');
    metrics += formatPrometheusMetric('eliza_conversations_active', activeConversations, {}, 'Active conversations');

    // Knowledge base metrics
    metrics += formatPrometheusMetric('eliza_knowledge_entities_total', knowledgeEntities?.length || 0, {}, 'Total knowledge entities');
    
    const entitiesByType = knowledgeEntities?.reduce((acc, e) => {
      acc[e.entity_type] = (acc[e.entity_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};
    
    Object.entries(entitiesByType).forEach(([type, count]) => {
      metrics += formatPrometheusMetric('eliza_knowledge_entities_by_type', count, { type }, 'Knowledge entities by type');
    });

    // XMRTCharger device metrics
    const activeDeviceCount = devices?.filter(d => d.is_active).length || 0;
    metrics += formatPrometheusMetric('xmrt_devices_total', devices?.length || 0, {}, 'Total registered XMRTCharger devices');
    metrics += formatPrometheusMetric('xmrt_devices_active', activeDeviceCount, {}, 'Currently active devices');

    const devicesByType = devices?.reduce((acc, d) => {
      acc[d.device_type || 'unknown'] = (acc[d.device_type || 'unknown'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    Object.entries(devicesByType).forEach(([type, count]) => {
      metrics += formatPrometheusMetric('xmrt_devices_by_type', count, { type }, 'Devices by type');
    });

    // Charging session metrics (last hour)
    const avgEfficiency = chargingSessions?.length
      ? chargingSessions.reduce((sum, s) => sum + (s.efficiency_score || 0), 0) / chargingSessions.length
      : 0;
    metrics += formatPrometheusMetric('xmrt_charging_sessions_total', chargingSessions?.length || 0, { period: 'last_hour' }, 'Charging sessions in last hour');
    metrics += formatPrometheusMetric('xmrt_charging_efficiency_avg', avgEfficiency, {}, 'Average charging efficiency percentage');

    // PoP event metrics (last hour)
    const validatedEvents = popEvents?.filter(e => e.is_validated).length || 0;
    const totalPoints = popEvents?.reduce((sum, e) => sum + Number(e.pop_points || 0), 0) || 0;
    metrics += formatPrometheusMetric('xmrt_pop_events_total', popEvents?.length || 0, { period: 'last_hour' }, 'PoP events in last hour');
    metrics += formatPrometheusMetric('xmrt_pop_events_validated', validatedEvents, { period: 'last_hour' }, 'Validated PoP events');
    metrics += formatPrometheusMetric('xmrt_pop_points_total', totalPoints, { period: 'last_hour' }, 'Total PoP points awarded in last hour');

    // Engagement command metrics (last hour)
    const commandsByStatus = commands?.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    metrics += formatPrometheusMetric('xmrt_commands_total', commands?.length || 0, { period: 'last_hour' }, 'Engagement commands issued in last hour');
    Object.entries(commandsByStatus).forEach(([status, count]) => {
      metrics += formatPrometheusMetric('xmrt_commands_by_status', count, { status, period: 'last_hour' }, 'Commands by status');
    });

    // Fetch cron job health for unified scoring
    let cronStats = { failing: 0, stalled: 0 };
    try {
      const { data: cronJobs } = await supabase.rpc('get_cron_jobs_status');
      cronStats = extractCronMetrics(cronJobs || []);
    } catch (cronErr) {
      console.warn('⚠️ Could not fetch cron job status:', cronErr);
    }

    // Health score metric - UNIFIED SCORING SYSTEM
    const healthMetrics = buildHealthMetrics({
      apiKeyHealth: { unhealthy: 0 }, // Would need separate query
      pythonExecStats: { failed: failedExecs },
      taskStats: { BLOCKED: tasksByStatus['BLOCKED'] || 0 },
      cronStats,
      agentStats: { ERROR: agentsByStatus['ERROR'] || 0 },
      edgeFunctionStats: { overall_error_rate: 0 },
      deviceStats: { total: devices?.length || 0, active: activeDeviceCount },
      chargingStats: { avg_efficiency: avgEfficiency, total: chargingSessions?.length || 0 },
      commandStats: { failed: commandsByStatus['failed'] || 0 }
    });

    const healthResult = calculateUnifiedHealthScore(healthMetrics);

    metrics += formatPrometheusMetric('eliza_health_score', healthResult.score, {}, 'Overall system health score (0-100)');
    metrics += formatPrometheusMetric('eliza_health_status', healthResult.status === 'healthy' ? 1 : healthResult.status === 'warning' ? 2 : healthResult.status === 'degraded' ? 3 : 4, {}, 'Health status (1=healthy, 2=warning, 3=degraded, 4=critical)');
    metrics += formatPrometheusMetric('eliza_health_issues_count', healthResult.issues.length, {}, 'Number of health issues detected');

    // System uptime (use agent count as a proxy for system being operational)
    metrics += formatPrometheusMetric('eliza_system_operational', agents && agents.length > 0 ? 1 : 0, {}, 'System operational status (1=up, 0=down)');

    // Timestamp of metrics collection
    metrics += formatPrometheusMetric('eliza_metrics_timestamp_seconds', Math.floor(Date.now() / 1000), {}, 'Timestamp when metrics were collected');

    console.log('✅ Prometheus metrics generated successfully');

    return new Response(metrics, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
      }
    });

  } catch (error: any) {
    console.error('❌ Prometheus Metrics Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
