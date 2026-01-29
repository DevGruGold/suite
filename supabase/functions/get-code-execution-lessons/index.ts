import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.21.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { limit = 20, include_all_functions = false, hours_back = 168 } = await req.json().catch(() => ({}));
    
    console.log(`📚 get-code-execution-lessons: Gathering lessons from last ${hours_back} hours`);
    const timeThreshold = new Date(Date.now() - hours_back * 60 * 60 * 1000).toISOString();

    // SOURCE 1: Python executions (primary)
    const { data: executions, error } = await supabase
      .from("eliza_python_executions")
      .select("*")
      .gte("created_at", timeThreshold)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error('❌ Failed to fetch python executions:', error);
    }

    // SOURCE 2: System logs for early-stage errors
    const { data: systemErrors, error: sysError } = await supabase
      .from("system_logs")
      .select("*")
      .eq("log_level", "error")
      .gte("created_at", timeThreshold)
      .order("created_at", { ascending: false })
      .limit(50);

    if (sysError) {
      console.error('❌ Failed to fetch system_logs:', sysError);
    }

    // SOURCE 3: Function usage errors (all functions if requested)
    let functionErrors: any[] = [];
    if (include_all_functions) {
      const { data: funcErrors, error: funcError } = await supabase
        .from("eliza_function_usage")
        .select("*")
        .eq("success", false)
        .gte("invoked_at", timeThreshold)
        .order("invoked_at", { ascending: false })
        .limit(100);

      if (!funcError && funcErrors) {
        functionErrors = funcErrors;
        console.log(`📋 Found ${functionErrors.length} function execution errors`);
      }
    }

    // Combine all data sources
    const allExecutions = executions || [];
    const allSystemErrors = systemErrors || [];

    if (allExecutions.length === 0 && allSystemErrors.length === 0 && functionErrors.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No execution history found",
          lessons: [],
          data_sources: {
            python_executions: 0,
            system_logs: 0,
            function_errors: 0
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate statistics from Python executions
    // Schema: eliza_python_executions uses status='completed'|'error'|'pending'|'running', error_message field
    const total = allExecutions.length;
    const successful = allExecutions.filter(e => e.status === "completed").length;
    const failed = allExecutions.filter(e => e.status === "error" || e.status === "failed").length;
    const success_rate = total > 0 ? (successful / total) * 100 : 0;

    // Identify common patterns from ALL sources
    const error_patterns: Record<string, number> = {};
    const successful_patterns: Record<string, number> = {};
    const early_stage_errors: Record<string, number> = {};
    const function_error_patterns: Record<string, number> = {};

    // Process Python execution patterns
    // Schema: error field is 'error_message', success status is 'completed'
    allExecutions.forEach(exec => {
      if ((exec.status === "error" || exec.status === "failed") && exec.error_message) {
        const error_type = exec.error_message.split(":")[0].trim();
        error_patterns[error_type] = (error_patterns[error_type] || 0) + 1;
      } else if (exec.status === "completed" && exec.metadata?.learning_metadata) {
        const lesson = exec.metadata.learning_metadata.lesson;
        if (lesson) {
          successful_patterns[lesson] = (successful_patterns[lesson] || 0) + 1;
        }
      }
    });

    // Process system log early-stage errors
    // Schema: system_logs uses 'log_source' not 'function_name'
    allSystemErrors.forEach(log => {
      const funcName = log.log_source || (log.message?.match(/\[([^\]]+)\]/)?.[1]) || 'unknown';
      const errorType = log.log_category || 'early_stage_error';
      const key = `${funcName}:${errorType}`;
      early_stage_errors[key] = (early_stage_errors[key] || 0) + 1;
    });

    // Process function execution errors
    functionErrors.forEach(err => {
      const funcName = err.function_name || 'unknown';
      const errorMsg = err.error_message?.split(':')[0]?.trim() || 'unknown_error';
      const key = `${funcName}:${errorMsg}`;
      function_error_patterns[key] = (function_error_patterns[key] || 0) + 1;
    });

    // Get auto-fix statistics
    const auto_fixed = allExecutions.filter(
      e => e.metadata?.auto_fix_attempted && e.metadata?.auto_fix_success
    ).length;

    // Generate AI insights using all data
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Analyze these code execution statistics and provide actionable insights:

=== PYTHON EXECUTION STATISTICS ===
- Total executions: ${total}
- Successful: ${successful} (${success_rate.toFixed(1)}%)
- Failed: ${failed}
- Auto-fixed: ${auto_fixed}

=== PYTHON ERROR PATTERNS ===
${Object.entries(error_patterns).map(([type, count]) => `- ${type}: ${count} occurrences`).join("\n") || "No patterns found"}

=== EARLY-STAGE FUNCTION ERRORS (Boot/Init failures) ===
${Object.entries(early_stage_errors).map(([key, count]) => `- ${key}: ${count} occurrences`).join("\n") || "No early-stage errors"}

=== FUNCTION EXECUTION ERRORS ===
${Object.entries(function_error_patterns).slice(0, 20).map(([key, count]) => `- ${key}: ${count} occurrences`).join("\n") || "No function errors"}

=== SUCCESSFUL LEARNING PATTERNS ===
${Object.entries(successful_patterns).map(([lesson, count]) => `- ${lesson}: ${count} times`).join("\n") || "No learning patterns yet"}

Based on this comprehensive data from multiple sources, provide:
1. Top 3 critical issues to address immediately
2. 3-5 actionable recommendations to improve code quality
3. Specific suggestions for preventing early-stage function failures
4. Any patterns that indicate systemic issues

Be specific, practical, and prioritize by impact.`;

    let recommendations = "Unable to generate AI recommendations - check GEMINI_API_KEY";
    try {
      const result = await model.generateContent(prompt);
      recommendations = result.response.text();
    } catch (aiError) {
      console.error('⚠️ AI recommendations failed:', aiError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        statistics: {
          python_executions: {
            total: total,
            successful,
            failed,
            success_rate: success_rate.toFixed(1) + "%",
            auto_fixed_count: auto_fixed,
          },
          system_errors: allSystemErrors.length,
          function_errors: functionErrors.length,
          time_window_hours: hours_back
        },
        patterns: {
          python_errors: error_patterns,
          early_stage_errors: early_stage_errors,
          function_errors: function_error_patterns,
          successful_lessons: successful_patterns,
        },
        data_sources: {
          python_executions: allExecutions.length,
          system_logs: allSystemErrors.length,
          function_errors: functionErrors.length
        },
        recommendations,
        recent_python_executions: allExecutions.slice(0, 5).map(e => ({
          id: e.id,
          status: e.status,
          description: e.description,
          created_at: e.created_at,
          had_auto_fix: e.metadata?.auto_fix_attempted || false,
        })),
        recent_system_errors: allSystemErrors.slice(0, 5).map(e => ({
          id: e.id,
          log_source: e.log_source,
          message: e.message,
          log_category: e.log_category,
          created_at: e.created_at
        })),
        recent_function_errors: functionErrors.slice(0, 5).map(e => ({
          id: e.id,
          function_name: e.function_name,
          error_message: e.error_message,
          invoked_at: e.invoked_at
        }))
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('❌ get-code-execution-lessons error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        details: 'Failed to generate execution lessons'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
