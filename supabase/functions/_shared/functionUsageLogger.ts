import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

export interface FunctionUsageLog {
  function_name: string;
  executive_name?: string;
  invoked_by?: string;
  success: boolean;
  execution_time_ms: number;
  user_context?: string;
  parameters?: any;
  error_message?: string;
  result_summary?: string;
  metadata?: any;
  // Version tracking fields
  deployment_version?: string;
  function_hash?: string;
  deployment_id?: string;
  git_commit_hash?: string;
  // Enhanced tracking fields
  session_id?: string;
  user_id?: string;
  tool_category?: string;
}

/**
 * Tool category mapping for automatic categorization
 */
const TOOL_CATEGORY_MAP: Record<string, string> = {
  // Python execution
  execute_python: 'python',
  run_code: 'python',
  
  // GitHub operations
  createGitHubIssue: 'github',
  createGitHubDiscussion: 'github',
  listGitHubIssues: 'github',
  'github-integration': 'github',
  
  // Agent management
  list_agents: 'agent',
  spawn_agent: 'agent',
  assign_task: 'agent',
  list_tasks: 'agent',
  update_agent_status: 'agent',
  update_task_status: 'agent',
  delete_task: 'agent',
  get_agent_workload: 'agent',
  auto_assign_tasks: 'agent',
  rebalance_workload: 'agent',
  identify_blockers: 'agent',
  clear_blocked_tasks: 'agent',
  bulk_update_task_status: 'agent',
  get_task_performance_report: 'agent',
  get_agent_by_name: 'agent',
  get_agent_stats: 'agent',
  batch_spawn_agents: 'agent',
  archive_agent: 'agent',
  
  // System monitoring
  check_system_status: 'system',
  check_ecosystem_health: 'system',
  generate_health_report: 'system',
  'system-status': 'system',
  'system-health': 'system',
  'ecosystem-monitor': 'system',
  'system-diagnostics': 'system',
  
  // Governance
  propose_new_edge_function: 'governance',
  vote_on_function_proposal: 'governance',
  list_function_proposals: 'governance',
  
  // Analytics
  get_function_usage_analytics: 'analytics',
  get_edge_function_logs: 'analytics',
  get_function_version_analytics: 'analytics',
  get_tool_usage_analytics: 'analytics',
  
  // User acquisition
  qualify_lead: 'acquisition',
  identify_service_interest: 'acquisition',
  generate_stripe_payment_link: 'acquisition',
  create_user_profile_from_session: 'acquisition',
  suggest_tier_based_on_needs: 'acquisition',
  check_onboarding_progress: 'acquisition',
  send_usage_alert: 'acquisition',
  link_api_key_to_conversation: 'acquisition',
  apply_retention_discount: 'acquisition',
  
  // Edge function invocation
  invoke_edge_function: 'edge_function',
  call_edge_function: 'edge_function',
  
  // Workflow management
  list_workflow_templates: 'workflow',
  execute_workflow_template: 'workflow',
  'workflow-template-manager': 'workflow',
  
  // Feedback & learning
  get_my_feedback: 'feedback',
  
  // Patent/MCP
  search_uspto_patents: 'mcp',
  'uspto-patent-mcp': 'mcp',
  'xmrt-mcp-server': 'mcp',
};

/**
 * Get tool category for a function name
 */
function getToolCategory(toolName: string): string {
  // Direct mapping
  if (TOOL_CATEGORY_MAP[toolName]) {
    return TOOL_CATEGORY_MAP[toolName];
  }
  
  // Pattern matching for SuperDuper agents
  if (toolName.startsWith('consult_') || toolName.startsWith('superduper')) {
    return 'superduper';
  }
  
  // Pattern matching for task orchestrator
  if (toolName.includes('task') || toolName.includes('orchestrat')) {
    return 'agent';
  }
  
  // Pattern matching for GitHub
  if (toolName.toLowerCase().includes('github')) {
    return 'github';
  }
  
  // Pattern matching for system/health
  if (toolName.includes('health') || toolName.includes('status') || toolName.includes('diagnostic')) {
    return 'system';
  }
  
  return 'general';
}

/**
 * Calculate a simple hash of function code for change detection
 */
async function calculateFunctionHash(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Automatically detect version information from environment
 */
function getVersionInfo(): {
  deployment_version?: string;
  deployment_id?: string;
  git_commit_hash?: string;
} {
  return {
    deployment_version: Deno.env.get('DEPLOYMENT_VERSION') || 
                       Deno.env.get('VERCEL_GIT_COMMIT_REF') ||
                       new Date().toISOString().split('T')[0],
    deployment_id: Deno.env.get('DEPLOYMENT_ID') || 
                   Deno.env.get('VERCEL_DEPLOYMENT_ID'),
    git_commit_hash: Deno.env.get('GIT_COMMIT_SHA') || 
                    Deno.env.get('VERCEL_GIT_COMMIT_SHA')
  };
}

/**
 * Log edge function usage for analytics and learning
 * All executives and edge functions should use this to track their activity
 */
export async function logFunctionUsage(
  supabase: SupabaseClient,
  log: FunctionUsageLog
): Promise<void> {
  try {
    const versionInfo = getVersionInfo();
    const toolCategory = log.tool_category || getToolCategory(log.function_name);
    
    const { error } = await supabase
      .from('eliza_function_usage')
      .insert({
        function_name: log.function_name,
        executive_name: log.executive_name,
        invoked_by: log.invoked_by || 'system',
        success: log.success,
        execution_time_ms: log.execution_time_ms,
        user_context: log.user_context,
        parameters: log.parameters || {},
        error_message: log.error_message,
        result_summary: log.result_summary,
        metadata: log.metadata || {},
        // Version tracking
        deployment_version: log.deployment_version || versionInfo.deployment_version,
        function_hash: log.function_hash,
        deployment_id: log.deployment_id || versionInfo.deployment_id,
        git_commit_hash: log.git_commit_hash || versionInfo.git_commit_hash,
        // Enhanced tracking
        session_id: log.session_id,
        user_id: log.user_id,
        tool_category: toolCategory
      });

    if (error) {
      console.error('Failed to log function usage:', error);
    }
  } catch (err) {
    console.error('Exception logging function usage:', err);
  }
}

/**
 * Wrapper to automatically log function execution with enhanced tracking
 */
export async function withUsageLogging<T>(
  supabase: SupabaseClient,
  functionName: string,
  executiveName: string | undefined,
  userContext: string | undefined,
  parameters: any,
  fn: () => Promise<T>,
  options?: {
    functionCode?: string;
    sessionId?: string;
    userId?: string;
  }
): Promise<T> {
  const startTime = Date.now();
  let success = false;
  let errorMessage: string | undefined;
  let result: T;
  let functionHash: string | undefined;

  // Calculate function hash if code provided
  if (options?.functionCode) {
    try {
      functionHash = await calculateFunctionHash(options.functionCode);
    } catch (e) {
      console.warn('Failed to calculate function hash:', e);
    }
  }

  try {
    result = await fn();
    success = true;
    return result;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const executionTime = Date.now() - startTime;
    
    await logFunctionUsage(supabase, {
      function_name: functionName,
      executive_name: executiveName,
      success,
      execution_time_ms: executionTime,
      user_context: userContext,
      parameters,
      error_message: errorMessage,
      function_hash: functionHash,
      session_id: options?.sessionId,
      user_id: options?.userId,
      tool_category: getToolCategory(functionName)
    });
  }
}

/**
 * Export utility for external use
 */
export { getToolCategory };
