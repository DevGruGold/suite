import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'sync-function-logs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncOptions {
  hours_back?: number;
  backfill_days?: number;
  include_boot_events?: boolean;
  include_console_output?: boolean;
  force_full_sync?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });
  const startTime = Date.now();
  console.log('🔄 Starting enhanced function logs sync...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Parse request body for options
    let options: SyncOptions = { 
      hours_back: 1,
      backfill_days: 0,
      include_boot_events: true,
      include_console_output: true,
      force_full_sync: false
    };
    
    try {
      const body = await req.json();
      options = { ...options, ...body };
    } catch {
      // Use defaults if no body
    }

    // If backfill_days is specified, override hours_back
    const effectiveHoursBack = options.backfill_days 
      ? options.backfill_days * 24 
      : (options.hours_back || 1);

    console.log(`📊 Syncing logs from last ${effectiveHoursBack} hours (backfill_days: ${options.backfill_days || 0})`);

    // Calculate time window
    const timeWindowStart = new Date(Date.now() - effectiveHoursBack * 60 * 60 * 1000).toISOString();
    
    // STRATEGY 1: Query system_logs table for early-stage errors
    console.log('📝 Querying system_logs for early-stage errors...');
    const { data: systemLogs, error: systemLogsError } = await supabase
      .from('system_logs')
      .select('*')
      .gte('created_at', timeWindowStart)
      .in('log_source', ['edge_function_early_stage', 'edge_function_boot', 'edge_function'])
      .order('created_at', { ascending: false })
      .limit(500);

    if (!systemLogsError && systemLogs && systemLogs.length > 0) {
      console.log(`✅ Found ${systemLogs.length} system_logs entries`);
      
    // Convert system_logs to eliza_function_usage format
      // Map logger names to actual function names
      const loggerToFunctionMap: Record<string, string> = {
        'cio-executive': 'gemini-chat',
        'cto-executive': 'deepseek-chat', 
        'cao-executive': 'openai-chat',
        'cso-executive': 'vercel-ai-chat',
        'eliza': 'lovable-chat',
        'kimi-chat': 'kimi-chat'
      };

      const systemLogRecords = systemLogs.map(log => {
        // Extract function name from message format: [function-name] message
        let functionName = log.function_name || 'unknown';
        
        // Check if message has logger prefix format [logger-name]
        const messageMatch = log.message?.match(/^\[([^\]]+)\]/);
        if (messageMatch && functionName === 'unknown') {
          const loggerName = messageMatch[1];
          functionName = loggerToFunctionMap[loggerName] || loggerName;
        }
        
        // Also check log_source for edge function names
        if (functionName === 'unknown' && log.log_source?.startsWith('edge_function')) {
          const sourceMatch = log.details?.function_name || log.metadata?.function_name;
          if (sourceMatch) {
            functionName = loggerToFunctionMap[sourceMatch] || sourceMatch;
          }
        }

        return {
          function_name: functionName,
          success: log.log_level !== 'error',
          execution_time_ms: log.metadata?.execution_time_ms || null,
          error_message: log.log_level === 'error' ? log.message : null,
          context: JSON.stringify({
            source: 'system_logs_sync',
            log_level: log.log_level,
            log_category: log.log_category,
            original_id: log.id
          }),
          invoked_at: log.created_at,
          deployment_version: log.metadata?.stage || 'system_log_sync'
        };
      }).filter(r => r.function_name !== 'unknown');

      // Upsert system log records
      if (systemLogRecords.length > 0) {
        const { error: insertError } = await supabase
          .from('eliza_function_usage')
          .insert(systemLogRecords);

        if (insertError) {
          console.error('⚠️ Failed to insert system_logs records:', insertError.message);
        } else {
          console.log(`✅ Synced ${systemLogRecords.length} records from system_logs`);
        }
      }
    }

    // STRATEGY 2: Query api_call_logs table
    console.log('📝 Querying api_call_logs...');
    const { data: apiLogs, error: apiLogsError } = await supabase
      .from('api_call_logs')
      .select('*')
      .gte('called_at', timeWindowStart)
      .order('called_at', { ascending: false })
      .limit(500);

    if (!apiLogsError && apiLogs && apiLogs.length > 0) {
      console.log(`✅ Found ${apiLogs.length} api_call_logs entries`);
      
      const apiLogRecords = apiLogs.map(log => ({
        function_name: log.function_name,
        success: log.status === 'success',
        execution_time_ms: log.execution_time_ms || null,
        error_message: log.error_message || null,
        context: JSON.stringify({
          source: 'api_call_logs_sync',
          caller_context: log.caller_context,
          original_id: log.id
        }),
        invoked_at: log.called_at,
        deployment_version: 'api_call_log_sync'
      }));

      if (apiLogRecords.length > 0) {
        const { error: insertError } = await supabase
          .from('eliza_function_usage')
          .insert(apiLogRecords);

        if (insertError) {
          console.error('⚠️ Failed to insert api_call_logs records:', insertError.message);
        } else {
          console.log(`✅ Synced ${apiLogRecords.length} records from api_call_logs`);
        }
      }
    }

    // STRATEGY 3: Query eliza_python_executions for Python-specific logs
    // Sync BOTH as 'python-executor' (edge function) and 'execute_python' (tool) for complete analytics coverage
    console.log('📝 Querying eliza_python_executions...');
    const { data: pythonLogs, error: pythonLogsError } = await supabase
      .from('eliza_python_executions')
      .select('*')
      .gte('created_at', timeWindowStart)
      .order('created_at', { ascending: false })
      .limit(500);

    if (!pythonLogsError && pythonLogs && pythonLogs.length > 0) {
      console.log(`✅ Found ${pythonLogs.length} eliza_python_executions entries`);
      
      // Create records for BOTH function names to ensure complete analytics coverage
      const pythonLogRecords: Array<{
        function_name: string;
        success: boolean;
        execution_time_ms: number | null;
        error_message: string | null;
        context: string;
        invoked_at: string;
        deployment_version: string;
        tool_category: string;
      }> = [];
      
      pythonLogs.forEach(log => {
        const baseRecord = {
          success: log.status === 'completed',
          execution_time_ms: log.execution_time_ms || null,
          error_message: (log.status === 'error' || log.status === 'failed') ? log.error_message : null,
          invoked_at: log.created_at,
          tool_category: 'python'
        };
        
        // Record as 'python-executor' (edge function name)
        pythonLogRecords.push({
          ...baseRecord,
          function_name: 'python-executor',
          context: JSON.stringify({
            source: 'python_executions_sync',
            sync_type: 'edge_function',
            purpose: log.purpose,
            original_source: log.source,
            agent_id: log.agent_id,
            task_id: log.task_id,
            original_id: log.id,
            original_status: log.status
          }),
          deployment_version: 'python_execution_sync_v2'
        });
        
        // Also record as 'execute_python' (tool name) for tool analytics
        pythonLogRecords.push({
          ...baseRecord,
          function_name: 'execute_python',
          context: JSON.stringify({
            source: 'python_executions_sync',
            sync_type: 'tool_call',
            purpose: log.purpose,
            original_source: log.source,
            agent_id: log.agent_id,
            task_id: log.task_id,
            original_id: log.id,
            original_status: log.status
          }),
          deployment_version: 'python_execution_sync_v2'
        });
      });

      if (pythonLogRecords.length > 0) {
        const { error: insertError } = await supabase
          .from('eliza_function_usage')
          .insert(pythonLogRecords);

        if (insertError) {
          console.error('⚠️ Failed to insert python_executions records:', insertError.message);
        } else {
          console.log(`✅ Synced ${pythonLogRecords.length} records from eliza_python_executions (${pythonLogs.length} executions × 2 names)`);
        }
      }
    }

    // STRATEGY 4: Try original edge_function_logs approach (might fail)
    console.log('📝 Attempting edge_function_logs query...');
    const { data: edgeLogs, error: logsError } = await supabase
      .from('edge_function_logs')
      .select('*')
      .gte('timestamp', timeWindowStart)
      .order('timestamp', { ascending: false })
      .limit(1000);

    if (logsError) {
      console.log('⚠️ edge_function_logs table query failed, trying alternative approach...');
      
      // Alternative: Use the Supabase Management API or analytics query
      // For now, let's try to get data from api_call_logs as a fallback
      const { data: apiLogs, error: apiError } = await supabase
        .from('api_call_logs')
        .select('*')
        .gte('called_at', timeWindowStart)
        .order('called_at', { ascending: false })
        .limit(1000);

      if (apiError) {
        console.error('❌ Failed to fetch logs:', apiError);
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to fetch logs from any source',
          details: { edgeLogs: logsError.message, apiLogs: apiError.message }
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Process api_call_logs and sync to eliza_function_usage
      const usageRecords = (apiLogs || []).map(log => ({
        function_name: log.function_name,
        success: log.status === 'success',
        execution_time_ms: log.execution_time_ms || null,
        error_message: log.error_message || null,
        context: JSON.stringify(log.caller_context || {}),
        invoked_at: log.called_at,
        deployment_version: 'api_call_log_sync',
        deployment_id: log.id
      }));

      if (usageRecords.length > 0) {
        const { error: insertError } = await supabase
          .from('eliza_function_usage')
          .upsert(usageRecords, { 
            onConflict: 'deployment_id',
            ignoreDuplicates: true 
          });

        if (insertError) {
          console.error('❌ Failed to insert usage records:', insertError);
        } else {
          console.log(`✅ Synced ${usageRecords.length} records from api_call_logs`);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        source: 'api_call_logs',
        records_processed: usageRecords.length,
        time_window_hours: options.hours_back
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Process edge_function_logs
    const usageRecords = (edgeLogs || []).map(log => {
      // Extract function name from the log
      const functionName = log.function_name || 
        (log.event_message?.match(/functions\/v1\/([^\/\s]+)/)?.[1]) || 
        'unknown';
      
      const statusCode = log.status_code || log.metadata?.response?.status_code;
      const success = statusCode ? statusCode >= 200 && statusCode < 400 : true;

      return {
        function_name: functionName,
        success,
        execution_time_ms: log.execution_time_ms || log.metadata?.execution_time_ms || null,
        error_message: success ? null : (log.event_message || null),
        context: log.metadata ? JSON.stringify(log.metadata) : null,
        invoked_at: log.timestamp,
        deployment_version: log.metadata?.version || null,
        deployment_id: log.metadata?.deployment_id || log.id
      };
    }).filter(r => r.function_name !== 'unknown');

    console.log(`📝 Prepared ${usageRecords.length} records for sync`);

    // Batch insert to eliza_function_usage
    if (usageRecords.length > 0) {
      // Insert in batches of 100
      const batchSize = 100;
      let totalInserted = 0;
      let totalErrors = 0;

      for (let i = 0; i < usageRecords.length; i += batchSize) {
        const batch = usageRecords.slice(i, i + batchSize);
        
        const { error: insertError } = await supabase
          .from('eliza_function_usage')
          .insert(batch);

        if (insertError) {
          console.error(`⚠️ Batch ${i / batchSize + 1} insert error:`, insertError.message);
          totalErrors += batch.length;
        } else {
          totalInserted += batch.length;
        }
      }

      console.log(`✅ Sync complete: ${totalInserted} inserted, ${totalErrors} errors`);

      // Refresh the materialized view for analytics
      try {
        await supabase.rpc('refresh_function_version_performance');
        console.log('✅ Refreshed function_version_performance materialized view');
      } catch (refreshError) {
        console.log('⚠️ Could not refresh materialized view:', refreshError);
      }

      return new Response(JSON.stringify({
        success: true,
        source: 'edge_function_logs',
        records_processed: usageRecords.length,
        records_inserted: totalInserted,
        records_failed: totalErrors,
        time_window_hours: options.hours_back,
        materialized_view_refreshed: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calculate total records synced from all sources
    const totalSystemLogs = systemLogs?.length || 0;
    const totalApiLogs = apiLogs?.length || 0;
    const totalPythonLogs = pythonLogs?.length || 0;
    const totalSynced = totalSystemLogs + totalApiLogs + totalPythonLogs;

    // Refresh the materialized view for analytics
    try {
      await supabase.rpc('refresh_function_version_performance');
      console.log('✅ Refreshed function_version_performance materialized view');
    } catch (refreshError) {
      console.log('⚠️ Could not refresh materialized view:', refreshError);
    }

    // Also refresh tool_usage_dashboard
    try {
      await supabase.rpc('refresh_tool_usage_dashboard');
      console.log('✅ Refreshed tool_usage_dashboard materialized view');
    } catch (refreshError) {
      console.log('⚠️ Could not refresh tool_usage_dashboard:', refreshError);
    }

    const executionTime = Date.now() - startTime;

    await usageTracker.success({ total_synced: totalSynced });
    return new Response(JSON.stringify({
      success: true,
      summary: {
        total_records_synced: totalSynced,
        system_logs_synced: totalSystemLogs,
        api_call_logs_synced: totalApiLogs,
        python_executions_synced: totalPythonLogs,
        edge_logs_synced: edgeLogs?.length || 0
      },
      time_window_hours: effectiveHoursBack,
      backfill_days: options.backfill_days || 0,
      execution_time_ms: executionTime,
      materialized_views_refreshed: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Sync error:', error);
    await usageTracker.failure(error instanceof Error ? error.message : 'Unknown error', 500);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
