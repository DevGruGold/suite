import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ToolUsageRequest {
  action: 'summary' | 'by_category' | 'by_tool' | 'errors' | 'performance' | 'trends' | 'executive_usage' | 'refresh_dashboard';
  time_window_hours?: number;
  category?: string;
  tool_name?: string;
  executive_name?: string;
  limit?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: ToolUsageRequest = await req.json().catch(() => ({ action: 'summary' }));
    const { 
      action = 'summary', 
      time_window_hours = 24, 
      category,
      tool_name,
      executive_name,
      limit = 50 
    } = body;

    const timeFilter = new Date(Date.now() - time_window_hours * 60 * 60 * 1000).toISOString();

    let result: any;

    switch (action) {
      case 'refresh_dashboard': {
        // Refresh the materialized view
        const { error } = await supabase.rpc('refresh_tool_usage_dashboard');
        if (error) {
          console.warn('Dashboard refresh failed (may not exist yet):', error.message);
        }
        result = { refreshed: true, timestamp: new Date().toISOString() };
        break;
      }

      case 'summary': {
        // Overall summary with key metrics
        const { data: usage, error } = await supabase
          .from('eliza_function_usage')
          .select('function_name, success, execution_time_ms, tool_category, executive_name')
          .gte('created_at', timeFilter);

        if (error) throw error;

        const totalCalls = usage?.length || 0;
        const successfulCalls = usage?.filter(u => u.success).length || 0;
        const avgExecutionTime = usage?.length 
          ? Math.round(usage.reduce((sum, u) => sum + (u.execution_time_ms || 0), 0) / usage.length)
          : 0;

        // Category breakdown
        const categoryStats: Record<string, { calls: number; success: number; avg_ms: number }> = {};
        usage?.forEach(u => {
          const cat = u.tool_category || 'general';
          if (!categoryStats[cat]) {
            categoryStats[cat] = { calls: 0, success: 0, avg_ms: 0 };
          }
          categoryStats[cat].calls++;
          if (u.success) categoryStats[cat].success++;
          categoryStats[cat].avg_ms += u.execution_time_ms || 0;
        });

        // Calculate averages
        Object.keys(categoryStats).forEach(cat => {
          categoryStats[cat].avg_ms = Math.round(categoryStats[cat].avg_ms / categoryStats[cat].calls);
        });

        // Top tools
        const toolCounts: Record<string, number> = {};
        usage?.forEach(u => {
          toolCounts[u.function_name] = (toolCounts[u.function_name] || 0) + 1;
        });
        const topTools = Object.entries(toolCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, count]) => ({ name, count }));

        // Executive activity
        const executiveStats: Record<string, number> = {};
        usage?.forEach(u => {
          if (u.executive_name) {
            executiveStats[u.executive_name] = (executiveStats[u.executive_name] || 0) + 1;
          }
        });

        result = {
          time_window_hours,
          total_calls: totalCalls,
          successful_calls: successfulCalls,
          failed_calls: totalCalls - successfulCalls,
          success_rate: totalCalls ? Math.round((successfulCalls / totalCalls) * 1000) / 10 : 0,
          avg_execution_time_ms: avgExecutionTime,
          by_category: categoryStats,
          top_tools: topTools,
          executive_activity: executiveStats
        };
        break;
      }

      case 'by_category': {
        // Detailed breakdown by category
        const { data: usage, error } = await supabase
          .from('eliza_function_usage')
          .select('*')
          .gte('created_at', timeFilter)
          .eq('tool_category', category || 'general')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;

        const stats = {
          category: category || 'general',
          total_calls: usage?.length || 0,
          successful: usage?.filter(u => u.success).length || 0,
          tools_used: [...new Set(usage?.map(u => u.function_name) || [])],
          recent_calls: usage?.slice(0, 20).map(u => ({
            tool: u.function_name,
            executive: u.executive_name,
            success: u.success,
            time_ms: u.execution_time_ms,
            error: u.error_message,
            timestamp: u.created_at
          }))
        };

        result = stats;
        break;
      }

      case 'by_tool': {
        // Detailed stats for a specific tool
        const { data: usage, error } = await supabase
          .from('eliza_function_usage')
          .select('*')
          .gte('created_at', timeFilter)
          .eq('function_name', tool_name || '')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;

        const successCalls = usage?.filter(u => u.success) || [];
        const failedCalls = usage?.filter(u => !u.success) || [];
        const executionTimes = usage?.map(u => u.execution_time_ms).filter(t => t != null) || [];

        result = {
          tool_name: tool_name || 'unknown',
          total_calls: usage?.length || 0,
          success_count: successCalls.length,
          failure_count: failedCalls.length,
          success_rate: usage?.length ? Math.round((successCalls.length / usage.length) * 1000) / 10 : 0,
          avg_execution_ms: executionTimes.length 
            ? Math.round(executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length)
            : 0,
          p95_execution_ms: executionTimes.length
            ? executionTimes.sort((a, b) => a - b)[Math.floor(executionTimes.length * 0.95)]
            : 0,
          common_errors: [...new Set(failedCalls.map(u => u.error_message).filter(Boolean))].slice(0, 5),
          executives_using: [...new Set(usage?.map(u => u.executive_name).filter(Boolean) || [])],
          recent_failures: failedCalls.slice(0, 5).map(u => ({
            error: u.error_message,
            parameters: u.parameters,
            timestamp: u.created_at
          }))
        };
        break;
      }

      case 'errors': {
        // Error analysis
        const { data: failures, error } = await supabase
          .from('eliza_function_usage')
          .select('function_name, error_message, parameters, tool_category, executive_name, created_at')
          .gte('created_at', timeFilter)
          .eq('success', false)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;

        // Group errors by type
        const errorPatterns: Record<string, { count: number; tools: string[]; last_seen: string }> = {};
        failures?.forEach(f => {
          const errorKey = f.error_message?.substring(0, 100) || 'Unknown error';
          if (!errorPatterns[errorKey]) {
            errorPatterns[errorKey] = { count: 0, tools: [], last_seen: f.created_at };
          }
          errorPatterns[errorKey].count++;
          if (!errorPatterns[errorKey].tools.includes(f.function_name)) {
            errorPatterns[errorKey].tools.push(f.function_name);
          }
        });

        // Tools with highest failure rates
        const toolFailures: Record<string, number> = {};
        failures?.forEach(f => {
          toolFailures[f.function_name] = (toolFailures[f.function_name] || 0) + 1;
        });

        result = {
          total_failures: failures?.length || 0,
          error_patterns: Object.entries(errorPatterns)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10)
            .map(([error, stats]) => ({ error, ...stats })),
          failing_tools: Object.entries(toolFailures)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tool, count]) => ({ tool, failure_count: count })),
          recent_failures: failures?.slice(0, 20).map(f => ({
            tool: f.function_name,
            category: f.tool_category,
            error: f.error_message,
            executive: f.executive_name,
            timestamp: f.created_at
          }))
        };
        break;
      }

      case 'performance': {
        // Performance analysis
        const { data: usage, error } = await supabase
          .from('eliza_function_usage')
          .select('function_name, execution_time_ms, tool_category, success')
          .gte('created_at', timeFilter)
          .not('execution_time_ms', 'is', null);

        if (error) throw error;

        // Calculate per-tool performance
        const toolPerf: Record<string, { times: number[]; failures: number }> = {};
        usage?.forEach(u => {
          if (!toolPerf[u.function_name]) {
            toolPerf[u.function_name] = { times: [], failures: 0 };
          }
          toolPerf[u.function_name].times.push(u.execution_time_ms);
          if (!u.success) toolPerf[u.function_name].failures++;
        });

        const slowestTools = Object.entries(toolPerf)
          .map(([name, data]) => ({
            name,
            calls: data.times.length,
            avg_ms: Math.round(data.times.reduce((a, b) => a + b, 0) / data.times.length),
            p95_ms: data.times.sort((a, b) => a - b)[Math.floor(data.times.length * 0.95)] || 0,
            max_ms: Math.max(...data.times),
            failure_rate: Math.round((data.failures / data.times.length) * 1000) / 10
          }))
          .sort((a, b) => b.avg_ms - a.avg_ms)
          .slice(0, 15);

        const allTimes = usage?.map(u => u.execution_time_ms) || [];
        const sortedTimes = allTimes.sort((a, b) => a - b);

        result = {
          total_calls: usage?.length || 0,
          overall_avg_ms: allTimes.length ? Math.round(allTimes.reduce((a, b) => a + b, 0) / allTimes.length) : 0,
          overall_p50_ms: sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0,
          overall_p95_ms: sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0,
          overall_p99_ms: sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0,
          slowest_tools: slowestTools,
          recommendations: generatePerformanceRecommendations(slowestTools)
        };
        break;
      }

      case 'trends': {
        // Usage trends over time (hourly buckets)
        const { data: usage, error } = await supabase
          .from('eliza_function_usage')
          .select('created_at, success, tool_category')
          .gte('created_at', timeFilter)
          .order('created_at', { ascending: true });

        if (error) throw error;

        // Group by hour
        const hourlyBuckets: Record<string, { total: number; success: number; categories: Record<string, number> }> = {};
        usage?.forEach(u => {
          const hour = u.created_at.substring(0, 13) + ':00:00Z';
          if (!hourlyBuckets[hour]) {
            hourlyBuckets[hour] = { total: 0, success: 0, categories: {} };
          }
          hourlyBuckets[hour].total++;
          if (u.success) hourlyBuckets[hour].success++;
          const cat = u.tool_category || 'general';
          hourlyBuckets[hour].categories[cat] = (hourlyBuckets[hour].categories[cat] || 0) + 1;
        });

        result = {
          time_window_hours,
          hourly_data: Object.entries(hourlyBuckets).map(([hour, data]) => ({
            hour,
            total_calls: data.total,
            successful: data.success,
            success_rate: Math.round((data.success / data.total) * 1000) / 10,
            by_category: data.categories
          })),
          peak_hour: Object.entries(hourlyBuckets).sort((a, b) => b[1].total - a[1].total)[0]?.[0] || null,
          total_calls: usage?.length || 0
        };
        break;
      }

      case 'executive_usage': {
        // Usage by executive
        const { data: usage, error } = await supabase
          .from('eliza_function_usage')
          .select('executive_name, function_name, success, execution_time_ms, tool_category')
          .gte('created_at', timeFilter)
          .eq('executive_name', executive_name || 'Eliza');

        if (error) throw error;

        const toolUsage: Record<string, { calls: number; success: number; avg_ms: number }> = {};
        usage?.forEach(u => {
          if (!toolUsage[u.function_name]) {
            toolUsage[u.function_name] = { calls: 0, success: 0, avg_ms: 0 };
          }
          toolUsage[u.function_name].calls++;
          if (u.success) toolUsage[u.function_name].success++;
          toolUsage[u.function_name].avg_ms += u.execution_time_ms || 0;
        });

        Object.keys(toolUsage).forEach(tool => {
          toolUsage[tool].avg_ms = Math.round(toolUsage[tool].avg_ms / toolUsage[tool].calls);
        });

        result = {
          executive: executive_name || 'Eliza',
          total_tool_calls: usage?.length || 0,
          success_rate: usage?.length 
            ? Math.round((usage.filter(u => u.success).length / usage.length) * 1000) / 10 
            : 0,
          tools_used: Object.entries(toolUsage)
            .sort((a, b) => b[1].calls - a[1].calls)
            .map(([tool, stats]) => ({
              tool,
              calls: stats.calls,
              success_rate: Math.round((stats.success / stats.calls) * 1000) / 10,
              avg_ms: stats.avg_ms
            })),
          favorite_categories: [...new Set(usage?.map(u => u.tool_category) || [])]
        };
        break;
      }

      default:
        result = { error: `Unknown action: ${action}` };
    }

    return new Response(
      JSON.stringify({
        success: true,
        action,
        data: result,
        generated_at: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Tool usage analytics error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Analytics query failed' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

/**
 * Generate performance recommendations based on tool stats
 */
function generatePerformanceRecommendations(tools: any[]): string[] {
  const recommendations: string[] = [];

  const slowTools = tools.filter(t => t.avg_ms > 2000);
  if (slowTools.length > 0) {
    recommendations.push(`⚠️ ${slowTools.length} tools have avg execution >2s: ${slowTools.map(t => t.name).join(', ')}`);
  }

  const unreliableTools = tools.filter(t => t.failure_rate > 20);
  if (unreliableTools.length > 0) {
    recommendations.push(`🔴 ${unreliableTools.length} tools have >20% failure rate: ${unreliableTools.map(t => t.name).join(', ')}`);
  }

  const highVariance = tools.filter(t => t.p95_ms > t.avg_ms * 3);
  if (highVariance.length > 0) {
    recommendations.push(`📊 ${highVariance.length} tools have high latency variance (p95 > 3x avg): ${highVariance.map(t => t.name).join(', ')}`);
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ All tools performing within acceptable parameters');
  }

  return recommendations;
}
