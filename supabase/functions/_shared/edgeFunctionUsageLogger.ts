import { SupabaseClient, createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Unified Edge Function Usage Logger
 * Writes directly to eliza_function_usage for ALL edge function invocations
 * This ensures complete analytics coverage including early validation failures
 */

interface UsageLogEntry {
  function_name: string;
  executive_name?: string;
  success: boolean;
  execution_time_ms: number;
  error_message?: string;
  parameters?: any;
  result_summary?: string;
  provider?: string;
  model?: string;
  tool_calls?: number;
  fallback?: string;
  status_code?: number;
}

/**
 * Get or create a Supabase client for logging
 * Uses service role key to bypass RLS
 */
function getLoggingClient(): SupabaseClient | null {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.warn('⚠️ Missing Supabase credentials for usage logging');
      return null;
    }
    
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  } catch (e) {
    console.error('❌ Failed to create logging client:', e);
    return null;
  }
}

/**
 * Log edge function usage directly to eliza_function_usage table
 * This should be called at EVERY return point in edge functions
 */
export async function logEdgeFunctionUsage(entry: UsageLogEntry): Promise<void> {
  try {
    const supabase = getLoggingClient();
    if (!supabase) return;

    const { error } = await supabase
      .from('eliza_function_usage')
      .insert({
        function_name: entry.function_name,
        executive_name: entry.executive_name,
        success: entry.success,
        execution_time_ms: entry.execution_time_ms,
        error_message: entry.error_message,
        parameters: entry.parameters || {},
        result_summary: entry.result_summary,
        metadata: {
          provider: entry.provider,
          model: entry.model,
          tool_calls: entry.tool_calls,
          fallback: entry.fallback,
          status_code: entry.status_code,
          logged_at: new Date().toISOString()
        },
        tool_category: categorizeFunction(entry.function_name),
        deployment_version: new Date().toISOString().split('T')[0]
      });

    if (error) {
      console.error(`⚠️ Failed to log usage for ${entry.function_name}:`, error.message);
    } else {
      console.log(`📊 Logged usage: ${entry.function_name} (${entry.success ? 'success' : 'failure'})`);
    }
  } catch (e) {
    // Never let logging errors break the main function
    console.error('❌ Usage logging exception:', e);
  }
}

/**
 * Categorize function for analytics grouping
 */
function categorizeFunction(functionName: string): string {
  const categories: Record<string, string[]> = {
    'ai_executive': ['gemini-chat', 'deepseek-chat', 'openai-chat', 'lovable-chat', 'kimi-chat', 'vercel-ai-chat'],
    'system': ['system-status', 'system-health', 'system-diagnostics', 'ecosystem-monitor'],
    'agent': ['agent-manager', 'task-orchestrator', 'task-auto-advance'],
    'workflow': ['workflow-template-manager', 'multi-step-orchestrator', 'workflow-optimizer'],
    'github': ['github-integration', 'sync-github-contributions'],
    'governance': ['vote-on-proposal', 'governance-phase-manager', 'list-function-proposals']
  };

  for (const [category, functions] of Object.entries(categories)) {
    if (functions.includes(functionName)) {
      return category;
    }
  }

  return 'general';
}

/**
 * Create a usage tracker that can be started at function entry
 * and completed at any return point
 */
export class UsageTracker {
  private functionName: string;
  private executiveName?: string;
  private startTime: number;
  private parameters?: any;

  constructor(functionName: string, executiveName?: string, parameters?: any) {
    this.functionName = functionName;
    this.executiveName = executiveName;
    this.startTime = Date.now();
    this.parameters = parameters;
  }

  /**
   * Log successful completion
   */
  async success(details?: {
    result_summary?: string;
    provider?: string;
    model?: string;
    tool_calls?: number;
    fallback?: string;
  }): Promise<void> {
    await logEdgeFunctionUsage({
      function_name: this.functionName,
      executive_name: this.executiveName,
      success: true,
      execution_time_ms: Date.now() - this.startTime,
      parameters: this.parameters,
      ...details
    });
  }

  /**
   * Log failure
   */
  async failure(error_message: string, status_code?: number): Promise<void> {
    await logEdgeFunctionUsage({
      function_name: this.functionName,
      executive_name: this.executiveName,
      success: false,
      execution_time_ms: Date.now() - this.startTime,
      error_message,
      parameters: this.parameters,
      status_code
    });
  }
}

/**
 * Helper to create a usage tracker at function entry
 */
export function startUsageTracking(
  functionName: string, 
  executiveName?: string, 
  parameters?: any
): UsageTracker {
  return new UsageTracker(functionName, executiveName, parameters);
}
