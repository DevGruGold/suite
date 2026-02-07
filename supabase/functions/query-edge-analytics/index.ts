import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyticsQueryParams {
  function_name?: string;
  hours_back?: number;
  include_boot_events?: boolean;
  include_console_logs?: boolean;
  limit?: number;
  event_types?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('📊 query-edge-analytics - Starting direct analytics query...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    let params: AnalyticsQueryParams = {};
    try {
      params = await req.json();
    } catch {
      // Use defaults
    }

    const {
      function_name,
      hours_back = 24,
      include_boot_events = true,
      include_console_logs = true,
      limit = 500,
      event_types = ['Log', 'Boot', 'Shutdown', 'Request']
    } = params;

    console.log(`🔍 Querying analytics: function=${function_name || 'all'}, hours_back=${hours_back}`);

    // Calculate time threshold
    const timeThreshold = Date.now() - (hours_back * 60 * 60 * 1000);
    const timeThresholdMicro = timeThreshold * 1000; // Supabase uses microseconds

    // Build the analytics SQL query for function_edge_logs
    // Note: This uses Supabase's analytics tables which are available via RPC
    let analyticsQuery = `
      SELECT 
        id,
        timestamp,
        event_message,
        event_type,
        function_id,
        level,
        metadata
      FROM function_edge_logs
      WHERE timestamp >= ${timeThresholdMicro}
    `;

    if (function_name) {
      // We'll filter by function name in the event_message since function_id is UUID
      analyticsQuery += ` AND event_message ILIKE '%${function_name}%'`;
    }

    if (!include_boot_events) {
      analyticsQuery += ` AND event_type NOT IN ('Boot', 'Shutdown')`;
    }

    analyticsQuery += ` ORDER BY timestamp DESC LIMIT ${limit}`;

    // Try to query analytics using the analytics endpoint
    // Supabase analytics is available via the management API
    const analyticsEndpoint = `${supabaseUrl}/rest/v1/rpc/query_analytics`;
    
    // Alternative: Query from postgres_logs as fallback
    const { data: postgresLogs, error: pgError } = await supabase.rpc('query_function_logs', {
      p_hours_back: hours_back,
      p_function_name: function_name || null,
      p_limit: limit
    }).maybeSingle();

    // If RPC doesn't exist, fall back to system_logs table
    let logs: any[] = [];
    let source = 'unknown';

    if (pgError) {
      console.log('⚠️ RPC not available, querying system_logs table...');
      
      const timeThresholdISO = new Date(timeThreshold).toISOString();
      
      let query = supabase
        .from('system_logs')
        .select('*')
        .gte('created_at', timeThresholdISO)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (function_name) {
        query = query.ilike('function_name', `%${function_name}%`);
      }

      const { data: systemLogs, error: sysError } = await query;

      if (sysError) {
        console.log('⚠️ system_logs query failed:', sysError.message);
        
        // Last fallback: Query eliza_function_usage directly
        let usageQuery = supabase
          .from('eliza_function_usage')
          .select('*')
          .gte('invoked_at', timeThresholdISO)
          .order('invoked_at', { ascending: false })
          .limit(limit);

        if (function_name) {
          usageQuery = usageQuery.eq('function_name', function_name);
        }

        const { data: usageLogs, error: usageError } = await usageQuery;

        if (usageError) {
          throw new Error(`All log sources failed: ${usageError.message}`);
        }

        logs = (usageLogs || []).map(log => ({
          id: log.id,
          timestamp: new Date(log.invoked_at).getTime() * 1000,
          event_message: log.success ? `✅ ${log.function_name} completed` : `❌ ${log.function_name} failed: ${log.error_message}`,
          event_type: 'Log',
          function_name: log.function_name,
          level: log.success ? 'info' : 'error',
          execution_time_ms: log.execution_time_ms,
          success: log.success,
          error_message: log.error_message,
          metadata: {
            executive_name: log.executive_name,
            deployment_version: log.deployment_version,
            tool_category: log.tool_category
          }
        }));
        source = 'eliza_function_usage';
      } else {
        logs = (systemLogs || []).map(log => ({
          id: log.id,
          timestamp: new Date(log.created_at).getTime() * 1000,
          event_message: log.message,
          event_type: log.log_level === 'error' ? 'Error' : 'Log',
          function_name: log.function_name,
          level: log.log_level,
          metadata: log.metadata
        }));
        source = 'system_logs';
      }
    } else {
      logs = postgresLogs || [];
      source = 'rpc_query';
    }

    // Process and categorize logs
    const categorizedLogs = {
      boot_events: [] as any[],
      shutdown_events: [] as any[],
      info_logs: [] as any[],
      error_logs: [] as any[],
      warning_logs: [] as any[],
      request_logs: [] as any[]
    };

    const functionStats: Record<string, {
      total: number;
      errors: number;
      boot_times: number[];
      execution_times: number[];
      last_seen: string;
    }> = {};

    logs.forEach(log => {
      const eventType = log.event_type || 'Log';
      const level = log.level || 'info';
      const funcName = log.function_name || extractFunctionName(log.event_message);

      // Categorize
      if (eventType === 'Boot') {
        categorizedLogs.boot_events.push(log);
        const bootTime = extractBootTime(log.event_message);
        if (bootTime && funcName) {
          if (!functionStats[funcName]) {
            functionStats[funcName] = { total: 0, errors: 0, boot_times: [], execution_times: [], last_seen: '' };
          }
          functionStats[funcName].boot_times.push(bootTime);
        }
      } else if (eventType === 'Shutdown') {
        categorizedLogs.shutdown_events.push(log);
      } else if (level === 'error' || eventType === 'Error') {
        categorizedLogs.error_logs.push(log);
        if (funcName) {
          if (!functionStats[funcName]) {
            functionStats[funcName] = { total: 0, errors: 0, boot_times: [], execution_times: [], last_seen: '' };
          }
          functionStats[funcName].errors++;
        }
      } else if (level === 'warning') {
        categorizedLogs.warning_logs.push(log);
      } else if (eventType === 'Request') {
        categorizedLogs.request_logs.push(log);
      } else {
        categorizedLogs.info_logs.push(log);
      }

      // Track function stats
      if (funcName) {
        if (!functionStats[funcName]) {
          functionStats[funcName] = { total: 0, errors: 0, boot_times: [], execution_times: [], last_seen: '' };
        }
        functionStats[funcName].total++;
        functionStats[funcName].last_seen = log.timestamp?.toString() || '';
        
        if (log.execution_time_ms) {
          functionStats[funcName].execution_times.push(log.execution_time_ms);
        }
      }
    });

    // Calculate summary statistics
    const summary = {
      total_logs: logs.length,
      boot_events: categorizedLogs.boot_events.length,
      shutdown_events: categorizedLogs.shutdown_events.length,
      error_logs: categorizedLogs.error_logs.length,
      warning_logs: categorizedLogs.warning_logs.length,
      info_logs: categorizedLogs.info_logs.length,
      request_logs: categorizedLogs.request_logs.length,
      unique_functions: Object.keys(functionStats).length,
      data_source: source,
      query_time_ms: Date.now() - startTime
    };

    // Calculate per-function metrics
    const functionMetrics = Object.entries(functionStats).map(([name, stats]) => ({
      function_name: name,
      total_logs: stats.total,
      error_count: stats.errors,
      error_rate: stats.total > 0 ? ((stats.errors / stats.total) * 100).toFixed(2) + '%' : '0%',
      avg_boot_time_ms: stats.boot_times.length > 0 
        ? Math.round(stats.boot_times.reduce((a, b) => a + b, 0) / stats.boot_times.length)
        : null,
      avg_execution_time_ms: stats.execution_times.length > 0
        ? Math.round(stats.execution_times.reduce((a, b) => a + b, 0) / stats.execution_times.length)
        : null,
      last_seen: stats.last_seen
    })).sort((a, b) => b.total_logs - a.total_logs);

    // Get recent errors with full context
    const recentErrors = categorizedLogs.error_logs.slice(0, 20).map(log => ({
      timestamp: log.timestamp,
      function_name: log.function_name || extractFunctionName(log.event_message),
      message: log.event_message,
      level: log.level,
      metadata: log.metadata
    }));

    const result = {
      success: true,
      summary,
      function_metrics: functionMetrics,
      recent_errors: recentErrors,
      boot_events: include_boot_events ? categorizedLogs.boot_events.slice(0, 50) : [],
      sample_logs: logs.slice(0, 100),
      query_params: {
        function_name: function_name || 'all',
        hours_back,
        include_boot_events,
        include_console_logs,
        limit
      }
    };

    console.log(`✅ Analytics query complete: ${logs.length} logs from ${source}`);

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Analytics query error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Failed to query edge function analytics'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Helper to extract function name from event message
function extractFunctionName(message: string): string | null {
  if (!message) return null;
  
  // Pattern: "functions/v1/function-name"
  const match = message.match(/functions\/v1\/([a-z0-9-]+)/i);
  if (match) return match[1];
  
  // Pattern: "[FUNCTION-NAME]"
  const bracketMatch = message.match(/\[([A-Z0-9-]+)\]/);
  if (bracketMatch) return bracketMatch[1].toLowerCase();
  
  // Pattern: "function-name -"
  const dashMatch = message.match(/^([a-z0-9-]+)\s+-/i);
  if (dashMatch) return dashMatch[1];
  
  return null;
}

// Helper to extract boot time from boot message
function extractBootTime(message: string): number | null {
  if (!message) return null;
  
  // Pattern: "booted (time: 31ms)"
  const match = message.match(/booted.*time:\s*(\d+)ms/i);
  if (match) return parseInt(match[1], 10);
  
  return null;
}
