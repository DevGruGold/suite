import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'code-monitor-daemon';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Configuration
const CODE_SCAN_WINDOW_HOURS = parseInt(Deno.env.get("CODE_SCAN_WINDOW_HOURS") || "1");
const CODE_SCAN_BATCH_SIZE = parseInt(Deno.env.get("CODE_SCAN_BATCH_SIZE") || "50");
const MAX_AUTO_FIX_ATTEMPTS = 1; // Reduced to 1 to prevent cascade timeout floods

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

async function logActivity(
  activity_type: string,
  description: string,
  metadata: any = {},
  status: string = "completed"
) {
  await supabase.from("eliza_activity_log").insert({
    activity_type,
    description,
    metadata,
    status,
    created_at: new Date().toISOString(),
  });
}

// Categorize error types for intelligent auto-fixing
function categorizeError(errorMessage: string): string {
  if (!errorMessage) return 'unknown';
  
  const error = errorMessage.toLowerCase();
  
  if (error.includes('modulenotfounderror') || error.includes('importerror')) {
    return 'missing_module';
  }
  if (error.includes('syntaxerror')) {
    return 'syntax_error';
  }
  if (error.includes('nameerror')) {
    return 'undefined_variable';
  }
  if (error.includes('typeerror')) {
    return 'type_error';
  }
  if (error.includes('attributeerror')) {
    return 'attribute_error';
  }
  if (error.includes('indexerror') || error.includes('keyerror')) {
    return 'index_key_error';
  }
  if (error.includes('zerodivisionerror')) {
    return 'division_error';
  }
  if (error.includes('urllib') || error.includes('requests') || error.includes('network')) {
    return 'network_access';
  }
  if (error.includes('timeout')) {
    return 'timeout';
  }
  
  return 'runtime_error';
}

// Provide feedback to executive about auto-fix results
async function provideFeedbackToAgent(
  execution: any,
  fixResult: any
) {
  const executiveName = execution.metadata?.agent_id || execution.source || 'eliza-main';
  
  const feedbackMessage = {
    executive_name: executiveName,
    feedback_type: 'auto_fix_result',
    issue_description: `Python execution ${execution.id} failed: ${categorizeError(execution.error_message)}`,
    learning_point: generateLearningPoint(execution, fixResult),
    original_context: {
      execution_id: execution.id,
      code_preview: execution.code.substring(0, 200),
      error_type: categorizeError(execution.error_message),
      error_message: execution.error_message?.substring(0, 300)
    },
    fix_result: {
      success: fixResult.success,
      fixed_code_preview: fixResult.fixed_code?.substring(0, 200),
      learning_metadata: fixResult.learning
    },
    acknowledged: false
  };
  
  await supabase.from('executive_feedback').insert(feedbackMessage);
}

function generateLearningPoint(execution: any, fixResult: any): string {
  const errorType = categorizeError(execution.error_message);
  
  if (fixResult.success) {
    switch (errorType) {
      case 'missing_module':
        return `✅ Auto-fixed module import error. Replaced external module with built-in alternatives. Use standard library modules only.`;
      case 'syntax_error':
        return `✅ Auto-fixed syntax error. Code structure corrected. Review Python syntax before executing.`;
      case 'undefined_variable':
        return `✅ Auto-fixed undefined variable. Added proper initialization. Always define variables before use.`;
      case 'network_access':
        return `✅ Auto-fixed network access attempt. Use invoke_edge_function for API calls instead of direct HTTP requests.`;
      default:
        return `✅ Code auto-fixed successfully. Error: ${errorType}. Learning captured for future prevention.`;
    }
  } else {
    switch (errorType) {
      case 'network_access':
        return `❌ Cannot auto-fix network access. Python sandbox has no internet. Use invoke_edge_function with appropriate edge function.`;
      case 'missing_module':
        return `❌ Cannot auto-fix module dependency. Only built-in modules available (math, json, datetime, re, etc.). Rewrite using standard library.`;
      case 'timeout':
        return `❌ Execution timeout. Code too slow or infinite loop. Optimize algorithm or break into smaller chunks.`;
      default:
        return `❌ Auto-fix failed for ${errorType}. Error: ${execution.error_message?.substring(0, 150)}. Manual review needed.`;
    }
  }
}

Deno.serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });
  const scanStartTime = new Date();
  
  // Check if another scan is already running (prevent parallel cascade)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recentScan } = await supabase
    .from("eliza_activity_log")
    .select("created_at")
    .eq("activity_type", "daemon_scan")
    .eq("status", "in_progress")
    .gte("created_at", fiveMinutesAgo)
    .limit(1);

  if (recentScan && recentScan.length > 0) {
    console.log('⏭️ Skipping - another scan is already in progress');
    await usageTracker.success({ skipped: true, reason: 'scan_in_progress' });
    return new Response(
      JSON.stringify({ skipped: true, reason: 'scan_in_progress', recent_scan: recentScan[0].created_at }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
  
  await logActivity(
    "daemon_scan",
    "🔍 Code Monitor Daemon: Scanning Python executions for failures and triggering auto-fixes...",
    { 
      scan_time: scanStartTime.toISOString(),
      scan_window_hours: CODE_SCAN_WINDOW_HOURS,
      batch_size: CODE_SCAN_BATCH_SIZE,
      max_auto_fixes: MAX_AUTO_FIX_ATTEMPTS
    },
    "in_progress"
  );

  try {
    // Query eliza_python_executions for failed executions
    const scanWindowStart = new Date(Date.now() - CODE_SCAN_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    
    const { data: failedExecutions, error: fetchError } = await supabase
      .from("eliza_python_executions")
      .select("*")
      .or("exit_code.neq.0,status.eq.error")
      .gte("created_at", scanWindowStart)
      .order("created_at", { ascending: false })
      .limit(CODE_SCAN_BATCH_SIZE);

    if (fetchError) throw fetchError;

    const executionCount = failedExecutions?.length || 0;
    console.log(`📊 Found ${executionCount} failed Python executions in last ${CODE_SCAN_WINDOW_HOURS}h`);
    
    if (executionCount === 0) {
      await logActivity(
        "daemon_scan",
        `✅ Scan complete: No failed executions found - system healthy!`,
        {
          scan_window_hours: CODE_SCAN_WINDOW_HOURS,
          scan_duration_ms: Date.now() - scanStartTime.getTime(),
        },
        "completed"
      );
      
      return new Response(
        JSON.stringify({
          success: true,
          message: "No failed executions found",
          scanned_at: scanStartTime.toISOString(),
          executions_scanned: 0,
          auto_fixes_attempted: 0
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Filter out already auto-fixed executions
    const unfixedExecutions = failedExecutions.filter(exec => {
      const metadata = exec.metadata || {};
      return !metadata.auto_fix_attempted && !metadata.was_auto_fixed;
    });

    console.log(`🔧 ${unfixedExecutions.length} executions need auto-fixing (${executionCount - unfixedExecutions.length} already attempted)`);

    // Limit auto-fixes per scan to avoid overwhelming the system
    const executionsToFix = unfixedExecutions.slice(0, MAX_AUTO_FIX_ATTEMPTS);
    
    const autoFixResults: any[] = [];
    const errorStats: Record<string, number> = {};
    
    for (const execution of executionsToFix) {
      const errorType = categorizeError(execution.error_message);
      errorStats[errorType] = (errorStats[errorType] || 0) + 1;
      
      console.log(`🔧 Triggering auto-fixer for execution ${execution.id} (${errorType})`);
      
      await logActivity(
        "auto_fix_triggered",
        `🔧 Triggering auto-fixer for failed execution ${execution.id}`,
        { 
          execution_id: execution.id, 
          error_type: errorType,
          error_preview: execution.error_message?.substring(0, 200)
        },
        "in_progress"
      );
      
      try {
        // Invoke autonomous-code-fixer
        const { data: fixResult, error: fixError } = await supabase.functions.invoke(
          "autonomous-code-fixer",
          { body: { execution_id: execution.id } }
        );
        
        const fixSuccess = !fixError && fixResult?.success;
        
        autoFixResults.push({
          execution_id: execution.id,
          error_type: errorType,
          fix_attempted: true,
          fix_success: fixSuccess,
          learning_captured: fixResult?.learning ? true : false
        });
        
        await logActivity(
          fixSuccess ? "auto_fix_success" : "auto_fix_failed",
          fixSuccess 
            ? `✅ Auto-fix succeeded for execution ${execution.id}` 
            : `❌ Auto-fix failed for execution ${execution.id}`,
          {
            execution_id: execution.id,
            error_type: errorType,
            fix_result: fixResult,
            fix_error: fixError
          },
          fixSuccess ? "completed" : "failed"
        );
        
        // Provide feedback to Eliza
        await provideFeedbackToAgent(execution, {
          success: fixSuccess,
          fixed_code: fixResult?.fixed_code,
          learning: fixResult?.learning,
          error: fixError?.message
        });
        
        console.log(fixSuccess 
          ? `✅ Auto-fix succeeded for ${execution.id}` 
          : `❌ Auto-fix failed for ${execution.id}: ${fixError?.message}`);
        
      } catch (fixException) {
        console.error(`❌ Exception during auto-fix for ${execution.id}:`, fixException);
        
        autoFixResults.push({
          execution_id: execution.id,
          error_type: errorType,
          fix_attempted: true,
          fix_success: false,
          exception: fixException.message
        });
        
        await logActivity(
          "auto_fix_exception",
          `❌ Exception during auto-fix for execution ${execution.id}`,
          {
            execution_id: execution.id,
            error: fixException.message,
            stack: fixException.stack
          },
          "failed"
        );
      }
    }
    
    // Generate summary report
    const successfulFixes = autoFixResults.filter(r => r.fix_success).length;
    const failedFixes = autoFixResults.filter(r => !r.fix_success).length;
    
    const summary = {
      scan_completed_at: new Date().toISOString(),
      scan_duration_ms: Date.now() - scanStartTime.getTime(),
      scan_window_hours: CODE_SCAN_WINDOW_HOURS,
      executions_scanned: executionCount,
      executions_needing_fix: unfixedExecutions.length,
      auto_fixes_attempted: executionsToFix.length,
      auto_fixes_succeeded: successfulFixes,
      auto_fixes_failed: failedFixes,
      error_categories: errorStats,
      learning_captured: autoFixResults.filter(r => r.learning_captured).length
    };
    
    await logActivity(
      "daemon_scan",
      `✅ Code Monitor Scan Complete: ${executionsToFix.length} auto-fixes attempted, ${successfulFixes} succeeded`,
      summary,
      "completed"
    );
    
    console.log(`📊 SCAN SUMMARY:`, summary);

    await usageTracker.success({ auto_fixes_succeeded: successfulFixes, auto_fixes_attempted: executionsToFix.length });
    return new Response(
      JSON.stringify({
        success: true,
        ...summary,
        auto_fix_results: autoFixResults.slice(0, 10) // Return first 10 for inspection
      }),
      { headers: { "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    await logActivity(
      "daemon_scan",
      `❌ Daemon scan error: ${error.message}`,
      {
        error: error.message,
        stack: error.stack,
        scan_time: scanStartTime.toISOString(),
      },
      "failed"
    );

    console.error(`❌ SCAN ERROR:`, error);

    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        stack: error.stack
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
