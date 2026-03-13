import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateTextWithFallback } from "../_shared/unifiedAIFallback.ts";
import { startUsageTracking } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'autonomous-code-fixer';
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const JUPYTER_EXECUTOR_TIMEOUT = 30000; // 30 seconds

// Log environment variable presence (but not values for security)
console.log('🔧 Environment check:', {
  hasSupabaseUrl: !!SUPABASE_URL,
  hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
  supabaseUrlLength: SUPABASE_URL?.length || 0,
  serviceRoleKeyLength: SUPABASE_SERVICE_ROLE_KEY?.length || 0
});

// Validate environment variables before creating client
if (!SUPABASE_URL) {
  console.error('❌ FATAL: SUPABASE_URL environment variable is missing');
  throw new Error('SUPABASE_URL environment variable is required');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ FATAL: SUPABASE_SERVICE_ROLE_KEY environment variable is missing');
  throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
}

// Initialize Supabase client with error handling
let supabase;
try {
  console.log('🔄 Attempting to create Supabase client...');
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log('✅ Supabase client created successfully');
} catch (clientError) {
  console.error('❌ Failed to create Supabase client:', {
    error: clientError.message,
    stack: clientError.stack,
    url: SUPABASE_URL.substring(0, 20) + '...' // Log partial URL for debugging
  });
  throw new Error(`Supabase client initialization failed: ${clientError.message}`);
}

// Helper function to convert to ISO string or null
function toIsoOrNull(date: any): string | null {
  if (!date) return null;
  try {
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

async function logActivity(
  activity_type: string,
  description: string,
  metadata: any = {},
  status: string = "in_progress"
) {
  try {
    // Ensure supabase client is still valid
    if (!supabase) {
      console.error('❌ Cannot log activity: Supabase client not initialized');
      return;
    }
    
    const { error: insertError } = await supabase.from("eliza_activity_log").insert({
      activity_type,
      description,
      metadata,
      status,
      created_at: toIsoOrNull(new Date()),
    });
    
    if (insertError) {
      console.error('❌ Failed to insert activity log:', {
        activity_type,
        error: insertError.message,
        details: insertError.details
      });
    } else {
      console.log(`📝 Activity logged: ${activity_type} - ${status}`);
    }
  } catch (logError) {
    console.error('❌ Exception in logActivity:', {
      activity_type,
      error: logError.message,
      stack: logError.stack
    });
  }
}

async function createManualReviewTask(
  executionId: string,
  originalCode: string,
  error: string,
  aiProviderFailure: boolean = false
) {
  console.log('📋 Creating manual review task for execution:', executionId);
  
  try {
    const { error: insertError } = await supabase.from("eliza_tasks").insert({
      task_type: "manual_code_review",
      title: `Manual Code Review Required: Execution ${executionId}`,
      description: aiProviderFailure 
        ? `AI providers unavailable for auto-fix. Original error: ${error.substring(0, 300)}`
        : `Auto-fix generated invalid Python syntax. Original error: ${error.substring(0, 300)}`,
      priority: "high",
      status: "pending",
      metadata: {
        execution_id: executionId,
        original_code: originalCode,
        original_error: error,
        ai_provider_failure: aiProviderFailure,
        created_by: FUNCTION_NAME,
        created_at: toIsoOrNull(new Date()),
      },
      created_at: toIsoOrNull(new Date()),
    });

    if (insertError) {
      console.error('❌ Failed to create manual review task:', insertError);
      return;
    }

    await logActivity(
      "manual_review_created",
      `📋 Created high-priority manual review task for execution ${executionId}`,
      {
        execution_id: executionId,
        ai_provider_failure: aiProviderFailure,
        task_type: "manual_code_review",
      },
      "requires_manual_review"
    );
  } catch (taskError) {
    console.error('❌ Exception in createManualReviewTask:', taskError);
  }
}

function validatePythonSyntax(code: string): { valid: boolean; error?: string } {
  try {
    // Basic indentation validation
    const lines = code.split('\n');
    let indentLevel = 0;
    const indentStack: number[] = [0];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Skip empty lines and comments
      if (trimmedLine === '' || trimmedLine.startsWith('#')) {
        continue;
      }
      
      // Count leading spaces/tabs
      const leadingSpaces = line.match(/^[ \t]*/)?.[0]?.length || 0;
      
      // Check for mixed tabs and spaces (common cause of IndentationError)
      if (line.includes('\t') && line.includes(' ')) {
        return {
          valid: false,
          error: `Line ${i + 1}: Mixed tabs and spaces in indentation`
        };
      }
      
      // Check indentation consistency
      if (leadingSpaces > indentStack[indentStack.length - 1]) {
        // Increased indentation - check if line ends with colon
        if (!trimmedLine.endsWith(':')) {
          return {
            valid: false,
            error: `Line ${i + 1}: Unexpected increase in indentation without colon`
          };
        }
        indentStack.push(leadingSpaces);
      } else if (leadingSpaces < indentStack[indentStack.length - 1]) {
        // Decreased indentation - pop from stack until we find matching level
        while (indentStack.length > 0 && leadingSpaces < indentStack[indentStack.length - 1]) {
          indentStack.pop();
        }
        if (leadingSpaces !== indentStack[indentStack.length - 1]) {
          return {
            valid: false,
            error: `Line ${i + 1}: Inconsistent indentation (expected ${indentStack[indentStack.length - 1]}, got ${leadingSpaces})`
          };
        }
      }
      
      // Update current indent level
      indentLevel = leadingSpaces;
    }
    
    // Check for basic Python syntax issues
    const commonIssues = [
      { pattern: /^[ \t]*except[ \t]*:/, name: "bare except statement" },
      { pattern: /^[ \t]*finally[ \t]*:/, name: "bare finally statement" },
      { pattern: /^[ \t]*else[ \t]*:/, name: "bare else statement" },
      { pattern: /^[ \t]*(if|while|for|def|class|try|except|else|elif|finally)[ \t]+[^:]+$/, name: "missing colon after control statement" },
    ];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      for (const issue of commonIssues) {
        if (issue.pattern.test(line) && !line.endsWith(':')) {
          return {
            valid: false,
            error: `Line ${i + 1}: ${issue.name}`
          };
        }
      }
    }
    
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Syntax validation error: ${error.message}`
    };
  }
}

async function generateFix(code: string, error: string, description: string): Promise<{ 
  success: boolean; 
  fixedCode?: string; 
  error?: string;
  requiresManualReview?: boolean;
}> {
  // ========== INFINITE LOOP PREVENTION ==========
  const autoFixMarkers = (code.match(/# AUTO-FIX FALLBACK/g) || []).length;
  const alreadyWrapped = code.includes('# AUTO-FIX FALLBACK') || code.includes('# AUTO-FIX FAILED');
  
  if (autoFixMarkers >= 1 || alreadyWrapped) {
    console.log(`🛑 INFINITE LOOP PREVENTION: Code already auto-fixed ${autoFixMarkers} time(s)`);
    await logActivity(
      "auto_fix_skipped",
      `⚠️ Skipped auto-fix: code already wrapped ${autoFixMarkers} time(s)`,
      {
        code_length: code.length,
        nesting_level: autoFixMarkers,
        reason: 'infinite_loop_prevention'
      },
      "skipped"
    );
    return { 
      success: false, 
      error: 'Code already contains auto-fix markers',
      requiresManualReview: true 
    };
  }

  await logActivity(
    "auto_fix_analysis",
    "🔬 Analyzing code failure to generate fix...",
    {
      code_length: code.length,
      error_preview: error?.substring(0, 200) || 'No error message',
      description,
    },
    "in_progress"
  );

  const prompt = `You are an expert Python developer and code fixer. Analyze this failed code execution and provide a corrected version.

IMPORTANT GUIDELINES:
1. Fix the actual error that occurred
2. Maintain proper Python indentation (4 spaces per level, no tabs)
3. Add appropriate error handling if needed
4. Ensure the code is production-ready and follows Python best practices
5. Do NOT wrap the entire code in a single try/except block unless absolutely necessary
6. If adding error handling, make it specific to the actual error
7. Preserve the original functionality and intent

ORIGINAL CODE:
\`\`\`python
${code}
\`\`\`

ERROR MESSAGE:
${error}

DESCRIPTION: ${description}

Provide ONLY the corrected Python code, no explanations or markdown formatting. Start with the corrected code immediately.

CORRECTED CODE:`;

  try {
    console.log('🔄 Generating fix with AI fallback cascade...');
    
    // Log which AI providers are being attempted
    await logActivity(
      "ai_provider_attempt",
      "Attempting AI providers for fix generation",
      {
        providers: ["openai", "gemini", "deepseek", "kimi"],
        timestamp: toIsoOrNull(new Date()),
      },
      "in_progress"
    );
    
    const { content: aiResult, provider: usedProvider } = await generateTextWithFallback(prompt, undefined, {
      temperature: 0.1, // Lower temperature for more deterministic code generation
      maxTokens: 4000,
      useFullElizaContext: false
    });
    
    // Extract just the code, removing any markdown formatting
    let fixedCode = aiResult
      .replace(/^```python\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    
    // Validate the generated code syntax
    const validation = validatePythonSyntax(fixedCode);
    if (!validation.valid) {
      console.error('❌ AI-generated code failed validation:', validation.error);
      await logActivity(
        "ai_generation_invalid",
        `AI-generated code failed syntax validation: ${validation.error}`,
        {
          validation_error: validation.error,
          ai_provider: usedProvider,
          fixed_code_preview: fixedCode.substring(0, 300),
          requires_manual_review: true,
        },
        "failed"
      );
      
      return { 
        success: false, 
        error: `AI-generated code invalid: ${validation.error}`,
        requiresManualReview: true 
      };
    }
    
    console.log(`✅ Fix generated via ${usedProvider} provider`);
    
    await logActivity(
      "ai_provider_success",
      `AI fix generated successfully using ${usedProvider}`,
      {
        provider: usedProvider,
        fixed_code_length: fixedCode.length,
        validation_passed: true,
      },
      "completed"
    );
    
    return { success: true, fixedCode };
    
  } catch (aiError) {
    console.error('❌ All AI providers failed for fix generation:', aiError);
    
    // Log detailed AI provider failure information
    await logActivity(
      "ai_provider_failure",
      "All AI providers failed to generate fix",
      {
        error_message: aiError.message,
        error_stack: aiError.stack,
        requires_manual_review: true,
      },
      "failed"
    );
    
    // DO NOT modify the original code with comments
    // Instead, return failure and let the caller handle it appropriately
    return { 
      success: false, 
      error: `All AI providers failed: ${aiError.message}`,
      requiresManualReview: true 
    };
  }
}

async function executeFix(code: string, description: string) {
  // Validate syntax before execution
  const validation = validatePythonSyntax(code);
  if (!validation.valid) {
    console.error('❌ Code failed pre-execution validation:', validation.error);
    await logActivity(
      "pre_execution_validation_failed",
      `Code validation failed before execution: ${validation.error}`,
      {
        validation_error: validation.error,
        code_preview: code.substring(0, 300),
      },
      "failed"
    );
    
    return { 
      success: false, 
      result: { 
        error: `Pre-execution validation failed: ${validation.error}`,
        validation_failed: true 
      } 
    };
  }

  await logActivity(
    "auto_fix_execution",
    "⚙️ Executing fixed code with jupyter-executor (Cloud Run)...",
    {
      code_length: code.length,
      description,
      validation_passed: true,
      executor: "jupyter-executor",
      backend: "cloud-run-flask"
    },
    "in_progress"
  );

  try {
    // Create an AbortController with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), JUPYTER_EXECUTOR_TIMEOUT);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/jupyter-executor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action: "execute",
        code,
        purpose: `AUTO-FIX: ${description}`,
        source: FUNCTION_NAME,
        agent_id: null,
        task_id: null
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    const result = await response.json();

    // Map jupyter-executor response format to expected format
    const executionResult = {
      success: result.success || false,
      output: result.output || '',
      error: result.error || '',
      exitCode: result.exitCode || (result.success ? 0 : 1),
      backend: result.backend || 'cloud-run-flask'
    };

    await logActivity(
      "auto_fix_execution",
      executionResult.success 
        ? "✅ Fixed code executed successfully in Cloud Run"
        : "❌ Fixed code execution failed in Cloud Run",
      {
        success: executionResult.success,
        exit_code: executionResult.exitCode,
        output_preview: executionResult.output.substring(0, 200),
        error_preview: executionResult.error.substring(0, 200),
        backend: executionResult.backend,
        validation_pre_execution: true,
      },
      executionResult.success ? "completed" : "failed"
    );

    return { 
      success: executionResult.success, 
      result: executionResult 
    };
  } catch (fetchError) {
    const isTimeout = fetchError.name === 'AbortError';
    await logActivity(
      "execution_request_failed",
      `Failed to call jupyter-executor: ${fetchError.message}`,
      {
        fetch_error: fetchError.message,
        is_timeout: isTimeout,
        timeout_ms: JUPYTER_EXECUTOR_TIMEOUT,
        executor: "jupyter-executor",
        validation_passed: true, // Validation passed, but execution failed
      },
      "failed"
    );
    
    return { 
      success: false, 
      result: { 
        error: `Failed to call jupyter-executor${isTimeout ? ' (timeout)' : ''}: ${fetchError.message}`,
        fetch_failed: true,
        is_timeout: isTimeout,
        backend: 'cloud-run-flask'
      } 
    };
  }
}

async function generateLearningMetadata(
  originalCode: string,
  originalError: string,
  fixedCode: string,
  fixSuccess: boolean
) {
  const prompt = `Analyze this code fix attempt and extract learning insights.

ORIGINAL CODE:
\`\`\`python
${originalCode}
\`\`\`

ORIGINAL ERROR:
${originalError}

${fixSuccess ? `FIXED CODE:
\`\`\`python
${fixedCode}
\`\`\`` : 'FIX ATTEMPT: Failed to generate valid fix'}

FIX SUCCESS: ${fixSuccess}

Provide a JSON response with:
{
  "error_type": "string - category of error (e.g., syntax, runtime, logic)",
  "root_cause": "string - what caused the error",
  "fix_strategy": "string - how it was (or should be) fixed",
  "lesson": "string - key takeaway for future",
  "prevention": "string - how to avoid this error in future code"
}

Focus on actionable insights that can help prevent similar errors.`;

  try {
    console.log('🔄 Generating learning metadata with AI fallback cascade...');
    const { content: learningResult, provider: learningProvider } = await generateTextWithFallback(prompt, undefined, {
      temperature: 0.3,
      maxTokens: 1000,
      useFullElizaContext: false
    });
    
    console.log(`📚 Learning metadata generated via ${learningProvider}`);
    
    const jsonMatch = learningResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const metadata = JSON.parse(jsonMatch[0]);
      
      // Add provider info to metadata
      return {
        ...metadata,
        learning_generated_by: learningProvider,
        timestamp: toIsoOrNull(new Date()),
        executor: "jupyter-executor",
        backend: "cloud-run-flask"
      };
    }
  } catch (e) {
    console.error("Failed to generate learning metadata:", e);
  }
  
  // Fallback metadata
  return {
    error_type: originalError.includes("IndentationError") ? "syntax" : "unknown",
    root_cause: originalError?.substring(0, 200) || 'No error message',
    fix_strategy: fixSuccess ? "code correction" : "requires_manual_review",
    lesson: "See execution logs and activity history",
    prevention: "Add pre-execution validation and error handling",
    learning_generated_by: "fallback",
    timestamp: toIsoOrNull(new Date()),
    executor: "jupyter-executor",
    backend: "cloud-run-flask"
  };
}

Deno.serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });
  
  try {
    const body = await req.json();
    console.log('🔍 Received request body:', JSON.stringify(body, null, 2));
    
    const { execution_id } = body;

    if (!execution_id) {
      return new Response(
        JSON.stringify({ error: "Missing execution_id parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    await logActivity(
      "auto_fix_start",
      `🤖 AUTO-FIXER ACTIVATED for execution ${execution_id}`,
      { 
        execution_id,
        executor: "jupyter-executor",
        backend: "cloud-run-flask"
      },
      "in_progress"
    );

    // Get the failed execution - only select required columns
    const { data: execution, error: fetchError } = await supabase
      .from("eliza_python_executions")
      .select("id, code, error_message, description, status, metadata")
      .eq("id", execution_id)
      .single();

    if (fetchError || !execution) {
      throw new Error(`Execution not found: ${fetchError?.message || 'No data returned'}`);
    }

    // Validate execution data
    if (!execution.code) {
      throw new Error("Execution has no code to fix");
    }
    if (!execution.error_message) {
      throw new Error("Execution has no error message");
    }
    if (!execution.description) {
      execution.description = "No description provided";
    }

    if (execution.status !== "error") {
      return new Response(
        JSON.stringify({ 
          error: "Execution did not fail",
          details: `Execution ${execution_id} has status: ${execution.status}`,
          execution_id 
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate fix
    const fixResult = await generateFix(
      execution.code,
      execution.error_message,
      execution.description
    );

    let success = false;
    let result = null;
    let fixedCode = null;
    let requiresManualReview = false;

    if (fixResult.success && fixResult.fixedCode) {
      // Execute fix if generation was successful
      const executionResult = await executeFix(
        fixResult.fixedCode,
        execution.description
      );
      
      success = executionResult.success;
      result = executionResult.result;
      fixedCode = fixResult.fixedCode;
    } else {
      // AI failed to generate a valid fix
      success = false;
      result = { error: fixResult.error, ai_generation_failed: true };
      requiresManualReview = fixResult.requiresManualReview || false;
      
      // Create manual review task if AI providers failed
      if (requiresManualReview) {
        await createManualReviewTask(
          execution_id,
          execution.code,
          execution.error_message,
          fixResult.error?.includes("AI providers") || false
        );
      }
    }

    // Generate learning metadata
    const learning = await generateLearningMetadata(
      execution.code,
      execution.error_message,
      fixedCode || execution.code, // Use original if no fixed code
      success
    );

    await logActivity(
      "learning_analysis",
      `📚 Learning extracted: ${learning.lesson}`,
      {
        execution_id,
        fix_success: success,
        requires_manual_review: requiresManualReview,
        executor: "jupyter-executor",
        ...learning,
      },
      requiresManualReview ? "requires_manual_review" : "completed"
    );

    // Update original execution with comprehensive metadata
    const metadataUpdate: any = {
      ...execution.metadata,
      auto_fix_attempted: true,
      auto_fix_success: success,
      auto_fix_details: {
        generation_success: fixResult.success,
        execution_success: success,
        requires_manual_review: requiresManualReview,
        generation_error: fixResult.error,
        executor: "jupyter-executor",
        backend: "cloud-run-flask",
        timestamp: toIsoOrNull(new Date()),
      },
      learning_metadata: learning,
    };

    if (fixedCode) {
      metadataUpdate.fixed_code = fixedCode;
    }

    await supabase
      .from("eliza_python_executions")
      .update({
        metadata: metadataUpdate,
      })
      .eq("id", execution_id);

    const finalStatus = requiresManualReview ? "requires_manual_review" : (success ? "completed" : "failed");
    
    await logActivity(
      "auto_fix_complete",
      success
        ? `✅ AUTO-FIX SUCCESSFUL for execution ${execution_id} using jupyter-executor`
        : requiresManualReview
        ? `📋 AUTO-FIX REQUIRES MANUAL REVIEW for execution ${execution_id}`
        : `❌ AUTO-FIX FAILED for execution ${execution_id}`,
      {
        execution_id,
        success,
        requires_manual_review: requiresManualReview,
        learning_captured: true,
        manual_review_task_created: requiresManualReview,
        executor: "jupyter-executor",
      },
      finalStatus
    );

    await usageTracker.success({ 
      result_summary: success ? 'fix_applied' : (requiresManualReview ? 'manual_review_required' : 'fix_failed'),
      requires_manual_review: requiresManualReview,
      executor: "jupyter-executor"
    });
    
    return new Response(
      JSON.stringify({
        success,
        execution_id,
        original_code: execution.code,
        fixed_code: fixedCode,
        requires_manual_review: requiresManualReview,
        learning,
        result,
        executor: "jupyter-executor",
        backend: "cloud-run-flask"
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('❌ Fatal error in handler:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    await logActivity(
      "auto_fix_error",
      `❌ Auto-fixer error: ${error.message}`,
      {
        error: error.message,
        stack: error.stack,
        executor: "jupyter-executor"
      },
      "failed"
    );

    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message, details: error.stack }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
