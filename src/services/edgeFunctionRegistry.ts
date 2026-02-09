import { supabase } from '@/integrations/supabase/client';

// Frontend Edge Function Registry - Synchronized with backend
// Total: 115+ functions across 18 categories

export interface EdgeFunctionCapability {
  name: string;
  url: string;
  description: string;
  capabilities: string[];
  category: 'ai' | 'mining' | 'web' | 'speech' | 'faucet' | 'ecosystem' | 'deployment' | 'github' | 'autonomous' | 'knowledge' | 'task-management' | 'monitoring' | 'code-execution' | 'database' | 'network' | 'superduper' | 'daemon' | 'governance' | 'research' | 'revenue' | 'vsco' | 'acquisition' | 'payments' | 'automation';
  example_use: string;
}

export const EDGE_FUNCTIONS_REGISTRY: EdgeFunctionCapability[] = [
  {
    name: 'lovable-chat',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/lovable-chat',
    description: '✅ PRIMARY AI - Model-agnostic chat via Lovable AI Gateway (Gemini 2.5 Flash default, Kimi K2 OpenRouter fallback, supports OpenAI GPT-5)',
    capabilities: ['Advanced AI chat', 'Context awareness', 'Multi-model support', 'Memory integration', 'Tool calling', 'Multi-step workflows'],
    category: 'ai',
    example_use: 'Main intelligent chat endpoint with full context and memory - use this for all AI chat needs'
  },
  {
    name: 'kimi-chat',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/kimi-chat',
    description: '✅ FALLBACK AI - Model-agnostic chat via Kimi k2 AI Gateway (OpenRouter API)',
    capabilities: ['Advanced AI chat', 'Context awareness', 'Multi-model support', 'Memory integration', 'Tool calling', 'Multi-step workflows'],
    category: 'ai',
    example_use: 'Fallback intelligent chat endpoint with full context and memory - use this for all AI chat needs when primary fails'
  },
  {
    name: 'gemini-chat',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/gemini-chat',
    description: '⚠️ LEGACY - Use lovable-chat instead. Kept for backward compatibility.',
    capabilities: ['AI conversation', 'Context-aware responses', 'Memory integration'],
    category: 'ai',
    example_use: 'DEPRECATED: Use lovable-chat with model parameter instead'
  },
  {
    name: 'openai-chat',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/openai-chat',
    description: '⚠️ LEGACY - Use lovable-chat instead. Kept for backward compatibility.',
    capabilities: ['AI conversation', 'OpenAI GPT-4/GPT-5', 'Fallback AI'],
    category: 'ai',
    example_use: 'DEPRECATED: Use lovable-chat with model parameter instead'
  },
  {
    name: 'deepseek-chat',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/deepseek-chat',
    description: '⚠️ LEGACY - Use lovable-chat instead. Kept for backward compatibility.',
    capabilities: ['Code generation', 'Technical reasoning', 'Code fixing'],
    category: 'ai',
    example_use: 'DEPRECATED: Use lovable-chat with model parameter instead'
  },
  {
    name: 'xmrt-mcp-server',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/xmrt-mcp-server',
    description: 'Model Context Protocol server for XMRT DAO Ecosystem - unified interface exposing all capabilities via standardized MCP protocol',
    capabilities: [
      'MCP protocol compliance (2025-06-18)',
      '25+ unified tools (AI, GitHub, mining, tasks, knowledge, Python)',
      'Real-time resource subscriptions',
      'Pre-configured prompt templates',
      'Cross-repository GitHub operations',
      'AI agent orchestration',
      'Knowledge base integration',
      'Mining & economics monitoring',
      'Task workflow management',
      'Python code execution',
      'System health monitoring'
    ],
    category: 'ecosystem',
    example_use: 'Connect AI agents (Claude Desktop, GPT-5, VS Code extensions) to entire XMRT ecosystem via standardized MCP protocol for seamless tool calling and resource access'
  },
  {
    name: 'playwright-browse',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/playwright-browse',
    description: 'Web browsing and scraping using Playwright automation',
    capabilities: ['Web browsing', 'Page scraping', 'Dynamic content extraction', 'JavaScript rendering'],
    category: 'web',
    example_use: 'Browse websites, extract data, interact with web pages, research real-time information'
  },
  {
    name: 'mining-proxy',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/mining-proxy',
    description: 'Unified mining statistics and worker management - combines pool stats from SupportXMR with worker registration',
    capabilities: [
      'Mining stats (hash rate, shares, earnings)',
      'Worker registration and tracking',
      'Per-worker statistics',
      'Worker-to-wallet mapping',
      'User session tracking',
      'XMR balance and payments'
    ],
    category: 'mining',
    example_use: 'Get comprehensive mining data including pool stats AND individual worker performance. Also handles mobile miner worker registration.'
  },
  {
    name: 'speech-to-text',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/speech-to-text',
    description: 'Convert speech audio to text',
    capabilities: ['Audio transcription', 'Voice input processing', 'Speech recognition'],
    category: 'speech',
    example_use: 'Process voice input from users for voice-based interactions'
  },
  {
    name: 'text-to-speech',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/text-to-speech',
    description: 'Convert text to speech audio',
    capabilities: ['Voice synthesis', 'Audio generation', 'TTS output'],
    category: 'speech',
    example_use: 'Generate voice responses for users'
  },
  {
    name: 'openai-tts',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/openai-tts',
    description: 'OpenAI high-quality text-to-speech',
    capabilities: ['Premium voice synthesis', 'Multiple voice models', 'High quality audio'],
    category: 'speech',
    example_use: 'Generate high-quality voice responses using OpenAI voices'
  },
  {
    name: 'check-faucet-eligibility',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/check-faucet-eligibility',
    description: 'Check if user is eligible for XMRT faucet claim',
    capabilities: ['Eligibility verification', 'Cooldown checking', 'User validation'],
    category: 'faucet',
    example_use: 'Verify if user can claim XMRT tokens from faucet'
  },
  {
    name: 'claim-faucet-tokens',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/claim-faucet-tokens',
    description: 'Process XMRT token faucet claims',
    capabilities: ['Token distribution', 'Claim processing', 'Transaction creation'],
    category: 'faucet',
    example_use: 'Help users claim free XMRT tokens from the faucet'
  },
  {
    name: 'get-faucet-stats',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/get-faucet-stats',
    description: 'Get XMRT faucet statistics and status',
    capabilities: ['Faucet statistics', 'Distribution data', 'Claim history'],
    category: 'faucet',
    example_use: 'Display faucet usage statistics and availability'
  },
  {
    name: 'ecosystem-webhook',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/ecosystem-webhook',
    description: 'Handle ecosystem events and webhooks',
    capabilities: ['Event processing', 'Webhook handling', 'System notifications'],
    category: 'ecosystem',
    example_use: 'Process ecosystem events and integrate with external services'
  },
  {
    name: 'conversation-access',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/conversation-access',
    description: 'Manage conversation persistence and history',
    capabilities: ['Session management', 'Message storage', 'Conversation retrieval'],
    category: 'ecosystem',
    example_use: 'Store and retrieve conversation history for perfect memory'
  },
  {
    name: 'render-api',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/render-api',
    description: 'Interface with Render deployment API',
    capabilities: ['Deployment status', 'System version tracking', 'Service monitoring'],
    category: 'deployment',
    example_use: 'Track XMRT Ecosystem deployment versions and status'
  },
  {
    name: 'vercel-manager',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/vercel-manager',
    description: 'Frontend (Vercel) communication and monitoring gateway - connects Eliza to the xmrtdao.vercel.app frontend',
    capabilities: ['Send webhooks to frontend', 'Check frontend health status', 'Notify frontend of backend changes', 'Get Vercel project information', 'Monitor frontend availability'],
    category: 'deployment',
    example_use: 'Send webhook notifications to frontend when backend events occur, monitor frontend health, coordinate backend-frontend integration'
  },
  {
    name: 'python-executor',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/python-executor',
    description: 'Execute Python code in a sandboxed environment',
    capabilities: ['Python code execution', 'Data analysis', 'Script automation', 'Web scraping with libraries'],
    category: 'ai',
    example_use: 'Run Python scripts for data processing, analysis, automation, or testing code snippets'
  },
  {
    name: 'github-integration',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/github-integration',
    description: '🔐 Complete GitHub OAuth integration using GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET. Supports 11 actions: list_issues, create_issue, comment_on_issue, list_discussions, create_discussion, get_repo_info, list_pull_requests, create_pull_request, get_file_content, commit_file, search_code',
    capabilities: ['GitHub OAuth authentication', 'Create/manage issues', 'Create PRs', 'Manage discussions', 'Commit files', 'Search code', 'Monitor repos', 'Repository info', 'Code search'],
    category: 'github',
    example_use: 'Use githubIntegrationService to create issues, manage PRs, commit code changes, search repository code with OAuth authentication'
  },
  {
    name: 'agent-manager',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/agent-manager',
    description: 'Spawn, manage, and delegate to AI agents in the ecosystem',
    capabilities: ['Spawn new agents', 'Assign tasks', 'Monitor agent workload', 'Update agent status', 'Log decisions'],
    category: 'task-management',
    example_use: 'Create specialized agents for complex tasks, delegate work, coordinate multi-agent workflows'
  },
  {
    name: 'extract-knowledge',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/extract-knowledge',
    description: 'Extracts structured knowledge entities from conversations',
    capabilities: ['Entity extraction', 'Knowledge graph building', 'Semantic analysis'],
    category: 'knowledge',
    example_use: 'Auto-extract facts and entities from chat messages'
  },
  {
    name: 'knowledge-manager',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/knowledge-manager',
    description: 'Manages the knowledge base and vector embeddings',
    capabilities: ['Vectorize text', 'Knowledge search', 'Data retrieval'],
    category: 'knowledge',
    example_use: 'Search the knowledge base for relevant information'
  },
  {
    name: 'summarize-conversation',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/summarize-conversation',
    description: 'Summarizes long conversations for context',
    capabilities: ['Text summarization', 'Context compression', 'Conversation analysis'],
    category: 'knowledge',
    example_use: 'Summarize chat history to provide context to AI models'
  },
  {
    name: 'task-orchestrator',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/task-orchestrator',
    description: 'Orchestrates complex multi-step tasks and workflows',
    capabilities: ['Task planning', 'Workflow execution', 'Dependency management'],
    category: 'task-management',
    example_use: 'Execute a sequence of dependent tasks to achieve a complex goal'
  },
  {
    name: 'system-diagnostics',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/system-diagnostics',
    description: 'Runs diagnostic checks on the ecosystem',
    capabilities: ['Health checks', 'Error detection', 'Performance monitoring'],
    category: 'monitoring',
    example_use: 'Run a full system health check to identify potential issues'
  },
  {
    name: 'system-health',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/system-health',
    description: 'Provides a summary of the system health status',
    capabilities: ['Status reporting', 'Health summary', 'Issue highlighting'],
    category: 'monitoring',
    example_use: 'Get a quick overview of the current system health'
  },
  {
    name: 'eliza-python-runtime',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/eliza-python-runtime',
    description: 'Python code execution environment for Eliza agents',
    capabilities: ['Sandboxed Python execution', 'Access to libraries', 'Custom script running'],
    category: 'code-execution',
    example_use: 'Execute Python code in a secure environment for agents'
  },
  {
    name: 'python-db-bridge',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/python-db-bridge',
    description: 'Bridge for Python scripts to interact with the Supabase database',
    capabilities: ['Database access from Python', 'Data manipulation', 'Query execution'],
    category: 'code-execution',
    example_use: 'Allow Python scripts to read and write data from the database'
  },
  {
    name: 'python-network-proxy',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/python-network-proxy',
    description: 'Proxy for Python scripts to make external network requests',
    capabilities: ['External API calls', 'Web scraping', 'Data fetching from internet'],
    category: 'code-execution',
    example_use: 'Enable Python scripts to access external web resources'
  },
  {
    name: 'function-usage-analytics',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/function-usage-analytics',
    description: 'Query historical edge function usage patterns and analytics. See which functions are used most, success rates, execution times, and common use cases across all executives.',
    capabilities: ['analytics', 'historical data', 'learning', 'function insights', 'executive performance'],
    category: 'monitoring',
    example_use: '{ "function_name": "github-integration", "time_period_hours": 168 }'
  },
  {
    name: 'propose-new-edge-function',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/propose-new-edge-function',
    description: 'Propose a new edge function to the Executive Council. Requires 3/4 approval for deployment.',
    capabilities: ['governance', 'consensus', 'autonomous expansion', 'capability proposal'],
    category: 'autonomous',
    example_use: '{ "function_name": "weather-api", "description": "Fetch weather data", "proposed_by": "CSO", "category": "external-api", "rationale": "Users need weather info", "use_cases": ["Travel planning", "Event scheduling"] }'
  },
  {
    name: 'vote-on-proposal',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/vote-on-proposal',
    description: 'Cast a vote on a pending edge function proposal. Executives vote approve/reject/abstain with reasoning.',
    capabilities: ['voting', 'consensus', 'governance', 'executive decision'],
    category: 'autonomous',
    example_use: '{ "proposal_id": "uuid", "executive_name": "CTO", "vote": "approve", "reasoning": "Technically sound and addresses real need" }'
  },
  {
    name: 'list-function-proposals',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/list-function-proposals',
    description: 'List all edge function proposals with their status and vote counts.',
    capabilities: ['governance', 'transparency', 'proposal tracking'],
    category: 'autonomous',
    example_use: '{ "status": "voting" }'
  },
  {
    name: 'mobile-miner-register',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/mobile-miner-register',
    description: 'Register a new mobile miner and generate unique worker ID and configuration.',
    capabilities: ['mining', 'registration', 'mobile', 'configuration'],
    category: 'mining',
    example_use: '{ "username": "alice_miner", "device_info": "Termux/Android" }'
  },
  {
    name: 'mobile-miner-config',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/mobile-miner-config',
    description: 'Generate XMRig configuration for a registered mobile miner.',
    capabilities: ['mining', 'configuration', 'mobile'],
    category: 'mining',
    example_use: '{ "user_number": "A1B2C3D4" }'
  },
  {
    name: 'mobile-miner-script',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/mobile-miner-script',
    description: 'Serve the mobile mining setup script that automates installation and configuration.',
    capabilities: ['mining', 'automation', 'mobile', 'setup'],
    category: 'mining',
    example_use: '{}'
  },
  // ============= VSCO WORKSPACE (CMS/Studio Management) =============
  {
    name: 'vsco-workspace',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/vsco-workspace',
    description: '📸 VSCO Workspace CMS - Full studio management: contacts, jobs, events, quotes, products, worksheets, notes, invoices, and calendar',
    capabilities: ['Contact management', 'Job management', 'Event scheduling', 'Product pricing', 'Quote creation', 'Worksheets/templates', 'Notes', 'Invoice management', 'Calendar integration', 'Pipeline analytics'],
    category: 'vsco',
    example_use: '{"action":"create_contact","data":{"firstName":"John","lastName":"Doe","email":"john@example.com"}}'
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
  {
    name: 'workflow-template-manager',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/workflow-template-manager',
    description: '🔄 Workflow Templates - Pre-built workflow templates for automation',
    capabilities: ['Template library', 'Workflow execution', 'Performance tracking'],
    category: 'automation',
    example_use: '{"action":"execute_template","data":{"template_name":"acquire_new_customer"}}'
  },
  // ============= SUPERDUPER AGENTS =============
  {
    name: 'superduper-router',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-router',
    description: '🚀 SuperDuper Router - Central router for specialist agents',
    capabilities: ['Agent routing', 'Request orchestration', 'Load balancing'],
    category: 'superduper',
    example_use: 'Route to SuperDuper agents'
  },
  {
    name: 'superduper-business-growth',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-business-growth',
    description: 'SuperDuper Agent: Business growth strategy',
    capabilities: ['Business strategy', 'Market analysis', 'Growth planning'],
    category: 'superduper',
    example_use: 'Analyze market opportunities'
  },
  {
    name: 'superduper-code-architect',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-code-architect',
    description: 'SuperDuper Agent: Software architecture',
    capabilities: ['Architecture design', 'Code review', 'System optimization'],
    category: 'superduper',
    example_use: 'Design system architecture'
  },
  {
    name: 'superduper-finance-investment',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-finance-investment',
    description: 'SuperDuper Agent: Financial planning',
    capabilities: ['Financial analysis', 'Investment strategy', 'Budget planning'],
    category: 'superduper',
    example_use: 'Analyze financial health'
  },
  {
    name: 'superduper-research-intelligence',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/superduper-research-intelligence',
    description: 'SuperDuper Agent: Research and intelligence',
    capabilities: ['Market research', 'Competitive analysis', 'Trend monitoring'],
    category: 'superduper',
    example_use: 'Conduct market research'
  },
  // ============= GOVERNANCE =============
  {
    name: 'governance-phase-manager',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/governance-phase-manager',
    description: '⚖️ Governance Phase Manager - Timed voting phase transitions',
    capabilities: ['Phase transitions', 'Executive deadlines', 'Community voting'],
    category: 'governance',
    example_use: 'Manage governance voting phases'
  },
  {
    name: 'evaluate-community-idea',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/evaluate-community-idea',
    description: 'Evaluate community ideas for feasibility',
    capabilities: ['Idea evaluation', 'Feasibility analysis', 'Impact assessment'],
    category: 'governance',
    example_use: 'Evaluate community proposals'
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
    name: 'handle-rejected-proposal',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/handle-rejected-proposal',
    description: '❌ Handle Rejected Proposals - Generate improvement suggestions',
    capabilities: ['Rejection handling', 'Improvement suggestions', 'Feedback'],
    category: 'governance',
    example_use: '{"proposal_id":"uuid"}'
  },
  // ============= MONITORING =============
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
  // ============= REVENUE =============
  {
    name: 'service-monetization-engine',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/service-monetization-engine',
    description: '💰 Service Monetization - API key generation and billing',
    capabilities: ['API key management', 'Usage tracking', 'Tiered pricing', 'Revenue analytics'],
    category: 'revenue',
    example_use: '{"action":"generate_api_key","data":{"service_name":"uspto-patent-mcp","tier":"pro"}}'
  },
  // ============= RESEARCH =============
  {
    name: 'uspto-patent-mcp',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/uspto-patent-mcp',
    description: 'USPTO Patent MCP - Search 11M+ patents, retrieve full text, download PDFs',
    capabilities: ['Patent search', 'Full text retrieval', 'PDF downloads', 'Portfolio analysis'],
    category: 'research',
    example_use: '{"method":"tools/call","params":{"name":"search_patents","arguments":{"query":"TTL/artificial intelligence"}}}'
  },
  // ============= AUTONOMOUS =============
  {
    name: 'autonomous-code-fixer',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/autonomous-code-fixer',
    description: 'Self-healing code execution - auto-fixes failed Python',
    capabilities: ['Auto-detect failures', 'Fix syntax errors', 'Re-execute code'],
    category: 'autonomous',
    example_use: 'Automatically fixes failed Python executions'
  },
  {
    name: 'autonomous-decision-maker',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/autonomous-decision-maker',
    description: '🧠 Autonomous Decision Maker - AI-driven decisions',
    capabilities: ['Decision analysis', 'Impact assessment', 'Recommendations'],
    category: 'autonomous',
    example_use: '{"decision_type":"task_assignment","context":{...}}'
  },
  {
    name: 'eliza-intelligence-coordinator',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/eliza-intelligence-coordinator',
    description: 'Coordinates intelligence across all agents',
    capabilities: ['Intelligence coordination', 'Knowledge synthesis', 'Multi-agent orchestration'],
    category: 'autonomous',
    example_use: 'Coordinate intelligence across agents'
  },
  {
    name: 'eliza-self-evaluation',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/eliza-self-evaluation',
    description: 'Self-evaluation for continuous improvement',
    capabilities: ['Performance analysis', 'Self-evaluation', 'Improvement recommendations'],
    category: 'autonomous',
    example_use: 'Analyze system performance'
  },
  {
    name: 'morning-discussion-post',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/morning-discussion-post',
    description: '🌅 Morning Discussion - Generate daily discussion topics',
    capabilities: ['Automated posting', 'Content generation', 'Scheduling'],
    category: 'autonomous',
    example_use: 'Generate morning discussion on GitHub'
  },
  {
    name: 'evening-summary-post',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/evening-summary-post',
    description: '🌆 Evening Summary - Generate daily summary reports',
    capabilities: ['Automated posting', 'Content generation', 'Summary'],
    category: 'autonomous',
    example_use: 'Generate evening summary on GitHub'
  },
  {
    name: 'weekly-retrospective-post',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/weekly-retrospective-post',
    description: '📅 Weekly Retrospective - Generate weekly retrospective',
    capabilities: ['Automated posting', 'Content generation', 'Retrospective'],
    category: 'autonomous',
    example_use: 'Generate weekly retrospective on GitHub'
  },
  {
    name: 'progress-update-post',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/progress-update-post',
    description: '📢 Progress Updates - Generate progress update posts',
    capabilities: ['Automated posting', 'Progress tracking', 'Updates'],
    category: 'autonomous',
    example_use: 'Generate progress updates on GitHub'
  },
  {
    name: 'opportunity-scanner',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/opportunity-scanner',
    description: 'Autonomous opportunity scanning and identification',
    capabilities: ['Opportunity detection', 'Market scanning', 'Trend analysis'],
    category: 'autonomous',
    example_use: 'Scan for market opportunities'
  },
  // ============= ECOSYSTEM =============
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
    name: 'xmrt-mcp-server',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/xmrt-mcp-server',
    description: 'XMRT MCP Server - Model Context Protocol server',
    capabilities: ['MCP protocol', '25+ unified tools', 'Resource subscriptions', 'Prompt templates'],
    category: 'ecosystem',
    example_use: 'Connect AI agents via MCP protocol'
  },
  // ============= DATABASE =============
  {
    name: 'redis-cache',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/redis-cache',
    description: 'Upstash Redis caching for API responses and rate limiting',
    capabilities: ['Get/Set cache', 'TTL management', 'Rate limiting'],
    category: 'database',
    example_use: '{"action":"get","key":"ecosystem_health"}'
  },
  {
    name: 'schema-manager',
    url: 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/schema-manager',
    description: 'Database schema and migrations management',
    capabilities: ['Schema management', 'Migrations', 'Data access'],
    category: 'database',
    example_use: 'Manage database schema'
  }
];

export async function searchEdgeFunctions(query: string): Promise<EdgeFunctionCapability[]> {
  if (!query) {
    return EDGE_FUNCTIONS_REGISTRY;
  }

  const lowerCaseQuery = query.toLowerCase();

  const filteredFunctions = EDGE_FUNCTIONS_REGISTRY.filter(fn => {
    const { name, description, capabilities, category, example_use } = fn;

    return (
      name.toLowerCase().includes(lowerCaseQuery) ||
      description.toLowerCase().includes(lowerCaseQuery) ||
      capabilities.some(cap => cap.toLowerCase().includes(lowerCaseQuery)) ||
      category.toLowerCase().includes(lowerCaseQuery) ||
      example_use.toLowerCase().includes(lowerCaseQuery)
    );
  });

  return filteredFunctions;
}

export async function getFunctionByName(name: string): Promise<EdgeFunctionCapability | undefined> {
  return EDGE_FUNCTIONS_REGISTRY.find(fn => fn.name === name);
}

export async function invokeEdgeFunction(functionName: string, body: any, headers?: Record<string, string>) {
  const fn = await getFunctionByName(functionName);

  if (!fn) {
    throw new Error(`Function "${functionName}" not found in registry.`);
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: body,
    headers: headers
  });

  if (error) {
    throw new Error(`Error invoking ${functionName}: ${error.message}`);
  }

  return data;
}
