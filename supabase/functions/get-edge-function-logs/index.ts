import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Complete registry of all known edge functions (93+ functions)
const KNOWN_FUNCTIONS = [
  // Core AI & Chat
  'lovable-chat', 'ai-chat', 'deepseek-chat', 'gemini-chat', 'kimi-chat', 'openai-chat',
  'vercel-ai-chat', 'vercel-ai-chat-stream', 'openai-tts', 'nlg-generator',
  
  // Agent Management
  'agent-manager', 'task-orchestrator', 'eliza-intelligence-coordinator', 'eliza-self-evaluation',
  
  // GitHub Integration
  'github-integration', 'validate-github-contribution',
  
  // SuperDuper Agents
  'superduper-router', 'superduper-integration', 'superduper-code-architect',
  'superduper-business-growth', 'superduper-finance-investment', 'superduper-communication-outreach',
  'superduper-content-media', 'superduper-design-brand', 'superduper-development-coach',
  'superduper-domain-experts', 'superduper-research-intelligence', 'superduper-social-viral',
  
  // Python Execution
  'python-executor', 'eliza-python-runtime', 'python-db-bridge', 'python-network-proxy',
  
  // Knowledge & Learning
  'knowledge-manager', 'extract-knowledge', 'system-knowledge-builder', 'enhanced-learning',
  'get-code-execution-lessons', 'vectorize-memory', 'get-embedding',
  
  // Monetization & Payments
  'service-monetization-engine', 'stripe-payment-webhook', 'generate-stripe-link',
  'process-contributor-reward',
  
  // Analytics & Monitoring
  'function-usage-analytics', 'get-edge-function-logs', 'get-function-version-analytics',
  'system-status', 'system-health', 'system-diagnostics', 'prometheus-metrics',
  'api-key-health-monitor', 'usage-monitor', 'ecosystem-monitor',
  
  // Event System
  'event-router', 'event-dispatcher', 'multi-step-orchestrator',
  
  // Workflow & Scheduling
  'workflow-template-manager', 'execute-scheduled-actions', 'schedule-reminder',
  
  // Mining & XMRT
  'mining-proxy', 'mobile-miner-config', 'mobile-miner-register', 'mobile-miner-script',
  'xmrt-mcp-server', 'validate-pop-event',
  
  // Device Management
  'monitor-device-connections', 'aggregate-device-metrics',
  
  // Code & Automation
  'autonomous-code-fixer', 'autonomous-decision-maker', 'code-monitor-daemon',
  'fetch-auto-fix-results', 'check-frontend-health',
  
  // Communication & Social
  'daily-discussion-post', 'morning-discussion-post', 'evening-summary-post',
  'progress-update-post', 'weekly-retrospective-post', 'community-spotlight-post',
  'issue-engagement-command',
  
  // Lead & User Management
  'qualify-lead', 'identify-service-interest', 'convert-session-to-user',
  'conversation-access', 'summarize-conversation',
  
  // Utilities
  'list-available-functions', 'search-edge-functions', 'propose-new-edge-function',
  'list-function-proposals', 'vote-on-proposal', 'universal-edge-invoker',
  'update-api-key', 'get-lovable-key', 'cleanup-duplicate-tasks',
  
  // External APIs
  'playwright-browse', 'render-api', 'vercel-manager', 'vercel-ecosystem-api',
  'redis-cache', 'opportunity-scanner', 'predictive-analytics',
  'schema-manager', 'uspto-patent-mcp',
  
  // Self-Optimizing
  'self-optimizing-agent-architecture',
];

interface LogQueryParams {
  function_name: string;
  time_window_hours?: number;
  status_filter?: 'all' | 'success' | 'error';
  limit?: number;
  include_stack_traces?: boolean;
  compare_with?: string[];
  include_analytics?: boolean;
  include_boot_events?: boolean;
  include_system_logs?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📋 get-edge-function-logs - Starting log retrieval...');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let params: LogQueryParams;
    try {
      params = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request body',
          example: { function_name: 'github-integration', time_window_hours: 24 }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const {
      function_name,
      time_window_hours = 24,
      status_filter = 'all',
      limit = 100,
      include_stack_traces = true,
      compare_with = [],
      include_analytics = true,
      include_boot_events = true,
      include_system_logs = true
    } = params;

    if (!function_name) {
      return new Response(
        JSON.stringify({ 
          error: 'function_name is required',
          example: { function_name: 'github-integration', time_window_hours: 24 },
          available_functions: KNOWN_FUNCTIONS.slice(0, 20),
          total_known_functions: KNOWN_FUNCTIONS.length
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate function name or check for pattern
    const isPattern = function_name.includes('*');
    let targetFunctions: string[] = [];
    
    if (isPattern) {
      // Support wildcard patterns like "superduper-*"
      const regex = new RegExp('^' + function_name.replace('*', '.*') + '$');
      targetFunctions = KNOWN_FUNCTIONS.filter(f => regex.test(f));
      console.log(`🔍 Pattern "${function_name}" matched ${targetFunctions.length} functions`);
    } else {
      targetFunctions = [function_name];
      
      // Validate function exists
      if (!KNOWN_FUNCTIONS.includes(function_name)) {
        const suggestions = findSimilarFunctions(function_name);
        console.warn(`⚠️ Unknown function: ${function_name}, suggestions: ${suggestions.join(', ')}`);
      }
    }

    // Add comparison functions
    if (compare_with.length > 0) {
      targetFunctions = [...new Set([...targetFunctions, ...compare_with])];
    }

    console.log(`🔍 Querying logs for: ${targetFunctions.join(', ')}, window: ${time_window_hours}h`);

    // Calculate time threshold
    const timeThreshold = new Date();
    timeThreshold.setHours(timeThreshold.getHours() - time_window_hours);

    // Query logs for all target functions from MULTIPLE SOURCES
    const functionResults: Record<string, any> = {};
    
    for (const funcName of targetFunctions) {
      // SOURCE 1: eliza_function_usage (primary)
      let usageQuery = supabase
        .from('eliza_function_usage')
        .select('*')
        .eq('function_name', funcName)
        .gte('invoked_at', timeThreshold.toISOString())
        .order('invoked_at', { ascending: false })
        .limit(limit);

      if (status_filter === 'success') {
        usageQuery = usageQuery.eq('success', true);
      } else if (status_filter === 'error') {
        usageQuery = usageQuery.eq('success', false);
      }

      const { data: usageLogs, error: usageError } = await usageQuery;

      // SOURCE 2: system_logs for early-stage errors (if enabled)
      let systemLogs: any[] = [];
      if (include_system_logs) {
        const { data: sysLogs, error: sysError } = await supabase
          .from('system_logs')
          .select('*')
          .ilike('function_name', `%${funcName}%`)
          .gte('created_at', timeThreshold.toISOString())
          .order('created_at', { ascending: false })
          .limit(50);

        if (!sysError && sysLogs) {
          systemLogs = sysLogs.map(log => ({
            id: log.id,
            function_name: log.function_name || funcName,
            success: log.log_level !== 'error',
            execution_time_ms: log.metadata?.execution_time_ms || null,
            error_message: log.log_level === 'error' ? log.message : null,
            invoked_at: log.created_at,
            source: 'system_logs',
            log_level: log.log_level,
            log_category: log.log_category,
            metadata: log.metadata
          }));
          console.log(`📋 Found ${systemLogs.length} system_logs entries for ${funcName}`);
        }
      }

      // SOURCE 3: api_call_logs for function invocations
      let apiCallLogs: any[] = [];
      const { data: apiLogs, error: apiError } = await supabase
        .from('api_call_logs')
        .select('*')
        .eq('function_name', funcName)
        .gte('called_at', timeThreshold.toISOString())
        .order('called_at', { ascending: false })
        .limit(50);

      if (!apiError && apiLogs) {
        apiCallLogs = apiLogs.map(log => ({
          id: log.id,
          function_name: log.function_name,
          success: log.status === 'success',
          execution_time_ms: log.execution_time_ms,
          error_message: log.error_message,
          invoked_at: log.called_at,
          source: 'api_call_logs',
          metadata: log.caller_context
        }));
        console.log(`📋 Found ${apiCallLogs.length} api_call_logs entries for ${funcName}`);
      }

      if (usageError) {
        console.error(`❌ Error fetching logs for ${funcName}:`, usageError);
        functionResults[funcName] = { 
          error: usageError.message,
          system_logs: systemLogs,
          api_call_logs: apiCallLogs
        };
        continue;
      }

      // Merge all logs and analyze
      const allLogs = [
        ...(usageLogs || []).map(l => ({ ...l, source: 'eliza_function_usage' })),
        ...systemLogs,
        ...apiCallLogs
      ].sort((a, b) => new Date(b.invoked_at).getTime() - new Date(a.invoked_at).getTime());

      functionResults[funcName] = {
        ...analyzeLogData(funcName, allLogs, include_stack_traces),
        data_sources: {
          eliza_function_usage: usageLogs?.length || 0,
          system_logs: systemLogs.length,
          api_call_logs: apiCallLogs.length,
          total_merged: allLogs.length
        }
      };
    }

    // If single function, return flat structure for backward compatibility
    const primaryResult = functionResults[function_name] || functionResults[targetFunctions[0]];
    
    // Check if function is known
    const isKnownFunction = KNOWN_FUNCTIONS.includes(function_name);
    const suggestions = !isKnownFunction ? findSimilarFunctions(function_name) : [];

    const result = {
      function_name: isPattern ? targetFunctions : function_name,
      is_pattern_query: isPattern,
      is_known_function: isKnownFunction,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      time_window_hours,
      query_time: new Date().toISOString(),
      ...primaryResult,
      comparison: targetFunctions.length > 1 ? generateComparison(functionResults) : undefined,
      all_function_data: targetFunctions.length > 1 ? functionResults : undefined,
      known_functions_count: KNOWN_FUNCTIONS.length,
    };

    console.log(`✅ Log analysis complete for ${targetFunctions.length} function(s)`);

    return new Response(
      JSON.stringify(result, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error retrieving logs:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Check function logs for more information'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Analyze log data and compute metrics
 */
function analyzeLogData(funcName: string, usageLogs: any[], includeStackTraces: boolean) {
  const totalInvocations = usageLogs.length;
  const successfulCalls = usageLogs.filter(log => log.success).length;
  const failedCalls = totalInvocations - successfulCalls;
  const successRate = totalInvocations > 0 ? (successfulCalls / totalInvocations * 100) : 0;

  // Execution time statistics
  const executionTimes = usageLogs.map(log => log.execution_time_ms).filter(t => t != null);
  const avgExecutionTime = executionTimes.length > 0
    ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
    : 0;
  const sortedTimes = [...executionTimes].sort((a, b) => a - b);
  const p50ExecutionTime = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.5)] : 0;
  const p95ExecutionTime = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.95)] : 0;
  const p99ExecutionTime = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.99)] : 0;

  // Error analysis
  const errorLogs = usageLogs.filter(log => !log.success);
  const errorTypes: Record<string, { count: number; sample_message: string; stack_traces?: string[] }> = {};

  errorLogs.forEach(log => {
    if (log.error_message) {
      const errorKey = categorizeError(log.error_message);
      if (!errorTypes[errorKey]) {
        errorTypes[errorKey] = {
          count: 0,
          sample_message: log.error_message,
          stack_traces: includeStackTraces ? [] : undefined
        };
      }
      errorTypes[errorKey].count++;
      if (includeStackTraces && errorTypes[errorKey].stack_traces && errorTypes[errorKey].stack_traces!.length < 3) {
        errorTypes[errorKey].stack_traces!.push(log.error_message);
      }
    }
  });

  // Recent errors
  const recentErrors = errorLogs.slice(0, 10).map(log => ({
    timestamp: log.invoked_at,
    error_message: log.error_message,
    execution_time_ms: log.execution_time_ms,
    executive_name: log.executive_name,
    deployment_version: log.deployment_version
  }));

  // Version breakdown
  const versionStats: Record<string, { count: number; success: number; failed: number }> = {};
  usageLogs.forEach(log => {
    const version = log.deployment_version || 'unknown';
    if (!versionStats[version]) {
      versionStats[version] = { count: 0, success: 0, failed: 0 };
    }
    versionStats[version].count++;
    if (log.success) {
      versionStats[version].success++;
    } else {
      versionStats[version].failed++;
    }
  });

  // Calculate health score (0-100)
  const healthScore = calculateHealthScore(successRate, avgExecutionTime, failedCalls, totalInvocations);

  // Status code distribution
  const statusCodes: Record<string, number> = {};
  usageLogs.forEach(log => {
    const statusCode = log.metadata?.status_code || (log.success ? '200' : '500');
    statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;
  });

  return {
    summary: {
      total_invocations: totalInvocations,
      successful_calls: successfulCalls,
      failed_calls: failedCalls,
      success_rate: `${successRate.toFixed(2)}%`,
      health_score: healthScore,
      health_status: getHealthStatus(healthScore)
    },
    performance: {
      avg_execution_time_ms: avgExecutionTime.toFixed(2),
      p50_execution_time_ms: p50ExecutionTime,
      p95_execution_time_ms: p95ExecutionTime,
      p99_execution_time_ms: p99ExecutionTime,
      min_execution_time_ms: executionTimes.length > 0 ? Math.min(...executionTimes) : 0,
      max_execution_time_ms: executionTimes.length > 0 ? Math.max(...executionTimes) : 0
    },
    error_analysis: {
      total_errors: failedCalls,
      unique_error_types: Object.keys(errorTypes).length,
      error_breakdown: errorTypes,
      recent_errors: recentErrors
    },
    version_breakdown: versionStats,
    status_code_distribution: statusCodes,
    sample_logs: usageLogs.slice(0, 10).map(log => ({
      timestamp: log.invoked_at,
      success: log.success,
      execution_time_ms: log.execution_time_ms,
      executive_name: log.executive_name,
      invoked_by: log.invoked_by,
      deployment_version: log.deployment_version,
      result_summary: log.result_summary
    })),
    recommendations: generateRecommendations(funcName, successRate, failedCalls, errorTypes, avgExecutionTime, totalInvocations)
  };
}

/**
 * Calculate health score (0-100)
 */
function calculateHealthScore(
  successRate: number,
  avgExecutionTime: number,
  failedCalls: number,
  totalInvocations: number
): number {
  if (totalInvocations === 0) return 50; // No data = neutral

  let score = 100;

  // Success rate impact (up to -50 points)
  score -= Math.max(0, (100 - successRate) * 0.5);

  // Performance impact (up to -20 points)
  if (avgExecutionTime > 10000) score -= 20;
  else if (avgExecutionTime > 5000) score -= 15;
  else if (avgExecutionTime > 2000) score -= 10;
  else if (avgExecutionTime > 1000) score -= 5;

  // Error volume impact (up to -30 points)
  const errorRate = failedCalls / Math.max(totalInvocations, 1);
  if (errorRate > 0.5) score -= 30;
  else if (errorRate > 0.2) score -= 20;
  else if (errorRate > 0.1) score -= 10;
  else if (errorRate > 0.05) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get health status label
 */
function getHealthStatus(score: number): string {
  if (score >= 90) return '🟢 Excellent';
  if (score >= 75) return '🟡 Good';
  if (score >= 50) return '🟠 Fair';
  if (score >= 25) return '🔴 Poor';
  return '⚫ Critical';
}

/**
 * Categorize error message for grouping
 */
function categorizeError(errorMessage: string): string {
  const lowerError = errorMessage.toLowerCase();
  
  if (lowerError.includes('timeout') || lowerError.includes('etimedout')) return 'Timeout';
  if (lowerError.includes('network') || lowerError.includes('enotfound') || lowerError.includes('dns')) return 'Network Error';
  if (lowerError.includes('401') || lowerError.includes('unauthorized')) return 'Authentication Error';
  if (lowerError.includes('403') || lowerError.includes('forbidden')) return 'Permission Error';
  if (lowerError.includes('404') || lowerError.includes('not found')) return 'Not Found';
  if (lowerError.includes('429') || lowerError.includes('rate limit')) return 'Rate Limited';
  if (lowerError.includes('500') || lowerError.includes('internal server')) return 'Server Error';
  if (lowerError.includes('json') || lowerError.includes('parse')) return 'Parse Error';
  if (lowerError.includes('validation') || lowerError.includes('invalid')) return 'Validation Error';
  if (lowerError.includes('connection') || lowerError.includes('econnrefused')) return 'Connection Error';
  
  // Return first 40 chars of error as category
  return errorMessage.substring(0, 40);
}

/**
 * Find similar function names for suggestions
 */
function findSimilarFunctions(input: string): string[] {
  const inputLower = input.toLowerCase();
  const suggestions: { name: string; score: number }[] = [];

  for (const func of KNOWN_FUNCTIONS) {
    const funcLower = func.toLowerCase();
    let score = 0;

    // Exact substring match
    if (funcLower.includes(inputLower) || inputLower.includes(funcLower)) {
      score += 50;
    }

    // Common prefix
    let prefixLen = 0;
    while (prefixLen < Math.min(inputLower.length, funcLower.length) && 
           inputLower[prefixLen] === funcLower[prefixLen]) {
      prefixLen++;
    }
    score += prefixLen * 5;

    // Word overlap
    const inputWords = inputLower.split(/[-_]/);
    const funcWords = funcLower.split(/[-_]/);
    for (const iw of inputWords) {
      for (const fw of funcWords) {
        if (iw === fw) score += 20;
        else if (fw.includes(iw) || iw.includes(fw)) score += 10;
      }
    }

    if (score > 10) {
      suggestions.push({ name: func, score });
    }
  }

  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.name);
}

/**
 * Generate comparison between multiple functions
 */
function generateComparison(results: Record<string, any>): any {
  const functions = Object.keys(results).filter(k => !results[k].error);
  
  if (functions.length < 2) return null;

  const comparison = functions.map(func => ({
    function_name: func,
    health_score: results[func].summary?.health_score || 0,
    success_rate: results[func].summary?.success_rate || '0%',
    avg_execution_time: results[func].performance?.avg_execution_time_ms || 0,
    total_calls: results[func].summary?.total_invocations || 0,
    errors: results[func].summary?.failed_calls || 0
  }));

  // Sort by health score
  comparison.sort((a, b) => b.health_score - a.health_score);

  return {
    ranked_by_health: comparison,
    best_performing: comparison[0]?.function_name,
    worst_performing: comparison[comparison.length - 1]?.function_name,
    average_health_score: Math.round(comparison.reduce((sum, c) => sum + c.health_score, 0) / comparison.length)
  };
}

/**
 * Generate actionable recommendations based on log analysis
 */
function generateRecommendations(
  funcName: string,
  successRate: number,
  failedCalls: number,
  errorTypes: Record<string, any>,
  avgExecutionTime: number,
  totalInvocations: number
): string[] {
  const recommendations: string[] = [];

  if (totalInvocations === 0) {
    recommendations.push(`📭 No invocations recorded for ${funcName}. Verify function is being called correctly.`);
    recommendations.push(`💡 Check if function name matches exactly (case-sensitive).`);
    return recommendations;
  }

  // Success rate recommendations
  if (successRate < 50) {
    recommendations.push(`🚨 CRITICAL: ${funcName} success rate is ${successRate.toFixed(1)}%. Immediate investigation required.`);
    recommendations.push(`🔧 Use get_function_version_analytics to identify if a recent deployment caused regression.`);
  } else if (successRate < 80) {
    recommendations.push(`⚠️ WARNING: ${funcName} success rate is ${successRate.toFixed(1)}%. Monitor closely.`);
  } else if (successRate < 95) {
    recommendations.push(`📊 ${funcName} success rate is ${successRate.toFixed(1)}%. Room for improvement.`);
  } else {
    recommendations.push(`✅ ${funcName} is healthy with ${successRate.toFixed(1)}% success rate.`);
  }

  // Error-specific recommendations
  const topErrors = Object.entries(errorTypes)
    .sort((a, b) => (b[1] as any).count - (a[1] as any).count)
    .slice(0, 3);

  if (topErrors.length > 0) {
    recommendations.push(`🔍 Top error categories: ${topErrors.map(([k, v]) => `${k} (${(v as any).count})`).join(', ')}`);
    
    for (const [errorType] of topErrors) {
      if (errorType === 'Timeout') {
        recommendations.push(`⏱️ Timeout errors detected. Consider increasing timeout or optimizing function.`);
      } else if (errorType === 'Rate Limited') {
        recommendations.push(`🚦 Rate limiting detected. Implement backoff/retry logic or increase quotas.`);
      } else if (errorType === 'Authentication Error') {
        recommendations.push(`🔑 Auth errors detected. Check API keys and tokens are valid.`);
      } else if (errorType === 'Network Error') {
        recommendations.push(`🌐 Network errors detected. Check external API availability.`);
      }
    }
  }

  // Performance recommendations
  if (avgExecutionTime > 10000) {
    recommendations.push(`🐌 Average execution time is ${avgExecutionTime.toFixed(0)}ms. Critical optimization needed.`);
  } else if (avgExecutionTime > 5000) {
    recommendations.push(`⏱️ Average execution time is ${avgExecutionTime.toFixed(0)}ms. Consider optimization.`);
  } else if (avgExecutionTime > 2000) {
    recommendations.push(`⏱️ Execution time (${avgExecutionTime.toFixed(0)}ms) is acceptable but could be improved.`);
  }

  // Volume-based recommendations
  if (failedCalls > 100) {
    recommendations.push(`📈 ${failedCalls} total failures. High volume warrants dedicated debugging session.`);
  }

  if (Object.keys(errorTypes).length > 5) {
    recommendations.push(`🔧 ${Object.keys(errorTypes).length} different error types. Consider comprehensive error handling review.`);
  }

  return recommendations;
}
