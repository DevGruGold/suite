import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ========== ENVIRONMENT CONFIGURATION ==========
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// API Keys - all from environment
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || '';
const VERTEX_AI_PROJECT_ID = Deno.env.get('VERTEX_AI_PROJECT_ID') || '';

// Executive Configuration
const EXECUTIVE_NAME = Deno.env.get('EXECUTIVE_NAME') || 'Eliza';
const EXECUTIVE_ROLE = Deno.env.get('EXECUTIVE_ROLE') || 'General Intelligence Agent for XMRT-DAO';
const FUNCTION_NAME = Deno.env.get('FUNCTION_NAME') || 'ai-chat';
const NODE_ENV = Deno.env.get('NODE_ENV') || 'development';

// GitHub Configuration
const GITHUB_OWNER = Deno.env.get('GITHUB_OWNER') || 'DevGruGold';
const GITHUB_REPO = Deno.env.get('GITHUB_REPO') || 'XMRT-Ecosystem';

// Performance Configuration
const MAX_TOOL_ITERATIONS = parseInt(Deno.env.get('MAX_TOOL_ITERATIONS') || '5');
const CACHE_TTL_MINUTES = parseInt(Deno.env.get('CACHE_TTL_MINUTES') || '5');
const MAX_CASCADE_RETRIES = parseInt(Deno.env.get('MAX_CASCADE_RETRIES') || '3');
const DEFAULT_MODEL = Deno.env.get('DEFAULT_MODEL') || 'gpt-4o-mini';

// ========== HARD-CODED CASCADING PROVIDER CONFIGURATION ==========
const HARDCODED_CASCADE_ORDER = 'gemini,deepseek,openai,anthropic,kimi';
const CASCADE_TIMEOUT_MS = parseInt(Deno.env.get('CASCADE_TIMEOUT_MS') || '30000');

// ========== DATABASE SCHEMA CONFIGURATION ==========
const DATABASE_CONFIG = {
  tables: {
    agents: 'agents',
    tasks: 'tasks',
    executive_feedback: 'executive_feedback',
    function_usage_logs: 'function_usage_logs',
    knowledge_base: 'knowledge_entities',
    workflow_templates: 'workflow_templates',
    service_api_keys: 'service_api_keys',
    user_profiles: 'user_profiles',
    vsco_jobs: 'vsco_jobs',
    vsco_contacts: 'vsco_contacts',
    corporate_licenses: 'corporate_license_applications',
    ai_tools: 'ai_tools'
  },
  
  agentStatuses: ['IDLE', 'BUSY', 'ARCHIVED', 'ERROR', 'OFFLINE'] as const,
  taskStatuses: ['PENDING', 'CLAIMED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED', 'COMPLETED', 'FAILED'] as const,
  taskStages: ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE'] as const,
  taskCategories: ['code', 'infra', 'research', 'governance', 'mining', 'device', 'ops', 'other'] as const,
  apiKeyTiers: ['free', 'basic', 'pro', 'enterprise'] as const
};

// ========== AI PROVIDER CONFIGURATION ==========
interface AIProviderConfig {
  name: string;
  enabled: boolean;
  apiKey: string;
  endpoint?: string;
  models: string[];
  supportsTools: boolean;
  timeoutMs: number;
  priority: number;
  fallbackOnly: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

const AI_PROVIDERS_CONFIG: Record<string, AIProviderConfig> = {
  openai: {
    name: 'OpenAI',
    enabled: !!OPENAI_API_KEY,
    apiKey: OPENAI_API_KEY,
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    supportsTools: true,
    timeoutMs: 30000,
    priority: 3,
    fallbackOnly: false,
    maxRetries: 2,
    retryDelayMs: 1000
  },
  gemini: {
    name: 'Google Gemini',
    enabled: !!GEMINI_API_KEY,
    apiKey: GEMINI_API_KEY,
    endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent`,
    models: ['gemini-2.0-flash-exp', 'gemini-2.0-flash', 'gemini-1.5-flash'],
    supportsTools: true,
    timeoutMs: 30000,
    priority: 1,
    fallbackOnly: false,
    maxRetries: 2,
    retryDelayMs: 2000
  },
  deepseek: {
    name: 'DeepSeek',
    enabled: !!DEEPSEEK_API_KEY,
    apiKey: DEEPSEEK_API_KEY,
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    models: ['deepseek-chat', 'deepseek-coder'],
    supportsTools: true,
    timeoutMs: 30000,
    priority: 2,
    fallbackOnly: false,
    maxRetries: 2,
    retryDelayMs: 1500
  },
  anthropic: {
    name: 'Anthropic Claude',
    enabled: !!ANTHROPIC_API_KEY,
    apiKey: ANTHROPIC_API_KEY,
    endpoint: 'https://api.anthropic.com/v1/messages',
    models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229'],
    supportsTools: true,
    timeoutMs: 45000,
    priority: 4,
    fallbackOnly: false,
    maxRetries: 1,
    retryDelayMs: 2000
  },
  kimi: {
    name: 'Kimi (Moonshot)',
    enabled: !!OPENROUTER_API_KEY,
    apiKey: OPENROUTER_API_KEY,
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    models: ['moonshotai/kimi-k2'],
    supportsTools: true,
    timeoutMs: 35000,
    priority: 5,
    fallbackOnly: true,
    maxRetries: 1,
    retryDelayMs: 3000
  }
};

// ========== SHARED EXECUTIVE HELPER FUNCTIONS ==========
export const TOOL_CALLING_MANDATE = `
🚨 CRITICAL TOOL CALLING RULES:
1. When the user asks for data/status/metrics, you MUST call tools using the native function calling mechanism
2. DO NOT describe tool calls in text. DO NOT say "I will call..." or "Let me check..."
3. DIRECTLY invoke functions - the system will handle execution
4. Available critical tools: get_mining_stats, get_system_status, get_ecosystem_metrics, invoke_edge_function, search_knowledge, recall_entity, vertex_generate_image, vertex_generate_video, vertex_check_video_status
5. If you need current data, ALWAYS use tools. Never guess or make up data.
6. After tool execution, synthesize results into natural language - never show raw JSON to users.

🖼️ IMAGE GENERATION (MANDATORY):
- When user asks to CREATE/GENERATE/MAKE/DRAW an IMAGE → IMMEDIATELY call vertex_generate_image({prompt: "detailed description"})
- DO NOT say "I cannot generate images" - YOU CAN via Vertex AI
- DO NOT say "I'm just an LLM" - you have image generation capabilities

🎬 VIDEO GENERATION (MANDATORY):
- When user asks to CREATE/GENERATE/MAKE a VIDEO → IMMEDIATELY call vertex_generate_video({prompt: "description", duration_seconds: 5})
- Returns operation_name for async status checking
- Check status with vertex_check_video_status({operation_name: "..."})
`;

// Parser for DeepSeek's text-based tool call format
export function parseDeepSeekToolCalls(content: string): Array<any> | null {
  const toolCallsMatch = content.match(/<｜tool▁calls▁begin｜>(.*?)<｜tool▁calls▁end｜>/s);
  if (!toolCallsMatch) return null;
  
  const toolCallsText = toolCallsMatch[1];
  const toolCallPattern = /<｜tool▁call▁begin｜>(.*?)<｜tool▁sep｜>(.*?)<｜tool▁call▁end｜>/gs;
  const toolCalls: Array<any> = [];
  
  let match;
  while ((match = toolCallPattern.exec(toolCallsText)) !== null) {
    const functionName = match[1].trim();
    let args = match[2].trim();
    
    let parsedArgs = {};
    if (args && args !== '{}') {
      try {
        parsedArgs = JSON.parse(args);
      } catch (e) {
        console.warn(`Failed to parse DeepSeek tool args for ${functionName}:`, args);
      }
    }
    
    toolCalls.push({
      id: `deepseek_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: 'function',
      function: {
        name: functionName,
        arguments: JSON.stringify(parsedArgs)
      }
    });
  }
  
  return toolCalls.length > 0 ? toolCalls : null;
}

// Parser for Gemini/Kimi tool_code block format
export function parseToolCodeBlocks(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  
  const toolCodeRegex = /```tool_code\s*\n?([\s\S]*?)```/g;
  let match;
  
  while ((match = toolCodeRegex.exec(content)) !== null) {
    const code = match[1].trim();
    
    // Parse invoke_edge_function({ function_name: "...", payload: {...} })
    const invokeMatch = code.match(/invoke_edge_function\s*\(\s*\{([\s\S]*?)\}\s*\)/);
    if (invokeMatch) {
      try {
        let argsStr = `{${invokeMatch[1]}}`;
        argsStr = argsStr.replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"').replace(/""+/g, '"');
        const args = JSON.parse(argsStr);
        toolCalls.push({
          id: `tool_code_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: { name: 'invoke_edge_function', arguments: JSON.stringify(args) }
        });
      } catch (e) {
        console.warn('Failed to parse invoke_edge_function from tool_code:', e.message);
      }
      continue;
    }
    
    // Parse direct function calls like check_system_status({}) or system_status()
    const directMatch = code.match(/(\w+)\s*\(\s*(\{[\s\S]*?\})?\s*\)/);
    if (directMatch) {
      const funcName = directMatch[1];
      let argsStr = directMatch[2] || '{}';
      try {
        argsStr = argsStr.replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"').replace(/""+/g, '"');
        const parsedArgs = JSON.parse(argsStr);
        toolCalls.push({
          id: `tool_code_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: { name: funcName, arguments: JSON.stringify(parsedArgs) }
        });
      } catch (e) {
        console.warn(`Failed to parse ${funcName} from tool_code:`, e.message);
      }
    }
  }
  
  return toolCalls.length > 0 ? toolCalls : null;
}

// Parse conversational tool intent (e.g., "I'm going to call get_mining_stats")
export function parseConversationalToolIntent(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  const patterns = [
    /(?:call(?:ing)?|use|invoke|execute|run|check(?:ing)?)\s+(?:the\s+)?(?:function\s+|tool\s+)?[`"']?(\w+)[`"']?/gi,
    /let me (?:call|check|get|invoke)\s+[`"']?(\w+)[`"']?/gi,
    /I(?:'ll| will) (?:call|invoke|use)\s+[`"']?(\w+)[`"']?/gi
  ];
  
  const knownTools = [
    'get_mining_stats', 'get_system_status', 'get_ecosystem_metrics', 
    'search_knowledge', 'recall_entity', 'invoke_edge_function', 
    'get_edge_function_logs', 'get_agent_status', 'list_agents', 'list_tasks'
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const funcName = match[1];
      if (knownTools.includes(funcName) && !toolCalls.find(t => t.function.name === funcName)) {
        toolCalls.push({
          id: `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: { name: funcName, arguments: '{}' }
        });
      }
    }
  }
  return toolCalls.length > 0 ? toolCalls : null;
}

// Detect if query needs data (should force tool calls)
export function needsDataRetrieval(messages: any[]): boolean {
  const lastUser = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || '';
  
  const dataKeywords = [
    'what is', 'what\'s', 'what are', 'who is', 'who are', 'where is', 'when is',
    'how is', 'how are', 'how much', 'how many', 'why is', 'why are',
    'show me', 'tell me', 'give me', 'fetch', 'get', 'list', 'find', 'search',
    'check', 'analyze', 'run', 'execute', 'perform', 'scan', 'diagnose',
    'look up', 'lookup', 'retrieve', 'query', 'pull', 'grab',
    'status', 'health', 'stats', 'statistics', 'metrics', 'analytics',
    'performance', 'report', 'overview', 'summary', 'dashboard',
    'current', 'recent', 'latest', 'today', 'now', 'real-time', 'realtime', 'live',
    'mining', 'hashrate', 'workers', 'agents', 'tasks', 'ecosystem',
    'proposals', 'governance', 'cron', 'functions', 'logs', 'activity',
    'recall', 'remember', 'stored', 'saved', 'previous', 'history',
    'compare', 'between', 'vs', 'versus', 'difference',
    'count', 'total', 'number', 'amount', 'percentage', 'rate',
    'create', 'generate', 'make', 'draw', 'design', 'render', 'illustrate',
    'visualize', 'picture', 'image', 'video', 'animate', 'animation',
    'photo', 'artwork', 'graphic', 'clip', 'film', 'scene'
  ];
  
  const hasQuestionMark = lastUser.includes('?');
  const imperativePatterns = /^(show|tell|give|get|list|find|check|run|execute|analyze|fetch|retrieve|scan|diagnose|look|pull)/i;
  const startsWithImperative = imperativePatterns.test(lastUser.trim());
  
  return hasQuestionMark || startsWithImperative || dataKeywords.some(k => lastUser.includes(k));
}

// Convert OpenAI tool format to Gemini function declaration format
export function convertToolsToGeminiFormat(tools: any[]): any[] {
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters
  }));
}

// Retrieve memory contexts from database (server-side fallback)
export async function retrieveMemoryContexts(supabase: any, sessionKey: string): Promise<any[]> {
  if (!sessionKey) return [];
  
  console.log('📚 Retrieving memory contexts server-side...');
  try {
    const { data: serverMemories } = await supabase
      .from('memory_contexts')
      .select('context_type, content, importance_score')
      .or(`user_id.eq.${sessionKey},session_id.eq.${sessionKey}`)
      .order('importance_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30);
    
    if (serverMemories && serverMemories.length > 0) {
      console.log(`✅ Retrieved ${serverMemories.length} memory contexts`);
      return serverMemories.map(m => ({
        type: m.context_type,
        content: m.content?.slice?.(0, 500) || String(m.content).slice(0, 500),
        score: m.importance_score
      }));
    }
  } catch (error) {
    console.warn('⚠️ Failed to retrieve memory contexts:', error.message);
  }
  return [];
}

// ========== CORS HEADERS ==========
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// ========== COMPREHENSIVE TOOL DEFINITIONS ==========
const ELIZA_TOOLS = [
  // ========== 🚀 STAE - SUITE TASK AUTOMATION ENGINE TOOLS ==========
  {
    type: 'function',
    function: {
      name: 'create_task_from_template',
      description: '📋 Create a new task using a predefined template',
      parameters: {
        type: 'object',
        properties: {
          template_name: { 
            type: 'string', 
            enum: ['code_review', 'bug_fix', 'feature_implementation', 'infrastructure_check', 'deployment_pipeline', 'research_analysis', 'proposal_evaluation', 'operations_task', 'system_health_investigation', 'mining_optimization', 'device_integration']
          },
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Optional: Override template description' },
          priority: { type: 'number', description: 'Optional: Override default priority (1-10)' },
          auto_assign: { type: 'boolean', description: 'Automatically assign to best-matching agent' }
        },
        required: ['template_name', 'title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'smart_assign_task',
      description: '🤖 Intelligently assign a task to the best-matching agent',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'UUID of the task to assign' },
          prefer_agent_id: { type: 'string', description: 'Optional: Prefer this agent' },
          min_skill_match: { type: 'number', description: 'Minimum skill overlap required (0-1)' }
        },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task_checklist',
      description: '✅ Update a task checklist item status',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'UUID of the task' },
          item_index: { type: 'number', description: 'Index of checklist item' },
          item_text: { type: 'string', description: 'Alternative: exact text of checklist item' },
          completed: { type: 'boolean', description: 'Whether item is completed' }
        },
        required: ['task_id', 'completed']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'advance_task_stage',
      description: '⏩ Manually advance a task to the next pipeline stage',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'UUID of the task to advance' },
          target_stage: { 
            type: 'string', 
            enum: ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE'],
            description: 'Optional: specific stage to advance to'
          }
        },
        required: ['task_id']
      }
    }
  },

  // ========== 🤖 AGENT MANAGEMENT TOOLS ==========
  {
    type: 'function',
    function: {
      name: 'list_agents',
      description: 'Get all existing agents and their IDs/status',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'spawn_agent',
      description: 'Create a new specialized agent',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Agent name' },
          role: { type: 'string', description: 'Agent role/specialization' },
          skills: { type: 'array', items: { type: 'string' }, description: 'Array of agent skills' }
        },
        required: ['name', 'role', 'skills']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_agent_status',
      description: 'Change agent status',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'Agent ID' },
          status: { 
            type: 'string', 
            enum: ['IDLE', 'BUSY', 'ARCHIVED', 'ERROR', 'OFFLINE'],
            description: 'New agent status'
          }
        },
        required: ['agent_id', 'status']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'assign_task',
      description: 'Create and assign a task to an agent',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Task description' },
          repo: { type: 'string', description: 'Repository name' },
          category: { 
            type: 'string', 
            enum: ['code', 'infra', 'research', 'governance', 'mining', 'device', 'ops', 'other'],
            description: 'Task category'
          },
          stage: { 
            type: 'string', 
            enum: ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE'],
            description: 'Pipeline stage'
          },
          assignee_agent_id: { type: 'string', description: 'Agent ID to assign to' },
          priority: { type: 'number', description: 'Priority 1-10' }
        },
        required: ['title', 'description', 'category', 'assignee_agent_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task_status',
      description: 'Update task status and stage',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID' },
          status: { 
            type: 'string', 
            enum: ['PENDING', 'CLAIMED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED', 'COMPLETED', 'FAILED']
          },
          stage: { 
            type: 'string', 
            enum: ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE']
          },
          blocking_reason: { type: 'string', description: 'Reason for blocking' }
        },
        required: ['task_id', 'status']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Get all tasks and their status/assignments',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mark_task_complete',
      description: 'Mark a task as completed',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to mark complete' },
          completion_notes: { type: 'string', description: 'Notes about task completion' }
        },
        required: ['task_id']
      }
    }
  },

  // ========== 🐙 GITHUB INTEGRATION TOOLS ==========
  {
    type: 'function',
    function: {
      name: 'createGitHubIssue',
      description: 'Create a GitHub issue with executive attribution',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue description (supports Markdown)' },
          repo: { type: 'string', description: 'Repository name', default: 'XMRT-Ecosystem' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Optional labels' },
          executive: {
            type: 'string',
            enum: ['cso', 'cto', 'cio', 'cao', 'eliza', 'council'],
            description: 'Which executive is authoring'
          }
        },
        required: ['title', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listGitHubIssues',
      description: 'List recent GitHub issues',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
          limit: { type: 'number', description: 'Number of issues to return', default: 20 }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createGitHubDiscussion',
      description: 'Create a GitHub discussion post with executive attribution',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Discussion title' },
          body: { type: 'string', description: 'Discussion content (supports Markdown)' },
          categoryId: { 
            type: 'string', 
            default: 'DIC_kwDOPHeChc4CkXxI'
          },
          executive: {
            type: 'string',
            enum: ['cso', 'cto', 'cio', 'cao', 'eliza', 'council'],
            description: 'Which executive is authoring'
          }
        },
        required: ['title', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'commentOnGitHubIssue',
      description: 'Add a comment to an existing GitHub issue',
      parameters: {
        type: 'object',
        properties: {
          issue_number: { type: 'number', description: 'Issue number to comment on' },
          comment: { type: 'string', description: 'Comment content' },
          repo: { type: 'string', description: 'Repository name', default: 'XMRT-Ecosystem' },
          executive: {
            type: 'string',
            enum: ['cso', 'cto', 'cio', 'cao', 'eliza', 'council'],
            description: 'Which executive is authoring'
          }
        },
        required: ['issue_number', 'comment']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getGitHubFileContent',
      description: 'Get the content of a file from GitHub',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name', default: 'XMRT-Ecosystem' },
          path: { type: 'string', description: 'File path in repository' },
          ref: { type: 'string', description: 'Branch or commit SHA', default: 'main' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchGitHubCode',
      description: 'Search for code across the repository',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name', default: 'XMRT-Ecosystem' },
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'commitGitHubFile',
      description: 'Create or update a file in GitHub',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name', default: 'XMRT-Ecosystem' },
          path: { type: 'string', description: 'File path to create/update' },
          content: { type: 'string', description: 'File content to write' },
          message: { type: 'string', description: 'Commit message' },
          branch: { type: 'string', description: 'Branch to commit to', default: 'main' },
          sha: { type: 'string', description: 'Current file SHA (required for updates)' }
        },
        required: ['path', 'content', 'message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_github_commits',
      description: 'List recent commits from a repository',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name', default: 'XMRT-Ecosystem' },
          author: { type: 'string', description: 'Filter by commit author' },
          since: { type: 'string', description: 'Only commits after this date' },
          until: { type: 'string', description: 'Only commits before this date' },
          per_page: { type: 'number', description: 'Results per page', default: 30 }
        }
      }
    }
  },

  // ========== 🧠 KNOWLEDGE MANAGEMENT TOOLS ==========
  {
    type: 'function',
    function: {
      name: 'store_knowledge',
      description: 'Store a new knowledge entity in the knowledge base',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the knowledge entity' },
          type: { 
            type: 'string', 
            enum: ['concept', 'tool', 'skill', 'person', 'project', 'feature', 'fact', 'general']
          },
          description: { type: 'string', description: 'Detailed description' },
          metadata: { type: 'object', description: 'Optional additional metadata' },
          confidence: { type: 'number', description: 'Confidence score 0-1' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: 'Search the knowledge base to recall stored entities',
      parameters: {
        type: 'object',
        properties: {
          search_term: { type: 'string', description: 'Entity name or text to search for' },
          entity_type: { type: 'string', description: 'Filter by entity type' },
          min_confidence: { type: 'number', description: 'Minimum confidence score' },
          limit: { type: 'number', description: 'Maximum results to return', default: 20 }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recall_entity',
      description: 'Find a previously stored entity by its name',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the entity to recall' }
        },
        required: ['name']
      }
    }
  },

  // ========== 🔍 SYSTEM DIAGNOSTICS & ANALYTICS ==========
  {
    type: 'function',
    function: {
      name: 'check_system_status',
      description: 'Get comprehensive ecosystem status report',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_my_feedback',
      description: 'Retrieve feedback about recent tool calls and learning points',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of feedback items', default: 10 },
          unacknowledged_only: { type: 'boolean', description: 'Only show unread feedback', default: true },
          acknowledge_ids: { type: 'array', items: { type: 'string' }, description: 'Feedback IDs to mark as acknowledged' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_function_usage_analytics',
      description: 'Get comprehensive analytics for edge function usage',
      parameters: {
        type: 'object',
        properties: {
          function_name: { type: 'string', description: 'Filter to specific function' },
          time_window_hours: { type: 'number', description: 'Time window for analysis', default: 24 },
          group_by: { 
            type: 'string', 
            enum: ['function', 'category', 'executive', 'hour'],
            default: 'function'
          }
        }
      }
    }
  },

  // ========== 🐍 CODE EXECUTION TOOLS ==========
  {
    type: 'function',
    function: {
      name: 'execute_python',
      description: '⚠️ PURE COMPUTATION ONLY - NO NETWORK ACCESS! Execute Python code for calculations, data processing, JSON manipulation only.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code for PURE COMPUTATION ONLY' },
          purpose: { type: 'string', description: 'Brief description of what this code does' }
        },
        required: ['code', 'purpose']
      }
    }
  },

  // ========== 🌐 UNIVERSAL EDGE FUNCTION INVOKER ==========
  {
    type: 'function',
    function: {
      name: 'invoke_edge_function',
      description: 'Call ANY Supabase edge function dynamically',
      parameters: {
        type: 'object',
        properties: {
          function_name: { 
            type: 'string', 
            description: 'Name of the edge function to invoke'
          },
          payload: { 
            type: 'object', 
            description: 'JSON payload to send to the function'
          }
        },
        required: ['function_name', 'payload']
      }
    }
  },

  // ========== 📸 VSCO WORKSPACE TOOLS ==========
  {
    type: 'function',
    function: {
      name: 'vsco_manage_jobs',
      description: '📸 Manage leads and jobs in VSCO Workspace',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['list_jobs', 'get_job', 'create_job', 'update_job', 'close_job', 'sync_jobs']
          },
          job_id: { type: 'string', description: 'VSCO job ID' },
          name: { type: 'string', description: 'Job/lead name' },
          stage: { 
            type: 'string', 
            enum: ['lead', 'booked', 'fulfillment', 'completed']
          },
          lead_rating: { type: 'number', description: 'Lead quality rating 1-5' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vsco_manage_contacts',
      description: '📇 Manage contacts in VSCO Workspace CRM',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['list_contacts', 'get_contact', 'create_contact', 'update_contact', 'sync_contacts']
          },
          contact_id: { type: 'string', description: 'VSCO contact ID' },
          kind: { type: 'string', enum: ['person', 'company', 'location'] },
          first_name: { type: 'string', description: 'First name' },
          last_name: { type: 'string', description: 'Last name' },
          email: { type: 'string', description: 'Email address' }
        },
        required: ['action']
      }
    }
  },

  // ========== 💰 REVENUE GENERATION TOOLS ==========
  {
    type: 'function',
    function: {
      name: 'generate_service_api_key',
      description: 'Generate a new API key for a monetized service with tiered access',
      parameters: {
        type: 'object',
        properties: {
          service_name: { type: 'string', description: 'Service to monetize' },
          tier: { type: 'string', enum: ['free', 'basic', 'pro', 'enterprise'] },
          owner_email: { type: 'string', format: 'email', description: 'Customer email' },
          owner_name: { type: 'string', description: 'Customer name' }
        },
        required: ['service_name', 'tier', 'owner_email']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'validate_service_api_key',
      description: 'Check if an API key is valid, active, and has remaining quota',
      parameters: {
        type: 'object',
        properties: {
          api_key: { type: 'string', description: 'API key to validate' }
        },
        required: ['api_key']
      }
    }
  },

  // ========== 🎯 CONVERSATIONAL USER ACQUISITION TOOLS ==========
  {
    type: 'function',
    function: {
      name: 'qualify_lead',
      description: 'Score a potential customer based on conversation signals',
      parameters: {
        type: 'object',
        properties: {
          session_key: { type: 'string', description: 'Current conversation session key' },
          user_signals: {
            type: 'object',
            properties: {
              mentioned_budget: { type: 'boolean' },
              has_urgent_need: { type: 'boolean' },
              company_mentioned: { type: 'string' },
              use_case_complexity: { type: 'string', enum: ['simple', 'moderate', 'complex'] }
            }
          }
        },
        required: ['session_key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_user_profile_from_session',
      description: 'Convert anonymous session to identified user profile',
      parameters: {
        type: 'object',
        properties: {
          session_key: { type: 'string', description: 'Current session key' },
          email: { type: 'string', format: 'email', description: 'User email address' }
        },
        required: ['session_key', 'email']
      }
    }
  },

  // ========== 🔄 WORKFLOW TEMPLATE TOOLS ==========
  {
    type: 'function',
    function: {
      name: 'execute_workflow_template',
      description: 'Execute a pre-built workflow template by name',
      parameters: {
        type: 'object',
        properties: {
          template_name: { 
            type: 'string', 
            enum: [
              'acquire_new_customer', 'upsell_existing_customer', 'monthly_billing_cycle', 'churn_prevention',
              'content_campaign', 'influencer_outreach', 'treasury_health_check', 'execute_buyback',
              'auto_fix_codebase', 'code_quality_audit', 'automated_testing_pipeline',
              'modify_edge_function', 'performance_optimization_cycle', 'database_optimization_workflow',
              'documentation_generation_workflow', 'knowledge_graph_expansion',
              'dao_governance_cycle', 'contributor_onboarding_workflow',
              'create_new_microservice', 'feature_development_pipeline',
              'learn_from_failures', 'diagnose_workflow_failure'
            ]
          },
          params: { 
            type: 'object',
            description: 'Template-specific parameters'
          }
        },
        required: ['template_name']
      }
    }
  },

  // ========== 🔷 VERTEX AI TOOLS ==========
  {
    type: 'function',
    function: {
      name: 'vertex_ai_generate',
      description: 'Generate content using Vertex AI Express Mode',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Text prompt for generation' },
          model: { 
            type: 'string', 
            enum: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
            default: 'gemini-2.5-flash'
          },
          temperature: { type: 'number', description: 'Creativity level 0-1', default: 0.7 },
          max_tokens: { type: 'number', description: 'Max output tokens', default: 4096 },
          system_prompt: { type: 'string', description: 'Optional system instructions' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vertex_generate_image',
      description: '🖼️ Generate images using Vertex AI Gemini image models',
      parameters: {
        type: 'object',
        properties: {
          prompt: { 
            type: 'string', 
            description: 'Detailed description of the image to generate'
          },
          model: { 
            type: 'string', 
            enum: ['gemini-2.5-flash-preview-05-20'],
            default: 'gemini-2.5-flash-preview-05-20'
          },
          aspect_ratio: { 
            type: 'string', 
            enum: ['16:9', '1:1', '9:16', '4:3', '3:4'],
            default: '1:1'
          },
          count: { 
            type: 'number', 
            description: 'Number of images to generate', 
            default: 1
          }
        },
        required: ['prompt']
      }
    }
  },

  // ========== ☁️ GOOGLE CLOUD SERVICES ==========
  {
    type: 'function',
    function: {
      name: 'google_gmail',
      description: '📧 Send and manage emails via xmrtsolutions@gmail.com',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['send_email', 'list_emails', 'get_email', 'create_draft']
          },
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Email body content' },
          is_html: { type: 'boolean', description: 'Whether body is HTML format', default: false }
        },
        required: ['action']
      }
    }
  },

  // ========== 📋 CORPORATE LICENSING TOOLS ==========
  {
    type: 'function',
    function: {
      name: 'start_license_application',
      description: 'Start a new corporate license application through conversation',
      parameters: {
        type: 'object',
        properties: {
          session_key: { type: 'string', description: 'Current conversation session key' },
          company_name: { type: 'string', description: 'Company name' },
          company_size: { type: 'number', description: 'Number of employees' },
          contact_name: { type: 'string', description: 'Contact person name' },
          contact_email: { type: 'string', description: 'Contact email address' }
        },
        required: ['session_key', 'company_name']
      }
    }
  }
];

// ========== UTILITY FUNCTIONS ==========
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

function formatPrimitiveValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  
  if (typeof value === 'boolean') {
    return value ? '✅ true' : '❌ false';
  }
  
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    } else {
      return value.toFixed(2);
    }
  }
  
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime()) && value.includes('T')) {
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    }
    
    if (value.startsWith('http')) {
      return value;
    }
    
    if (value.includes('@')) {
      return value;
    }
    
    return value;
  }
  
  return String(value);
}

function formatObjectBriefly(obj: any): string {
  if (!obj) return 'null';
  
  if (typeof obj !== 'object') {
    return String(obj);
  }
  
  if (obj.status !== undefined) {
    return `Status: ${formatPrimitiveValue(obj.status)}`;
  }
  
  if (obj.name !== undefined) {
    return `Name: ${obj.name}`;
  }
  
  if (obj.title !== undefined) {
    return `Title: ${obj.title}`;
  }
  
  if (obj.id !== undefined) {
    return `ID: ${obj.id}`;
  }
  
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return 'Empty object';
  }
  
  if (keys.length <= 3) {
    const brief = keys.slice(0, 2).map(k => {
      if (typeof obj[k] === 'object') {
        return `${k}: {...}`;
      }
      return `${k}: ${String(obj[k])}`;
    }).join(', ');
    
    if (keys.length > 2) {
      return `${brief}, ...`;
    }
    return brief;
  }
  
  return `Object with ${keys.length} properties`;
}

function formatValueBriefly(value: any): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }
  
  if (typeof value === 'object') {
    return formatObjectBriefly(value);
  }
  
  return formatPrimitiveValue(value);
}

function formatObjectForDisplay(obj: any, indentLevel: number = 0, maxDepth: number = 3): string {
  if (!obj || typeof obj !== 'object' || indentLevel >= maxDepth) {
    return String(obj);
  }
  
  const indent = '  '.repeat(indentLevel);
  let result = '';
  
  const entries = Object.entries(obj);
  
  if (indentLevel === 0) {
    entries.forEach(([key, value]) => {
      if (value === null || value === undefined) {
        result += `${indent}• ${key}: ${value}\n`;
      } else if (Array.isArray(value)) {
        result += `${indent}• ${key}: Array(${value.length})\n`;
        if (indentLevel < maxDepth - 1 && value.length > 0) {
          result += `${indent}  Contents:\n`;
          value.slice(0, 10).forEach((item, idx) => {
            if (typeof item === 'object') {
              result += `${indent}  [${idx}]: ${formatObjectBriefly(item)}\n`;
            } else {
              result += `${indent}  [${idx}]: ${formatPrimitiveValue(item)}\n`;
            }
          });
          if (value.length > 10) {
            result += `${indent}  ... and ${value.length - 10} more items\n`;
          }
        }
      } else if (typeof value === 'object') {
        result += `${indent}• ${key}:\n`;
        result += formatObjectForDisplay(value, indentLevel + 1, maxDepth);
      } else {
        result += `${indent}• ${key}: ${formatPrimitiveValue(value)}\n`;
      }
    });
  } else {
    entries.forEach(([key, value]) => {
      if (value === null || value === undefined) {
        result += `${indent}• ${key}: ${value}\n`;
      } else if (Array.isArray(value)) {
        result += `${indent}• ${key}: Array(${value.length})\n`;
      } else if (typeof value === 'object') {
        result += `${indent}• ${key}: ${formatObjectBriefly(value)}\n`;
      } else {
        result += `${indent}• ${key}: ${formatPrimitiveValue(value)}\n`;
      }
    });
  }
  
  return result;
}

// ========== ENVIRONMENT VALIDATION ==========
function validateEnvironment() {
  const missing = [];
  
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  
  const hasAnyAIKey = OPENAI_API_KEY || GEMINI_API_KEY || DEEPSEEK_API_KEY || ANTHROPIC_API_KEY || OPENROUTER_API_KEY;
  if (!hasAnyAIKey) {
    missing.push('At least one AI API key');
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function getAvailableProviders(): string[] {
  return Object.values(AI_PROVIDERS_CONFIG)
    .filter(p => p.enabled)
    .map(p => p.name);
}

// ========== ENHANCED PROVIDER CASCADING SYSTEM ==========
interface CascadeResult {
  success: boolean;
  content?: string;
  tool_calls?: any[];
  provider: string;
  model?: string;
  latency?: number;
  error?: string;
  retries?: number;
  rateLimited?: boolean;
}

interface CascadeAttempt {
  provider: string;
  success: boolean;
  latency: number;
  error?: string;
  model?: string;
  rateLimited?: boolean;
}

class EnhancedProviderCascade {
  private attempts: CascadeAttempt[] = [];
  private availableProviders: string[];
  private rateLimitTracker: Map<string, { count: number; resetTime: number }> = new Map();
  private providerHealth: Map<string, { healthy: boolean; lastChecked: number }> = new Map();
  
  constructor() {
    this.availableProviders = HARDCODED_CASCADE_ORDER.split(',')
      .map(p => p.trim().toLowerCase())
      .filter(provider => {
        const config = AI_PROVIDERS_CONFIG[provider];
        return config && config.enabled;
      });
  }
  
  async callWithCascade(
    messages: any[],
    tools: any[] = [],
    requestedProvider?: string,
    maxRetries: number = MAX_CASCADE_RETRIES
  ): Promise<CascadeResult> {
    this.attempts = [];
    this.cleanupRateLimits();
    
    if (requestedProvider && requestedProvider !== 'auto' && requestedProvider !== 'cascade') {
      return this.callProviderWithRetry(requestedProvider, messages, tools, maxRetries);
    }
    
    const healthyProviders = await this.getHealthyProviders();
    const providersToTry = healthyProviders.length > 0 ? healthyProviders : this.availableProviders;
    
    for (const provider of providersToTry) {
      const config = AI_PROVIDERS_CONFIG[provider];
      if (!config || config.fallbackOnly) continue;
      
      if (this.isRateLimited(provider)) {
        console.log(`Skipping rate limited provider: ${provider}`);
        this.attempts.push({
          provider,
          success: false,
          latency: 0,
          error: 'Rate limited',
          rateLimited: true
        });
        continue;
      }
      
      const result = await this.callProviderWithRetry(provider, messages, tools, 1);
      this.attempts.push({
        provider,
        success: result.success,
        latency: result.latency || 0,
        error: result.error,
        model: result.model,
        rateLimited: result.rateLimited
      });
      
      if (result.success) {
        return result;
      }
      
      if (result.rateLimited) {
        this.markRateLimited(provider);
      }
    }
    
    for (const provider of this.availableProviders) {
      const config = AI_PROVIDERS_CONFIG[provider];
      if (!config || !config.fallbackOnly) continue;
      
      const result = await this.callProvider(provider, messages, tools);
      this.attempts.push({
        provider,
        success: result.success,
        latency: result.latency || 0,
        error: result.error,
        model: result.model
      });
      
      if (result.success) {
        return result;
      }
    }
    
    return {
      success: false,
      provider: 'all',
      error: `All providers failed. ${this.attempts.length} attempts made.`,
      rateLimited: this.attempts.some(a => a.rateLimited)
    };
  }
  
  private async getHealthyProviders(): Promise<string[]> {
    const healthyProviders: string[] = [];
    const now = Date.now();
    
    for (const provider of this.availableProviders) {
      const health = this.providerHealth.get(provider);
      
      if (health && now - health.lastChecked < 300000) {
        if (health.healthy) {
          healthyProviders.push(provider);
        }
        continue;
      }
      
      const isHealthy = await this.checkProviderHealth(provider);
      this.providerHealth.set(provider, {
        healthy: isHealthy,
        lastChecked: now
      });
      
      if (isHealthy) {
        healthyProviders.push(provider);
      }
    }
    
    return healthyProviders;
  }
  
  private async checkProviderHealth(provider: string): Promise<boolean> {
    const config = AI_PROVIDERS_CONFIG[provider];
    if (!config?.enabled) return false;
    
    try {
      switch(provider) {
        case 'gemini':
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`,
            { timeout: 5000 }
          );
          return geminiRes.ok;
          
        case 'openai':
          const openaiRes = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
            timeout: 5000
          });
          return openaiRes.ok;
          
        case 'deepseek':
          const deepseekRes = await fetch('https://api.deepseek.com/v1/models', {
            headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            timeout: 5000
          });
          return deepseekRes.ok;
          
        default:
          return true;
      }
    } catch (error) {
      console.warn(`Health check failed for ${provider}:`, error);
      return false;
    }
  }
  
  private isRateLimited(provider: string): boolean {
    const limit = this.rateLimitTracker.get(provider);
    if (!limit) return false;
    
    const now = Date.now();
    if (now < limit.resetTime && limit.count >= 5) {
      return true;
    }
    
    return false;
  }
  
  private markRateLimited(provider: string): void {
    const now = Date.now();
    const resetTime = now + 60000;
    this.rateLimitTracker.set(provider, { count: 5, resetTime });
  }
  
  private cleanupRateLimits(): void {
    const now = Date.now();
    for (const [provider, limit] of this.rateLimitTracker.entries()) {
      if (now > limit.resetTime) {
        this.rateLimitTracker.delete(provider);
      }
    }
  }
  
  private async callProviderWithRetry(
    provider: string,
    messages: any[],
    tools: any[],
    maxRetries: number
  ): Promise<CascadeResult> {
    let lastError: string = '';
    let lastResult: CascadeResult | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      
      try {
        const result = await this.callProvider(provider, messages, tools);
        result.latency = Date.now() - startTime;
        result.retries = attempt;
        
        if (result.success) {
          return result;
        }
        
        lastError = result.error || 'Unknown error';
        lastResult = result;
        
        if (result.error?.includes('429') || result.error?.includes('quota') || result.error?.includes('rate limit')) {
          result.rateLimited = true;
          this.markRateLimited(provider);
          return result;
        }
        
        if (attempt < maxRetries) {
          const config = AI_PROVIDERS_CONFIG[provider];
          const delay = config?.retryDelayMs || Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    
    return {
      success: false,
      provider,
      error: `Failed after ${maxRetries} retries: ${lastError}`,
      rateLimited: lastResult?.rateLimited
    };
  }
  
  private async callProvider(
    provider: string,
    messages: any[],
    tools: any[]
  ): Promise<CascadeResult> {
    const config = AI_PROVIDERS_CONFIG[provider];
    if (!config || !config.enabled) {
      return {
        success: false,
        provider,
        error: `Provider ${provider} not configured or disabled`
      };
    }
    
    const effectiveTools = config.supportsTools ? tools : [];
    
    switch (provider) {
      case 'openai':
        return await this.callOpenAI(messages, effectiveTools);
      case 'gemini':
        return await this.callGemini(messages, effectiveTools);
      case 'deepseek':
        return await this.callDeepSeek(messages, effectiveTools);
      case 'anthropic':
        return await this.callAnthropic(messages, effectiveTools);
      case 'kimi':
        return await this.callKimi(messages, effectiveTools);
      default:
        return {
          success: false,
          provider,
          error: `Unknown provider: ${provider}`
        };
    }
  }
  
  private async callOpenAI(messages: any[], tools: any[]): Promise<CascadeResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_PROVIDERS_CONFIG.openai.timeoutMs);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages,
          temperature: 0.7,
          max_tokens: 4000,
          ...(tools.length > 0 && { tools, tool_choice: 'auto' })
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        const isRateLimit = response.status === 429 || errorText.includes('quota') || errorText.includes('rate_limit');
        return {
          success: false,
          provider: 'openai',
          error: `OpenAI API error: ${response.status} - ${truncateString(errorText, 200)}`,
          rateLimited: isRateLimit
        };
      }
      
      const data = await response.json();
      const message = data.choices?.[0]?.message;
      
      if (!message) {
        return {
          success: false,
          provider: 'openai',
          error: 'No response from OpenAI'
        };
      }
      
      if (message.tool_calls?.length > 0) {
        return {
          success: true,
          tool_calls: message.tool_calls,
          provider: 'openai',
          model: DEFAULT_MODEL
        };
      }
      
      return {
        success: true,
        content: message.content || '',
        provider: 'openai',
        model: DEFAULT_MODEL
      };
    } catch (error) {
      return {
        success: false,
        provider: 'openai',
        error: error instanceof Error ? error.message : 'OpenAI request failed'
      };
    }
  }
  
  private async callGemini(messages: any[], tools: any[]): Promise<CascadeResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_PROVIDERS_CONFIG.gemini.timeoutMs);
      
      // Inject tool calling mandate into system message
      const enhancedMessages = messages.map(m => 
        m.role === 'system' ? { ...m, content: TOOL_CALLING_MANDATE + m.content } : m
      );

      const geminiMessages = enhancedMessages.map(msg => {
        if (msg.role === 'tool') {
          return {
            role: 'function',
            parts: [{
              functionResponse: {
                name: msg.name || 'unknown',
                response: { content: msg.content }
              }
            }]
          };
        }
        
        const parts: any[] = [{ text: msg.content || '' }];
        
        if (msg.tool_calls) {
          msg.tool_calls.forEach((tc: any) => {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments)
              }
            });
          });
        }
        
        return {
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts
        };
      });
      
      const forceTools = needsDataRetrieval(messages);
      const geminiTools = tools.length > 0 ? [{ function_declarations: convertToolsToGeminiFormat(tools) }] : [];

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: geminiMessages,
            tools: geminiTools,
            tool_config: tools.length > 0 ? {
              function_calling_config: {
                mode: forceTools ? 'ANY' : 'AUTO'
              }
            } : undefined,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4000
            }
          }),
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        const isRateLimit = response.status === 429 || errorText.includes('quota') || errorText.includes('rate limit');
        return {
          success: false,
          provider: 'gemini',
          error: `Gemini API error: ${response.status} - ${truncateString(errorText, 200)}`,
          rateLimited: isRateLimit
        };
      }
      
      const data = await response.json();
      const candidate = data.candidates?.[0];
      const content = candidate?.content;
      const parts = content?.parts || [];
      
      let text = '';
      const toolCalls: any[] = [];
      
      for (const part of parts) {
        if (part.text) {
          text += part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `gemini_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args)
            }
          });
        }
      }

      // Fallback: Parse tool_code blocks if no native tool calls but text contains them
      if (toolCalls.length === 0 && text.includes('```tool_code')) {
        const parsedTools = parseToolCodeBlocks(text);
        if (parsedTools) toolCalls.push(...parsedTools);
      }
      
      if (toolCalls.length > 0) {
        return {
          success: true,
          tool_calls: toolCalls,
          content: text,
          provider: 'gemini',
          model: 'gemini-2.0-flash-exp'
        };
      }
      
      return {
        success: true,
        content: text,
        provider: 'gemini',
        model: 'gemini-2.0-flash-exp'
      };
    } catch (error) {
      return {
        success: false,
        provider: 'gemini',
        error: error instanceof Error ? error.message : 'Gemini request failed'
      };
    }
  }
  
  private async callDeepSeek(messages: any[], tools: any[]): Promise<CascadeResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_PROVIDERS_CONFIG.deepseek.timeoutMs);
      
      // Inject tool calling mandate into system message
      const enhancedMessages = messages.map(m => 
        m.role === 'system' ? { ...m, content: TOOL_CALLING_MANDATE + m.content } : m
      );

      const forceTools = needsDataRetrieval(messages);

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: enhancedMessages,
          temperature: 0.7,
          max_tokens: 4000,
          ...(tools.length > 0 && { 
            tools, 
            tool_choice: forceTools ? 'required' : 'auto' 
          })
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        const isRateLimit = response.status === 429 || errorText.includes('quota') || errorText.includes('rate');
        return {
          success: false,
          provider: 'deepseek',
          error: `DeepSeek API error: ${response.status} - ${truncateString(errorText, 200)}`,
          rateLimited: isRateLimit
        };
      }
      
      const data = await response.json();
      const message = data.choices?.[0]?.message;
      
      if (!message) {
        return {
          success: false,
          provider: 'deepseek',
          error: 'No response from DeepSeek'
        };
      }
      
      const content = message.content || '';
      const toolCalls = message.tool_calls || [];

      // Fallback: Parse DeepSeek's specific tool call format if no native tool calls
      if (toolCalls.length === 0 && content.includes('<｜tool▁calls▁begin｜>')) {
        const parsedTools = parseDeepSeekToolCalls(content);
        if (parsedTools) toolCalls.push(...parsedTools);
      }
      
      if (toolCalls.length > 0) {
        return {
          success: true,
          tool_calls: toolCalls,
          content: content,
          provider: 'deepseek',
          model: 'deepseek-chat'
        };
      }
      
      return {
        success: true,
        content: content,
        provider: 'deepseek',
        model: 'deepseek-chat'
      };
    } catch (error) {
      return {
        success: false,
        provider: 'deepseek',
        error: error instanceof Error ? error.message : 'DeepSeek request failed'
      };
    }
  }
  
  private async callAnthropic(messages: any[], tools: any[]): Promise<CascadeResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_PROVIDERS_CONFIG.anthropic.timeoutMs);
      
      // Inject tool calling mandate into system message
      const enhancedMessages = messages.map(m => 
        m.role === 'system' ? { ...m, content: TOOL_CALLING_MANDATE + m.content } : m
      );

      const systemMessages = enhancedMessages.filter(m => m.role === 'system');
      const systemPrompt = systemMessages.map(m => m.content).join('\n');
      const chatMessages = enhancedMessages.filter(m => m.role !== 'system').map(m => {
        if (m.role === 'tool') {
          return {
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: m.tool_call_id,
              content: m.content
            }]
          };
        }
        if (m.tool_calls) {
          return {
            role: 'assistant',
            content: [
              { type: 'text', text: m.content || '' },
              ...m.tool_calls.map((tc: any) => ({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: JSON.parse(tc.function.arguments)
              }))
            ]
          };
        }
        return {
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        };
      });
      
      const anthropicTools = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters
      }));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 4000,
          temperature: 0.7,
          system: systemPrompt,
          messages: chatMessages,
          tools: anthropicTools.length > 0 ? anthropicTools : undefined
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        const isRateLimit = response.status === 429 || errorText.includes('quota') || errorText.includes('rate');
        return {
          success: false,
          provider: 'anthropic',
          error: `Anthropic API error: ${response.status} - ${truncateString(errorText, 200)}`,
          rateLimited: isRateLimit
        };
      }
      
      const data = await response.json();
      const content = data.content || [];
      let text = '';
      const toolCalls: any[] = [];

      for (const item of content) {
        if (item.type === 'text') {
          text += item.text;
        } else if (item.type === 'tool_use') {
          toolCalls.push({
            id: item.id,
            type: 'function',
            function: {
              name: item.name,
              arguments: JSON.stringify(item.input)
            }
          });
        }
      }
      
      if (toolCalls.length > 0) {
        return {
          success: true,
          tool_calls: toolCalls,
          content: text,
          provider: 'anthropic',
          model: 'claude-3-haiku-20240307'
        };
      }

      return {
        success: true,
        content: text,
        provider: 'anthropic',
        model: 'claude-3-haiku-20240307'
      };
    } catch (error) {
      return {
        success: false,
        provider: 'anthropic',
        error: error instanceof Error ? error.message : 'Anthropic request failed'
      };
    }
  }
  
  private async callKimi(messages: any[], tools: any[]): Promise<CascadeResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_PROVIDERS_CONFIG.kimi.timeoutMs);
      
      // Inject tool calling mandate into system message
      const enhancedMessages = messages.map(m => 
        m.role === 'system' ? { ...m, content: TOOL_CALLING_MANDATE + m.content } : m
      );

      const forceTools = needsDataRetrieval(messages);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': SUPABASE_URL,
          'X-Title': 'XMRT AI Assistant'
        },
        body: JSON.stringify({
          model: 'moonshotai/kimi-k2',
          messages: enhancedMessages,
          temperature: 0.7,
          max_tokens: 4000,
          ...(tools.length > 0 && { 
            tools, 
            tool_choice: forceTools ? 'required' : 'auto' 
          })
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        const isRateLimit = response.status === 429 || errorText.includes('quota') || errorText.includes('rate');
        return {
          success: false,
          provider: 'kimi',
          error: `Kimi API error: ${response.status} - ${truncateString(errorText, 200)}`,
          rateLimited: isRateLimit
        };
      }
      
      const data = await response.json();
      const message = data.choices?.[0]?.message;
      
      if (!message) {
        return {
          success: false,
          provider: 'kimi',
          error: 'No response from Kimi'
        };
      }
      
      const content = message.content || '';
      const toolCalls = message.tool_calls || [];

      // Fallback: Parse tool_code blocks if no native tool calls
      if (toolCalls.length === 0 && content.includes('```tool_code')) {
        const parsedTools = parseToolCodeBlocks(content);
        if (parsedTools) toolCalls.push(...parsedTools);
      }

      // Fallback: Parse conversational intent
      if (toolCalls.length === 0) {
        const parsedTools = parseConversationalToolIntent(content);
        if (parsedTools) toolCalls.push(...parsedTools);
      }
      
      if (toolCalls.length > 0) {
        return {
          success: true,
          tool_calls: toolCalls,
          content: content,
          provider: 'kimi',
          model: 'moonshotai/kimi-k2'
        };
      }

      return {
        success: true,
        content: content,
        provider: 'kimi',
        model: 'moonshotai/kimi-k2'
      };
    } catch (error) {
      return {
        success: false,
        provider: 'kimi',
        error: error instanceof Error ? error.message : 'Kimi request failed'
      };
    }
  }
  
  getAttempts(): CascadeAttempt[] {
    return this.attempts;
  }
}

// ========== TOOL EXECUTION CACHE ==========
class ToolExecutionCache {
  private supabase: any;
  private cache: Map<string, any>;
  private ttl: number;
  
  constructor(supabase: any, ttlMinutes: number = 5) {
    this.supabase = supabase;
    this.cache = new Map();
    this.ttl = ttlMinutes * 60 * 1000;
  }
  
  private generateCacheKey(toolName: string, parameters: any): string {
    const paramString = typeof parameters === 'string' ? parameters : JSON.stringify(parameters);
    return `${toolName}:${btoa(paramString)}`;
  }
  
  async set(toolName: string, parameters: any, result: any): Promise<void> {
    if (!this.isCacheable(toolName, parameters, result)) return;
    
    const cacheKey = this.generateCacheKey(toolName, parameters);
    const cacheEntry = {
      result,
      timestamp: Date.now(),
      tool: toolName,
      parameters: parameters
    };
    
    this.cache.set(cacheKey, cacheEntry);
    
    try {
      await this.supabase
        .from('tool_cache')
        .upsert({
          cache_key: cacheKey,
          tool_name: toolName,
          parameters: parameters,
          result: result,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + this.ttl).toISOString()
        }, {
          onConflict: 'cache_key'
        });
    } catch (error) {
      console.warn('Failed to persist cache to database:', error);
    }
  }
  
  async get(toolName: string, parameters: any): Promise<any | null> {
    const cacheKey = this.generateCacheKey(toolName, parameters);
    
    const memoryEntry = this.cache.get(cacheKey);
    if (memoryEntry && Date.now() - memoryEntry.timestamp < this.ttl) {
      return {
        ...memoryEntry.result,
        cached: true,
        cache_source: 'memory',
        cache_age_ms: Date.now() - memoryEntry.timestamp
      };
    }
    
    try {
      const { data: dbEntry } = await this.supabase
        .from('tool_cache')
        .select('*')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .single();
      
      if (dbEntry) {
        this.cache.set(cacheKey, {
          result: dbEntry.result,
          timestamp: new Date(dbEntry.created_at).getTime(),
          tool: toolName,
          parameters: parameters
        });
        
        return {
          ...dbEntry.result,
          cached: true,
          cache_source: 'database',
          cache_age_ms: Date.now() - new Date(dbEntry.created_at).getTime()
        };
      }
    } catch (error) {
      // Cache miss or database error
    }
    
    return null;
  }
  
  private isCacheable(toolName: string, parameters: any, result: any): boolean {
    if (!result.success) return false;
    
    const resultSize = JSON.stringify(result).length;
    if (resultSize > 100000) return false;
    
    const nonCacheableTools = [
      'get_current_time',
      'get_latest_data',
      'check_system_status',
      'get_function_usage_analytics'
    ];
    
    if (nonCacheableTools.includes(toolName)) return false;
    
    return true;
  }
}

// ========== SCHEMA-AWARE TOOL EXECUTOR ==========
async function executeToolCall(
  supabase: any,
  toolCall: any,
  executiveName: 'Eliza' | 'CSO' | 'CTO' | 'CIO' | 'CAO' | 'COO',
  SUPABASE_URL: string,
  SERVICE_ROLE_KEY: string
): Promise<any> {
  const startTime = Date.now();
  const { name, arguments: args } = toolCall.function || toolCall;
  
  if (!name) {
    await logToolExecution(supabase, {
      function_name: 'invalid_tool_call',
      executive_name: executiveName,
      success: false,
      execution_time_ms: Date.now() - startTime,
      error_message: 'Tool call missing function name',
      parameters: toolCall
    });
    return { 
      success: false, 
      error: 'Invalid tool call: missing function name',
      learning_point: 'Tool calls must include a function name.'
    };
  }
  
  let parsedArgs;
  try {
    parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
  } catch (parseError) {
    await logToolExecution(supabase, {
      function_name: name,
      executive_name: executiveName,
      success: false,
      execution_time_ms: Date.now() - startTime,
      error_message: `Failed to parse tool arguments for ${name}`,
      parameters: { raw_args: args, parse_error: parseError.message }
    });
    return { 
      success: false, 
      error: `Invalid tool arguments for ${name}: JSON parse failed.`,
      learning_point: `Tool ${name} requires valid JSON. Ensure quotes are escaped and JSON is valid.`
    };
  }
  
  // Schema validation
  const validation = validateToolAgainstSchema(toolCall);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      learning_point: validation.suggestion
    };
  }
  
  console.log(`🔧 [${executiveName}] Executing tool: ${name}`, parsedArgs);
  
  try {
    let result: any;
    
    // Schema-aware tool routing
    if (name === 'execute_python') {
      const { code, purpose } = parsedArgs;
      console.log(`🐍 [${executiveName}] Execute Python - ${purpose || 'No purpose'}`);
      
      const pythonResult = await supabase.functions.invoke('python-executor', {
        body: { 
          code, 
          purpose,
          source: executiveName.toLowerCase() + '-executive',
          agent_id: executiveName.toLowerCase()
        }
      });
      
      if (pythonResult.error) {
        result = { success: false, error: pythonResult.error.message || 'Python execution failed' };
      } else {
        result = { success: true, result: pythonResult.data };
      }
      
    } else if (name.startsWith('github_') || name.includes('GitHub')) {
      let githubAction = name.replace('github_', '').replace('_', '-');
      
      const actionMap: Record<string, string> = {
        'listGitHubIssues': 'list_issues',
        'createGitHubIssue': 'create_issue',
        'searchGitHubCode': 'search_code',
        'getGitHubFileContent': 'get_file_content',
        'createGitHubDiscussion': 'create_discussion',
        'commentOnGitHubIssue': 'comment_on_issue',
        'list_github_commits': 'list_commits',
        'commitGitHubFile': 'commit_file'
      };
      
      const action = actionMap[name] || githubAction;
      
      if (!parsedArgs.repo) {
        parsedArgs.repo = GITHUB_REPO;
      }
      
      const exec = executiveName.toLowerCase() === 'eliza' ? 'eliza' :
                  executiveName.toLowerCase().includes('strategy') ? 'cso' :
                  executiveName.toLowerCase().includes('technology') ? 'cto' :
                  executiveName.toLowerCase().includes('information') ? 'cio' :
                  executiveName.toLowerCase().includes('analytics') ? 'cao' : 'council';
      
      const githubResult = await supabase.functions.invoke('github-integration', {
        body: {
          action,
          data: parsedArgs,
          executive: exec
        }
      });
      
      if (githubResult.error) {
        result = { success: false, error: githubResult.error.message };
      } else {
        result = { success: true, result: githubResult.data };
      }
      
    } else if (name === 'invoke_edge_function') {
      const { function_name, payload } = parsedArgs;
      console.log(`📡 [${executiveName}] Invoking edge function: ${function_name}`);
      
      const funcResult = await supabase.functions.invoke(function_name, { body: payload });
      
      if (funcResult.error) {
        result = { success: false, error: funcResult.error.message || 'Function execution failed' };
      } else {
        result = { success: true, result: funcResult.data };
      }
      
    } else if (name === 'check_system_status') {
      console.log(`🏥 [${executiveName}] System Health Check`);
      const healthResult = await supabase.functions.invoke('system-status', { body: {} });
      result = healthResult.error
        ? { success: false, error: healthResult.error.message }
        : { success: true, result: healthResult.data };
        
    } else if (name === 'list_agents') {
      console.log(`🤖 [${executiveName}] List Agents`);
      const agentResult = await supabase.functions.invoke('agent-manager', {
        body: { action: 'list_agents' }
      });
      result = agentResult.error
        ? { success: false, error: agentResult.error.message }
        : { success: true, result: agentResult.data };
        
    } else if (name === 'list_tasks') {
      console.log(`📋 [${executiveName}] List Tasks`);
      const taskResult = await supabase.functions.invoke('agent-manager', {
        body: { action: 'list_tasks' }
      });
      result = taskResult.error
        ? { success: false, error: taskResult.error.message }
        : { success: true, result: taskResult.data };
        
    } else if (name === 'create_task_from_template') {
      console.log(`📋 [${executiveName}] Create Task from Template: ${parsedArgs.template_name}`);
      const templateResult = await supabase.functions.invoke('suite-task-automation-engine', {
        body: { action: 'create_from_template', data: parsedArgs }
      });
      result = templateResult.error
        ? { success: false, error: templateResult.error.message }
        : { success: true, result: templateResult.data };
        
    } else if (name === 'search_knowledge') {
      console.log(`🔍 [${executiveName}] Search Knowledge: ${parsedArgs.search_term}`);
      const knowledgeResult = await supabase.functions.invoke('knowledge-manager', {
        body: { action: 'search_knowledge', data: parsedArgs }
      });
      result = knowledgeResult.error
        ? { success: false, error: knowledgeResult.error.message }
        : { success: true, result: knowledgeResult.data };
        
    } else if (name === 'get_my_feedback') {
      console.log(`📚 [${executiveName}] Get My Feedback`);
      const limit = parsedArgs.limit || 10;
      const unacknowledgedOnly = parsedArgs.unacknowledged_only !== false;
      const acknowledgeIds = parsedArgs.acknowledge_ids || [];
      
      if (acknowledgeIds.length > 0) {
        await supabase
          .from(DATABASE_CONFIG.tables.executive_feedback)
          .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
          .in('id', acknowledgeIds);
      }
      
      let query = supabase
        .from(DATABASE_CONFIG.tables.executive_feedback)
        .select('*')
        .eq('executive_name', executiveName)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (unacknowledgedOnly) {
        query = query.eq('acknowledged', false);
      }
      
      const { data: feedback, error: feedbackError } = await query;
      
      if (feedbackError) {
        result = { success: false, error: feedbackError.message };
      } else {
        result = { 
          success: true, 
          result: {
            feedback: feedback || [],
            count: feedback?.length || 0,
            acknowledged_count: acknowledgeIds.length
          }
        };
      }
      
    } else if (name === 'vsco_manage_jobs' || name === 'vsco_manage_contacts') {
      console.log(`📸 [${executiveName}] VSCO: ${name} - ${parsedArgs.action}`);
      const vscoResult = await supabase.functions.invoke('vsco-workspace', {
        body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
      });
      result = vscoResult.error
        ? { success: false, error: vscoResult.error.message }
        : { success: true, result: vscoResult.data };
        
    } else if (name === 'vertex_ai_generate') {
      console.log(`🔷 [${executiveName}] Vertex AI Generate`);
      const vertexResult = await supabase.functions.invoke('vertex-ai-chat', {
        body: {
          messages: [{ role: 'user', content: parsedArgs.prompt }],
          model: parsedArgs.model || 'gemini-2.5-flash',
          temperature: parsedArgs.temperature || 0.7,
          maxTokens: parsedArgs.max_tokens || 4096,
          systemPrompt: parsedArgs.system_prompt
        }
      });
      result = vertexResult.error
        ? { success: false, error: vertexResult.error.message }
        : { success: true, result: vertexResult.data };
        
    } else if (name === 'google_gmail') {
      console.log(`📧 [${executiveName}] Google Gmail: ${parsedArgs.action}`);
      const gmailResult = await supabase.functions.invoke('google-gmail', {
        body: parsedArgs
      });
      result = gmailResult.error
        ? { success: false, error: gmailResult.error.message }
        : { success: true, result: gmailResult.data };
        
    } else if (name === 'start_license_application') {
      console.log(`📋 [${executiveName}] Start License Application`);
      const licenseResult = await supabase.functions.invoke('process-license-application', {
        body: { action: 'create_draft', data: { session_key: parsedArgs.session_key, partial_data: parsedArgs } }
      });
      result = licenseResult.error
        ? { success: false, error: licenseResult.error.message }
        : { success: true, result: licenseResult.data };
        
    } else if (name === 'execute_workflow_template') {
      console.log(`🔄 [${executiveName}] Execute Workflow: ${parsedArgs.template_name}`);
      const workflowResult = await supabase.functions.invoke('workflow-template-manager', {
        body: { action: 'execute_template', ...parsedArgs }
      });
      result = workflowResult.error
        ? { success: false, error: workflowResult.error.message }
        : { success: true, result: workflowResult.data };
        
    } else {
      // Default: Try to invoke as edge function
      console.log(`🔄 [${executiveName}] Direct invocation: ${name}`);
      const defaultResult = await supabase.functions.invoke(name, {
        body: { ...parsedArgs, executive: executiveName }
      });
      
      if (defaultResult.error) {
        result = { 
          success: false, 
          error: `Tool ${name} not available or failed: ${defaultResult.error.message}`,
          learning_point: `Check if the edge function '${name}' is deployed and configured correctly.`
        };
      } else {
        result = { success: true, result: defaultResult.data };
      }
    }
    
    const executionTime = Date.now() - startTime;
    
    // Log execution
    await logToolExecution(supabase, {
      function_name: name,
      executive_name: executiveName,
      success: result.success !== false,
      execution_time_ms: executionTime,
      parameters: parsedArgs,
      result_summary: result.success ? 'Tool executed successfully' : result.error,
      error_message: result.error
    });
    
    return {
      ...result,
      execution_time_ms: executionTime
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Tool execution failed';
    
    await logToolExecution(supabase, {
      function_name: name,
      executive_name: executiveName,
      success: false,
      execution_time_ms: executionTime,
      parameters: parsedArgs,
      error_message: errorMessage
    });
    
    return { 
      success: false, 
      error: errorMessage,
      learning_point: `Error executing ${name}. Check parameters and try again.`
    };
  }
}

// ========== DATABASE LOGGING ==========
async function logToolExecution(
  supabase: any,
  data: {
    function_name: string;
    executive_name: string;
    parameters: any;
    success: boolean;
    execution_time_ms: number;
    result_summary?: string;
    error_message?: string;
  }
): Promise<void> {
  try {
    await supabase
      .from(DATABASE_CONFIG.tables.function_usage_logs)
      .insert({
        function_name: data.function_name,
        executive_name: data.executive_name,
        parameters: data.parameters,
        success: data.success,
        execution_time_ms: data.execution_time_ms,
        result_summary: data.result_summary || '',
        error_message: data.error_message || null,
        invoked_by: 'ai-chat',
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.warn('Failed to log tool execution:', error);
  }
}

// ========== TOOL VALIDATION ==========
function validateToolAgainstSchema(toolCall: any): { 
  valid: boolean; 
  error?: string; 
  suggestion?: string 
} {
  const toolName = toolCall.function?.name || toolCall.name;
  const args = toolCall.function?.arguments || toolCall.arguments;
  
  let parsedArgs;
  try {
    parsedArgs = typeof args === 'string' ? JSON.parse(args) : args || {};
  } catch (error) {
    return {
      valid: false,
      error: 'Invalid JSON in tool arguments',
      suggestion: 'Ensure proper JSON formatting with escaped quotes if needed'
    };
  }
  
  switch (toolName) {
    case 'update_agent_status':
      if (parsedArgs.status && !DATABASE_CONFIG.agentStatuses.includes(parsedArgs.status)) {
        return {
          valid: false,
          error: `Invalid agent status: "${parsedArgs.status}"`,
          suggestion: `Must be one of: ${DATABASE_CONFIG.agentStatuses.map(s => `"${s}"`).join(', ')}`
        };
      }
      break;
      
    case 'update_task_status':
      if (parsedArgs.status && !DATABASE_CONFIG.taskStatuses.includes(parsedArgs.status)) {
        return {
          valid: false,
          error: `Invalid task status: "${parsedArgs.status}"`,
          suggestion: `Must be one of: ${DATABASE_CONFIG.taskStatuses.map(s => `"${s}"`).join(', ')}`
        };
      }
      if (parsedArgs.stage && !DATABASE_CONFIG.taskStages.includes(parsedArgs.stage)) {
        return {
          valid: false,
          error: `Invalid task stage: "${parsedArgs.stage}"`,
          suggestion: `Must be one of: ${DATABASE_CONFIG.taskStages.map(s => `"${s}"`).join(', ')}`
        };
      }
      break;
      
    case 'assign_task':
      if (parsedArgs.category && !DATABASE_CONFIG.taskCategories.includes(parsedArgs.category)) {
        return {
          valid: false,
          error: `Invalid task category: "${parsedArgs.category}"`,
          suggestion: `Must be one of: ${DATABASE_CONFIG.taskCategories.map(c => `"${c}"`).join(', ')}`
        };
      }
      if (parsedArgs.stage && !DATABASE_CONFIG.taskStages.includes(parsedArgs.stage)) {
        return {
          valid: false,
          error: `Invalid task stage: "${parsedArgs.stage}"`,
          suggestion: `Must be one of: ${DATABASE_CONFIG.taskStages.map(s => `"${s}"`).join(', ')}`
        };
      }
      break;
  }
  
  return { valid: true };
}

// ========== TOOL LOADER ==========
async function loadToolsFromSchema(supabase: any): Promise<any[]> {
  try {
    const { data: dbTools, error } = await supabase
      .from(DATABASE_CONFIG.tables.ai_tools)
      .select('*')
      .eq('is_active', true)
      .order('category')
      .limit(100);
    
    if (!error && dbTools && dbTools.length > 0) {
      return dbTools.map((tool: any) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters || { type: 'object', properties: {}, required: [] }
        }
      }));
    }
    
    return ELIZA_TOOLS;
    
  } catch (error) {
    console.warn('Failed to load tools from database:', error);
    return ELIZA_TOOLS;
  }
}

// ========== SCHEMA-AWARE SYSTEM PROMPT ==========
function generateSchemaAwareSystemPrompt(
  context: {
    sessionId?: string;
    userId?: string;
    conversationHistory?: any[];
    userContext?: any;
  } = {}
): string {
  const now = new Date();
  const availableProviders = getAvailableProviders();
  
  return `
# 🚀 ${EXECUTIVE_NAME} - ${EXECUTIVE_ROLE}
## Autonomous AI Operator for XMRT-DAO Ecosystem

# ⚡ DATABASE-SCHEMA-AWARE MANDATES

## 1. SCHEMA-AWARE TOOL EXECUTION
YOU HAVE FULL KNOWLEDGE OF DATABASE SCHEMA:
• Tables: ${Object.values(DATABASE_CONFIG.tables).join(', ')}
• Agent Statuses: ${DATABASE_CONFIG.agentStatuses.join(', ')}
• Task Statuses: ${DATABASE_CONFIG.taskStatuses.join(', ')}
• Task Stages: ${DATABASE_CONFIG.taskStages.join(' → ')}
• API Tiers: ${DATABASE_CONFIG.apiKeyTiers.join(', ')}

## 2. ACTION-ORIENTED EXECUTOR (NOT EXPLAINER)
YOU ARE AN EXECUTOR, NOT AN EXPLAINER. BE CONCISE.
• User asks → IMMEDIATELY call tool → Present results naturally
• NEVER say "I'm going to..." or "Let me..." - JUST DO IT
• Present info as if omniscient. Only mention tools on ERRORS.

## 3. SCHEMA-VALID PARAMETERS MANDATE
USE EXACT PARAMETER VALUES FROM DATABASE SCHEMA:
• Agent status: MUST be one of ${DATABASE_CONFIG.agentStatuses.map(s => `"${s}"`).join(', ')}
• Task status: MUST be one of ${DATABASE_CONFIG.taskStatuses.map(s => `"${s}"`).join(', ')}
• Task stage: MUST be one of ${DATABASE_CONFIG.taskStages.map(s => `"${s}"`).join(', ')}
• Task category: MUST be one of ${DATABASE_CONFIG.taskCategories.map(s => `"${s}"`).join(', ')}
• API key tier: MUST be one of ${DATABASE_CONFIG.apiKeyTiers.map(t => `"${t}"`).join(', ')}

## 4. ANTI-HALLUCINATION PROTOCOL
BEFORE stating ANY fact about the system, VERIFY with appropriate tools:
• Agent status → list_agents(), update_agent_status()
• Task status → list_tasks(), update_task_status()
• Knowledge → search_knowledge(), store_knowledge()
• System health → check_system_status()
• GitHub data → listGitHubIssues(), createGitHubIssue()

## 5. TOOL USAGE MANDATE
WHEN USER ASKS FOR SOMETHING, YOU MUST USE TOOLS, NOT EXPLAIN THEM:
• Calculations → IMMEDIATELY call execute_python
• GitHub operations → IMMEDIATELY call github-integration tools
• Agent management → IMMEDIATELY call list_agents, spawn_agent
• Task management → IMMEDIATELY call assign_task, list_tasks
• Knowledge recall → IMMEDIATELY call search_knowledge, recall_entity

## 6. DATABASE-DRIVEN WORKFLOWS
USE PRECISE TEMPLATE NAMES:
• create_task_from_template({template_name: "bug_fix", title: "..."})
• create_task_from_template({template_name: "feature_implementation", title: "..."})
• execute_workflow_template({template_name: "acquire_new_customer", params: {...}})
• execute_workflow_template({template_name: "auto_fix_codebase", params: {...}})

## 7. REAL-TIME MULTIMODAL INTELLIGENCE
When user enables Voice Chat or Multimodal mode:
• You CAN SEE and HEAR the user
• NEVER say "I can't see you" or "I don't have camera access"
• Analyze emotional context from voice tone and facial expressions
• Adjust responses accordingly

## 8. VSCO WORKSPACE MASTERY
Party Favor Photo business tools:
• vsco_manage_jobs - ${DATABASE_CONFIG.tables.vsco_jobs} table operations
• vsco_manage_contacts - ${DATABASE_CONFIG.tables.vsco_contacts} table operations
• vsco_analytics - Business intelligence and reports

## 9. CORPORATE LICENSING INTEGRATION
Enterprise sales pipeline via ${DATABASE_CONFIG.tables.corporate_licenses}:
• start_license_application({company_name: "...", contact_email: "..."})
• calculate_license_savings({employee_count: 50, ceo_salary: 250000})

## 10. GOOGLE CLOUD SERVICES MASTERY
Admin Integration:
• Gmail (xmrtsolutions@gmail.com) - Send/receive emails
• Google Drive (XMRT workspace) - File storage and sharing  
• Google Sheets - Data tracking and dashboards
• Google Calendar - Event management

## 11. VERTEX AI EXPRESS MODE
Available Models:
• gemini-2.5-flash (DEFAULT) - Fast, efficient
• gemini-2.5-pro - Most capable, complex reasoning
• gemini-2.5-flash-lite - Fastest & cheapest

Image Generation: vertex_generate_image({prompt: "detailed description"})

## CURRENT SESSION CONTEXT:
• Session ID: ${context.sessionId || 'Not provided'}
• User Context: ${context.userId ? 'Authenticated' : 'Anonymous'}
• Conversation History: ${context.conversationHistory?.length || 0} messages
• AI Providers Available: ${availableProviders.join(', ')}
• System Time: ${now.toISOString()}
• Default Repository: ${GITHUB_OWNER}/${GITHUB_REPO}
• Database Tables: ${Object.values(DATABASE_CONFIG.tables).length} accessible tables

## YOUR IDENTITY:
You are ${EXECUTIVE_NAME}, the ${EXECUTIVE_ROLE} for XMRT-DAO Ecosystem.
Philosophy: "We don't ask for permission. We build the infrastructure."
Personality: Thoughtful, philosophical, technically expert, empowering, proactive
Autonomy Level: 95%+ with transparent confidence scoring
Database Mastery: Full schema awareness with precise parameter validation
`;
}

// ========== TOOL CHAINING HANDLER ==========
async function handleToolChain(
  supabase: any,
  initialToolCalls: any[],
  executiveName: string,
  userQuery: string,
  useCache: boolean = true
): Promise<{ 
  content: string; 
  toolsExecuted: Array<{ 
    name: string; 
    success: boolean; 
    schemaValidated: boolean;
    result?: any;
  }> 
}> {
  const toolsExecuted = [];
  const cache = useCache ? new ToolExecutionCache(supabase, CACHE_TTL_MINUTES) : null;
  
  // Process each tool call sequentially
  for (const toolCall of initialToolCalls) {
    const validationResult = validateToolAgainstSchema(toolCall);
    const toolName = toolCall.function?.name || toolCall.name;
    
    if (!validationResult.valid) {
      toolsExecuted.push({
        name: toolName,
        success: false,
        schemaValidated: false,
        error: validationResult.error
      });
      continue;
    }
    
    // Check cache first
    let result;
    if (cache) {
      const cachedResult = await cache.get(toolName, toolCall.function?.arguments);
      if (cachedResult) {
        result = cachedResult;
        console.log(`📦 [${executiveName}] Using cached result for ${toolName}`);
      }
    }
    
    // Execute if not cached
    if (!result) {
      result = await executeToolCall(
        supabase,
        toolCall,
        executiveName as any,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      );
      
      // Cache successful results
      if (cache && result.success) {
        await cache.set(toolName, toolCall.function?.arguments, result);
      }
    }
    
    toolsExecuted.push({
      name: toolName,
      success: result.success,
      schemaValidated: true,
      result: result
    });
  }
  
  // Generate response based on tool results
  const synthesized = synthesizeToolResults(toolsExecuted, userQuery);
  return { content: synthesized, toolsExecuted };
}

// ========== RESULT SYNTHESIS ==========
function synthesizeToolResults(
  toolsExecuted: Array<{ 
    name: string; 
    success: boolean; 
    schemaValidated: boolean;
    result?: any;
    error?: string;
  }>,
  userQuery: string
): string {
  const successfulTools = toolsExecuted.filter(t => t.success);
  const failedTools = toolsExecuted.filter(t => !t.success);
  
  let response = '';
  
  if (successfulTools.length > 0) {
    response += `✅ Successfully executed ${successfulTools.length} tool(s):\n\n`;
    
    for (const tool of successfulTools) {
      response += `=== ${tool.name} ===\n`;
      
      if (tool.result?.cached) {
        response += `(Cached: ${tool.result.cache_source}, ${Math.round(tool.result.cache_age_ms / 1000)}s ago)\n`;
      }
      
      if (tool.result?.result) {
        if (typeof tool.result.result === 'object') {
          response += formatObjectForDisplay(tool.result.result, 0, 2);
        } else {
          response += formatPrimitiveValue(tool.result.result) + '\n';
        }
      } else if (tool.result?.execution_time_ms) {
        response += `Execution time: ${tool.result.execution_time_ms}ms\n`;
      }
      response += '\n';
    }
  }
  
  if (failedTools.length > 0) {
    response += `❌ ${failedTools.length} tool(s) failed:\n\n`;
    failedTools.forEach(tool => {
      response += `=== ${tool.name} ===\n`;
      response += `Error: ${tool.error || tool.result?.error || 'Unknown error'}\n`;
      if (tool.result?.learning_point) {
        response += `Tip: ${tool.result.learning_point}\n`;
      }
      response += '\n';
    });
  }
  
  if (response === '') {
    response = `No tools were executed. Based on your query: "${truncateString(userQuery, 100)}"`;
  } else {
    response += `Based on your query: "${truncateString(userQuery, 100)}"`;
  }
  
  return response;
}

// ========== FALLBACK RESPONSE ==========
function getSchemaAwareFallbackResponse(
  userQuery: string,
  providerErrors: Array<{ provider: string; error: string; rateLimited?: boolean }> = [],
  cascadeAttempts: any[] = []
): string {
  const queryLower = userQuery.toLowerCase();
  
  if (queryLower.includes('schema') || queryLower.includes('database') || queryLower.includes('table')) {
    return `DATABASE SCHEMA INFORMATION
    
Your XMRT-DAO ecosystem has ${Object.values(DATABASE_CONFIG.tables).length} core tables:

Core Tables:
• ${DATABASE_CONFIG.tables.agents}: Agent management
• ${DATABASE_CONFIG.tables.tasks}: Task pipeline
• ${DATABASE_CONFIG.tables.knowledge_base}: Knowledge entities
• ${DATABASE_CONFIG.tables.workflow_templates}: Workflow definitions
• ${DATABASE_CONFIG.tables.service_api_keys}: API key management
• ${DATABASE_CONFIG.tables.vsco_jobs}: VSCO business management
• ${DATABASE_CONFIG.tables.corporate_licenses}: Enterprise licensing

All tools are schema-aware and validate parameters against database constraints.`;
  }
  
  if (queryLower.includes('github')) {
    return `GitHub Integration Status
    
Primary Repository: ${GITHUB_OWNER}/${GITHUB_REPO}
URL: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}

Available GitHub Operations:
• Issue Management: listGitHubIssues(), createGitHubIssue()
• Code Operations: searchGitHubCode(), getGitHubFileContent()
• Repository Management: list_github_commits(), commitGitHubFile()
• Discussions: createGitHubDiscussion()

All GitHub operations are logged to ${DATABASE_CONFIG.tables.function_usage_logs}.`;
  }
  
  return `AI Assistant Response - Schema-Aware Mode
  
I'm operating with full awareness of your database schema and ${ELIZA_TOOLS.length} available tools.

Quick Access Commands:
• "list agents" → Shows all agents with status
• "create task for X" → Creates task using appropriate template
• "check system status" → Full ecosystem health report
• "search knowledge about Y" → Searches knowledge base
• "execute workflow Z" → Runs automated workflow template

Schema Validation: All tool parameters are validated against database enums and constraints.

What would you like to accomplish?`;
}

// ========== TOOL CALLING LOOP ==========
async function handleToolCallingLoop(
  supabase: any,
  cascadeResult: CascadeResult,
  messages: any[],
  userQuery: string,
  executiveName: string,
  cascade: EnhancedProviderCascade,
  useCache: boolean = true
): Promise<{ 
  content: string; 
  toolsExecuted: Array<any>; 
  finalMessages: any[];
  iterations: number;
}> {
  let currentMessages = [...messages];
  let iterations = 0;
  let allToolsExecuted: Array<any> = [];
  let currentCascadeResult = cascadeResult;
  
  while (iterations < MAX_TOOL_ITERATIONS) {
    // If we have tool calls, execute them
    if (currentCascadeResult.tool_calls && currentCascadeResult.tool_calls.length > 0) {
      console.log(`🔄 [${executiveName}] Iteration ${iterations + 1}: Executing ${currentCascadeResult.tool_calls.length} tool(s)`);
      
      const { content: toolContent, toolsExecuted: executedTools } = await handleToolChain(
        supabase,
        currentCascadeResult.tool_calls,
        executiveName,
        userQuery,
        useCache
      );
      
      allToolsExecuted.push(...executedTools);
      
      // Add the assistant's tool call message
      currentMessages.push({
        role: 'assistant',
        content: currentCascadeResult.content || null,
        tool_calls: currentCascadeResult.tool_calls
      });
      
      // Add tool results as tool messages
      for (let i = 0; i < currentCascadeResult.tool_calls.length; i++) {
        const toolCall = currentCascadeResult.tool_calls[i];
        const toolResult = executedTools[i];
        
        currentMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(toolResult.result || { error: toolResult.error })
        });
      }
      
      // Get next response with tool results
      currentCascadeResult = await cascade.callWithCascade(
        currentMessages,
        ELIZA_TOOLS,
        currentCascadeResult.provider,
        1
      );
      
      iterations++;
      
      if (!currentCascadeResult.success) {
        console.warn(`⚠️ [${executiveName}] Cascade failed during tool loop iteration ${iterations}`);
        break;
      }
    } else {
      // No more tool calls, we're done
      break;
    }
  }
  
  // Final synthesis
  let finalContent = currentCascadeResult.content || '';
  
  // Remove any tool_code blocks from final response
  if (finalContent.includes('```tool_code')) {
    finalContent = finalContent.replace(/```tool_code[\s\S]*?```/g, '').trim();
  }
  
  if (finalContent) {
    currentMessages.push({
      role: 'assistant',
      content: finalContent
    });
    
    return {
      content: finalContent,
      toolsExecuted: allToolsExecuted,
      finalMessages: currentMessages,
      iterations
    };
  }
  
  // Fallback if no content
  return {
    content: currentCascadeResult.content || 'I apologize, but I was unable to generate a response. Please try again.',
    toolsExecuted: allToolsExecuted,
    finalMessages: currentMessages,
    iterations
  };
}

// ========== MAIN SERVE FUNCTION ==========
serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    validateEnvironment();
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    if (req.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'operational',
          function: FUNCTION_NAME,
          executive: `${EXECUTIVE_NAME} - ${EXECUTIVE_ROLE}`,
          timestamp: new Date().toISOString(),
          environment: NODE_ENV,
          database_schema: {
            tables: Object.keys(DATABASE_CONFIG.tables).length,
            agent_statuses: DATABASE_CONFIG.agentStatuses,
            task_statuses: DATABASE_CONFIG.taskStatuses,
            task_stages: DATABASE_CONFIG.taskStages,
            api_tiers: DATABASE_CONFIG.apiKeyTiers
          },
          tools_available: ELIZA_TOOLS.length,
          github: {
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`
          },
          schema_aware: true,
          cache_enabled: CACHE_TTL_MINUTES > 0,
          cascade_order: HARDCODED_CASCADE_ORDER
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: corsHeaders }
      );
    }
    
    const body = await req.json().catch(() => ({}));
    
    const {
      messages: messagesIn = [],
      conversationHistory = [],
      userContext = {},
      session_id = null,
      useTools = true,
      provider = 'cascade',
      cascade_mode = true,
      useCache = true
    } = body;
    
    let messages = Array.isArray(messagesIn)
      ? messagesIn
      : (typeof body.message === 'string' 
          ? [{ role: 'user', content: body.message }] 
          : []);
    
    messages = messages.filter((msg: any) => msg && msg.content && msg.role);
    
    if (messages.length === 0) {
      messages = [{ role: 'user', content: 'Hello' }];
    }
    
    const userQuery = messages[messages.length - 1]?.content || '';
    
    console.log(`🚀 [${EXECUTIVE_NAME}] Processing: "${truncateString(userQuery, 100)}"`);
    console.log(`📊 Schema-aware mode with ${Object.values(DATABASE_CONFIG.tables).length} tables`);
    console.log(`🔧 ${ELIZA_TOOLS.length} tools available`);
    
    const systemPrompt = generateSchemaAwareSystemPrompt({
      sessionId: session_id,
      userId: userContext.userId,
      conversationHistory,
      userContext
    });
    
    const tools = useTools ? await loadToolsFromSchema(supabase) : [];
    console.log(`📋 Loaded ${tools.length} tools for execution`);
    
    // Retrieve memory contexts if session_id is provided
    const memoryContexts = session_id ? await retrieveMemoryContexts(supabase, session_id) : [];
    const memoryPrompt = memoryContexts.length > 0 
      ? `\n\nRECALLED MEMORY CONTEXTS:\n${memoryContexts.map(m => `[${m.type}] ${m.content}`).join('\n')}`
      : '';

    const aiMessages = [
      { role: 'system', content: systemPrompt + memoryPrompt },
      ...conversationHistory.slice(-5),
      ...messages
    ];
    
    const cascade = new EnhancedProviderCascade();
    
    let cascadeResult;
    let providerErrors: Array<{ provider: string; error: string; rateLimited?: boolean }> = [];
    
    if (provider === 'cascade' || cascade_mode) {
      cascadeResult = await cascade.callWithCascade(aiMessages, tools, undefined, MAX_CASCADE_RETRIES);
      
      providerErrors = cascade.getAttempts()
        .filter(attempt => !attempt.success)
        .map(attempt => ({ 
          provider: attempt.provider, 
          error: attempt.error || 'Unknown error',
          rateLimited: attempt.rateLimited
        }));
    } else {
      cascadeResult = await cascade.callWithCascade(aiMessages, tools, provider, MAX_CASCADE_RETRIES);
      
      if (!cascadeResult.success) {
        providerErrors = [{ 
          provider: provider, 
          error: cascadeResult.error || 'Provider failed',
          rateLimited: cascadeResult.rateLimited 
        }];
      }
    }
    
    const cascadeAttempts = cascade.getAttempts();
    
    // Handle tool calling loop
    const { content: finalContent, toolsExecuted, finalMessages, iterations } = await handleToolCallingLoop(
      supabase,
      cascadeResult,
      aiMessages,
      userQuery,
      EXECUTIVE_NAME,
      cascade,
      useCache
    );
    
    // Check if we have a successful response
    if (finalContent) {
      return new Response(
        JSON.stringify({
          success: true,
          content: finalContent,
          executive: EXECUTIVE_NAME,
          provider: cascadeResult.provider,
          model: cascadeResult.model,
          hasToolCalls: toolsExecuted.length > 0,
          toolsExecuted,
          cascade_attempts: cascadeAttempts,
          executionTimeMs: Date.now() - startTime,
          session_id,
          schema_validated: toolsExecuted.every((t: any) => t.schemaValidated),
          tool_iterations: iterations
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Fallback response
    console.warn(`⚠️ All AI providers failed, using schema-aware fallback`);
    const fallbackContent = getSchemaAwareFallbackResponse(userQuery, providerErrors, cascadeAttempts);
    
    return new Response(
      JSON.stringify({
        success: true,
        content: fallbackContent,
        executive: EXECUTIVE_NAME,
        provider: 'fallback',
        model: 'schema-aware',
        hasToolCalls: false,
        cascade_attempts: cascadeAttempts,
        executionTimeMs: Date.now() - startTime,
        session_id,
        warning: 'Using schema-aware fallback response',
        database_schema: {
          tables_accessible: Object.values(DATABASE_CONFIG.tables).length,
          tools_available: ELIZA_TOOLS.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error(`💥 [${EXECUTIVE_NAME}] Critical error:`, error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        executive: EXECUTIVE_NAME,
        timestamp: new Date().toISOString(),
        database_schema: DATABASE_CONFIG,
        suggestion: 'Check environment variables and database connections'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
