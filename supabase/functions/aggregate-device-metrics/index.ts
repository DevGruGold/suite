import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";
import { startUsageTracking } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'aggregate-device-metrics';
const QUERY_TIMEOUT_MS = 6000; // 6 second timeout per query

// Timeout wrapper for database queries
async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T | null> {
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => {
      console.warn(`⚠️ ${operation} timed out after ${ms}ms`);
      resolve(null);
    }, ms)
  );
  return Promise.race([promise, timeout]);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body for cron triggers - use default action
    }

    const { action, ...payload } = body;

    // Early return for cron triggers with no action (fast response)
    if (!action) {
      console.log('📊 Cron trigger - running quick aggregate for today');
      const today = new Date().toISOString().split('T')[0];
      const result = await quickAggregate(supabase, today);
      await usageTracker.success({ result_summary: 'cron_aggregate' });
      return new Response(JSON.stringify({ success: true, cron: true, ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📊 Device Metrics Aggregator - Action: ${action}`);

    let result;

    switch (action) {
      case 'aggregate':
        result = await aggregateMetrics(supabase, payload);
        break;
      case 'metrics':
        result = await getMetrics(supabase, payload);
        break;
      case 'hourly':
        result = await getHourlyMetrics(supabase, payload);
        break;
      case 'daily':
        result = await getDailyMetrics(supabase, payload);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await usageTracker.success({ result_summary: `${action}_completed` });
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Metrics Aggregation Error:', error);
    await usageTracker.failure(error instanceof Error ? error.message : 'Unknown error', 400);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Quick aggregate for cron - limited queries with timeouts
async function quickAggregate(supabase: any, summary_date: string) {
  const start_time = `${summary_date}T00:00:00Z`;
  const end_time = `${summary_date}T23:59:59Z`;

  // Run queries with timeouts in parallel
  const [activeDevicesResult, totalConnectionsResult, popPointsResult] = await Promise.all([
    withTimeout(
      supabase.from('device_connection_sessions').select('device_id', { count: 'exact', head: true }).eq('is_active', true),
      QUERY_TIMEOUT_MS,
      'activeDevices'
    ),
    withTimeout(
      supabase.from('device_connection_sessions').select('*', { count: 'exact', head: true }).gte('connected_at', start_time).lte('connected_at', end_time),
      QUERY_TIMEOUT_MS,
      'totalConnections'
    ),
    withTimeout(
      supabase.from('pop_events_ledger').select('pop_points').gte('event_timestamp', start_time).lte('event_timestamp', end_time).limit(100),
      QUERY_TIMEOUT_MS,
      'popPoints'
    )
  ]);

  const active_devices_count = activeDevicesResult?.count ?? 0;
  const total_connections = totalConnectionsResult?.count ?? 0;
  const total_pop_points = popPointsResult?.data?.reduce((sum: number, p: any) => sum + (p.pop_points || 0), 0) ?? 0;

  // Quick upsert
  await withTimeout(
    supabase.from('device_metrics_summary').upsert({
      summary_date,
      summary_hour: null,
      active_devices_count,
      total_connections,
      total_pop_points_earned: total_pop_points,
      aggregated_at: new Date().toISOString()
    }, { onConflict: 'summary_date' }),
    QUERY_TIMEOUT_MS,
    'upsertSummary'
  );

  console.log(`✅ Quick aggregate: ${active_devices_count} active, ${total_connections} connections, ${total_pop_points} PoP`);

  return { summary_date, active_devices_count, total_connections, total_pop_points };
}

async function aggregateMetrics(supabase: any, payload: any) {
  const { date, hour } = payload;
  
  const summary_date = date || new Date().toISOString().split('T')[0];
  const summary_hour = hour !== undefined ? hour : null;

  console.log(`📊 Aggregating metrics for ${summary_date}${summary_hour !== null ? ` hour ${summary_hour}` : ''}`);

  let start_time, end_time;
  if (summary_hour !== null) {
    start_time = `${summary_date}T${String(summary_hour).padStart(2, '0')}:00:00Z`;
    end_time = `${summary_date}T${String(summary_hour).padStart(2, '0')}:59:59Z`;
  } else {
    start_time = `${summary_date}T00:00:00Z`;
    end_time = `${summary_date}T23:59:59Z`;
  }

  // Run all queries in parallel with timeouts
  const [activeResult, connectionsResult, sessionsResult, popResult, anomaliesResult, commandsIssuedResult, commandsExecResult] = await Promise.all([
    withTimeout(supabase.from('device_connection_sessions').select('device_id', { count: 'exact', head: true }).eq('is_active', true).gte('connected_at', start_time).lte('connected_at', end_time), QUERY_TIMEOUT_MS, 'active'),
    withTimeout(supabase.from('device_connection_sessions').select('*', { count: 'exact', head: true }).gte('connected_at', start_time).lte('connected_at', end_time), QUERY_TIMEOUT_MS, 'connections'),
    withTimeout(supabase.from('device_connection_sessions').select('total_duration_seconds').gte('connected_at', start_time).lte('connected_at', end_time).limit(100), QUERY_TIMEOUT_MS, 'sessions'),
    withTimeout(supabase.from('pop_events_ledger').select('pop_points').gte('event_timestamp', start_time).lte('event_timestamp', end_time).limit(100), QUERY_TIMEOUT_MS, 'pop'),
    withTimeout(supabase.from('device_activity_log').select('*', { count: 'exact', head: true }).eq('is_anomaly', true).gte('activity_timestamp', start_time).lte('activity_timestamp', end_time), QUERY_TIMEOUT_MS, 'anomalies'),
    withTimeout(supabase.from('engagement_commands').select('*', { count: 'exact', head: true }).gte('issued_at', start_time).lte('issued_at', end_time), QUERY_TIMEOUT_MS, 'commandsIssued'),
    withTimeout(supabase.from('engagement_commands').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('issued_at', start_time).lte('issued_at', end_time), QUERY_TIMEOUT_MS, 'commandsExec')
  ]);

  const active_devices_count = activeResult?.count ?? 0;
  const total_connections = connectionsResult?.count ?? 0;
  const sessionStats = sessionsResult?.data || [];
  const avg_session_duration = sessionStats.length > 0
    ? Math.floor(sessionStats.reduce((sum: number, s: any) => sum + (s.total_duration_seconds || 0), 0) / sessionStats.length)
    : 0;
  const total_pop_points_earned = popResult?.data?.reduce((sum: number, p: any) => sum + (p.pop_points || 0), 0) ?? 0;
  const total_anomalies_detected = anomaliesResult?.count ?? 0;
  const total_commands_issued = commandsIssuedResult?.count ?? 0;
  const total_commands_executed = commandsExecResult?.count ?? 0;

  // Upsert summary
  const { data: summary, error } = await supabase
    .from('device_metrics_summary')
    .upsert({
      summary_date,
      summary_hour,
      active_devices_count,
      total_connections,
      avg_session_duration_seconds: avg_session_duration,
      total_pop_points_earned,
      total_anomalies_detected,
      total_commands_issued,
      total_commands_executed,
      top_device_ids: [],
      top_event_types: [],
      aggregated_at: new Date().toISOString()
    }, {
      onConflict: summary_hour !== null ? 'summary_date,summary_hour' : 'summary_date'
    })
    .select()
    .single();

  if (error) throw error;

  console.log(`✅ Metrics aggregated successfully`);

  return { success: true, summary_date, summary_hour, metrics: summary };
}

async function getMetrics(supabase: any, payload: any) {
  const { timeframe = 'daily', start_date, end_date } = payload;

  let query = supabase.from('device_metrics_summary').select('*').order('summary_date', { ascending: false });

  if (timeframe === 'hourly') {
    query = query.not('summary_hour', 'is', null);
  } else {
    query = query.is('summary_hour', null);
  }

  if (start_date) query = query.gte('summary_date', start_date);
  if (end_date) query = query.lte('summary_date', end_date);
  query = query.limit(100);

  const result = await withTimeout(query, QUERY_TIMEOUT_MS, 'getMetrics');
  const metrics = result?.data || [];

  return { success: true, timeframe, metrics, count: metrics.length };
}

async function getHourlyMetrics(supabase: any, payload: any) {
  const { date } = payload;

  const result = await withTimeout(
    supabase.from('device_metrics_summary').select('*').eq('summary_date', date).not('summary_hour', 'is', null).order('summary_hour', { ascending: true }),
    QUERY_TIMEOUT_MS,
    'getHourlyMetrics'
  );

  const metrics = result?.data || [];
  return { success: true, date, hourly_metrics: metrics, count: metrics.length };
}

async function getDailyMetrics(supabase: any, payload: any) {
  const { start_date, end_date } = payload;

  let query = supabase.from('device_metrics_summary').select('*').is('summary_hour', null).order('summary_date', { ascending: false });

  if (start_date) query = query.gte('summary_date', start_date);
  if (end_date) query = query.lte('summary_date', end_date);

  const result = await withTimeout(query, QUERY_TIMEOUT_MS, 'getDailyMetrics');
  const metrics = result?.data || [];

  return { success: true, start_date, end_date, daily_metrics: metrics, count: metrics.length };
}
