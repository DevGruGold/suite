import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { template_name, time_window_hours = 24, include_logs = true } = await req.json();

    if (!template_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'template_name is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`[Diagnose Workflow Failure] Analyzing: ${template_name}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Get workflow template definition
    const { data: template, error: templateError } = await supabase
      .from('workflow_templates')
      .select('*')
      .eq('template_name', template_name)
      .single();

    if (templateError || !template) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Template '${template_name}' not found`,
          hint: 'Check workflow_templates table for available templates'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // 2. Get recent execution logs
    const cutoffTime = new Date(Date.now() - time_window_hours * 60 * 60 * 1000).toISOString();
    
    const { data: executionLogs, error: logsError } = await supabase
      .from('workflow_execution_logs')
      .select('*')
      .eq('template_name', template_name)
      .gte('started_at', cutoffTime)
      .order('started_at', { ascending: false })
      .limit(20);

    // 3. Get related activity logs
    const { data: activityLogs } = await supabase
      .from('eliza_activity_log')
      .select('*')
      .or(`title.ilike.%${template_name}%,description.ilike.%${template_name}%`)
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: false })
      .limit(20);

    // 4. Extract functions used in workflow steps
    const stepsConfig = template.steps_config || [];
    const functionNames = new Set<string>();
    
    for (const step of stepsConfig) {
      if (step.function_name) functionNames.add(step.function_name);
      if (step.config?.function_name) functionNames.add(step.config.function_name);
      if (step.config?.action) functionNames.add(step.config.action);
    }

    // 5. Get edge function logs for related functions
    let edgeFunctionLogs: any[] = [];
    if (include_logs && functionNames.size > 0) {
      const { data: funcLogs } = await supabase
        .from('eliza_function_usage')
        .select('*')
        .in('function_name', Array.from(functionNames))
        .gte('called_at', cutoffTime)
        .order('called_at', { ascending: false })
        .limit(50);
      
      edgeFunctionLogs = funcLogs || [];
    }

    // 6. Calculate failure metrics
    const totalExecutions = executionLogs?.length || 0;
    const failedExecutions = executionLogs?.filter(e => e.status === 'failed' || e.status === 'error') || [];
    const successfulExecutions = executionLogs?.filter(e => e.status === 'completed' || e.status === 'success') || [];
    const failureRate = totalExecutions > 0 ? (failedExecutions.length / totalExecutions) * 100 : 0;

    // 7. Extract error patterns
    const errorPatterns: Record<string, number> = {};
    const failingSteps: Record<string, number> = {};
    
    for (const exec of failedExecutions) {
      const errorMsg = exec.error_message || exec.metadata?.error || 'Unknown error';
      const shortError = errorMsg.substring(0, 100);
      errorPatterns[shortError] = (errorPatterns[shortError] || 0) + 1;
      
      if (exec.failed_at_step) {
        failingSteps[exec.failed_at_step] = (failingSteps[exec.failed_at_step] || 0) + 1;
      }
    }

    // 8. Analyze with AI if DeepSeek available
    let aiAnalysis = null;
    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');
    
    if (deepseekKey && failedExecutions.length > 0) {
      try {
        const analysisPrompt = `Analyze this failing workflow and provide root cause analysis:

WORKFLOW: ${template_name}
DESCRIPTION: ${template.description || 'N/A'}
FAILURE RATE: ${failureRate.toFixed(1)}% (${failedExecutions.length}/${totalExecutions})

STEPS CONFIG:
${JSON.stringify(stepsConfig, null, 2)}

RECENT FAILURES (sample):
${JSON.stringify(failedExecutions.slice(0, 5), null, 2)}

ERROR PATTERNS:
${JSON.stringify(errorPatterns, null, 2)}

FAILING STEPS:
${JSON.stringify(failingSteps, null, 2)}

EDGE FUNCTION ERRORS:
${JSON.stringify(edgeFunctionLogs.filter(l => !l.success).slice(0, 10), null, 2)}

Provide:
1. ROOT CAUSE: Most likely cause of failures
2. SPECIFIC FIXES: Code or config changes needed
3. SEVERITY: critical/high/medium/low
4. AUTO-FIXABLE: Can this be fixed automatically? (yes/no)
5. RECOMMENDATIONS: Ordered list of remediation steps`;

        const aiResponse = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${deepseekKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: analysisPrompt }],
            max_tokens: 2000,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiAnalysis = aiData.choices?.[0]?.message?.content;
        }
      } catch (aiError) {
        console.error('[Diagnose] AI analysis failed:', aiError);
      }
    }

    // 9. Build diagnostic report
    const diagnosticReport = {
      template_name,
      template_description: template.description,
      analysis_window_hours: time_window_hours,
      analyzed_at: new Date().toISOString(),
      
      metrics: {
        total_executions: totalExecutions,
        successful: successfulExecutions.length,
        failed: failedExecutions.length,
        failure_rate_percent: parseFloat(failureRate.toFixed(2)),
        avg_duration_ms: executionLogs?.length 
          ? executionLogs.reduce((sum, e) => sum + (e.duration_ms || 0), 0) / executionLogs.length 
          : null,
      },
      
      error_analysis: {
        patterns: errorPatterns,
        failing_steps: failingSteps,
        most_common_error: Object.entries(errorPatterns).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        most_failing_step: Object.entries(failingSteps).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      },
      
      functions_involved: Array.from(functionNames),
      function_error_count: edgeFunctionLogs.filter(l => !l.success).length,
      
      ai_analysis: aiAnalysis,
      
      severity: failureRate > 50 ? 'critical' : failureRate > 25 ? 'high' : failureRate > 10 ? 'medium' : 'low',
      
      recommendations: generateRecommendations(errorPatterns, failingSteps, template, failureRate),
      
      raw_data: {
        recent_failures: failedExecutions.slice(0, 5),
        recent_successes: successfulExecutions.slice(0, 3),
        function_logs_sample: edgeFunctionLogs.slice(0, 10),
      }
    };

    // 10. Store diagnostic report
    await supabase
      .from('eliza_activity_log')
      .insert({
        activity_type: 'workflow_diagnosis',
        title: `Diagnosed: ${template_name}`,
        description: `Failure rate: ${failureRate.toFixed(1)}%, Severity: ${diagnosticReport.severity}`,
        status: diagnosticReport.severity === 'critical' ? 'failed' : 'completed',
        metadata: {
          template_name,
          failure_rate: failureRate,
          severity: diagnosticReport.severity,
          top_error: diagnosticReport.error_analysis.most_common_error,
          recommendations_count: diagnosticReport.recommendations.length,
        }
      });

    const executionTime = Date.now() - startTime;
    console.log(`[Diagnose Workflow Failure] Completed in ${executionTime}ms`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        diagnostic_report: diagnosticReport,
        execution_time_ms: executionTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Diagnose Workflow Failure] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        execution_time_ms: Date.now() - startTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function generateRecommendations(
  errorPatterns: Record<string, number>,
  failingSteps: Record<string, number>,
  template: any,
  failureRate: number
): string[] {
  const recommendations: string[] = [];

  // Check for common error patterns
  const errors = Object.keys(errorPatterns).join(' ').toLowerCase();
  
  if (errors.includes('timeout') || errors.includes('timed out')) {
    recommendations.push('Increase timeout values for slow steps or add retry logic');
  }
  
  if (errors.includes('unauthorized') || errors.includes('401') || errors.includes('403')) {
    recommendations.push('Check API key configuration and permissions in Supabase secrets');
  }
  
  if (errors.includes('not found') || errors.includes('404')) {
    recommendations.push('Verify edge function names and endpoints exist and are deployed');
  }
  
  if (errors.includes('template_name') || errors.includes('missing')) {
    recommendations.push('Ensure callers pass template_name in correct payload structure (data.template_name or body.template_name)');
  }
  
  if (errors.includes('vsco') || errors.includes('workspace')) {
    recommendations.push('Check VSCO Workspace API credentials and ensure vsco-workspace function is deployed');
  }

  // Check failing steps
  const topFailingStep = Object.entries(failingSteps).sort((a, b) => b[1] - a[1])[0];
  if (topFailingStep) {
    recommendations.push(`Investigate step "${topFailingStep[0]}" which fails most frequently (${topFailingStep[1]} times)`);
  }

  // General recommendations based on failure rate
  if (failureRate > 50) {
    recommendations.push('CRITICAL: Consider disabling this workflow until root cause is fixed');
    recommendations.push('Review recent code changes to workflow-template-manager or related functions');
  } else if (failureRate > 25) {
    recommendations.push('Add better error handling and fallback logic to failing steps');
  }

  if (recommendations.length === 0) {
    recommendations.push('No obvious issues detected - review logs manually for edge cases');
  }

  return recommendations;
}
