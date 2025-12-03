import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Early Stage Logger - Captures errors BEFORE they propagate
 * This wrapper ensures that even if a function fails at boot or early initialization,
 * the error is captured and logged to the system_logs table for debugging.
 */

interface EarlyStageError {
  function_name: string;
  error_message: string;
  error_stack?: string;
  execution_time_ms: number;
  stage: 'boot' | 'init' | 'execution' | 'cleanup';
  metadata?: Record<string, any>;
}

/**
 * Log an early-stage error to system_logs table
 * This bypasses normal logging channels to ensure capture even during failures
 */
export async function logEarlyStageError(error: EarlyStageError): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ [EARLY_LOGGER] Missing Supabase credentials, cannot log early-stage error');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Log to system_logs table
    await supabase.from('system_logs').insert({
      function_name: error.function_name,
      log_level: 'error',
      log_source: 'edge_function_early_stage',
      log_category: 'execution_error',
      message: `[EARLY_STAGE:${error.stage.toUpperCase()}] ${error.error_message}`,
      metadata: {
        stage: error.stage,
        execution_time_ms: error.execution_time_ms,
        error_stack: error.error_stack,
        ...error.metadata
      }
    });

    // Also log to eliza_function_usage for analytics
    await supabase.from('eliza_function_usage').insert({
      function_name: error.function_name,
      success: false,
      execution_time_ms: error.execution_time_ms,
      error_message: `[${error.stage.toUpperCase()}] ${error.error_message}`,
      context: JSON.stringify({
        stage: error.stage,
        early_stage_capture: true,
        timestamp: new Date().toISOString()
      })
    });

    console.log(`📝 [EARLY_LOGGER] Captured early-stage error for ${error.function_name} at ${error.stage}`);
  } catch (logError) {
    // Last resort: console log if database logging fails
    console.error('❌ [EARLY_LOGGER] Failed to log early-stage error:', logError);
    console.error('Original error:', error);
  }
}

/**
 * Wrap an edge function handler with early-stage error capture
 * Usage:
 * 
 * import { withEarlyLogging } from '../_shared/earlyStageLogger.ts';
 * 
 * serve(withEarlyLogging('my-function', async (req) => {
 *   // Your handler code
 * }));
 */
export function withEarlyLogging(
  functionName: string,
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const startTime = Date.now();
    let stage: 'boot' | 'init' | 'execution' | 'cleanup' = 'init';

    try {
      stage = 'execution';
      const response = await handler(req);
      
      // Log successful execution if it took a long time (potential performance issue)
      const executionTime = Date.now() - startTime;
      if (executionTime > 30000) {
        console.warn(`⚠️ [EARLY_LOGGER] ${functionName} took ${executionTime}ms - potential timeout risk`);
      }
      
      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Capture the error before re-throwing
      await logEarlyStageError({
        function_name: functionName,
        error_message: error instanceof Error ? error.message : String(error),
        error_stack: error instanceof Error ? error.stack : undefined,
        execution_time_ms: executionTime,
        stage,
        metadata: {
          request_method: req.method,
          request_url: req.url,
          caught_at: new Date().toISOString()
        }
      });

      // Re-throw to maintain normal error flow
      throw error;
    }
  };
}

/**
 * Log a boot event for tracking function cold starts
 */
export async function logBootEvent(functionName: string, bootTimeMs: number): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) return;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    await supabase.from('system_logs').insert({
      function_name: functionName,
      log_level: 'info',
      log_source: 'edge_function_boot',
      log_category: 'performance',
      message: `[BOOT] ${functionName} booted in ${bootTimeMs}ms`,
      metadata: {
        boot_time_ms: bootTimeMs,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`❌ [EARLY_LOGGER] Failed to log boot event for ${functionName}:`, error);
  }
}

/**
 * Create a function-specific logger with pre-bound function name
 */
export function createFunctionLogger(functionName: string) {
  return {
    logError: (message: string, error?: Error, metadata?: Record<string, any>) =>
      logEarlyStageError({
        function_name: functionName,
        error_message: message,
        error_stack: error?.stack,
        execution_time_ms: 0,
        stage: 'execution',
        metadata: { original_error: error?.message, ...metadata }
      }),
    
    logBoot: (bootTimeMs: number) => logBootEvent(functionName, bootTimeMs),
    
    wrap: (handler: (req: Request) => Promise<Response>) =>
      withEarlyLogging(functionName, handler)
  };
}
