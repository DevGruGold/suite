/**
 * Office Clerk - AI-Free Edge Function Executor
 * 
 * When all AI providers fail, this module executes edge functions directly
 * based on keyword/intent detection and synthesizes results without AI.
 * 
 * Supports 115+ programmatic edge functions
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

// Configuration for Offline AI
const OFFLINE_AI_URL = Deno.env.get('OFFLINE_AI_URL');
const OFFLINE_MODEL_NAME = "SmolVLM-500M-Instruct (Offline)";

/**
 * Call the Offline AI Endpoint (e.g., local llama.cpp server)
 */
async function callOfflineAI(
  prompt: string,
  systemPrompt?: string
): Promise<{ success: boolean; content: string; provider: string }> {
  if (!OFFLINE_AI_URL) {
    console.log('🏢 Office Clerk: No OFFLINE_AI_URL configured. Skipping offline AI.');
    return { success: false, content: '', provider: 'none' };
  }

  console.log(`🏢 Office Clerk: Attempting to contact Offline AI at ${OFFLINE_AI_URL}...`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for local AI

    const response = await fetch(OFFLINE_AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt || "You are a helpful assistant." },
          { role: 'user', content: prompt }
        ],
        model: "smolvlm", // Generic identifier, server usually ignores if single-model
        temperature: 0.7,
        max_tokens: 500
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || data.content || '';
      if (content) {
        console.log('🏢 Office Clerk: Offline AI successfully generated response.');
        return { success: true, content, provider: OFFLINE_MODEL_NAME };
      }
    } else {
      console.warn(`🏢 Office Clerk: Offline AI returned ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.warn('🏢 Office Clerk: Offline AI connection failed:', error.message);
  }

  return { success: false, content: '', provider: 'none' };
}

export interface OfficeClerkResult {
  success: boolean;
  content: string;
  functionsExecuted: string[];
  rawResults: any[];
}

/**
 * Intent to function mapping
 * Each entry maps keyword patterns to an edge function and default arguments
 */
const INTENT_MAPPINGS: Array<{
  patterns: string[];
  functionName: string;
  args: any;
  category: string;
}> = [
    // Mining & Crypto
    { patterns: ['mining', 'hashrate', 'worker', 'xmr', 'monero', 'miner'], functionName: 'mining-proxy', args: { action: 'get_stats' }, category: 'Mining' },
    { patterns: ['mobile miner', 'miner config'], functionName: 'mobile-miner-config', args: {}, category: 'Mining' },
    { patterns: ['miner register', 'register miner'], functionName: 'mobile-miner-register', args: {}, category: 'Mining' },

    // Device & Charger
    { patterns: ['device', 'connection', 'charger', 'pop', 'charging'], functionName: 'monitor-device-connections', args: { action: 'list_active' }, category: 'Devices' },
    { patterns: ['validate pop', 'pop event', 'proof of plug'], functionName: 'validate-pop-event', args: {}, category: 'Devices' },
    { patterns: ['device metric', 'aggregate device'], functionName: 'aggregate-device-metrics', args: { action: 'aggregate' }, category: 'Devices' },

    // System & Health
    { patterns: ['status', 'health', 'system status'], functionName: 'system-status', args: {}, category: 'System' },
    { patterns: ['system health', 'health check'], functionName: 'system-health', args: {}, category: 'System' },
    { patterns: ['diagnostic', 'system diagnostic'], functionName: 'system-diagnostics', args: {}, category: 'System' },
    { patterns: ['api key health', 'key health', 'api status'], functionName: 'api-key-health-monitor', args: {}, category: 'System' },
    { patterns: ['frontend health', 'website health'], functionName: 'check-frontend-health', args: {}, category: 'System' },
    { patterns: ['prometheus', 'metrics endpoint'], functionName: 'prometheus-metrics', args: {}, category: 'System' },

    // Agents
    { patterns: ['agent', 'list agent', 'agents', 'agent status'], functionName: 'agent-manager', args: { action: 'list' }, category: 'Agents' },
    { patterns: ['agent deployment', 'deploy agent'], functionName: 'agent-deployment-coordinator', args: { action: 'status' }, category: 'Agents' },
    { patterns: ['agent work', 'execute work'], functionName: 'agent-work-executor', args: { action: 'status' }, category: 'Agents' },

    // Tasks
    { patterns: ['task', 'list task', 'tasks', 'task status'], functionName: 'task-orchestrator', args: { action: 'list' }, category: 'Tasks' },
    { patterns: ['task advance', 'auto advance'], functionName: 'task-auto-advance', args: {}, category: 'Tasks' },
    { patterns: ['cleanup task', 'duplicate task'], functionName: 'cleanup-duplicate-tasks', args: {}, category: 'Tasks' },

    // Governance & DAO
    { patterns: ['ecosystem', 'metrics', 'dao', 'governance'], functionName: 'ecosystem-monitor', args: {}, category: 'Governance' },
    { patterns: ['governance phase', 'phase manager'], functionName: 'governance-phase-manager', args: { action: 'status' }, category: 'Governance' },
    { patterns: ['proposal', 'list proposal'], functionName: 'list-function-proposals', args: {}, category: 'Governance' },
    { patterns: ['vote', 'request vote', 'executive vote'], functionName: 'request-executive-votes', args: {}, category: 'Governance' },
    { patterns: ['community idea', 'evaluate idea'], functionName: 'evaluate-community-idea', args: {}, category: 'Governance' },

    // Knowledge & Memory
    { patterns: ['knowledge', 'memory', 'search knowledge'], functionName: 'knowledge-manager', args: { action: 'list' }, category: 'Knowledge' },
    { patterns: ['extract knowledge', 'knowledge extraction'], functionName: 'extract-knowledge', args: {}, category: 'Knowledge' },
    { patterns: ['system knowledge', 'knowledge build'], functionName: 'system-knowledge-builder', args: {}, category: 'Knowledge' },
    { patterns: ['vectorize', 'embedding'], functionName: 'vectorize-memory', args: {}, category: 'Knowledge' },

    // GitHub Integration
    { patterns: ['github', 'repo', 'repository'], functionName: 'github-integration', args: { action: 'status' }, category: 'GitHub' },
    { patterns: ['contribution', 'github contribution'], functionName: 'sync-github-contributions', args: {}, category: 'GitHub' },
    { patterns: ['validate contribution'], functionName: 'validate-github-contribution', args: {}, category: 'GitHub' },
    { patterns: ['contributor reward', 'reward'], functionName: 'process-contributor-reward', args: {}, category: 'GitHub' },

    // Edge Functions
    { patterns: ['function', 'edge function', 'list function', 'available function'], functionName: 'list-available-functions', args: {}, category: 'Functions' },
    { patterns: ['search function', 'find function'], functionName: 'search-edge-functions', args: { query: '' }, category: 'Functions' },
    { patterns: ['function proposal', 'propose function'], functionName: 'propose-new-edge-function', args: {}, category: 'Functions' },
    { patterns: ['deploy function', 'approved function'], functionName: 'deploy-approved-edge-function', args: {}, category: 'Functions' },
    { patterns: ['function log', 'edge log'], functionName: 'get-edge-function-logs', args: {}, category: 'Functions' },
    { patterns: ['function action', 'get action'], functionName: 'get-function-actions', args: {}, category: 'Functions' },

    // Cron & Scheduling
    { patterns: ['cron', 'schedule', 'scheduled', 'cron registry'], functionName: 'get-cron-registry', args: {}, category: 'Scheduling' },
    { patterns: ['scheduled action', 'execute schedule'], functionName: 'execute-scheduled-actions', args: {}, category: 'Scheduling' },
    { patterns: ['schedule reminder', 'reminder'], functionName: 'schedule-reminder', args: {}, category: 'Scheduling' },

    // Analytics & Usage
    { patterns: ['analytics', 'usage', 'function usage', 'usage analytics'], functionName: 'function-usage-analytics', args: { action: 'summary' }, category: 'Analytics' },
    { patterns: ['tool usage', 'tool analytics'], functionName: 'tool-usage-analytics', args: {}, category: 'Analytics' },
    { patterns: ['query analytics', 'edge analytics'], functionName: 'query-edge-analytics', args: {}, category: 'Analytics' },
    { patterns: ['version analytics', 'function version'], functionName: 'get-function-version-analytics', args: {}, category: 'Analytics' },
    { patterns: ['sync log', 'function log sync'], functionName: 'sync-function-logs', args: { hours_back: 1 }, category: 'Analytics' },

    // Workflow & Automation
    { patterns: ['workflow', 'template', 'workflow template'], functionName: 'workflow-template-manager', args: { action: 'list' }, category: 'Workflow' },
    { patterns: ['workflow optimize', 'optimize workflow'], functionName: 'workflow-optimizer', args: {}, category: 'Workflow' },
    { patterns: ['diagnose workflow', 'workflow failure'], functionName: 'diagnose-workflow-failure', args: {}, category: 'Workflow' },
    { patterns: ['multi step', 'orchestrate'], functionName: 'multi-step-orchestrator', args: {}, category: 'Workflow' },
    { patterns: ['suite task', 'task automation'], functionName: 'suite-task-automation-engine', args: {}, category: 'Workflow' },

    // AI & Learning
    { patterns: ['eliza evaluation', 'self evaluation'], functionName: 'eliza-self-evaluation', args: {}, category: 'AI' },
    { patterns: ['eliza intelligence', 'intelligence coordinator'], functionName: 'eliza-intelligence-coordinator', args: {}, category: 'AI' },
    { patterns: ['enhanced learning', 'learning'], functionName: 'enhanced-learning', args: {}, category: 'AI' },
    { patterns: ['predictive', 'prediction', 'forecast'], functionName: 'predictive-analytics', args: {}, category: 'AI' },
    { patterns: ['nlg', 'natural language', 'generate text'], functionName: 'nlg-generator', args: {}, category: 'AI' },

    // Autonomous & Decision
    { patterns: ['autonomous', 'decision', 'autonomous decision'], functionName: 'autonomous-decision-maker', args: {}, category: 'Autonomous' },
    { patterns: ['autonomous code', 'code fix', 'auto fix'], functionName: 'autonomous-code-fixer', args: {}, category: 'Autonomous' },
    { patterns: ['auto fix result', 'fix result'], functionName: 'fetch-auto-fix-results', args: {}, category: 'Autonomous' },
    { patterns: ['code monitor', 'monitor code'], functionName: 'code-monitor-daemon', args: { action: 'status' }, category: 'Autonomous' },
    { patterns: ['self optimizing', 'optimize agent'], functionName: 'self-optimizing-agent-architecture', args: {}, category: 'Autonomous' },

    // Conversation & Chat
    { patterns: ['conversation', 'summarize conversation'], functionName: 'summarize-conversation', args: {}, category: 'Chat' },
    { patterns: ['conversation access', 'access conversation'], functionName: 'conversation-access', args: {}, category: 'Chat' },

    // Google Services
    { patterns: ['google auth', 'cloud auth'], functionName: 'google-cloud-auth', args: {}, category: 'Google' },
    { patterns: ['gmail', 'email', 'mail'], functionName: 'google-gmail', args: { action: 'list' }, category: 'Google' },
    { patterns: ['drive', 'google drive', 'file'], functionName: 'google-drive', args: { action: 'list' }, category: 'Google' },
    { patterns: ['sheet', 'google sheet', 'spreadsheet'], functionName: 'google-sheets', args: { action: 'list' }, category: 'Google' },
    { patterns: ['calendar', 'event', 'schedule'], functionName: 'google-calendar', args: { action: 'list' }, category: 'Google' },

    // Vercel & Deployment
    { patterns: ['vercel', 'deployment', 'vercel manager'], functionName: 'vercel-manager', args: { action: 'status' }, category: 'Deployment' },
    { patterns: ['vercel ecosystem', 'ecosystem api'], functionName: 'vercel-ecosystem-api', args: {}, category: 'Deployment' },

    // SuperDuper Agents
    { patterns: ['superduper', 'super agent'], functionName: 'superduper-router', args: { action: 'list' }, category: 'SuperDuper' },
    { patterns: ['code architect', 'architect'], functionName: 'superduper-code-architect', args: {}, category: 'SuperDuper' },
    { patterns: ['business growth', 'growth'], functionName: 'superduper-business-growth', args: {}, category: 'SuperDuper' },
    { patterns: ['research', 'intelligence'], functionName: 'superduper-research-intelligence', args: {}, category: 'SuperDuper' },

    // Payments & Monetization
    { patterns: ['stripe', 'payment'], functionName: 'generate-stripe-link', args: {}, category: 'Payments' },
    { patterns: ['monetization', 'service monetization'], functionName: 'service-monetization-engine', args: {}, category: 'Payments' },
    { patterns: ['license', 'license application'], functionName: 'process-license-application', args: {}, category: 'Payments' },

    // MCP Servers
    { patterns: ['mcp', 'xmrt mcp'], functionName: 'xmrt-mcp-server', args: {}, category: 'MCP' },
    { patterns: ['patent', 'uspto'], functionName: 'uspto-patent-mcp', args: {}, category: 'MCP' },

    // Misc
    { patterns: ['redis', 'cache'], functionName: 'redis-cache', args: { action: 'status' }, category: 'Cache' },
    { patterns: ['python', 'execute python'], functionName: 'python-executor', args: {}, category: 'Python' },
    { patterns: ['playwright', 'browse', 'screenshot'], functionName: 'playwright-browse', args: {}, category: 'Browser' },
    { patterns: ['render', 'render api'], functionName: 'render-api', args: {}, category: 'Render' },
    { patterns: ['hume', 'emotion', 'expression'], functionName: 'hume-expression-measurement', args: {}, category: 'Hume' },
    { patterns: ['user identity', 'correlate user'], functionName: 'correlate-user-identity', args: {}, category: 'Identity' },
    { patterns: ['lead', 'qualify lead'], functionName: 'qualify-lead', args: {}, category: 'Leads' },
    { patterns: ['service interest', 'identify service'], functionName: 'identify-service-interest', args: {}, category: 'Leads' },
    { patterns: ['n8n', 'workflow generator'], functionName: 'n8n-workflow-generator', args: {}, category: 'Automation' },
    { patterns: ['gemini agent', 'create agent'], functionName: 'gemini-agent-creator', args: {}, category: 'AI' },
    { patterns: ['schema', 'schema manager'], functionName: 'schema-manager', args: {}, category: 'Database' },
    { patterns: ['code lesson', 'execution lesson'], functionName: 'get-code-execution-lessons', args: {}, category: 'Learning' },
    { patterns: ['feedback', 'my feedback'], functionName: 'get-my-feedback', args: {}, category: 'Feedback' },
    { patterns: ['opportunity', 'scan opportunity'], functionName: 'opportunity-scanner', args: {}, category: 'Business' },
    { patterns: ['event dispatch', 'dispatch event'], functionName: 'event-dispatcher', args: {}, category: 'Events' },
    { patterns: ['event route', 'route event'], functionName: 'event-router', args: {}, category: 'Events' },
    { patterns: ['universal', 'invoke function'], functionName: 'universal-edge-invoker', args: {}, category: 'Functions' },
    { patterns: ['template library', 'library manager'], functionName: 'template-library-manager', args: {}, category: 'Templates' },
  ];

/**
 * Execute the Office Clerk - detect intent and run matching functions
 */
export async function executeOfficeClerk(
  userQuery: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<OfficeClerkResult> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const queryLower = userQuery.toLowerCase();
  const executedFunctions: string[] = [];
  const rawResults: any[] = [];

  // STEP 1: Attempt Offline AI Fallback (SmolVLM)
  // This gives us "intelligence" even when the internet/cloud is down
  const offlineResult = await callOfflineAI(
    userQuery,
    "You are the Office Clerk, a helpful assistant running locally. Answer the user's query concisely."
  );

  if (offlineResult.success) {
    return {
      success: true,
      content: `[Offline AI: ${offlineResult.provider}] ${offlineResult.content}`,
      functionsExecuted: [],
      rawResults: []
    };
  }

  // STEP 2: Fallback to Regex / Deterministic Execution
  console.log('🏢 Office Clerk: Analyzing query for programmatic execution');

  // Find all matching intents
  const matchedMappings = INTENT_MAPPINGS.filter(mapping =>
    mapping.patterns.some(pattern => queryLower.includes(pattern))
  );

  // Deduplicate by function name
  const uniqueFunctions = [...new Map(matchedMappings.map(m => [m.functionName, m])).values()];

  console.log(`🏢 Office Clerk: Found ${uniqueFunctions.length} matching function(s)`);

  // Execute each matched function
  for (const mapping of uniqueFunctions.slice(0, 5)) { // Limit to 5 to prevent overload
    try {
      let finalArgs = { ...mapping.args };

      // Dynamic argument injection for specific functions
      if (mapping.functionName === 'extract-knowledge') {
        finalArgs = {
          ...finalArgs,
          content: userQuery, // Pass the user's query as content to extract from
          message_id: `oc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          session_id: 'office_clerk_direct_execution'
        };
      }

      console.log(`🏢 Executing: ${mapping.functionName} (${mapping.category})`);

      const { data, error } = await supabase.functions.invoke(mapping.functionName, {
        body: finalArgs
      });

      if (!error && data) {
        executedFunctions.push(mapping.functionName);
        rawResults.push({
          function: mapping.functionName,
          category: mapping.category,
          data
        });
      } else if (error) {
        console.warn(`🏢 ${mapping.functionName} error:`, error.message);
      }
    } catch (err) {
      console.warn(`🏢 ${mapping.functionName} failed:`, err);
    }
  }

  // Synthesize results into readable format
  const content = synthesizeResults(rawResults, userQuery);

  return {
    success: executedFunctions.length > 0,
    content,
    functionsExecuted: executedFunctions,
    rawResults
  };
}

/**
 * Synthesize raw results into human-readable format without AI
 */
function synthesizeResults(results: any[], originalQuery: string): string {
  if (results.length === 0) {
    return generateHelpfulGuidance(originalQuery);
  }

  let output = `📊 **Data Retrieved** (AI-free programmatic mode)\n\n`;

  for (const { function: fn, category, data } of results) {
    output += `### ${category}: ${fn}\n`;
    output += formatData(data, fn);
    output += '\n\n';
  }

  output += `---\n_Executed ${results.length} function(s) via Office Clerk. AI synthesis unavailable._`;

  return output;
}

/**
 * Format data based on function type
 */
function formatData(data: any, functionName: string): string {
  if (!data) return '`No data returned`';

  // Handle common patterns
  if (functionName.includes('mining') || functionName === 'mining-proxy') {
    const stats = data.stats || data;
    return [
      `- **Hash Rate**: ${stats.hashRate || stats.hashrate || 0} H/s`,
      `- **Valid Shares**: ${stats.validShares || 0}`,
      `- **Workers**: ${stats.workerCount || stats.workers?.length || 0}`,
      `- **Pool**: ${stats.pool || 'N/A'}`
    ].join('\n');
  }

  if (functionName.includes('status') || functionName.includes('health')) {
    const status = data.status || data;
    return [
      `- **Status**: ${status.overallStatus || status.status || 'operational'}`,
      `- **Health Score**: ${status.healthScore || status.health_score || 'N/A'}%`,
      `- **Uptime**: ${status.uptime || 'N/A'}`
    ].join('\n');
  }

  if (functionName.includes('agent')) {
    const agents = data.agents || data || [];
    if (Array.isArray(agents)) {
      const list = agents.slice(0, 5).map((a: any) =>
        `- **${a.name || a.id}**: ${a.status || 'unknown'} (${a.role || 'agent'})`
      ).join('\n');
      return list + (agents.length > 5 ? `\n_...and ${agents.length - 5} more_` : '');
    }
  }

  if (functionName.includes('task')) {
    const tasks = data.tasks || data || [];
    if (Array.isArray(tasks)) {
      const list = tasks.slice(0, 5).map((t: any) =>
        `- **${t.title || t.id}**: ${t.status || 'unknown'} (${t.stage || t.priority || '-'})`
      ).join('\n');
      return list + (tasks.length > 5 ? `\n_...and ${tasks.length - 5} more_` : '');
    }
  }

  if (functionName.includes('function') && Array.isArray(data)) {
    const list = data.slice(0, 10).map((f: any) =>
      `- \`${typeof f === 'string' ? f : f.name || f.function_name || f}\``
    ).join('\n');
    return list + (data.length > 10 ? `\n_...and ${data.length - 10} more_` : '');
  }

  // Generic array handling
  if (Array.isArray(data)) {
    if (data.length === 0) return '`Empty list`';
    const list = data.slice(0, 5).map((item, i) => {
      if (typeof item === 'object') {
        const name = item.name || item.title || item.id || `Item ${i + 1}`;
        return `- ${name}`;
      }
      return `- ${item}`;
    }).join('\n');
    return list + (data.length > 5 ? `\n_...and ${data.length - 5} more_` : '');
  }

  // Generic object handling
  if (typeof data === 'object') {
    const entries = Object.entries(data).slice(0, 8);
    return entries.map(([key, value]) => {
      const displayValue = typeof value === 'object'
        ? JSON.stringify(value).slice(0, 80) + '...'
        : String(value).slice(0, 100);
      return `- **${key}**: ${displayValue}`;
    }).join('\n');
  }

  return `\`${String(data).slice(0, 500)}\``;
}

/**
 * Generate helpful guidance when no functions match
 */
function generateHelpfulGuidance(query: string): string {
  return `⚠️ **AI Services Temporarily Unavailable**

I couldn't find a direct match for your query, but I can help with these topics:

**📊 Data & Status**
- "show mining stats" / "mining hashrate"
- "system status" / "health check"
- "list agents" / "agent status"
- "list tasks" / "task progress"

**🔌 Devices & Connections**
- "list devices" / "charger connections"
- "device metrics"

**🏛️ Governance**
- "ecosystem metrics"
- "list proposals"
- "governance status"

**🔧 Functions & Workflows**
- "list functions" / "edge functions"
- "cron registry" / "scheduled tasks"
- "workflow templates"

**📈 Analytics**
- "function usage" / "analytics"
- "api key health"

**🔗 Integrations**
- "github status"
- "vercel status"
- "google services"

_Type a command above to get direct data. Full AI will resume when credits are restored._`;
}

/**
 * Get list of all available function categories
 */
export function getOfficeClerkCategories(): string[] {
  return [...new Set(INTENT_MAPPINGS.map(m => m.category))];
}

/**
 * Get all available functions with their patterns
 */
export function getOfficeClerkFunctions(): Array<{ name: string; category: string; patterns: string[] }> {
  return INTENT_MAPPINGS.map(m => ({
    name: m.functionName,
    category: m.category,
    patterns: m.patterns
  }));
}
