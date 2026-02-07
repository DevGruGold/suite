import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

/**
 * Shared logging utility for all Supabase Edge Functions
 * Logs to public.system_logs table for centralized monitoring
 */

export type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'critical';
export type LogSource = 'edge_function' | 'frontend' | 'background_task' | 'system';
export type LogCategory = 'performance' | 'security' | 'user_activity' | 'system_health' | 'api_call' | 'error' | 'workflow' | 'ai_interaction';

export interface SystemLogEntry {
  log_level: LogLevel;
  log_source: LogSource;
  log_category: LogCategory;
  message: string;
  details?: Record<string, any>;
  error_stack?: string;
  user_context?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Initialize Supabase client for logging
 */
function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Log an entry to public.system_logs
 */
export async function logToSystem(
  functionName: string,
  entry: SystemLogEntry
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('system_logs')
      .insert({
        log_level: entry.log_level,
        log_source: entry.log_source,
        log_category: entry.log_category,
        message: `[${functionName}] ${entry.message}`,
        details: entry.details || {},
        error_stack: entry.error_stack,
        user_context: entry.user_context || {},
        metadata: {
          ...entry.metadata,
          function_name: functionName,
          timestamp: new Date().toISOString()
        }
      });

    if (error) {
      console.error('Failed to log to system_logs:', error);
    }
  } catch (err) {
    console.error('System logging error:', err);
  }
}

/**
 * Convenience methods for different log levels
 */
export const EdgeFunctionLogger = (functionName: string) => ({
  debug: (message: string, details?: Record<string, any>) => 
    logToSystem(functionName, {
      log_level: 'debug',
      log_source: 'edge_function',
      log_category: 'system_health',
      message,
      details
    }),

  info: (message: string, category: LogCategory = 'system_health', details?: Record<string, any>) => 
    logToSystem(functionName, {
      log_level: 'info',
      log_source: 'edge_function',
      log_category: category,
      message,
      details
    }),

  warning: (message: string, category: LogCategory = 'system_health', details?: Record<string, any>) => 
    logToSystem(functionName, {
      log_level: 'warning',
      log_source: 'edge_function',
      log_category: category,
      message,
      details
    }),

  error: (message: string, error: Error | unknown, category: LogCategory = 'error', details?: Record<string, any>) => 
    logToSystem(functionName, {
      log_level: 'error',
      log_source: 'edge_function',
      log_category: category,
      message,
      details,
      error_stack: error instanceof Error ? error.stack : String(error)
    }),

  critical: (message: string, error: Error | unknown, category: LogCategory = 'error', details?: Record<string, any>) => 
    logToSystem(functionName, {
      log_level: 'critical',
      log_source: 'edge_function',
      log_category: category,
      message,
      details,
      error_stack: error instanceof Error ? error.stack : String(error)
    }),

  apiCall: (endpoint: string, status: number, duration_ms: number, details?: Record<string, any>) =>
    logToSystem(functionName, {
      log_level: status >= 400 ? 'error' : 'info',
      log_source: 'edge_function',
      log_category: 'api_call',
      message: `API call to ${endpoint} - Status: ${status}`,
      details: {
        ...details,
        endpoint,
        status,
        duration_ms
      }
    }),

  userActivity: (action: string, userContext?: Record<string, any>, details?: Record<string, any>) =>
    logToSystem(functionName, {
      log_level: 'info',
      log_source: 'edge_function',
      log_category: 'user_activity',
      message: action,
      user_context: userContext,
      details
    })
});
