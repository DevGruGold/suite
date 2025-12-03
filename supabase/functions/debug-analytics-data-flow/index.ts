import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Debug Analytics Data Flow
 * Traces the complete data flow for any function's analytics to identify where data is getting lost.
 * Compares data between eliza_python_executions (actual executions) and eliza_function_usage (analytics).
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('🔍 Starting analytics data flow debug...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Parse request
    let params = {
      function_name: 'python-executor',
      time_window_hours: 24,
      include_samples: true
    };
    
    try {
      const body = await req.json();
      params = { ...params, ...body };
    } catch {
      // Use defaults
    }

    const { function_name, time_window_hours, include_samples } = params;
    const timeWindowStart = new Date(Date.now() - time_window_hours * 60 * 60 * 1000).toISOString();
    
    console.log(`📊 Debugging analytics for: ${function_name} (last ${time_window_hours}h)`);

    const results: any = {
      function_name,
      time_window_hours,
      time_window_start: timeWindowStart,
      data_sources: {},
      discrepancies: [],
      root_cause_analysis: [],
      recommendations: []
    };

    // ========================================
    // SOURCE 1: eliza_python_executions (actual Python executions)
    // ========================================
    console.log('📝 Query 1: eliza_python_executions (actual executions)...');
    const pythonQuery = `
      SELECT 
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE status = 'completed') as success_count,
        COUNT(*) FILTER (WHERE status = 'error' OR status = 'failed') as error_count,
        COUNT(*) FILTER (WHERE status NOT IN ('completed', 'error', 'failed')) as other_status_count,
        AVG(execution_time_ms) as avg_execution_ms,
        MIN(created_at) as oldest_record,
        MAX(created_at) as newest_record
      FROM eliza_python_executions
      WHERE created_at >= '${timeWindowStart}'
    `;
    
    const { data: pythonStats, error: pythonError } = await supabase
      .from('eliza_python_executions')
      .select('id, status, execution_time_ms, error_message, created_at, source, purpose')
      .gte('created_at', timeWindowStart)
      .order('created_at', { ascending: false })
      .limit(500);

    if (pythonError) {
      console.error('❌ Error querying eliza_python_executions:', pythonError);
      results.data_sources.eliza_python_executions = { error: pythonError.message };
    } else {
      const pythonRecords = pythonStats || [];
      const successCount = pythonRecords.filter(r => r.status === 'completed').length;
      const errorCount = pythonRecords.filter(r => r.status === 'error' || r.status === 'failed').length;
      const otherCount = pythonRecords.filter(r => !['completed', 'error', 'failed'].includes(r.status)).length;
      
      // Get status distribution
      const statusDistribution: Record<string, number> = {};
      pythonRecords.forEach(r => {
        statusDistribution[r.status || 'null'] = (statusDistribution[r.status || 'null'] || 0) + 1;
      });

      results.data_sources.eliza_python_executions = {
        query_executed: 'SELECT * FROM eliza_python_executions WHERE created_at >= ...',
        total_records: pythonRecords.length,
        success_count: successCount,
        error_count: errorCount,
        other_status_count: otherCount,
        success_rate: pythonRecords.length > 0 ? ((successCount / pythonRecords.length) * 100).toFixed(2) + '%' : 'N/A',
        status_distribution: statusDistribution,
        newest_record: pythonRecords[0]?.created_at || null,
        oldest_record: pythonRecords[pythonRecords.length - 1]?.created_at || null,
        sample_records: include_samples ? pythonRecords.slice(0, 5).map(r => ({
          id: r.id,
          status: r.status,
          execution_time_ms: r.execution_time_ms,
          error_preview: r.error_message?.substring(0, 100),
          created_at: r.created_at,
          source: r.source
        })) : []
      };
    }

    // ========================================
    // SOURCE 2: eliza_function_usage (analytics table)
    // ========================================
    console.log('📝 Query 2: eliza_function_usage (analytics - python-executor)...');
    const { data: usageByPythonExecutor, error: usageError1 } = await supabase
      .from('eliza_function_usage')
      .select('id, function_name, success, execution_time_ms, error_message, invoked_at, tool_category, context, deployment_version')
      .eq('function_name', 'python-executor')
      .gte('invoked_at', timeWindowStart)
      .order('invoked_at', { ascending: false })
      .limit(500);

    if (usageError1) {
      console.error('❌ Error querying eliza_function_usage (python-executor):', usageError1);
      results.data_sources.eliza_function_usage_python_executor = { error: usageError1.message };
    } else {
      const records = usageByPythonExecutor || [];
      const successCount = records.filter(r => r.success).length;
      
      results.data_sources.eliza_function_usage_python_executor = {
        query_executed: "SELECT * FROM eliza_function_usage WHERE function_name = 'python-executor' AND invoked_at >= ...",
        total_records: records.length,
        success_count: successCount,
        error_count: records.length - successCount,
        success_rate: records.length > 0 ? ((successCount / records.length) * 100).toFixed(2) + '%' : 'N/A',
        sample_records: include_samples ? records.slice(0, 5).map(r => ({
          id: r.id,
          success: r.success,
          error_preview: r.error_message?.substring(0, 100),
          invoked_at: r.invoked_at,
          tool_category: r.tool_category,
          deployment_version: r.deployment_version
        })) : []
      };
    }

    // ========================================
    // SOURCE 3: eliza_function_usage for execute_python tool
    // ========================================
    console.log('📝 Query 3: eliza_function_usage (analytics - execute_python tool)...');
    const { data: usageByExecutePython, error: usageError2 } = await supabase
      .from('eliza_function_usage')
      .select('id, function_name, success, execution_time_ms, error_message, invoked_at, tool_category, context, deployment_version')
      .eq('function_name', 'execute_python')
      .gte('invoked_at', timeWindowStart)
      .order('invoked_at', { ascending: false })
      .limit(500);

    if (usageError2) {
      console.error('❌ Error querying eliza_function_usage (execute_python):', usageError2);
      results.data_sources.eliza_function_usage_execute_python = { error: usageError2.message };
    } else {
      const records = usageByExecutePython || [];
      const successCount = records.filter(r => r.success).length;
      
      // Check for argument parsing errors
      const parseErrors = records.filter(r => r.error_message?.includes('parse') || r.error_message?.includes('argument'));
      
      results.data_sources.eliza_function_usage_execute_python = {
        query_executed: "SELECT * FROM eliza_function_usage WHERE function_name = 'execute_python' AND invoked_at >= ...",
        total_records: records.length,
        success_count: successCount,
        error_count: records.length - successCount,
        argument_parse_errors: parseErrors.length,
        success_rate: records.length > 0 ? ((successCount / records.length) * 100).toFixed(2) + '%' : 'N/A',
        sample_records: include_samples ? records.slice(0, 5).map(r => ({
          id: r.id,
          success: r.success,
          error_preview: r.error_message?.substring(0, 100),
          invoked_at: r.invoked_at,
          tool_category: r.tool_category
        })) : []
      };
    }

    // ========================================
    // SOURCE 4: Check sync-function-logs history
    // ========================================
    console.log('📝 Query 4: Check for synced records...');
    const { data: syncedRecords, error: syncError } = await supabase
      .from('eliza_function_usage')
      .select('id, function_name, deployment_version, context, invoked_at')
      .or('deployment_version.eq.python_execution_sync,context.ilike.%python_executions_sync%')
      .gte('invoked_at', timeWindowStart)
      .limit(100);

    results.data_sources.synced_from_python_executions = {
      query_executed: "SELECT * FROM eliza_function_usage WHERE deployment_version = 'python_execution_sync' OR context LIKE '%python_executions_sync%'",
      total_synced_records: syncedRecords?.length || 0,
      error: syncError?.message || null
    };

    // ========================================
    // DISCREPANCY ANALYSIS
    // ========================================
    console.log('🔬 Analyzing discrepancies...');
    
    const actualPythonCount = results.data_sources.eliza_python_executions?.total_records || 0;
    const analyticsExecutorCount = results.data_sources.eliza_function_usage_python_executor?.total_records || 0;
    const analyticsToolCount = results.data_sources.eliza_function_usage_execute_python?.total_records || 0;
    const syncedCount = results.data_sources.synced_from_python_executions?.total_synced_records || 0;
    
    const totalAnalyticsCount = analyticsExecutorCount + analyticsToolCount;
    const missingFromAnalytics = actualPythonCount - syncedCount;

    if (actualPythonCount > 0 && totalAnalyticsCount === 0) {
      results.discrepancies.push({
        type: 'COMPLETE_DATA_LOSS',
        severity: 'critical',
        description: `${actualPythonCount} Python executions exist but ZERO appear in analytics`,
        actual_count: actualPythonCount,
        analytics_count: totalAnalyticsCount
      });
    } else if (missingFromAnalytics > 0) {
      results.discrepancies.push({
        type: 'PARTIAL_DATA_LOSS',
        severity: 'high',
        description: `${missingFromAnalytics} Python executions not synced to analytics`,
        actual_count: actualPythonCount,
        synced_count: syncedCount,
        missing_count: missingFromAnalytics
      });
    }

    // Check for status field mismatch
    const statusDist = results.data_sources.eliza_python_executions?.status_distribution || {};
    if (statusDist['success'] && statusDist['success'] > 0) {
      results.discrepancies.push({
        type: 'SCHEMA_MISMATCH',
        severity: 'high',
        description: `Found ${statusDist['success']} records with status='success' - should be 'completed'`,
        detail: 'sync-function-logs may be using wrong status check'
      });
    }

    // ========================================
    // ROOT CAUSE ANALYSIS
    // ========================================
    console.log('🎯 Root cause analysis...');

    // Check if eliza-python-runtime logs to eliza_function_usage
    if (actualPythonCount > syncedCount) {
      results.root_cause_analysis.push({
        cause: 'MISSING_DIRECT_LOGGING',
        description: 'eliza-python-runtime logs to eliza_python_executions but NOT to eliza_function_usage',
        evidence: `${actualPythonCount} executions vs ${syncedCount} synced records`,
        fix: 'Add direct logging to eliza_function_usage in eliza-python-runtime/index.ts'
      });
    }

    // Check sync-function-logs schema issues
    if (statusDist['completed'] && !statusDist['success']) {
      // Schema is correct
    } else {
      results.root_cause_analysis.push({
        cause: 'SYNC_SCHEMA_MISMATCH',
        description: "sync-function-logs may use status='success' instead of 'completed'",
        evidence: `Status distribution: ${JSON.stringify(statusDist)}`,
        fix: "Update sync-function-logs to check status='completed' instead of 'success'"
      });
    }

    // Check for argument parsing issues
    const parseErrorCount = results.data_sources.eliza_function_usage_execute_python?.argument_parse_errors || 0;
    if (parseErrorCount > 0) {
      results.root_cause_analysis.push({
        cause: 'ARGUMENT_PARSE_FAILURES',
        description: `${parseErrorCount} tool calls failed due to argument parsing`,
        evidence: 'execute_python invocations with "Failed to parse tool arguments" error',
        fix: 'Improve argument validation in toolExecutor.ts'
      });
    }

    // ========================================
    // RECOMMENDATIONS
    // ========================================
    results.recommendations = [
      {
        priority: 1,
        action: 'FIX_SYNC_SCHEMA',
        description: "Update sync-function-logs to use status='completed' and error_message field",
        file: 'supabase/functions/sync-function-logs/index.ts'
      },
      {
        priority: 2,
        action: 'ADD_DIRECT_LOGGING',
        description: 'Add eliza_function_usage insert in eliza-python-runtime after every execution',
        file: 'supabase/functions/eliza-python-runtime/index.ts'
      },
      {
        priority: 3,
        action: 'BACKFILL_MISSING_DATA',
        description: 'Run sync-function-logs with backfill_days=7 after fixes',
        command: 'POST /functions/v1/sync-function-logs { "backfill_days": 7 }'
      }
    ];

    // ========================================
    // FINAL SUMMARY
    // ========================================
    results.summary = {
      diagnosis: missingFromAnalytics > 0 
        ? `DATA LOSS: ${missingFromAnalytics} of ${actualPythonCount} Python executions (${((missingFromAnalytics/actualPythonCount)*100).toFixed(1)}%) missing from analytics`
        : 'Analytics data appears complete',
      root_causes_identified: results.root_cause_analysis.length,
      execution_time_ms: Date.now() - startTime
    };

    console.log(`✅ Debug complete in ${results.summary.execution_time_ms}ms`);

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Debug error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
