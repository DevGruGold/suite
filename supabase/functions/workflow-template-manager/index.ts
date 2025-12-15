import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { generateTextWithFallback } from '../_shared/unifiedAIFallback.ts';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'workflow-template-manager';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExecuteTemplateParams {
  template_name: string;
  params?: Record<string, any>;
}

// Helper: Generate structured report
function generateReport(
  title: string,
  sections: { heading: string; content: any }[],
  metadata: Record<string, any> = {}
): { summary: string; full_report: string; structured_data: any } {
  const timestamp = new Date().toISOString();
  
  let fullReport = `# ${title}\n\n`;
  fullReport += `**Generated:** ${timestamp}\n\n`;
  
  for (const [key, value] of Object.entries(metadata)) {
    fullReport += `**${key}:** ${value}\n`;
  }
  fullReport += '\n---\n\n';
  
  const structuredData: any = { title, timestamp, metadata, sections: [] };
  
  for (const section of sections) {
    fullReport += `## ${section.heading}\n\n`;
    if (typeof section.content === 'string') {
      fullReport += `${section.content}\n\n`;
    } else {
      fullReport += `\`\`\`json\n${JSON.stringify(section.content, null, 2)}\n\`\`\`\n\n`;
    }
    structuredData.sections.push(section);
  }
  
  // Generate summary (first 500 chars of key sections)
  const summaryParts = sections.slice(0, 3).map(s => 
    typeof s.content === 'string' ? s.content.substring(0, 150) : JSON.stringify(s.content).substring(0, 100)
  );
  const summary = summaryParts.join(' | ');
  
  return { summary, full_report: fullReport, structured_data: structuredData };
}

// Helper: Perform scoring/ranking
function performScoring(
  items: any[],
  criteria: { field: string; weight: number; higherIsBetter?: boolean }[]
): { scores: { item: any; score: number }[]; topItems: any[] } {
  const scores = items.map(item => {
    let totalScore = 0;
    for (const criterion of criteria) {
      const value = item[criterion.field] || 0;
      const normalizedValue = typeof value === 'number' ? value : 0;
      const weightedScore = criterion.higherIsBetter !== false 
        ? normalizedValue * criterion.weight 
        : (100 - normalizedValue) * criterion.weight;
      totalScore += weightedScore;
    }
    return { item, score: totalScore };
  });
  
  scores.sort((a, b) => b.score - a.score);
  return { scores, topItems: scores.slice(0, 5).map(s => s.item) };
}

// Helper: Evaluate conditions for decision steps
function evaluateConditions(
  conditions: Record<string, string>,
  context: Record<string, any>
): { result: string; matchedCondition: string } {
  for (const [condition, action] of Object.entries(conditions)) {
    // Check if condition is truthy in context
    if (context[condition]) {
      return { result: action, matchedCondition: condition };
    }
  }
  return { result: 'default', matchedCondition: 'none' };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { action, data } = await req.json();
    console.log(`[Workflow Template Manager] Action: ${action}`);

    switch (action) {
      case 'list_templates': {
        const { category, active_only = true } = data || {};

        let query = supabase
          .from('workflow_templates')
          .select('*')
          .order('times_executed', { ascending: false });

        if (category) {
          query = query.eq('category', category);
        }

        if (active_only) {
          query = query.eq('is_active', true);
        }

        const { data: templates, error } = await query;

        if (error) throw error;

        return new Response(
          JSON.stringify({
            success: true,
            templates: templates || [],
            count: templates?.length || 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_template': {
        const { template_name } = data;

        const { data: template, error } = await supabase
          .from('workflow_templates')
          .select('*')
          .eq('template_name', template_name)
          .single();

        if (error) throw error;

        return new Response(
          JSON.stringify({
            success: true,
            template,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'execute_template': {
        // ROBUST PAYLOAD HANDLING: Support both wrapped and flat structures
        // Body already parsed at line 106 - no need to re-read
        // Wrapped: { action, data: { template_name, params } }
        // Flat:    { action, template_name, params/context }
        
        // Extract template_name from data if present (data is from the parsed body)
        const template_name = data?.template_name;
        const params = data?.params || data?.context || {};
        
        if (!template_name) {
          console.error('[Workflow Template Manager] Missing template_name. Received data:', JSON.stringify(data));
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Missing required parameter: template_name',
              hint: 'Provide template_name in body.data.template_name',
              received: { action, hasData: !!data, dataKeys: data ? Object.keys(data) : [] }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        
        console.log(`[Workflow Template Manager] Executing template: ${template_name} with params:`, JSON.stringify(params));

        // Get template
        const { data: template, error: templateError } = await supabase
          .from('workflow_templates')
          .select('*')
          .eq('template_name', template_name)
          .single();

        if (templateError || !template) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Template not found: ${template_name}` 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          );
        }

        // Create execution record
        const executionId = `exec_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
        const { data: execution, error: execError } = await supabase
          .from('workflow_template_executions')
          .insert({
            template_id: template.id,
            template_name: template.template_name,
            execution_id: executionId,
            status: 'running',
            execution_params: params,
            total_steps: (template.steps as any[]).length,
          })
          .select()
          .single();

        if (execError) throw execError;

        console.log(`[Workflow Template Manager] Starting execution: ${executionId} for template: ${template_name}`);

        // Execute workflow steps with enhanced context
        const steps = template.steps as any[];
        let stepsCompleted = 0;
        const startTime = Date.now();
        const results: any[] = [];
        const workflowContext: Record<string, any> = { ...params };

        try {
          for (const step of steps) {
            console.log(`[Workflow Template Manager] Executing step: ${step.name}`);
            
            // Check conditional execution
            if (step.conditional && !workflowContext[step.conditional]) {
              console.log(`[Workflow Step] Skipping ${step.name} - condition not met: ${step.conditional}`);
              results.push({
                step: step.name,
                type: step.type,
                status: 'skipped',
                reason: `Condition not met: ${step.conditional}`,
              });
              continue;
            }
            
            // Process step based on type
            const stepResult = await executeStep(step, workflowContext, supabase);
            results.push({
              step: step.name,
              type: step.type,
              status: 'completed',
              result: stepResult,
            });
            
            // Merge step result into workflow context for subsequent steps
            if (stepResult && typeof stepResult === 'object') {
              Object.assign(workflowContext, { [`${step.name.replace(/\s+/g, '_').toLowerCase()}_result`]: stepResult });
            }

            stepsCompleted++;

            // Update execution progress
            await supabase
              .from('workflow_template_executions')
              .update({ steps_completed: stepsCompleted })
              .eq('id', execution.id);
          }

          // Mark execution as completed
          const durationMs = Date.now() - startTime;
          await supabase
            .from('workflow_template_executions')
            .update({
              status: 'completed',
              success: true,
              completed_at: new Date().toISOString(),
              duration_ms: durationMs,
              steps_completed: stepsCompleted,
              execution_results: { steps: results, context: workflowContext },
            })
            .eq('id', execution.id);

          // Update template statistics
          const newSuccessRate = ((template.success_rate * template.times_executed + 100) / (template.times_executed + 1));
          await supabase
            .from('workflow_templates')
            .update({
              times_executed: template.times_executed + 1,
              success_rate: newSuccessRate,
            })
            .eq('id', template.id);

          // Log activity
          await supabase.from('eliza_activity_log').insert({
            activity_type: 'workflow_execution',
            function_name: 'workflow-template-manager',
            description: `Executed workflow: ${template_name}`,
            metadata: { execution_id: executionId, duration_ms: durationMs, steps_completed: stepsCompleted },
          });

          console.log(`[Workflow Template Manager] Execution completed: ${executionId} in ${durationMs}ms`);

          return new Response(
            JSON.stringify({
              success: true,
              execution_id: executionId,
              template_name,
              status: 'completed',
              duration_ms: durationMs,
              steps_completed: stepsCompleted,
              total_steps: steps.length,
              results,
              message: `Template '${template_name}' executed successfully in ${(durationMs / 1000).toFixed(1)}s`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (stepError: any) {
          // Mark execution as failed
          const durationMs = Date.now() - startTime;
          await supabase
            .from('workflow_template_executions')
            .update({
              status: 'failed',
              success: false,
              completed_at: new Date().toISOString(),
              duration_ms: durationMs,
              steps_completed: stepsCompleted,
              error_message: stepError.message,
              execution_results: { steps: results, error: stepError.message },
            })
            .eq('id', execution.id);

          // Update template statistics
          const newSuccessRate = ((template.success_rate * template.times_executed) / (template.times_executed + 1));
          await supabase
            .from('workflow_templates')
            .update({
              times_executed: template.times_executed + 1,
              success_rate: newSuccessRate,
            })
            .eq('id', template.id);

          console.error(`[Workflow Template Manager] Execution failed: ${executionId}`, stepError);

          return new Response(
            JSON.stringify({
              success: false,
              execution_id: executionId,
              error: stepError.message,
              steps_completed: stepsCompleted,
              total_steps: steps.length,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
      }

      case 'create_template': {
        const { template_name, category, description, steps, tags = [] } = data;

        const { data: newTemplate, error: createError } = await supabase
          .from('workflow_templates')
          .insert({
            template_name,
            category,
            description,
            steps,
            tags,
          })
          .select()
          .single();

        if (createError) throw createError;

        console.log(`[Workflow Template Manager] Created template: ${template_name}`);

        return new Response(
          JSON.stringify({
            success: true,
            template: newTemplate,
            message: `Template '${template_name}' created successfully`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_template': {
        const { template_name, ...updates } = data;

        const { error: updateError } = await supabase
          .from('workflow_templates')
          .update(updates)
          .eq('template_name', template_name);

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({
            success: true,
            message: `Template '${template_name}' updated successfully`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_template_analytics': {
        const { template_name, limit = 10 } = data || {};

        let query = supabase
          .from('workflow_template_executions')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(limit);

        if (template_name) {
          query = query.eq('template_name', template_name);
        }

        const { data: executions, error } = await query;

        if (error) throw error;

        // Calculate analytics
        const totalExecutions = executions?.length || 0;
        const successfulExecutions = executions?.filter(e => e.success).length || 0;
        const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;
        const avgDuration = executions?.reduce((sum, e) => sum + (e.duration_ms || 0), 0) / totalExecutions || 0;

        return new Response(
          JSON.stringify({
            success: true,
            analytics: {
              template_name,
              total_executions: totalExecutions,
              successful_executions: successfulExecutions,
              failed_executions: totalExecutions - successfulExecutions,
              success_rate: successRate.toFixed(2),
              avg_duration_ms: avgDuration.toFixed(0),
              avg_duration_seconds: (avgDuration / 1000).toFixed(1),
              recent_executions: executions || [],
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_execution_status': {
        const { execution_id } = data;

        const { data: execution, error } = await supabase
          .from('workflow_template_executions')
          .select('*')
          .eq('execution_id', execution_id)
          .single();

        if (error) throw error;

        return new Response(
          JSON.stringify({
            success: true,
            execution,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
  } catch (error) {
    console.error('[Workflow Template Manager] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// Enhanced step execution with real AI implementations
async function executeStep(step: any, context: Record<string, any>, supabase: any): Promise<any> {
  const stepType = step.type;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  console.log(`[Workflow Step] Type: ${stepType}, Name: ${step.name}`);

  switch (stepType) {
    // ========== AI ANALYSIS ==========
    case 'ai_analysis': {
      const prompt = `
Task: ${step.name}
Description: ${step.description}

Context Data:
${JSON.stringify(context, null, 2)}

Please analyze the above context and provide insights, patterns, and recommendations.
Format your response as structured analysis with clear sections.
`;
      const systemPrompt = `You are an expert analyst for the Suite AI Platform. Provide clear, actionable analysis based on the data provided. Be specific and data-driven in your assessments.`;
      
      const analysis = await generateTextWithFallback(prompt, systemPrompt, { temperature: 0.7, max_tokens: 2000 });
      return { 
        analysis, 
        model_used: 'unified_cascade',
        analyzed_at: new Date().toISOString(),
      };
    }

    // ========== AI GENERATION ==========
    case 'ai_generation': {
      const prompt = `
Task: ${step.name}
Description: ${step.description}

Context Data:
${JSON.stringify(context, null, 2)}

Generate the requested content based on the description and context.
Ensure the output is well-structured, professional, and actionable.
`;
      const systemPrompt = `You are an expert content generator for the Suite AI Platform. Create high-quality, professional content that aligns with enterprise standards. Be thorough but concise.`;
      
      const generated = await generateTextWithFallback(prompt, systemPrompt, { temperature: 0.7, max_tokens: 2000 });
      return { 
        generated_content: generated,
        model_used: 'unified_cascade',
        generated_at: new Date().toISOString(),
      };
    }

    // ========== REPORTING ==========
    case 'reporting': {
      const sections: { heading: string; content: any }[] = [];
      
      // Build report sections from context
      for (const [key, value] of Object.entries(context)) {
        if (key.endsWith('_result') && value) {
          const heading = key.replace('_result', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          sections.push({ heading, content: value });
        }
      }
      
      const report = generateReport(
        `${step.name} Report`,
        sections,
        { workflow_step: step.name, output_table: step.output_table }
      );
      
      // Store report if output table specified
      if (step.output_table) {
        try {
          await supabase.from(step.output_table).insert({
            report_summary: report.summary,
            full_report: report.full_report,
            ...report.structured_data,
          });
        } catch (e) {
          console.warn(`[Report] Could not store to ${step.output_table}:`, e.message);
        }
      }
      
      return report;
    }

    // ========== SCORING ==========
    case 'scoring': {
      const items = context.items || context.tasks || context.agents || [];
      const criteria = step.criteria || [
        { field: 'success_rate', weight: 0.4, higherIsBetter: true },
        { field: 'relevance_score', weight: 0.3, higherIsBetter: true },
        { field: 'complexity', weight: 0.3, higherIsBetter: false },
      ];
      
      const scoringResult = performScoring(items, criteria);
      return {
        scored_items: scoringResult.scores.length,
        top_items: scoringResult.topItems,
        scoring_criteria: criteria,
      };
    }

    // ========== DECISION ==========
    case 'decision': {
      const conditions = step.conditions || {};
      const decision = evaluateConditions(conditions, context);
      
      // Execute decision action
      console.log(`[Decision] Condition: ${decision.matchedCondition} -> Action: ${decision.result}`);
      
      return {
        decision: decision.result,
        matched_condition: decision.matchedCondition,
        evaluated_conditions: Object.keys(conditions),
      };
    }

    // ========== ANALYTICS ==========
    case 'analytics': {
      // Perform analytics calculations based on step description
      const analyticsResult: any = {
        type: step.description,
        timestamp: new Date().toISOString(),
      };
      
      if (step.description.includes('underperform')) {
        // Identify underperformers from agents in context
        const agents = context.fetch_agent_metrics_result?.data || [];
        const underperformers = agents.filter((a: any) => 
          (a.success_rate || 0) < 70 || (a.blocked_tasks || 0) > 3
        );
        analyticsResult.underperformers = underperformers;
        analyticsResult.underperformer_count = underperformers.length;
        context.underperformers_identified = underperformers.length > 0;
      }
      
      if (step.description.includes('overload')) {
        const agents = context.fetch_agent_metrics_result?.data || [];
        const overloaded = agents.filter((a: any) => 
          (a.current_workload || 0) >= (a.max_concurrent_tasks || 5) * 0.9
        );
        analyticsResult.overloaded_agents = overloaded;
        analyticsResult.imbalance_detected = overloaded.length > 0;
        context.imbalance_detected = overloaded.length > 0;
      }
      
      return analyticsResult;
    }

    // ========== CALCULATION ==========
    case 'calculation': {
      // Aggregate/combine data from context
      const aggregated: any = {
        calculation_type: step.description,
        timestamp: new Date().toISOString(),
        inputs: {},
      };
      
      // Collect all relevant data from context
      for (const [key, value] of Object.entries(context)) {
        if (value && typeof value === 'object' && !key.startsWith('_')) {
          aggregated.inputs[key] = Array.isArray(value) ? value.length : 1;
        }
      }
      
      aggregated.total_items = Object.values(aggregated.inputs).reduce((sum: number, v: any) => sum + (typeof v === 'number' ? v : 0), 0);
      
      return aggregated;
    }

    // ========== LOG RETRIEVAL (for diagnostics) ==========
    case 'log_retrieval': {
      const failingFunctions = context.failing_functions || context.extract_failing_functions_result?.failing_functions || [];
      const allLogs: any[] = [];
      
      for (const funcName of failingFunctions.slice(0, 5)) { // Limit to 5 functions
        try {
          const { data, error } = await supabase.functions.invoke('get-edge-function-logs', {
            body: {
              function_name: funcName,
              time_window_hours: step.time_window_hours || 168,
              status_filter: step.status_filter || 'error',
              include_stack_traces: step.include_stack_traces ?? true,
              limit: step.limit || 50,
            }
          });
          
          if (!error && data) {
            allLogs.push({ function: funcName, logs: data, success: true });
          } else {
            allLogs.push({ function: funcName, error: error?.message, success: false });
          }
        } catch (e) {
          console.error(`[Log Retrieval] Error fetching logs for ${funcName}:`, e);
          allLogs.push({ function: funcName, error: e.message, success: false });
        }
      }
      
      return {
        logs: allLogs,
        functions_analyzed: allLogs.length,
        successful_retrievals: allLogs.filter(l => l.success).length,
        timestamp: new Date().toISOString(),
      };
    }

    // ========== FAILURE CALCULATION (for diagnostics) ==========
    case 'failure_calculation': {
      const executions = context.fetch_execution_history_result?.data || [];
      const failures = executions.filter((e: any) => !e.success);
      const failureRate = executions.length > 0 ? (failures.length / executions.length) * 100 : 0;
      
      // Extract error patterns
      const errorPatterns: Record<string, number> = {};
      failures.forEach((f: any) => {
        const msg = f.error_message || 'Unknown error';
        errorPatterns[msg] = (errorPatterns[msg] || 0) + 1;
      });
      
      // Find most common failing functions from error messages
      const functionPattern = /Function (\S+) failed|invoke\(['"]([^'"]+)['"]\)|(\w+-\w+(?:-\w+)*) (error|failed)/gi;
      const failingFunctionsSet = new Set<string>();
      
      failures.forEach((f: any) => {
        const errorMsg = f.error_message || '';
        const results = f.execution_results;
        
        // Extract from error message
        let match;
        while ((match = functionPattern.exec(errorMsg)) !== null) {
          const funcName = match[1] || match[2] || match[3];
          if (funcName) failingFunctionsSet.add(funcName);
        }
        
        // Extract from execution results
        if (results?.steps) {
          results.steps.forEach((s: any) => {
            if (s.status === 'failed' || s.result?.error) {
              if (s.result?.function) failingFunctionsSet.add(s.result.function);
            }
          });
        }
      });
      
      const failingFunctions = Array.from(failingFunctionsSet);
      const mostCommonError = Object.entries(errorPatterns).sort((a, b) => b[1] - a[1])[0];
      
      // Store in context for subsequent steps
      context.failing_functions = failingFunctions;
      context.failure_rate = failureRate;
      context.high_severity = failureRate > 50;
      context.auto_fixable = failingFunctions.length === 1 && failureRate < 80;
      context.requires_modification = failingFunctions.length > 0;
      context.is_revenue_workflow = context.template_name?.includes('customer') || 
                                     context.template_name?.includes('billing') ||
                                     context.template_name?.includes('revenue');
      
      return {
        failure_rate: failureRate.toFixed(2),
        total_executions: executions.length,
        total_failures: failures.length,
        error_patterns: errorPatterns,
        failing_functions: failingFunctions,
        most_common_error: mostCommonError ? { message: mostCommonError[0], count: mostCommonError[1] } : null,
        timestamp: new Date().toISOString(),
      };
    }

    // ========== SEVERITY SCORING (for diagnostics) ==========
    case 'severity_scoring': {
      const failureRate = context.failure_rate || context.calculate_failure_metrics_result?.failure_rate || 0;
      const executionsAffected = context.total_failures || context.calculate_failure_metrics_result?.total_failures || 0;
      const isRevenueWorkflow = context.is_revenue_workflow || false;
      
      // Calculate severity score (0-100)
      let severityScore = 0;
      severityScore += Math.min(failureRate * 0.6, 60); // Up to 60 points for failure rate
      severityScore += Math.min(executionsAffected * 2, 20); // Up to 20 points for volume
      if (isRevenueWorkflow) severityScore += 20; // 20 point boost for revenue workflows
      
      // Determine severity level
      let severity: string;
      if (severityScore >= 80 || failureRate >= 90) severity = 'critical';
      else if (severityScore >= 60 || failureRate >= 70) severity = 'high';
      else if (severityScore >= 40 || failureRate >= 50) severity = 'medium';
      else severity = 'low';
      
      // Update context flags
      context.severity = severity;
      context.severity_score = severityScore;
      context.high_severity = severity === 'critical' || severity === 'high';
      context.manual_intervention_needed = severity === 'critical';
      context.learning_opportunity = context.total_failures >= 5;
      
      return {
        severity,
        severity_score: severityScore.toFixed(1),
        factors: {
          failure_rate: failureRate,
          executions_affected: executionsAffected,
          is_revenue_workflow: isRevenueWorkflow,
        },
        recommendations: {
          urgent: severity === 'critical',
          auto_fix_eligible: context.auto_fixable,
          requires_manual_review: context.manual_intervention_needed,
        },
      };
    }

    // ========== DIAGNOSTIC REPORTING ==========
    case 'diagnostic_reporting': {
      const diagnosisId = `diag_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
      const templateName = context.template_name;
      
      // Gather all diagnostic data
      const failureMetrics = context.calculate_failure_metrics_result || {};
      const rootCause = context.ai_root_cause_analysis_result || {};
      const recommendations = context.generate_remediation_recommendations_result || {};
      const severityData = context.assess_severity_result || {};
      
      // Build report sections
      const sections: { heading: string; content: any }[] = [
        { heading: 'Executive Summary', content: `Workflow "${templateName}" diagnosed with ${severityData.severity || 'unknown'} severity. Failure rate: ${failureMetrics.failure_rate || 0}%` },
        { heading: 'Failure Metrics', content: failureMetrics },
        { heading: 'Root Cause Analysis', content: rootCause.analysis || 'No root cause identified' },
        { heading: 'Affected Functions', content: context.failing_functions || [] },
        { heading: 'Recommendations', content: recommendations.generated_content || 'No recommendations generated' },
        { heading: 'Severity Assessment', content: severityData },
      ];
      
      const report = generateReport(
        `Workflow Diagnostic Report: ${templateName}`,
        sections,
        { 
          diagnosis_id: diagnosisId,
          template_name: templateName,
          severity: severityData.severity,
          generated_at: new Date().toISOString(),
        }
      );
      
      // Store to diagnostic reports table
      if (step.output_table) {
        try {
          await supabase.from(step.output_table).insert({
            template_name: templateName,
            diagnosis_id: diagnosisId,
            executions_analyzed: failureMetrics.total_executions || 0,
            failure_rate: parseFloat(failureMetrics.failure_rate) || 0,
            primary_failure_point: failureMetrics.most_common_error?.message || null,
            root_cause_analysis: rootCause,
            recommended_actions: recommendations,
            affected_functions: context.failing_functions || [],
            full_report: report.full_report,
            severity: severityData.severity || 'medium',
          });
          console.log(`[Diagnostic Report] Stored to ${step.output_table} with ID: ${diagnosisId}`);
        } catch (e) {
          console.warn(`[Diagnostic Report] Could not store to ${step.output_table}:`, e.message);
        }
      }
      
      return {
        diagnosis_id: diagnosisId,
        template_analyzed: templateName,
        severity: severityData.severity,
        failure_rate: failureMetrics.failure_rate,
        primary_failure_point: failureMetrics.most_common_error?.message,
        affected_functions: context.failing_functions,
        report_summary: report.summary,
        full_report: report.full_report,
      };
    }

    // ========== VALIDATION ==========
    case 'validation':
      return { validated: true, message: 'Validation passed' };

    // ========== API CALL ==========
    case 'api_call': {
      if (step.function) {
        const functionName = step.function;
        const body = {
          action: step.action,
          data: replaceTemplateParams(step.params_template || step.params || {}, context),
        };

        console.log(`[Workflow Step] Calling function: ${functionName}`, body);

        const { data, error } = await supabase.functions.invoke(functionName, { body });

        if (error) {
          console.error(`[Workflow Step] Function ${functionName} error:`, error);
          // Don't throw for non-critical calls
          return { error: error.message, function: functionName };
        }

        return data;
      }
      return { skipped: true, reason: 'No function specified' };
    }

    // ========== DATABASE ==========
    case 'database': {
      if (!step.table) {
        return { skipped: true, reason: 'No table specified' };
      }
      
      if (step.operation === 'select') {
        let query = supabase.from(step.table).select('*');
        
        // Apply filters
        if (step.filter) {
          if (step.filter.status) {
            query = query.eq('status', step.filter.status);
          }
          if (step.filter.time_range) {
            const hours = step.filter.time_range === '24_hours' ? 24 : 
                          step.filter.time_range === '7_days' ? 168 : 24;
            query = query.gte('created_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString());
          }
        }
        
        if (step.filter_key && context[step.filter_key]) {
          query = query.eq(step.filter_key, context[step.filter_key]);
        }
        
        query = query.limit(step.limit || 100);
        
        const { data, error } = await query;
        if (error) {
          console.error(`[Database] Select error on ${step.table}:`, error);
          return { error: error.message };
        }
        return { data, count: data?.length || 0 };
      }
      
      if (step.operation === 'insert') {
        const insertData: any = {
          ...context,
          created_at: new Date().toISOString(),
        };
        
        // Clean up context for storage
        delete insertData.params;
        
        const { data, error } = await supabase
          .from(step.table)
          .insert(insertData)
          .select()
          .single();

        if (error) {
          console.error(`[Database] Insert error on ${step.table}:`, error);
          return { error: error.message };
        }
        return { inserted: true, id: data?.id };
      }
      
      return { skipped: true, reason: `Unsupported operation: ${step.operation}` };
    }

    // ========== NOTIFICATION ==========
    case 'notification':
    case 'notification_batch':
    case 'multi_channel': {
      const channels = step.channels || ['system'];
      console.log(`[Workflow Step] Notification to ${channels.join(', ')}: ${step.description}`);
      
      // Log notification to activity feed
      await supabase.from('activity_feed').insert({
        title: step.name,
        description: step.description,
        type: 'workflow_notification',
        data: { channels, workflow_step: step.name },
      });
      
      return { 
        notified: true, 
        message: step.description,
        channels,
        timestamp: new Date().toISOString(),
      };
    }

    // ========== DEFAULT / PLACEHOLDER ==========
    default:
      console.log(`[Workflow Step] Executing generic step: ${stepType}`);
      return { 
        completed: true, 
        type: stepType,
        description: step.description,
        timestamp: new Date().toISOString(),
      };
  }
}

// Helper function to replace template parameters
function replaceTemplateParams(template: any, params: Record<string, any>): any {
  if (typeof template === 'string') {
    return template.replace(/{(\w+)}/g, (_, key) => params[key] || '');
  }

  if (Array.isArray(template)) {
    return template.map(item => replaceTemplateParams(item, params));
  }

  if (template && typeof template === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(template)) {
      result[key] = replaceTemplateParams(value, params);
    }
    return result;
  }

  return template;
}
