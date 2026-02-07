import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'get-my-feedback';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FeedbackRequest {
  executive_name?: string;
  limit?: number;
  unacknowledged_only?: boolean;
  acknowledge_ids?: string[];
  include_function_errors?: boolean;
  include_python_errors?: boolean;
  hours_back?: number;
}

interface FeedbackResponse {
  success: boolean;
  feedback: {
    executive_feedback: any[];
    function_errors: any[];
    python_errors: any[];
    activity_issues: any[];
  };
  statistics: {
    total_feedback_items: number;
    unacknowledged_count: number;
    function_error_count_7d: number;
    function_success_rate: string;
    python_success_rate: string;
    top_failing_functions: string[];
    most_common_error_types: string[];
  };
  acknowledged_count: number;
  recommendations: string[];
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });
  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Parse request body
    let params: FeedbackRequest = {};
    try {
      const body = await req.text();
      if (body) {
        params = JSON.parse(body);
      }
    } catch {
      // Use defaults if parsing fails
    }

    // Apply defaults
    const executiveName = params.executive_name || 'Eliza';
    const limit = Math.min(params.limit || 10, 50);
    const unacknowledgedOnly = params.unacknowledged_only !== false;
    const acknowledgeIds = params.acknowledge_ids || [];
    const includeFunctionErrors = params.include_function_errors !== false;
    const includePythonErrors = params.include_python_errors !== false;
    const hoursBack = params.hours_back || 168; // 7 days default

    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    let acknowledgedCount = 0;

    // Step 1: Acknowledge feedback items if requested
    if (acknowledgeIds.length > 0) {
      const { data: ackResult, error: ackError } = await supabase
        .from('executive_feedback')
        .update({ 
          acknowledged: true, 
          acknowledged_at: new Date().toISOString() 
        })
        .in('id', acknowledgeIds)
        .select('id');

      if (!ackError && ackResult) {
        acknowledgedCount = ackResult.length;
      }
      console.log(`Acknowledged ${acknowledgedCount} feedback items`);
    }

    // Step 2: Query executive_feedback
    let feedbackQuery = supabase
      .from('executive_feedback')
      .select('id, executive_name, feedback_type, observation_description, learning_point, impact_level, acknowledged, acknowledged_at, created_at')
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unacknowledgedOnly) {
      feedbackQuery = feedbackQuery.or('acknowledged.is.null,acknowledged.eq.false');
    }

    const { data: executiveFeedback, error: feedbackError } = await feedbackQuery;
    if (feedbackError) {
      console.error('Error fetching executive_feedback:', feedbackError);
    }

    // Step 3: Query function errors from eliza_function_usage
    let functionErrors: any[] = [];
    if (includeFunctionErrors) {
      const { data: funcErrors, error: funcError } = await supabase
        .from('eliza_function_usage')
        .select('id, function_name, error_message, executive_name, invoked_at, parameters, execution_time_ms')
        .eq('success', false)
        .gte('invoked_at', cutoffTime)
        .order('invoked_at', { ascending: false })
        .limit(limit);

      if (funcError) {
        console.error('Error fetching function errors:', funcError);
      } else {
        functionErrors = funcErrors || [];
      }
    }

    // Step 4: Query Python execution errors
    let pythonErrors: any[] = [];
    if (includePythonErrors) {
      const { data: pyErrors, error: pyError } = await supabase
        .from('eliza_python_executions')
        .select('id, code, error_message, status, execution_time_ms, source, started_at, purpose')
        .eq('status', 'failed')
        .gte('started_at', cutoffTime)
        .order('started_at', { ascending: false })
        .limit(limit);

      if (pyError) {
        console.error('Error fetching python errors:', pyError);
      } else {
        pythonErrors = pyErrors || [];
      }
    }

    // Step 5: Query activity issues from eliza_activity_log
    const { data: activityIssues, error: activityError } = await supabase
      .from('eliza_activity_log')
      .select('id, activity_type, title, description, status, metadata, created_at')
      .in('status', ['failed', 'error', 'blocked'])
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (activityError) {
      console.error('Error fetching activity issues:', activityError);
    }

    // Step 6: Calculate statistics
    // Function success rate (7 days)
    const { data: funcStats, error: funcStatsError } = await supabase
      .from('eliza_function_usage')
      .select('success')
      .gte('invoked_at', cutoffTime);

    let functionSuccessRate = 'N/A';
    let functionErrorCount7d = 0;
    if (!funcStatsError && funcStats) {
      const totalCalls = funcStats.length;
      const successfulCalls = funcStats.filter(f => f.success).length;
      functionErrorCount7d = totalCalls - successfulCalls;
      functionSuccessRate = totalCalls > 0 
        ? `${((successfulCalls / totalCalls) * 100).toFixed(1)}%` 
        : 'N/A';
    }

    // Python success rate (7 days)
    const { data: pyStats, error: pyStatsError } = await supabase
      .from('eliza_python_executions')
      .select('status')
      .gte('started_at', cutoffTime);

    let pythonSuccessRate = 'N/A';
    if (!pyStatsError && pyStats) {
      const totalExecutions = pyStats.length;
      const successfulExecutions = pyStats.filter(p => p.status === 'completed').length;
      pythonSuccessRate = totalExecutions > 0 
        ? `${((successfulExecutions / totalExecutions) * 100).toFixed(1)}%` 
        : 'N/A';
    }

    // Top failing functions
    const { data: topFailing } = await supabase
      .from('eliza_function_usage')
      .select('function_name')
      .eq('success', false)
      .gte('invoked_at', cutoffTime);

    const failingCounts: Record<string, number> = {};
    (topFailing || []).forEach(f => {
      failingCounts[f.function_name] = (failingCounts[f.function_name] || 0) + 1;
    });
    const topFailingFunctions = Object.entries(failingCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => `${name} (${count})`);

    // Most common error types
    const errorTypes: Record<string, number> = {};
    [...functionErrors, ...pythonErrors].forEach(e => {
      const errorMsg = e.error_message || '';
      let errorType = 'Unknown';
      
      if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        errorType = 'Timeout';
      } else if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('connection')) {
        errorType = 'Network';
      } else if (errorMsg.includes('import') || errorMsg.includes('module')) {
        errorType = 'Import';
      } else if (errorMsg.includes('syntax') || errorMsg.includes('SyntaxError')) {
        errorType = 'Syntax';
      } else if (errorMsg.includes('parameter') || errorMsg.includes('argument') || errorMsg.includes('undefined')) {
        errorType = 'Parameter';
      } else if (errorMsg.includes('permission') || errorMsg.includes('unauthorized') || errorMsg.includes('403')) {
        errorType = 'Permission';
      } else if (errorMsg.includes('not found') || errorMsg.includes('404')) {
        errorType = 'NotFound';
      }
      
      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
    });
    const mostCommonErrorTypes = Object.entries(errorTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => `${type} (${count})`);

    // Step 7: Generate recommendations based on error patterns
    const recommendations: string[] = [];

    if (errorTypes['Network'] > 0) {
      recommendations.push('Network errors detected: Use invoke_edge_function for all external API calls to handle retries automatically.');
    }
    if (errorTypes['Import'] > 0) {
      recommendations.push('Import errors found: Verify module names and use only approved libraries in Python executions.');
    }
    if (errorTypes['Timeout'] > 0) {
      recommendations.push('Timeout issues detected: Consider breaking long operations into smaller chunks or increasing timeout thresholds.');
    }
    if (errorTypes['Parameter'] > 0) {
      recommendations.push('Parameter errors occurring: Always validate required parameters before tool execution. Check tool schemas in elizaTools.ts.');
    }
    if (errorTypes['Permission'] > 0) {
      recommendations.push('Permission errors found: Verify API keys are configured correctly and have required scopes.');
    }
    if (errorTypes['Syntax'] > 0) {
      recommendations.push('Syntax errors in code: Use proper validation before executing generated code. Test with smaller code snippets first.');
    }

    // Add general recommendations
    if (functionErrors.length > 5) {
      recommendations.push(`High function error rate: ${functionErrors.length} failures in last ${hoursBack} hours. Review error patterns and consider adding defensive coding.`);
    }
    if (pythonErrors.length > 3) {
      recommendations.push(`Python execution failures elevated: ${pythonErrors.length} failures. Consider using simpler code patterns or pre-tested snippets.`);
    }
    if (recommendations.length === 0) {
      recommendations.push('No critical issues detected. Continue monitoring for patterns.');
    }

    // Unacknowledged count
    const { count: unackCount } = await supabase
      .from('executive_feedback')
      .select('*', { count: 'exact', head: true })
      .or('acknowledged.is.null,acknowledged.eq.false');

    const response: FeedbackResponse = {
      success: true,
      feedback: {
        executive_feedback: executiveFeedback || [],
        function_errors: functionErrors,
        python_errors: pythonErrors,
        activity_issues: activityIssues || [],
      },
      statistics: {
        total_feedback_items: (executiveFeedback?.length || 0) + functionErrors.length + pythonErrors.length + (activityIssues?.length || 0),
        unacknowledged_count: unackCount || 0,
        function_error_count_7d: functionErrorCount7d,
        function_success_rate: functionSuccessRate,
        python_success_rate: pythonSuccessRate,
        top_failing_functions: topFailingFunctions,
        most_common_error_types: mostCommonErrorTypes,
      },
      acknowledged_count: acknowledgedCount,
      recommendations,
    };

    // Log usage
    const duration = Date.now() - startTime;
    console.log(`get-my-feedback completed in ${duration}ms:`, {
      executive_feedback_count: executiveFeedback?.length || 0,
      function_errors_count: functionErrors.length,
      python_errors_count: pythonErrors.length,
      activity_issues_count: activityIssues?.length || 0,
      acknowledged_count: acknowledgedCount,
    });

    await usageTracker.success({ total_items: response.statistics.total_feedback_items });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('get-my-feedback error:', error);
    await usageTracker.failure(error instanceof Error ? error.message : 'Unknown error', 500);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      feedback: { executive_feedback: [], function_errors: [], python_errors: [], activity_issues: [] },
      statistics: {
        total_feedback_items: 0,
        unacknowledged_count: 0,
        function_error_count_7d: 0,
        function_success_rate: 'N/A',
        python_success_rate: 'N/A',
        top_failing_functions: [],
        most_common_error_types: [],
      },
      acknowledged_count: 0,
      recommendations: ['Error retrieving feedback. Check edge function logs for details.'],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
