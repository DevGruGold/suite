import { SupabaseClient, createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Unified Edge Function Usage Logger
 * Writes directly to eliza_function_usage for ALL edge function invocations
 * This ensures complete analytics coverage including early validation failures
 * 
 * Enhanced with execution_source tracking for cross-platform cron job awareness
 */

export type ExecutionSource = 'supabase_native' | 'pg_cron' | 'github_actions' | 'vercel_cron' | 'api' | 'tool_call';

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
  execution_source?: ExecutionSource;
}

/**
 * Detect execution source from request headers and body
 * This identifies which platform initiated the function call
 */
export function detectExecutionSource(req: Request, body?: any): ExecutionSource {
  // Check for Supabase native scheduler header
  const schedulerHeader = req.headers.get('x-supabase-scheduler');
  if (schedulerHeader === 'true' || schedulerHeader === '1') {
    return 'supabase_native';
  }
  
  // Check for Vercel cron header
  const vercelCron = req.headers.get('x-vercel-cron');
  if (vercelCron === '1' || vercelCron === 'true') {
    return 'vercel_cron';
  }
  
  // Check for GitHub Actions (via body payload or header)
  if (body?.source === 'github_actions' || body?.source === 'github_action') {
    return 'github_actions';
  }
  const githubHeader = req.headers.get('x-github-action');
  if (githubHeader) {
    return 'github_actions';
  }
  
  // Check for pg_cron (usually via pg_net with specific user-agent)
  const userAgent = req.headers.get('user-agent') || '';
  if (userAgent.includes('pg_net') || userAgent.includes('PostgreSQL')) {
    return 'pg_cron';
  }
  
  // Check if this was a tool call (from body payload)
  if (body?.invoked_by === 'tool_call' || body?.source === 'tool_call') {
    return 'tool_call';
  }
  
  // Default to API call
  return 'api';
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
        execution_source: entry.execution_source || 'api',
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
      console.log(`📊 Logged usage: ${entry.function_name} [${entry.execution_source || 'api'}] (${entry.success ? 'success' : 'failure'})`);
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
    'ai_executive': ['gemini-chat', 'deepseek-chat', 'openai-chat', 'lovable-chat', 'kimi-chat', 'vercel-ai-chat', 'vercel-ai-chat-stream', 'ai-chat'],
    'system': ['system-status', 'system-health', 'system-diagnostics', 'ecosystem-monitor', 'list-available-functions', 'get-edge-function-logs', 'prometheus-metrics', 'api-key-health-monitor', 'check-frontend-health', 'sync-function-logs', 'get-cron-registry'],
    'agent': ['agent-manager', 'task-orchestrator', 'task-auto-advance', 'suite-task-automation-engine', 'eliza-self-evaluation', 'eliza-intelligence-coordinator'],
    'workflow': ['workflow-template-manager', 'multi-step-orchestrator', 'workflow-optimizer', 'diagnose-workflow-failure', 'n8n-workflow-generator', 'execute-scheduled-actions'],
    'github': ['github-integration', 'sync-github-contributions', 'ingest-github-contribution', 'validate-github-contribution', 'morning-discussion-post', 'daily-discussion-post', 'evening-summary-post', 'weekly-retrospective-post', 'community-spotlight-post', 'progress-update-post'],
    'governance': ['vote-on-proposal', 'governance-phase-manager', 'list-function-proposals', 'propose-new-edge-function', 'execute-approved-proposal', 'handle-rejected-proposal', 'request-executive-votes', 'deploy-approved-edge-function', 'evaluate-community-idea'],
    'analytics': ['function-usage-analytics', 'get-my-feedback', 'get-function-version-analytics', 'tool-usage-analytics', 'query-edge-analytics', 'debug-analytics-data-flow', 'get-code-execution-lessons', 'get-function-actions'],
    'integration': ['vsco-workspace', 'vsco-webhook-handler', 'create-suite-quote', 'stripe-payment-webhook', 'vercel-ecosystem-api', 'vercel-manager', 'hume-access-token', 'hume-tts', 'hume-expression-measurement', 'google-gmail', 'google-drive', 'google-sheets', 'google-calendar', 'google-cloud-auth'],
    'mining': ['mining-proxy', 'mobile-miner-config', 'mobile-miner-register', 'mobile-miner-script', 'aggregate-device-metrics', 'monitor-device-connections', 'validate-pop-event'],
    'business': ['identify-service-interest', 'qualify-lead', 'process-license-application', 'generate-stripe-link', 'service-monetization-engine', 'usage-monitor', 'convert-session-to-user', 'correlate-user-identity'],
    'knowledge': ['knowledge-manager', 'extract-knowledge', 'vectorize-memory', 'get-embedding', 'system-knowledge-builder', 'summarize-conversation'],
    'python': ['python-executor', 'python-db-bridge', 'python-network-proxy', 'eliza-python-runtime', 'enhanced-learning', 'predictive-analytics'],
    'autonomous': ['autonomous-code-fixer', 'autonomous-decision-maker', 'code-monitor-daemon', 'gemini-agent-creator', 'agent-deployment-coordinator', 'self-optimizing-agent-architecture'],
    'superduper': ['superduper-router', 'superduper-integration', 'superduper-business-growth', 'superduper-code-architect', 'superduper-communication-outreach', 'superduper-content-media', 'superduper-design-brand', 'superduper-development-coach', 'superduper-domain-experts', 'superduper-finance-investment', 'superduper-research-intelligence', 'superduper-social-viral'],
    'mcp': ['xmrt-mcp-server', 'uspto-patent-mcp']
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
  private executionSource: ExecutionSource;

  constructor(functionName: string, executiveName?: string, parameters?: any, executionSource: ExecutionSource = 'api') {
    this.functionName = functionName;
    this.executiveName = executiveName;
    this.startTime = Date.now();
    this.parameters = parameters;
    this.executionSource = executionSource;
  }

  /**
   * Set execution source after initialization (useful when detecting from request)
   */
  setExecutionSource(source: ExecutionSource): void {
    this.executionSource = source;
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
      execution_source: this.executionSource,
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
      execution_source: this.executionSource,
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

/**
 * Helper to create a usage tracker with request-based source detection
 */
export function startUsageTrackingWithRequest(
  functionName: string,
  req: Request,
  body?: any,
  executiveName?: string
): UsageTracker {
  const executionSource = detectExecutionSource(req, body);
  return new UsageTracker(functionName, executiveName, body, executionSource);
}
