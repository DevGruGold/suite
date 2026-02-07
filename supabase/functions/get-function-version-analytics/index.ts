import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VersionComparisonResult {
  version: string;
  total_calls: number;
  success_rate: number;
  avg_execution_ms: number;
  median_execution_ms: number;
  p95_execution_ms: number;
  stability_score: number;
  error_types: Record<string, number>;
  first_seen: string;
  last_seen: string;
  recommendation: 'stable' | 'degraded' | 'unstable' | 'insufficient_data';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📊 Function Version Analytics - Starting analysis...');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      function_name,          // REQUIRED: Function to analyze
      version,                // OPTIONAL: Specific version to analyze
      compare_versions = true, // Compare all versions
      time_window_hours = 168, // Default: 7 days
      min_calls_threshold = 10 // Minimum calls for valid analysis
    } = await req.json();

    if (!function_name) {
      return new Response(
        JSON.stringify({ 
          error: 'function_name is required',
          example: { function_name: 'github-integration', compare_versions: true }
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`🔍 Analyzing function: ${function_name}, version: ${version || 'all'}`);

    // Calculate time threshold
    const timeThreshold = new Date();
    timeThreshold.setHours(timeThreshold.getHours() - time_window_hours);

    // Refresh materialized view for latest data
    console.log('🔄 Refreshing materialized view...');
    await supabase.rpc('refresh_function_version_performance');

    // Query version performance data
    let query = supabase
      .from('function_version_performance')
      .select('*')
      .eq('function_name', function_name)
      .gte('total_invocations', min_calls_threshold)
      .order('last_invoked_at', { ascending: false });

    if (version) {
      query = query.eq('deployment_version', version);
    }

    const { data: versionData, error: versionError } = await query;

    if (versionError) {
      throw new Error(`Failed to fetch version data: ${versionError.message}`);
    }

    console.log(`✅ Found ${versionData?.length || 0} versions with sufficient data`);

    // Get detailed error analysis per version
    const versionAnalytics: VersionComparisonResult[] = [];

    for (const versionRow of (versionData || [])) {
      // Get error type distribution for this version
      const { data: errors } = await supabase
        .from('eliza_function_usage')
        .select('error_message')
        .eq('function_name', function_name)
        .eq('deployment_version', versionRow.deployment_version)
        .eq('success', false)
        .not('error_message', 'is', null)
        .gte('invoked_at', timeThreshold.toISOString());

      // Categorize errors
      const errorTypes: Record<string, number> = {};
      errors?.forEach(e => {
        const errorKey = e.error_message?.split(':')[0]?.substring(0, 50) || 'Unknown';
        errorTypes[errorKey] = (errorTypes[errorKey] || 0) + 1;
      });

      // Determine recommendation based on metrics
      let recommendation: VersionComparisonResult['recommendation'];
      const successRate = versionRow.success_rate_pct || 0;
      const totalCalls = versionRow.total_invocations || 0;

      if (totalCalls < min_calls_threshold) {
        recommendation = 'insufficient_data';
      } else if (successRate >= 95 && (versionRow.stability_score || 0) >= 80) {
        recommendation = 'stable';
      } else if (successRate >= 80 && (versionRow.stability_score || 0) >= 60) {
        recommendation = 'degraded';
      } else {
        recommendation = 'unstable';
      }

      versionAnalytics.push({
        version: versionRow.deployment_version,
        total_calls: totalCalls,
        success_rate: successRate,
        avg_execution_ms: versionRow.avg_execution_ms || 0,
        median_execution_ms: versionRow.median_execution_ms || 0,
        p95_execution_ms: versionRow.p95_execution_ms || 0,
        stability_score: versionRow.stability_score || 0,
        error_types: errorTypes,
        first_seen: versionRow.first_invoked_at,
        last_seen: versionRow.last_invoked_at,
        recommendation
      });
    }

    // Sort by stability score (best first)
    versionAnalytics.sort((a, b) => b.stability_score - a.stability_score);

    // Generate regression analysis
    const regressionAnalysis = compare_versions && versionAnalytics.length > 1
      ? analyzeRegressions(versionAnalytics)
      : null;

    // Determine best version
    const bestVersion = versionAnalytics.find(v => v.recommendation === 'stable') || 
                       versionAnalytics[0];

    const result = {
      function_name,
      time_window_hours,
      total_versions_analyzed: versionAnalytics.length,
      versions: versionAnalytics,
      best_version: bestVersion ? {
        version: bestVersion.version,
        success_rate: bestVersion.success_rate,
        stability_score: bestVersion.stability_score,
        avg_execution_ms: bestVersion.avg_execution_ms
      } : null,
      regression_analysis: regressionAnalysis,
      recommendations: generateRecommendations(versionAnalytics, function_name)
    };

    console.log(`✅ Analysis complete. Best version: ${bestVersion?.version || 'N/A'}`);

    return new Response(
      JSON.stringify(result, null, 2),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Error in version analytics:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Check function logs for more information'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

/**
 * Analyze regressions between versions
 */
function analyzeRegressions(versions: VersionComparisonResult[]) {
  const regressions = [];
  
  // Defensive check for empty or insufficient data
  if (!versions || versions.length < 2) {
    return { total_regressions: 0, critical_regressions: 0, regressions: [] };
  }
  
  for (let i = 0; i < versions.length - 1; i++) {
    const newer = versions[i];
    const older = versions[i + 1];
    
    // Check for success rate regression
    if (newer.success_rate < older.success_rate - 5) { // 5% threshold
      regressions.push({
        type: 'success_rate_drop',
        from_version: older.version,
        to_version: newer.version,
        impact: `Success rate dropped from ${older.success_rate}% to ${newer.success_rate}%`,
        severity: newer.success_rate < 80 ? 'critical' : 'warning'
      });
    }
    
    // Check for execution time regression
    const executionIncrease = ((newer.avg_execution_ms - older.avg_execution_ms) / older.avg_execution_ms) * 100;
    if (executionIncrease > 20) { // 20% slower
      regressions.push({
        type: 'execution_time_increase',
        from_version: older.version,
        to_version: newer.version,
        impact: `Execution time increased by ${executionIncrease.toFixed(1)}% (${older.avg_execution_ms}ms → ${newer.avg_execution_ms}ms)`,
        severity: executionIncrease > 50 ? 'critical' : 'warning'
      });
    }
    
    // Check for stability regression
    if (newer.stability_score < older.stability_score - 10) {
      regressions.push({
        type: 'stability_degradation',
        from_version: older.version,
        to_version: newer.version,
        impact: `Stability score dropped from ${older.stability_score} to ${newer.stability_score}`,
        severity: newer.stability_score < 60 ? 'critical' : 'warning'
      });
    }
  }
  
  return {
    total_regressions: regressions.length,
    critical_regressions: regressions.filter(r => r.severity === 'critical').length,
    regressions
  };
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(
  versions: VersionComparisonResult[], 
  functionName: string
): string[] {
  const recommendations: string[] = [];
  
  // Handle empty or undefined versions array - CRITICAL FIX
  if (!versions || versions.length === 0) {
    recommendations.push(`⚠️ No version data available for ${functionName}.`);
    recommendations.push(`📊 This could mean: no invocations in the time window, or all calls are below the minimum threshold.`);
    recommendations.push(`💡 Try increasing time_window_hours or decreasing min_calls_threshold.`);
    return recommendations;
  }
  
  const bestVersion = versions.find(v => v.recommendation === 'stable');
  const latestVersion = versions[0];
  
  // Additional null safety for latestVersion
  if (!latestVersion) {
    recommendations.push(`⚠️ Could not determine latest version for ${functionName}.`);
    return recommendations;
  }
  
  if (!bestVersion) {
    recommendations.push(`⚠️ No stable version found for ${functionName}. All versions have issues.`);
    recommendations.push(`🔍 Investigate error patterns: ${Object.keys(latestVersion.error_types || {}).join(', ')}`);
  } else if (latestVersion.version !== bestVersion.version) {
    recommendations.push(`🎯 ROLLBACK RECOMMENDED: Consider rolling back to version ${bestVersion.version}`);
    recommendations.push(`📊 Latest version (${latestVersion.version}) has ${latestVersion.success_rate}% success vs ${bestVersion.success_rate}% for best version`);
  } else {
    recommendations.push(`✅ Current version (${latestVersion.version}) is stable and performing well`);
  }
  
  // Check for execution time issues - with null safety
  if (latestVersion.p95_execution_ms && latestVersion.p95_execution_ms > 5000) {
    recommendations.push(`⏱️ P95 execution time is ${latestVersion.p95_execution_ms}ms. Consider optimization.`);
  }
  
  // Check for version fragmentation
  if (versions.length > 5) {
    recommendations.push(`📦 ${versions.length} versions detected. Consider consolidating deployments.`);
  }
  
  return recommendations;
}
