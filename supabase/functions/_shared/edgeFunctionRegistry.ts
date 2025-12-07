// Edge Function Registry - Used by search-edge-functions
// This is a shared registry of all available edge functions
// Total: 115+ functions across 18 categories

export interface EdgeFunctionCapability {
  name: string;
  url: string;
  description: string;
  capabilities: string[];
  category: 'ai' | 'mining' | 'web' | 'speech' | 'faucet' | 'ecosystem' | 'deployment' | 'github' | 'autonomous' | 'knowledge' | 'task-management' | 'monitoring' | 'code-execution' | 'database' | 'network' | 'superduper' | 'daemon' | 'governance' | 'research' | 'revenue' | 'vsco' | 'hume' | 'acquisition' | 'payments' | 'automation';
  example_use: string;
}

export const EDGE_FUNCTIONS_REGISTRY: EdgeFunctionCapability[] = [
  {
    name: 'service-monetization-engine',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/service-monetization-engine',
    description: '💰 REVENUE GENERATION - API key generation, usage tracking, tiered access control, billing, and revenue analytics for monetized services',
    capabilities: ['API key management', 'Usage tracking', 'Tiered pricing (free/basic/pro/enterprise)', 'Invoice generation', 'Revenue analytics', 'Quota enforcement', 'Customer onboarding', 'Tier upgrades', 'MRR calculation'],
    category: 'revenue',
    example_use: 'Generate API key: {"action":"generate_api_key","data":{"service_name":"uspto-patent-mcp","tier":"pro","owner_email":"customer@example.com"}}. Track usage: {"action":"track_usage","data":{"api_key":"xmrt_pro_abc","service_name":"uspto-patent-mcp","endpoint":"/search"}}'
  },
  {
    name: 'workflow-template-manager',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/workflow-template-manager',
    description: '🔄 WORKFLOW AUTOMATION - Pre-built workflow templates for revenue generation, marketing automation, financial management, and self-optimization',
    capabilities: ['Template library (9 pre-built workflows)', 'Workflow execution', 'Performance tracking', 'Template creation', 'Success rate analytics', 'Multi-step orchestration', 'Revenue workflows', 'Marketing workflows', 'Financial workflows'],
    category: 'automation',
    example_use: 'Execute template: {"action":"execute_template","data":{"template_name":"acquire_new_customer","params":{"email":"new@customer.com","tier":"basic","service_name":"uspto-patent-mcp"}}}. List templates: {"action":"list_templates","data":{"category":"revenue"}}'
  },
{
    name: 'lovable-chat',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/lovable-chat',
    description: '✅ PRIMARY AI - Model-agnostic chat via Lovable AI Gateway (Gemini 2.5 Flash default, supports OpenAI GPT-5)',
    capabilities: ['Advanced AI chat', 'Context awareness', 'Multi-model support', 'Memory integration', 'Tool calling', 'Multi-step workflows'],
    category: 'ai',
    example_use: 'Main intelligent chat endpoint with full context and memory - use this for all AI chat needs'
  },
  {
    name: 'github-integration',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/github-integration',
    description: 'Complete GitHub OAuth operations - create issues, PRs, comments, discussions',
    capabilities: ['List issues', 'Create issues', 'Comment on issues', 'Create PRs', 'Get file content', 'Search code', 'List discussions'],
    category: 'github',
    example_use: 'Create GitHub issue, list repository issues, manage pull requests'
  },
  {
    name: 'mining-proxy',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/mining-proxy',
    description: 'Unified mining statistics and worker management from SupportXMR',
    capabilities: ['Get mining stats', 'Get worker status', 'Track earnings', 'Monitor hashrate', 'Worker registration'],
    category: 'mining',
    example_use: 'Get comprehensive mining data including pool stats and individual worker performance'
  },
  {
    name: 'agent-manager',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/agent-manager',
    description: 'Primary agent orchestration - create, manage, and monitor AI agents',
    capabilities: ['List agents', 'Spawn agent', 'Update agent status', 'Assign task', 'List tasks', 'Update task', 'Delete task', 'Get workload'],
    category: 'task-management',
    example_use: 'Create a new agent and assign them a task, monitor agent workloads'
  },
  {
    name: 'python-executor',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/python-executor',
    description: 'Sandboxed Python execution via Piston API (stdlib only, no pip)',
    capabilities: ['Execute Python code', 'Data analysis', 'Calculations', 'Network access via proxy', 'Database access via bridge'],
    category: 'code-execution',
    example_use: 'Execute Python to analyze device connection patterns from the last 24 hours'
  },
  {
    name: 'playwright-browse',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/playwright-browse',
    description: 'Web browsing and scraping using Playwright automation',
    capabilities: ['Browse websites', 'Extract data', 'Dynamic content extraction', 'JavaScript rendering', 'Interact with pages'],
    category: 'web',
    example_use: 'Browse websites, extract data, interact with web pages, research real-time information'
  },
  {
    name: 'knowledge-manager',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/knowledge-manager',
    description: 'Knowledge base CRUD operations - store, search, and link entities',
    capabilities: ['Store knowledge', 'Search knowledge', 'Create relationships', 'Get related entities', 'Update confidence'],
    category: 'knowledge',
    example_use: 'Store concepts, link entities, search knowledge graph'
  },
  {
    name: 'task-orchestrator',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/task-orchestrator',
    description: 'Advanced task automation - auto-assign, rebalance, analyze bottlenecks',
    capabilities: ['Auto assign tasks', 'Rebalance workload', 'Identify blockers', 'Clear blocked tasks', 'Analyze bottlenecks', 'Bulk updates'],
    category: 'task-management',
    example_use: 'Automatically distribute all pending tasks to idle agents by priority'
  },
  {
    name: 'system-status',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/system-status',
    description: 'Quick health check - database, agents, tasks status',
    capabilities: ['System health check', 'Database status', 'Agent status', 'Task status', 'Quick diagnostics'],
    category: 'monitoring',
    example_use: 'Get comprehensive system health status'
  },
  {
    name: 'system-diagnostics',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/system-diagnostics',
    description: 'Detailed resource usage and performance metrics',
    capabilities: ['Memory usage', 'CPU usage', 'Database performance', 'Edge function health', 'Deep diagnostics'],
    category: 'monitoring',
    example_use: 'Run detailed system diagnostics when system is slow'
  },
  {
    name: 'autonomous-code-fixer',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/autonomous-code-fixer',
    description: 'Self-healing code execution - auto-fixes and re-executes failed Python',
    capabilities: ['Auto-detect failures', 'Fix syntax errors', 'Fix logic errors', 'Re-execute code', 'Handle API failures'],
    category: 'autonomous',
    example_use: 'Automatically fixes failed Python executions without human intervention'
  },
  {
    name: 'multi-step-orchestrator',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/multi-step-orchestrator',
    description: 'Complex workflow engine for background processing with dependencies',
    capabilities: ['Execute workflows', 'Multi-step tasks', 'Dependency handling', 'Background processing', 'Autonomous workflows'],
    category: 'autonomous',
    example_use: 'Execute debugging workflow: scan logs → identify errors → fix code → verify'
  },
  {
    name: 'search-edge-functions',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/search-edge-functions',
    description: 'Semantic search for edge functions by capability, keywords, or use case',
    capabilities: ['Search functions', 'Find by capability', 'Keyword search', 'Category filter', 'Ranked results'],
    category: 'ecosystem',
    example_use: 'Find the right function when you don\'t know which one to use'
  },
  {
    name: 'xmrt_integration',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/xmrt_integration',
    description: 'Unified ecosystem health & integration hub - connects all XMRT repos (XMRT-Ecosystem, xmrt-wallet-public, mobilemonero, xmrtnet, xmrtdao) for comprehensive health reports and integration monitoring',
    capabilities: [
      'Multi-repository health monitoring',
      'Cross-repo integration verification',
      'Deployment status (Vercel, Render, Supabase)',
      'API health checks (mining, faucet, edge functions)',
      'Database performance metrics',
      'Community engagement analytics',
      'Comprehensive markdown reports',
      'Repository comparison',
      'Integration debugging',
      'Ecosystem-wide status overview'
    ],
    category: 'ecosystem',
    example_use: 'Generate comprehensive ecosystem health report covering all repos, deployments, APIs, and community engagement. Check integration between services. Compare repository activity.'
  },
  {
    name: 'aggregate-device-metrics',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/aggregate-device-metrics',
    description: 'Aggregate and analyze device mining metrics over time',
    capabilities: ["Mining stats", "Device monitoring", "Hashrate tracking"],
    category: 'mining',
    example_use: 'Use aggregate device metrics for aggregate and analyze device mining metrics over time'
  },  {
    name: 'api-key-health-monitor',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/api-key-health-monitor',
    description: 'Monitor health and usage of API keys across services',
    capabilities: ["Health checks", "Performance metrics", "Status monitoring"],
    category: 'monitoring',
    example_use: 'Use api key health monitor for monitor health and usage of api keys across services'
  },  {
    name: 'check-frontend-health',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/check-frontend-health',
    description: 'Health check for frontend application status',
    capabilities: ["Health checks", "Performance metrics", "Status monitoring"],
    category: 'monitoring',
    example_use: 'Use check frontend health for health check for frontend application status'
  },  {
    name: 'cleanup-duplicate-tasks',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/cleanup-duplicate-tasks',
    description: 'Remove duplicate tasks from the task management system',
    capabilities: ["Task creation", "Task assignment", "Workload balancing"],
    category: 'task-management',
    example_use: 'Use cleanup duplicate tasks for remove duplicate tasks from the task management system'
  },  {
    name: 'code-monitor-daemon',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/code-monitor-daemon',
    description: 'Continuous monitoring daemon for code execution and errors',
    capabilities: ["Execute code", "Error handling", "Sandboxed execution"],
    category: 'code-execution',
    example_use: 'Use code monitor daemon for continuous monitoring daemon for code execution and errors'
  },  {
    name: 'community-spotlight-post',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/community-spotlight-post',
    description: 'Generate and post community spotlight content',
    capabilities: ["Automated posting", "Content generation", "Scheduling"],
    category: 'autonomous',
    example_use: 'Use community spotlight post for generate and post community spotlight content'
  },  {
    name: 'conversation-access',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/conversation-access',
    description: 'Manage conversation access and permissions',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use conversation access for manage conversation access and permissions'
  },  {
    name: 'daily-discussion-post',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/daily-discussion-post',
    description: 'Generate and post daily discussion topics',
    capabilities: ["Automated posting", "Content generation", "Scheduling"],
    category: 'autonomous',
    example_use: 'Use daily discussion post for generate and post daily discussion topics'
  },  {
    name: 'deepseek-chat',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/deepseek-chat',
    description: 'AI chat via DeepSeek model',
    capabilities: ["AI chat", "Context awareness", "Natural language processing"],
    category: 'ai',
    example_use: 'Use deepseek chat for ai chat via deepseek model'
  },  {
    name: 'ecosystem-monitor',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/ecosystem-monitor',
    description: 'Monitor entire XMRT Vercel ecosystem health (xmrt-io, xmrt-ecosystem, xmrt-dao-ecosystem)',
    capabilities: ["Multi-service health checks", "Performance metrics", "Status monitoring", "Vercel deployment tracking"],
    category: 'monitoring',
    example_use: 'Monitor all Vercel services health, check ecosystem performance, track deployment status'
  },  {
    name: 'eliza-python-runtime',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/eliza-python-runtime',
    description: 'Python runtime environment for Eliza agent',
    capabilities: ["Execute code", "Error handling", "Sandboxed execution"],
    category: 'code-execution',
    example_use: 'Use eliza python runtime for python runtime environment for eliza agent'
  },  {
    name: 'enhanced-learning',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/enhanced-learning',
    description: 'Advanced machine learning and pattern recognition',
    capabilities: ["Knowledge storage", "Semantic search", "Entity relationships"],
    category: 'knowledge',
    example_use: 'Use enhanced learning for advanced machine learning and pattern recognition'
  },  {
    name: 'evening-summary-post',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/evening-summary-post',
    description: 'Generate and post evening summary reports',
    capabilities: ["Automated posting", "Content generation", "Scheduling"],
    category: 'autonomous',
    example_use: 'Use evening summary post for generate and post evening summary reports'
  },  {
    name: 'execute-scheduled-actions',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/execute-scheduled-actions',
    description: 'Execute scheduled tasks and actions',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use execute scheduled actions for execute scheduled tasks and actions'
  },  {
    name: 'extract-knowledge',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/extract-knowledge',
    description: 'Extract and structure knowledge from conversations',
    capabilities: ["Knowledge storage", "Semantic search", "Entity relationships"],
    category: 'knowledge',
    example_use: 'Use extract knowledge for extract and structure knowledge from conversations'
  },  {
    name: 'fetch-auto-fix-results',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/fetch-auto-fix-results',
    description: 'Retrieve results from autonomous code fixing',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use fetch auto fix results for retrieve results from autonomous code fixing'
  },  {
    name: 'gemini-chat',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/gemini-chat',
    description: 'AI chat via Google Gemini model',
    capabilities: ["AI chat", "Context awareness", "Natural language processing"],
    category: 'ai',
    example_use: 'Use gemini chat for ai chat via google gemini model'
  },  {
    name: 'get-code-execution-lessons',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/get-code-execution-lessons',
    description: 'Retrieve lessons learned from code executions',
    capabilities: ["Execute code", "Error handling", "Sandboxed execution"],
    category: 'code-execution',
    example_use: 'Use get code execution lessons for retrieve lessons learned from code executions'
  },  {
    name: 'get-embedding',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/get-embedding',
    description: 'Generate vector embeddings for text',
    capabilities: ["Knowledge storage", "Semantic search", "Entity relationships"],
    category: 'knowledge',
    example_use: 'Use get embedding for generate vector embeddings for text'
  },  {
    name: 'get-lovable-key',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/get-lovable-key',
    description: 'Retrieve Lovable API key',
    capabilities: ["AI chat", "Context awareness", "Natural language processing"],
    category: 'ai',
    example_use: 'Use get lovable key for retrieve lovable api key'
  },  {
    name: 'issue-engagement-command',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/issue-engagement-command',
    description: 'Engage with GitHub issues via commands',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use issue engagement command for engage with github issues via commands'
  },  {
    name: 'kimi-chat',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/kimi-chat',
    description: 'AI chat via Kimi model',
    capabilities: ["AI chat", "Context awareness", "Natural language processing"],
    category: 'ai',
    example_use: 'Use kimi chat for ai chat via kimi model'
  },  {
    name: 'list-available-functions',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/list-available-functions',
    description: 'List all available edge functions',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use list available functions for list all available edge functions'
  },  {
    name: 'monitor-device-connections',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/monitor-device-connections',
    description: 'Monitor mining device connections and status',
    capabilities: ["Mining stats", "Device monitoring", "Hashrate tracking"],
    category: 'mining',
    example_use: 'Use monitor device connections for monitor mining device connections and status'
  },  {
    name: 'morning-discussion-post',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/morning-discussion-post',
    description: 'Generate and post morning discussion topics',
    capabilities: ["Automated posting", "Content generation", "Scheduling"],
    category: 'autonomous',
    example_use: 'Use morning discussion post for generate and post morning discussion topics'
  },  {
    name: 'nlg-generator',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/nlg-generator',
    description: 'Natural language generation for reports and content',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use nlg generator for natural language generation for reports and content'
  },  {
    name: 'openai-chat',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/openai-chat',
    description: 'AI chat via OpenAI models',
    capabilities: ["AI chat", "Context awareness", "Natural language processing"],
    category: 'ai',
    example_use: 'Use openai chat for ai chat via openai models'
  },  {
    name: 'openai-tts',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/openai-tts',
    description: 'Text-to-speech via OpenAI',
    capabilities: ["Text-to-speech", "Voice synthesis", "Audio generation"],
    category: 'ai',
    example_use: 'Use openai tts for text-to-speech via openai'
  },  
  {
    name: 'uspto-patent-mcp',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/uspto-patent-mcp',
    description: 'MCP server for USPTO patent and trademark database access. Search 11M+ patents, retrieve full text, download PDFs, analyze portfolios using advanced CQL queries',
    capabilities: [
      'Patent search with CQL syntax (title, abstract, inventor, assignee, date, classification)',
      'Full text document retrieval (abstract, claims, description)',
      'PDF downloads (base64 encoded)',
      'Inventor portfolio analysis',
      'Assignee/company patent search',
      'CPC classification search',
      'Prior art search assistance',
      'Technology landscape mapping',
      'Competitive intelligence'
    ],
    category: 'research' as const,
    example_use: 'Search patents: {"method":"tools/call","params":{"name":"search_patents","arguments":{"query":"TTL/artificial intelligence AND ISD/20240101->20241231"}}}'
  },
  {
    name: 'predictive-analytics',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/predictive-analytics',
    description: 'Predictive analytics for mining and system metrics',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use predictive analytics for predictive analytics for mining and system metrics'
  },  {
    name: 'process-contributor-reward',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/process-contributor-reward',
    description: 'Process and distribute contributor rewards',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use process contributor reward for process and distribute contributor rewards'
  },  {
    name: 'progress-update-post',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/progress-update-post',
    description: 'Generate and post progress updates',
    capabilities: ["Automated posting", "Content generation", "Scheduling"],
    category: 'autonomous',
    example_use: 'Use progress update post for generate and post progress updates'
  },  {
    name: 'prometheus-metrics',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/prometheus-metrics',
    description: 'Export Prometheus-compatible metrics',
    capabilities: ["Mining stats", "Device monitoring", "Hashrate tracking"],
    category: 'mining',
    example_use: 'Use prometheus metrics for export prometheus-compatible metrics'
  },  {
    name: 'python-db-bridge',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/python-db-bridge',
    description: 'Bridge for Python code to access database',
    capabilities: ["Execute code", "Error handling", "Sandboxed execution"],
    category: 'code-execution',
    example_use: 'Use python db bridge for bridge for python code to access database'
  },  {
    name: 'python-network-proxy',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/python-network-proxy',
    description: 'Network proxy for Python code execution',
    capabilities: ["Execute code", "Error handling", "Sandboxed execution"],
    category: 'code-execution',
    example_use: 'Use python network proxy for network proxy for python code execution'
  },  {
    name: 'vercel-ecosystem-api',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/vercel-ecosystem-api',
    description: 'Vercel multi-service management for xmrt-io, xmrt-ecosystem, and xmrt-dao-ecosystem deployments',
    capabilities: ["Deployment tracking", "Multi-service health monitoring", "Service status aggregation", "Deployment history"],
    category: 'deployment',
    example_use: 'Check health of all Vercel services, get deployment info, monitor service status'
  },  {
    name: 'redis-cache',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/redis-cache',
    description: 'Upstash Redis caching service for API responses, sessions, and rate limiting',
    capabilities: ["Get/Set cache", "Delete cache", "Health check", "TTL management"],
    category: 'database',
    example_use: 'Cache ecosystem health for 5 minutes, store session data, implement rate limiting'
  },  {
    name: 'schedule-reminder',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/schedule-reminder',
    description: 'Schedule and send reminders',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use schedule reminder for schedule and send reminders'
  },  {
    name: 'schema-manager',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/schema-manager',
    description: 'Manage database schema and migrations',
    capabilities: ["Database operations", "Schema management", "Data access"],
    category: 'database',
    example_use: 'Use schema manager for manage database schema and migrations'
  },  {
    name: 'self-optimizing-agent-architecture',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/self-optimizing-agent-architecture',
    description: 'Self-optimizing agent system architecture',
    capabilities: ["Task creation", "Task assignment", "Workload balancing"],
    category: 'task-management',
    example_use: 'Use self optimizing agent architecture for self-optimizing agent system architecture'
  },  {
    name: 'summarize-conversation',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/summarize-conversation',
    description: 'Generate conversation summaries',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use summarize conversation for generate conversation summaries'
  },  {
    name: 'system-health',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/system-health',
    description: 'Comprehensive system health monitoring',
    capabilities: ["Health checks", "Performance metrics", "Status monitoring"],
    category: 'monitoring',
    example_use: 'Use system health for comprehensive system health monitoring'
  },  {
    name: 'universal-edge-invoker',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/universal-edge-invoker',
    description: 'Universal invoker for all edge functions',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use universal edge invoker for universal invoker for all edge functions'
  },  {
    name: 'update-api-key',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/update-api-key',
    description: 'Update API keys in the system',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use update api key for update api keys in the system'
  },  {
    name: 'validate-github-contribution',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/validate-github-contribution',
    description: 'Validate GitHub contributions for rewards',
    capabilities: ["GitHub API", "Repository management", "Issue tracking"],
    category: 'github',
    example_use: 'Use validate github contribution for validate github contributions for rewards'
  },  {
    name: 'validate-pop-event',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/validate-pop-event',
    description: 'Validate proof-of-participation events',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use validate pop event for validate proof-of-participation events'
  },  {
    name: 'vectorize-memory',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/vectorize-memory',
    description: 'Convert memories to vector embeddings',
    capabilities: ["Knowledge storage", "Semantic search", "Entity relationships"],
    category: 'knowledge',
    example_use: 'Use vectorize memory for convert memories to vector embeddings'
  },  {
    name: 'vercel-ai-chat',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/vercel-ai-chat',
    description: 'AI chat via Vercel AI SDK',
    capabilities: ["AI chat", "Context awareness", "Natural language processing"],
    category: 'ai',
    example_use: 'Use vercel ai chat for ai chat via vercel ai sdk'
  },  {
    name: 'vercel-ai-chat-stream',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/vercel-ai-chat-stream',
    description: 'Streaming AI chat via Vercel AI SDK',
    capabilities: ["AI chat", "Context awareness", "Natural language processing"],
    category: 'ai',
    example_use: 'Use vercel ai chat stream for streaming ai chat via vercel ai sdk'
  },  {
    name: 'vercel-manager',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/vercel-manager',
    description: 'Manage Vercel deployments',
    capabilities: ["Deployment management", "API integration", "Service control"],
    category: 'deployment',
    example_use: 'Use vercel manager for manage vercel deployments'
  },  {
    name: 'weekly-retrospective-post',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/weekly-retrospective-post',
    description: 'Generate and post weekly retrospective',
    capabilities: ["Automated posting", "Content generation", "Scheduling"],
    category: 'autonomous',
    example_use: 'Use weekly retrospective post for generate and post weekly retrospective'
  },  {
    name: 'xmrt-mcp-server',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/xmrt-mcp-server',
    description: 'XMRT Model Context Protocol server',
    capabilities: ["Multi-service integration", "Health monitoring", "Status reporting"],
    category: 'ecosystem',
    example_use: 'Use xmrt mcp server for xmrt model context protocol server'
  },  {
    name: 'superduper-business-growth',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-business-growth',
    description: 'SuperDuper Agent: Business growth strategy and market expansion',
    capabilities: ["Business strategy", "Market analysis", "Growth planning", "Revenue optimization"],
    category: 'superduper',
    example_use: 'Analyze market opportunities, develop growth strategies, revenue optimization'
  },  {
    name: 'superduper-code-architect',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-code-architect',
    description: 'SuperDuper Agent: Software architecture and system design',
    capabilities: ["Architecture design", "Code review", "System optimization", "Technical debt analysis"],
    category: 'superduper',
    example_use: 'Design system architecture, review code quality, optimize performance'
  },  {
    name: 'superduper-communication-outreach',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-communication-outreach',
    description: 'SuperDuper Agent: Community communication and outreach',
    capabilities: ["Community engagement", "Outreach campaigns", "Stakeholder communication"],
    category: 'superduper',
    example_use: 'Manage community outreach, stakeholder communications, engagement campaigns'
  },  {
    name: 'superduper-content-media',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-content-media',
    description: 'SuperDuper Agent: Content creation and media strategy',
    capabilities: ["Content creation", "Media strategy", "Marketing materials", "Social content"],
    category: 'superduper',
    example_use: 'Create marketing content, develop media strategy, social media management'
  },  {
    name: 'superduper-design-brand',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-design-brand',
    description: 'SuperDuper Agent: Brand identity and visual design',
    capabilities: ["Brand strategy", "Visual design", "UI/UX", "Design systems"],
    category: 'superduper',
    example_use: 'Develop brand identity, create design systems, UI/UX improvements'
  },  {
    name: 'superduper-development-coach',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-development-coach',
    description: 'SuperDuper Agent: Developer mentoring and coaching',
    capabilities: ["Developer mentoring", "Code education", "Best practices", "Career guidance"],
    category: 'superduper',
    example_use: 'Mentor developers, teach best practices, provide career guidance'
  },  {
    name: 'superduper-domain-experts',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-domain-experts',
    description: 'SuperDuper Agent: Domain-specific expertise and consulting',
    capabilities: ["Domain expertise", "Technical consulting", "Industry knowledge", "Specialized advice"],
    category: 'superduper',
    example_use: 'Provide domain expertise, technical consulting, specialized guidance'
  },  {
    name: 'superduper-finance-investment',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-finance-investment',
    description: 'SuperDuper Agent: Financial planning and investment strategy',
    capabilities: ["Financial analysis", "Investment strategy", "Budget planning", "ROI optimization"],
    category: 'superduper',
    example_use: 'Analyze financial health, develop investment strategy, budget planning'
  },  {
    name: 'superduper-integration',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-integration',
    description: 'SuperDuper Agent: System integration and orchestration',
    capabilities: ["System integration", "API orchestration", "Service coordination", "Integration testing"],
    category: 'superduper',
    example_use: 'Integrate systems, orchestrate APIs, coordinate services'
  },  {
    name: 'superduper-research-intelligence',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-research-intelligence',
    description: 'SuperDuper Agent: Research and competitive intelligence',
    capabilities: ["Market research", "Competitive analysis", "Trend monitoring", "Intelligence gathering"],
    category: 'superduper',
    example_use: 'Conduct market research, analyze competitors, monitor trends'
  },  {
    name: 'superduper-social-viral',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-social-viral',
    description: 'SuperDuper Agent: Social media and viral marketing',
    capabilities: ["Viral campaigns", "Social media strategy", "Influencer outreach", "Engagement optimization"],
    category: 'superduper',
    example_use: 'Create viral campaigns, optimize social engagement, influencer partnerships'
  },  {
    name: 'eliza-intelligence-coordinator',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/eliza-intelligence-coordinator',
    description: 'Coordinates intelligence gathering and knowledge synthesis across all agents',
    capabilities: ["Intelligence coordination", "Knowledge synthesis", "Multi-agent orchestration"],
    category: 'autonomous',
    example_use: 'Coordinate intelligence across agents, synthesize knowledge, orchestrate workflows'
  },  {
    name: 'eliza-self-evaluation',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/eliza-self-evaluation',
    description: 'Self-evaluation and performance analysis for continuous improvement',
    capabilities: ["Performance analysis", "Self-evaluation", "Improvement recommendations"],
    category: 'autonomous',
    example_use: 'Analyze system performance, evaluate effectiveness, recommend improvements'
  },  {
    name: 'evaluate-community-idea',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/evaluate-community-idea',
    description: 'Evaluate community-submitted ideas for feasibility and impact',
    capabilities: ["Idea evaluation", "Feasibility analysis", "Impact assessment"],
    category: 'governance',
    example_use: 'Evaluate community proposals, assess feasibility, determine impact'
  },  {
    name: 'function-usage-analytics',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/function-usage-analytics',
    description: 'Analytics for edge function usage patterns and performance',
    capabilities: ["Usage analytics", "Performance tracking", "Pattern analysis"],
    category: 'monitoring',
    example_use: 'Analyze function usage, track performance, identify patterns'
  },  {
    name: 'list-function-proposals',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/list-function-proposals',
    description: 'List all edge function proposals and their status',
    capabilities: ["Proposal listing", "Status tracking", "Governance monitoring"],
    category: 'governance',
    example_use: 'List pending proposals, check proposal status, view voting history'
  },  {
    name: 'mobile-miner-config',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/mobile-miner-config',
    description: 'Configuration management for mobile mining devices',
    capabilities: ["Device configuration", "Mining settings", "Mobile optimization"],
    category: 'mining',
    example_use: 'Configure mobile miners, optimize settings, manage device profiles'
  },  {
    name: 'mobile-miner-register',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/mobile-miner-register',
    description: 'Registration system for mobile mining devices',
    capabilities: ["Device registration", "Miner onboarding", "Identity management"],
    category: 'mining',
    example_use: 'Register mobile miners, onboard new devices, manage identities'
  },  {
    name: 'mobile-miner-script',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/mobile-miner-script',
    description: 'Script distribution for mobile mining clients',
    capabilities: ["Script distribution", "Client updates", "Version management"],
    category: 'mining',
    example_use: 'Distribute mining scripts, push updates, manage versions'
  },  {
    name: 'opportunity-scanner',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/opportunity-scanner',
    description: 'Autonomous opportunity scanning and identification',
    capabilities: ["Opportunity detection", "Market scanning", "Trend analysis"],
    category: 'autonomous',
    example_use: 'Scan for opportunities, detect market trends, identify potential'
  },  {
    name: 'propose-new-edge-function',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/propose-new-edge-function',
    description: 'Submit new edge function proposals for council voting',
    capabilities: ["Proposal submission", "Governance workflow", "Council voting"],
    category: 'governance',
    example_use: 'Propose new functions, submit to council, initiate voting'
  },  {
    name: 'render-api',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/render-api',
    description: 'Render.com deployment management and monitoring',
    capabilities: ["Render deployment", "Service management", "Health monitoring"],
    category: 'deployment',
    example_use: 'Manage Render deployments, monitor services, check health'
  },  {
    name: 'system-knowledge-builder',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/system-knowledge-builder',
    description: 'Autonomous knowledge base construction and maintenance',
    capabilities: ["Knowledge construction", "Entity extraction", "Relationship building"],
    category: 'knowledge',
    example_use: 'Build knowledge base, extract entities, create relationships'
  },  {
    name: 'vote-on-proposal',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/vote-on-proposal',
    description: 'Cast votes on edge function and governance proposals',
    capabilities: ["Voting system", "Proposal evaluation", "Decision making"],
    category: 'governance',
    example_use: 'Vote on proposals, evaluate decisions, participate in governance'
  },  {
    name: 'superduper-router',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-router',
    description: 'Central router for all SuperDuper specialist agents',
    capabilities: ["Agent routing", "Request orchestration", "Load balancing"],
    category: 'superduper',
    example_use: 'Route to SuperDuper agents, orchestrate specialist requests'
  },
  // ============= VSCO WORKSPACE (CMS/Studio Management) =============
  {
    name: 'vsco-workspace',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/vsco-workspace',
    description: '📸 VSCO Workspace CMS - Full studio management: contacts, jobs, events, quotes, products, worksheets, notes, invoices, and calendar integration',
    capabilities: ['Contact management', 'Job management', 'Event scheduling', 'Product pricing', 'Quote creation', 'Worksheets/templates', 'Notes', 'Invoice management', 'Calendar integration', 'Pipeline analytics'],
    category: 'vsco',
    example_use: '{"action":"create_contact","data":{"firstName":"John","lastName":"Doe","email":"john@example.com"}}'
  },
  // ============= HUME AI (Emotional Intelligence) =============
  {
    name: 'hume-access-token',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/hume-access-token',
    description: '🎭 Hume EVI Access Token - Generate access tokens for Hume Empathic Voice Interface',
    capabilities: ['OAuth token generation', 'Client authentication', 'EVI voice access'],
    category: 'hume',
    example_use: 'Generate access token for Hume EVI voice chat integration'
  },
  {
    name: 'hume-expression-measurement',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/hume-expression-measurement',
    description: '🎭 Hume Expression Measurement - Analyze facial expressions and emotions',
    capabilities: ['Facial expression analysis', 'Emotion detection', 'Confidence scoring', 'Multi-face detection'],
    category: 'hume',
    example_use: '{"image":"base64_encoded_image"}'
  },
  {
    name: 'hume-tts',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/hume-tts',
    description: '🎭 Hume TTS - Empathic text-to-speech with emotional expression',
    capabilities: ['Emotional voice synthesis', 'Voice ID selection', 'Expressive audio generation'],
    category: 'hume',
    example_use: '{"text":"Hello","voiceId":"c7aa10be-..."}'
  },
  // ============= USER ACQUISITION =============
  {
    name: 'qualify-lead',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/qualify-lead',
    description: '💰 Lead Qualification - Score leads based on conversation signals',
    capabilities: ['Lead scoring', 'Signal processing', 'Budget detection', 'Urgency assessment'],
    category: 'acquisition',
    example_use: '{"session_key":"abc123","user_signals":{"mentioned_budget":true}}'
  },
  {
    name: 'identify-service-interest',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/identify-service-interest',
    description: '🎯 Service Interest Detection - Identify services a lead wants',
    capabilities: ['Service detection', 'Interest scoring', 'Multi-service tracking'],
    category: 'acquisition',
    example_use: '{"user_message":"I need mining help","session_key":"abc123"}'
  },
  {
    name: 'convert-session-to-user',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/convert-session-to-user',
    description: '👤 Session Conversion - Convert anonymous sessions to users',
    capabilities: ['User creation', 'Profile linking', 'Session migration'],
    category: 'acquisition',
    example_use: '{"session_key":"abc123","email":"user@example.com"}'
  },
  // ============= PAYMENTS =============
  {
    name: 'generate-stripe-link',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/generate-stripe-link',
    description: '💳 Stripe Payment Links - Generate payment links for upgrades',
    capabilities: ['Payment link generation', 'Checkout session', 'Tier pricing'],
    category: 'payments',
    example_use: '{"tier":"pro","email":"customer@example.com"}'
  },
  {
    name: 'stripe-payment-webhook',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/stripe-payment-webhook',
    description: '💳 Stripe Webhook - Process payments and auto-upgrade keys',
    capabilities: ['Payment verification', 'Webhook validation', 'Auto upgrade'],
    category: 'payments',
    example_use: 'Webhook endpoint for Stripe events'
  },
  // ============= AUTOMATION =============
  {
    name: 'suite-task-automation-engine',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/suite-task-automation-engine',
    description: '🤖 STAE - Task automation with templates and smart assignment',
    capabilities: ['Template-based tasks', 'Smart agent matching', 'Checklist management', 'Stage advancement'],
    category: 'automation',
    example_use: '{"action":"create_task_from_template","data":{"template_name":"bug_fix"}}'
  },
  {
    name: 'task-auto-advance',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/task-auto-advance',
    description: '⏩ Task Auto-Advance - Auto-advance tasks through pipeline',
    capabilities: ['Stage advancement', 'Threshold monitoring', 'Agent notification'],
    category: 'automation',
    example_use: 'Runs on cron to advance eligible tasks'
  },
  // ============= ADDITIONAL MONITORING =============
  {
    name: 'get-edge-function-logs',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/get-edge-function-logs',
    description: '📊 Edge Function Logs - Retrieve detailed logs',
    capabilities: ['Log retrieval', 'Error filtering', 'Time-based queries'],
    category: 'monitoring',
    example_use: '{"function_name":"github-integration","hours":24}'
  },
  {
    name: 'get-function-version-analytics',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/get-function-version-analytics',
    description: '📈 Function Version Analytics - Compare versions',
    capabilities: ['Version comparison', 'Regression detection', 'Performance metrics'],
    category: 'monitoring',
    example_use: '{"function_name":"lovable-chat","compare_versions":true}'
  },
  {
    name: 'sync-function-logs',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/sync-function-logs',
    description: '🔄 Sync Function Logs - Synchronize logs from Analytics',
    capabilities: ['Log synchronization', 'Backfill data', 'Version tracking'],
    category: 'monitoring',
    example_use: 'Runs on cron every 15 minutes'
  },
  {
    name: 'tool-usage-analytics',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/tool-usage-analytics',
    description: '📊 Tool Usage Analytics - Comprehensive tool analytics',
    capabilities: ['Tool success rates', 'Executive breakdowns', 'Error patterns'],
    category: 'monitoring',
    example_use: '{"time_period_hours":168}'
  },
  {
    name: 'query-edge-analytics',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/query-edge-analytics',
    description: '🔍 Query Edge Analytics - Query Supabase Analytics',
    capabilities: ['Analytics queries', 'Performance data', 'Usage patterns'],
    category: 'monitoring',
    example_use: '{"function_name":"github-integration","time_range":"24h"}'
  },
  {
    name: 'debug-analytics-data-flow',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/debug-analytics-data-flow',
    description: '🔍 Debug Analytics - Trace analytics data flow',
    capabilities: ['Data flow tracing', 'Gap identification', 'Pipeline debugging'],
    category: 'monitoring',
    example_use: 'Debug analytics pipeline issues'
  },
  // ============= ADDITIONAL GOVERNANCE =============
  {
    name: 'governance-phase-manager',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/governance-phase-manager',
    description: '⚖️ Governance Phase Manager - Timed voting phase transitions',
    capabilities: ['Phase transitions', 'Executive deadlines', 'Community voting'],
    category: 'governance',
    example_use: 'Manage governance voting phases'
  },
  {
    name: 'handle-rejected-proposal',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/handle-rejected-proposal',
    description: '❌ Handle Rejected Proposals - Generate improvement suggestions',
    capabilities: ['Rejection handling', 'Improvement suggestions', 'Feedback'],
    category: 'governance',
    example_use: '{"proposal_id":"uuid"}'
  },
  {
    name: 'execute-approved-proposal',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/execute-approved-proposal',
    description: '✅ Execute Approved Proposals - Finalize with code generation',
    capabilities: ['Code generation', 'Task creation', 'GitHub PR creation'],
    category: 'governance',
    example_use: '{"proposal_id":"uuid"}'
  },
  {
    name: 'request-executive-votes',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/request-executive-votes',
    description: '🗳️ Request Executive Votes - Trigger AI executives to vote',
    capabilities: ['Executive notification', 'Vote solicitation', 'Council coordination'],
    category: 'governance',
    example_use: '{"proposal_id":"uuid"}'
  },
  // ============= ADDITIONAL AUTONOMOUS =============
  {
    name: 'autonomous-decision-maker',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/autonomous-decision-maker',
    description: '🧠 Autonomous Decision Maker - AI-driven decisions',
    capabilities: ['Decision analysis', 'Impact assessment', 'Recommendations'],
    category: 'autonomous',
    example_use: '{"decision_type":"task_assignment","context":{...}}'
  },
  {
    name: 'deploy-approved-edge-function',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/deploy-approved-edge-function',
    description: '🚀 Deploy Edge Function - Deploy approved functions',
    capabilities: ['Function deployment', 'Config updates', 'Verification'],
    category: 'deployment',
    example_use: '{"proposal_id":"uuid"}'
  },
  // ============= EVENT SYSTEM =============
  {
    name: 'event-router',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/event-router',
    description: '📨 Event Router - Central webhook ingress',
    capabilities: ['Webhook validation', 'Event normalization', 'Logging'],
    category: 'ecosystem',
    example_use: 'Receives webhooks from GitHub, Vercel'
  },
  {
    name: 'event-dispatcher',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/event-dispatcher',
    description: '🎯 Event Dispatcher - Intelligent event routing',
    capabilities: ['Event routing', 'Action mapping', 'Workflow triggering'],
    category: 'ecosystem',
    example_use: '{"event_type":"github:push","payload":{...}}'
  },
  {
    name: 'usage-monitor',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/usage-monitor',
    description: '📊 Usage Monitor - Track API usage and quotas',
    capabilities: ['Usage tracking', 'Quota enforcement', 'Rate limiting'],
    category: 'monitoring',
    example_use: '{"api_key":"xmrt_pro_abc"}'
  }
];
