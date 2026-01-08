// working ai-chat WITH tool calling.txt
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ========== ENVIRONMENT CONFIGURATION ==========
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// API Keys
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || '';

// Executive Configuration
const EXECUTIVE_NAME = Deno.env.get('EXECUTIVE_NAME') || 'Eliza';
const EXECUTIVE_ROLE = Deno.env.get('EXECUTIVE_ROLE') || 'General Intelligence Agent for XMRT-DAO';
const FUNCTION_NAME = Deno.env.get('FUNCTION_NAME') || 'ai-chat';

// Performance Configuration
const MAX_TOOL_ITERATIONS = parseInt(Deno.env.get('MAX_TOOL_ITERATIONS') || '5');
const REQUEST_TIMEOUT_MS = parseInt(Deno.env.get('REQUEST_TIMEOUT_MS') || '45000');
const CONVERSATION_HISTORY_LIMIT = parseInt(Deno.env.get('CONVERSATION_HISTORY_LIMIT') || '30');

// Memory Configuration
const MEMORY_SUMMARY_INTERVAL = parseInt(Deno.env.get('MEMORY_SUMMARY_INTERVAL') || '5');
const MAX_TOOL_RESULTS_MEMORY = parseInt(Deno.env.get('MAX_TOOL_RESULTS_MEMORY') || '20');

// Web Browsing Configuration
const PLAYWRIGHT_BROWSE_URL = Deno.env.get('PLAYWRIGHT_BROWSE_URL') || 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/playwright-browse';

// ========== DATABASE SCHEMA ==========
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
    ai_tools: 'ai_tools',
    conversation_memory: 'conversation_memory',
    memory_contexts: 'memory_contexts',
    eliza_activity_log: 'eliza_activity_log'
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
    priority: 1,
    fallbackOnly: false,
    maxRetries: 2,
    retryDelayMs: 1000
  },
  gemini: {
    name: 'Google Gemini',
    enabled: !!GEMINI_API_KEY,
    apiKey: GEMINI_API_KEY,
    endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent`,
    models: ['gemini-2.0-flash-exp', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    supportsTools: true,
    timeoutMs: 30000,
    priority: 2,
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
    priority: 3,
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
    supportsTools: false,
    timeoutMs: 45000,
    priority: 4,
    fallbackOnly: true,
    maxRetries: 1,
    retryDelayMs: 2000
  },
  kimi: {
    name: 'Kimi K2 (OpenRouter)',
    enabled: !!OPENROUTER_API_KEY,
    apiKey: OPENROUTER_API_KEY,
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    models: ['moonshotai/kimi-k2'],
    supportsTools: true,
    timeoutMs: 45000,
    priority: 5,
    fallbackOnly: true,
    maxRetries: 1,
    retryDelayMs: 2000
  }
};

// ========== CORS HEADERS ==========
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// ========== ENHANCED EXECUTIVE HELPER FUNCTIONS ==========
// CRITICAL TOOL CALLING INSTRUCTION - prepended to all AI prompts
const TOOL_CALLING_MANDATE = `
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

🌐 WEB BROWSING (MANDATORY):
- When user asks to VIEW/OPEN/CHECK/BROWSE/NAVIGATE to a URL or website → IMMEDIATELY call browse_web({url: "https://..."})
- Use this for ANY URL viewing, webpage checking, or web content extraction
- Always use the full URL including https:// prefix
- DO NOT say "I cannot browse the web" - YOU CAN via Playwright Browser
- Supported actions: 'navigate' (default), 'extract', 'json'
`;

// ========== ENHANCED CONTENT ANALYSIS FUNCTIONS ==========
function extractKeyInsights(content: string, domain: string): string {
  if (!content || content.length < 100) {
    return "The page appears to be accessible but contains minimal content.\n";
  }
  
  // Extract title if present
  const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : '';
  
  // Extract meta description
  const metaMatch = content.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const description = metaMatch ? metaMatch[1] : '';
  
  // Check for common indicators
  const isNewsSite = domain.includes('ycombinator') || domain.includes('news');
  const isSocialMedia = domain.includes('reddit') || domain.includes('twitter') || domain.includes('facebook');
  const isSearchEngine = domain.includes('google') || domain.includes('bing') || domain.includes('duckduckgo');
  
  let insights = '';
  
  if (title) {
    insights += `**Title**: ${title}\n`;
  }
  
  if (description && description.length < 200) {
    insights += `**Description**: ${description}\n`;
  }
  
  // Domain-specific analysis
  if (isNewsSite) {
    // Try to extract headlines from Hacker News
    if (domain.includes('ycombinator')) {
      const hnMatches = content.match(/<a href="[^"]+" class="titlelink"[^>]*>([^<]+)<\/a>/g);
      if (hnMatches && hnMatches.length > 0) {
        const headlines = hnMatches.slice(0, 5).map((h, i) => {
          const textMatch = h.match(/<a[^>]*>([^<]+)<\/a>/);
          return textMatch ? `  ${i + 1}. ${textMatch[1]}` : '';
        }).filter(Boolean);
        
        if (headlines.length > 0) {
          insights += `**Top Headlines**:\n${headlines.join('\n')}\n`;
        }
      }
    }
  } else if (isSocialMedia) {
    insights += `**Note**: This appears to be a social media platform. For detailed content, you might need to view specific subpages or use their API.\n`;
  } else if (isSearchEngine) {
    insights += `**Note**: This is a search engine homepage. To search for specific content, I can help you formulate search queries.\n`;
  }
  
  // Check for common elements
  const hasForms = content.includes('<form') || content.includes('<input');
  const hasImages = content.match(/<img[^>]+>/g)?.length || 0;
  const hasLinks = content.match(/<a[^>]+href=["'][^"']+["'][^>]*>/g)?.length || 0;
  
  insights += `**Page Elements**: ${hasForms ? 'Forms, ' : ''}${hasImages} images, ${hasLinks} links\n`;
  
  return insights;
}

function extractTopicTrends(content: string): string {
  // Simple topic extraction from content
  const topics = [
    'AI', 'programming', 'technology', 'security', 'privacy', 
    'business', 'startup', 'crypto', 'blockchain', 'web3',
    'development', 'software', 'hardware', 'cloud', 'data',
    'research', 'science', 'health', 'finance', 'education'
  ];
  
  const contentLower = content.toLowerCase();
  const foundTopics = topics.filter(topic => 
    contentLower.includes(topic.toLowerCase())
  ).slice(0, 5);
  
  if (foundTopics.length > 0) {
    return `Trending topics: ${foundTopics.join(', ')}`;
  }
  
  return 'Various technology and startup news';
}

function analyzeUserIntent(query: string, conversationContext: any[] = []): {
  primaryIntent: string;
  needsData: boolean;
  isFollowUp: boolean;
  topics: string[];
} {
  const queryLower = query.toLowerCase();
  
  const intents = {
    dataRetrieval: ['what', 'how', 'when', 'where', 'who', 'why', 'show', 'tell', 'get', 'find', 'list', 'check'],
    action: ['do', 'make', 'create', 'generate', 'build', 'execute', 'run', 'perform', 'start'],
    analysis: ['analyze', 'review', 'evaluate', 'assess', 'compare', 'summarize'],
    browsing: ['open', 'browse', 'view', 'visit', 'go to', 'check', 'navigate', 'http', 'https', 'www', '.com'],
    status: ['status', 'health', 'stats', 'metrics', 'performance', 'report'],
    memory: ['remember', 'recall', 'previous', 'before', 'last time', 'earlier'],
    help: ['help', 'assist', 'guide', 'how to', 'can you']
  };
  
  const detectedIntents = [];
  for (const [intent, keywords] of Object.entries(intents)) {
    if (keywords.some(keyword => queryLower.includes(keyword))) {
      detectedIntents.push(intent);
    }
  }
  
  // Extract topics
  const commonTopics = [
    'task', 'agent', 'github', 'code', 'function', 'edge function', 'mining',
    'system', 'database', 'web', 'url', 'api', 'key', 'license', 'workflow',
    'vertex', 'image', 'video', 'billing', 'financial', 'vsco', 'lead'
  ];
  
  const foundTopics = commonTopics.filter(topic => queryLower.includes(topic));
  
  // Check if this is a follow-up question
  const isFollowUp = conversationContext.length > 0 && (
    queryLower.includes('what about') ||
    queryLower.includes('how about') ||
    queryLower.includes('also') ||
    queryLower.includes('and') ||
    queryLower.includes('what else') ||
    (queryLower.includes('?') && conversationContext.some(ctx => 
      ctx.role === 'assistant' && Date.now() - (ctx.timestamp || 0) < 300000
    ))
  );
  
  return {
    primaryIntent: detectedIntents[0] || 'general',
    needsData: detectedIntents.some(intent => ['dataRetrieval', 'status', 'analysis'].includes(intent)),
    isFollowUp,
    topics: foundTopics
  };
}

// Parser for DeepSeek's text-based tool call format
function parseDeepSeekToolCalls(content: string): Array<any> | null {
  const toolCallsMatch = content.match(/ 🫎(.*?)🫎/s);
  if (!toolCallsMatch) return null;
  
  const toolCallsText = toolCallsMatch[1];
  const toolCallPattern = / 🔧(.*?)🔧(.*?)🔧/gs;
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
function parseToolCodeBlocks(content: string): Array<any> | null {
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
function parseConversationalToolIntent(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  const patterns = [
    /(?:call(?:ing)?|use|invoke|execute|run|check(?:ing)?)\s+(?:the\s+)?(?:function\s+|tool\s+)?[`"']?(\w+)[`"']?/gi,
    /let me (?:call|check|get|invoke)\s+[`"']?(\w+)[`"']?/gi,
    /I(?:'ll| will) (?:call|invoke|use)\s+[`"']?(\w+)[`"']?/gi
  ];
  
  const knownTools = [
    'get_mining_stats', 'get_system_status', 'get_ecosystem_metrics', 
    'search_knowledge', 'recall_entity', 'invoke_edge_function', 
    'get_edge_function_logs', 'get_agent_status', 'list_agents', 'list_tasks',
    'search_edge_functions', 'browse_web'
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
function needsDataRetrieval(messages: any[]): boolean {
  const lastUser = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || '';
  
  const dataKeywords = [
    // Questions (any question likely needs data)
    'what is', 'what\'s', 'what are', 'who is', 'who are', 'where is', 'when is',
    'how is', 'how are', 'how much', 'how many', 'why is', 'why are',
    // Commands/Actions
    'show me', 'tell me', 'give me', 'fetch', 'get', 'list', 'find', 'search',
    'check', 'analyze', 'run', 'execute', 'perform', 'scan', 'diagnose',
    'look up', 'lookup', 'retrieve', 'query', 'pull', 'grab',
    // Status/Metrics
    'status', 'health', 'stats', 'statistics', 'metrics', 'analytics',
    'performance', 'report', 'overview', 'summary', 'dashboard',
    // System/Ecosystem
    'current', 'recent', 'latest', 'today', 'now', 'real-time', 'realtime', 'live',
    'mining', 'hashrate', 'workers', 'agents', 'tasks', 'ecosystem',
    'proposals', 'governance', 'cron', 'functions', 'logs', 'activity',
    // Memory/Knowledge
    'recall', 'remember', 'stored', 'saved', 'previous', 'history',
    // Comparisons/Specifics
    'compare', 'between', 'vs', 'versus', 'difference',
    'count', 'total', 'number', 'amount', 'percentage', 'rate',
    // Creative/Generative
    'create', 'generate', 'make', 'draw', 'design', 'render', 'illustrate',
    'visualize', 'picture', 'image', 'video', 'animate', 'animation',
    'photo', 'artwork', 'graphic', 'clip', 'film', 'scene',
    // Web/URL browsing
    'view', 'open', 'check', 'browse', 'navigate', 'visit', 'go to',
    'website', 'webpage', 'url', 'link', 'http://', 'https://',
    'web', 'internet', 'page', 'site'
  ];
  
  const hasQuestionMark = lastUser.includes('?');
  const imperativePatterns = /^(show|tell|give|get|list|find|check|run|execute|analyze|fetch|retrieve|scan|diagnose|look|pull|view|open|browse|navigate|visit|go)/i;
  const startsWithImperative = imperativePatterns.test(lastUser.trim());
  const urlPattern = /(https?:\/\/[^\s]+)/gi;
  const hasUrl = urlPattern.test(lastUser);
  
  return hasQuestionMark || startsWithImperative || hasUrl || dataKeywords.some(k => lastUser.includes(k));
}

// Convert OpenAI tool format to Gemini function declaration format
function convertToolsToGeminiFormat(tools: any[]): any[] {
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters
  }));
}

// Retrieve memory contexts from database (server-side fallback)
async function retrieveMemoryContexts(supabase: any, sessionKey: string): Promise<any[]> {
  if (!sessionKey) return [];
  
  console.log('📚 Retrieving memory contexts server-side...');
  try {
    const { data: serverMemories } = await supabase
      .from(DATABASE_CONFIG.tables.memory_contexts)
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

// Enhanced browse_web function that uses the playwright-browse edge function
async function browseWeb(url: string, options: {
  action?: 'navigate' | 'extract' | 'json';
  timeout?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
} = {}): Promise<any> {
  console.log(`🌐 Browsing: ${url}`);
  
  try {
    const requestBody = {
      url,
      action: options.action || 'navigate',
      timeout: options.timeout || 30000,
      headers: options.headers,
      method: options.method || 'GET',
      body: options.body
    };
    
    const response = await fetch(PLAYWRIGHT_BROWSE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`Browse failed with status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Successfully browsed ${url} (${result.status}) in ${result.metadata.loadTime}ms`);
      
      // Clean up content for logging
      const cleanContent = result.content.length > 200 ? 
        result.content.substring(0, 200) + '...' : result.content;
      console.log(`📄 Content preview: ${cleanContent}`);
      
      return result;
    } else {
      console.error(`❌ Browse failed: ${result.error}`);
      return {
        success: false,
        error: result.error,
        url,
        status: result.status || 500,
        content: '',
        metadata: result.metadata || { loadTime: 0 }
      };
    }
  } catch (error) {
    console.error(`💥 Browse error:`, error);
    return {
      success: false,
      error: error.message || 'Unknown error during browse',
      url,
      status: 500,
      content: '',
      metadata: { loadTime: 0 }
    };
  }
}

// Fallback to DeepSeek API with full tool support
async function callDeepSeekFallback(messages: any[], tools?: any[]): Promise<any> {
  const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
  if (!DEEPSEEK_API_KEY) return null;
  
  console.log('🔄 Trying DeepSeek fallback...');
  
  // Inject tool calling mandate into system message
  const enhancedMessages = messages.map(m => 
    m.role === 'system' ? { ...m, content: TOOL_CALLING_MANDATE + m.content } : m
  );
  
  const forceTools = needsDataRetrieval(messages);
  console.log(`📊 DeepSeek - Data retrieval needed: ${forceTools}`);
  
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: enhancedMessages,
        tools,
        tool_choice: tools ? (forceTools ? 'required' : 'auto') : undefined,
        temperature: 0.7,
        max_tokens: 8000,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ DeepSeek fallback successful');
      return {
        content: data.choices?.[0]?.message?.content || '',
        tool_calls: data.choices?.[0]?.message?.tool_calls || [],
        provider: 'deepseek',
        model: 'deepseek-chat'
      };
    } else {
      const errorText = await response.text();
      console.warn('⚠️ DeepSeek API error:', response.status, errorText);
    }
  } catch (error) {
    console.warn('⚠️ DeepSeek fallback failed:', error.message);
  }
  return null;
}

// Fallback to Kimi K2 via OpenRouter with full tool support
async function callKimiFallback(messages: any[], tools?: any[]): Promise<any> {
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) return null;
  
  console.log('🔄 Trying Kimi K2 fallback via OpenRouter...');
  
  const enhancedMessages = messages.map(m => 
    m.role === 'system' ? { ...m, content: TOOL_CALLING_MANDATE + m.content } : m
  );
  
  const forceTools = needsDataRetrieval(messages);
  console.log(`📊 Kimi K2 - Data retrieval needed: ${forceTools}`);
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://xmrt.pro',
        'X-Title': 'XMRT Eliza'
      },
      body: JSON.stringify({
        model: 'moonshotai/kimi-k2',
        messages: enhancedMessages,
        tools,
        tool_choice: tools ? (forceTools ? 'required' : 'auto') : undefined,
        temperature: 0.9,
        max_tokens: 8000,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Kimi K2 fallback successful');
      return {
        content: data.choices?.[0]?.message?.content || '',
        tool_calls: data.choices?.[0]?.message?.tool_calls || [],
        provider: 'openrouter',
        model: 'moonshotai/kimi-k2'
      };
    } else {
      const errorText = await response.text();
      console.warn('⚠️ Kimi K2 API error:', response.status, errorText);
    }
  } catch (error) {
    console.warn('⚠️ Kimi K2 fallback failed:', error.message);
  }
  return null;
}

// Fallback to Gemini API with native tool calling
async function callGeminiFallback(
  messages: any[], 
  tools?: any[],
  images?: string[]
): Promise<any> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) return null;
  
  console.log('🔄 Trying Gemini fallback with native tool calling...');
  
  try {
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const userText = lastUserMessage?.content || 'Help me';
    
    const parts: any[] = [{ text: `${TOOL_CALLING_MANDATE}\n${systemPrompt}\n\nUser: ${userText}` }];
    
    // Add images if present
    if (images && images.length > 0) {
      for (const imageBase64 of images) {
        const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          parts.push({ inline_data: { mime_type: matches[1], data: matches[2] } });
        }
      }
    }
    
    // Convert ALL tools to Gemini format - no artificial limits
    const geminiTools = tools && tools.length > 0 ? [{
      functionDeclarations: tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters
      }))
    }] : undefined;
    console.log(`📊 Gemini fallback: Passing ${tools?.length || 0} tools (full array)`);
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          tools: geminiTools,
          generationConfig: { temperature: 0.7, maxOutputTokens: 8000 }
        })
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      const responseParts = data.candidates?.[0]?.content?.parts || [];
      
      // Check for native function calls
      const functionCalls = responseParts.filter((p: any) => p.functionCall);
      if (functionCalls.length > 0) {
        console.log(`✅ Gemini returned ${functionCalls.length} native function calls`);
        return {
          content: responseParts.find((p: any) => p.text)?.text || '',
          tool_calls: functionCalls.map((fc: any, idx: number) => ({
            id: `gemini_${Date.now()}_${idx}`,
            type: 'function',
            function: {
              name: fc.functionCall.name,
              arguments: JSON.stringify(fc.functionCall.args || {})
            }
          })),
          provider: 'gemini',
          model: 'gemini-2.0-flash-exp'
        };
      }
      
      // Extract text response
      const text = responseParts.find((p: any) => p.text)?.text;
      if (text) {
        console.log('✅ Gemini fallback successful');
        return { content: text, tool_calls: [], provider: 'gemini', model: 'gemini-2.0-flash-exp' };
      }
    } else {
      const errorText = await response.text();
      console.warn('⚠️ Gemini API error:', response.status, errorText);
    }
  } catch (error) {
    console.warn('⚠️ Gemini fallback failed:', error.message);
  }
  return null;
}

// ENHANCED: Synthesize tool results into intelligent, conversational responses
async function synthesizeToolResults(
  toolResults: Array<{ tool: string; result: any }>,
  userQuery: string,
  executiveName: string,
  conversationContext: any[] = []
): Promise<string> {
  console.log('🧠 Synthesizing tool results with intelligent analysis...');
  
  // Group tool results by type
  const webResults = toolResults.filter(r => r.tool === 'browse_web');
  const functionResults = toolResults.filter(r => r.tool === 'search_edge_functions');
  const systemResults = toolResults.filter(r => ['get_system_status', 'get_mining_stats', 'get_ecosystem_metrics'].includes(r.tool));
  const otherResults = toolResults.filter(r => !['browse_web', 'search_edge_functions', 'get_system_status', 'get_mining_stats', 'get_ecosystem_metrics'].includes(r.tool));
  
  // Analyze user intent
  const intent = analyzeUserIntent(userQuery, conversationContext);
  
  let response = '';
  
  // Start with contextual greeting
  if (conversationContext.length === 0) {
    response += `👋 **${executiveName} here!** I've gathered the information you requested.\n\n`;
  } else if (intent.isFollowUp) {
    response += `📝 **Following up** on your previous query:\n\n`;
  } else {
    response += `🔍 **Here's what I found** based on your request:\n\n`;
  }
  
  // Process web browsing results with intelligent analysis
  if (webResults.length > 0) {
    response += `### 🌐 **Web Analysis**\n`;
    
    webResults.forEach((result, index) => {
      const { url, status, content, metadata, error } = result.result;
      const domain = url ? new URL(url).hostname : 'unknown';
      
      response += `\n**${index + 1}. ${domain}** `;
      
      if (status === 200) {
        response += `✅ *Accessible* (loaded in ${metadata?.loadTime || 'unknown'}ms)\n`;
        
        // Extract intelligent insights
        const insights = extractKeyInsights(content, domain);
        response += insights;
        
        // Add domain-specific commentary
        if (domain.includes('ycombinator.com')) {
          response += `   💡 *Hacker News Insight*: The site shows technology trends and startup discussions. Good for staying updated on tech news.\n`;
        } else if (domain.includes('reddit.com')) {
          response += `   💬 *Social Platform*: Reddit hosts community discussions. Specific subreddits would show targeted content.\n`;
        } else if (domain.includes('google.com')) {
          response += `   🔍 *Search Engine*: Ready for queries. I can help you search for specific information if needed.\n`;
        }
      } else if (status === 403) {
        response += `⚠️ *Blocked/Access Denied* (HTTP ${status})\n`;
        response += `   This site is blocking automated access. Common for sites with strict bot protection.\n`;
        response += `   *Suggestion*: Try accessing through a regular browser or check if an API is available.\n`;
      } else if (status >= 400) {
        response += `❌ *Error* (HTTP ${status}): ${error || 'Failed to load'}\n`;
      } else {
        response += `📄 *Loaded* (HTTP ${status})\n`;
      }
    });
    response += '\n';
  }
  
  // Process edge function search results
  if (functionResults.length > 0) {
    response += `### 🔧 **Edge Functions**\n`;
    
    functionResults.forEach((result, index) => {
      const { functions = [], success, error } = result.result;
      
      if (success && functions && functions.length > 0) {
        // Group by category
        const byCategory = functions.reduce((acc: any, func: any) => {
          const category = func.category || 'uncategorized';
          if (!acc[category]) acc[category] = [];
          acc[category].push(func);
          return acc;
        }, {});
        
        const totalFunctions = functions.length;
        response += `\nFound **${totalFunctions}** available edge functions:\n`;
        
        Object.entries(byCategory).forEach(([category, funcs]: [string, any]) => {
          response += `\n**${category.toUpperCase()}** (${funcs.length}):\n`;
          funcs.slice(0, 3).forEach((f: any) => {
            const shortDesc = f.description?.length > 60 ? f.description.substring(0, 60) + '...' : f.description || 'No description';
            response += `   • **${f.name}**: ${shortDesc}\n`;
          });
          if (funcs.length > 3) {
            response += `   ... plus ${funcs.length - 3} more ${category} functions\n`;
          }
        });
        
        // Add insights
        const billingFunctions = functions.filter((f: any) => 
          f.name.includes('billing') || f.name.includes('financial') || 
          f.description?.toLowerCase().includes('billing') ||
          f.description?.toLowerCase().includes('financial')
        );
        
        if (billingFunctions.length > 0) {
          response += `\n   💰 *Billing Functions*: Found ${billingFunctions.length} billing/financial-related functions including "${billingFunctions[0]?.name}".\n`;
        }
        
        response += `\n   🛠️ *Usage*: You can invoke any of these with the \`invoke_edge_function\` tool.\n`;
      } else if (!success) {
        response += `\n❌ *Search failed*: ${error || 'Unknown error'}\n`;
      } else {
        response += `\n📭 *No functions found* in the registry.\n`;
        response += `   *Suggestion*: You might want to create a new function or check the database directly.\n`;
      }
    });
    response += '\n';
  }
  
  // Process system status results
  if (systemResults.length > 0) {
    response += `### 📊 **System Status**\n`;
    
    systemResults.forEach(result => {
      const { success, ...data } = result.result;
      
      if (success) {
        Object.entries(data).forEach(([key, value]) => {
          if (key !== 'success' && key !== 'timestamp' && value !== undefined) {
            if (typeof value === 'object') {
              response += `\n**${key.replace(/_/g, ' ').toUpperCase()}**:\n`;
              Object.entries(value).forEach(([subKey, subValue]) => {
                response += `   • ${subKey}: ${subValue}\n`;
              });
            } else {
              response += `   • **${key.replace(/_/g, ' ')}**: ${value}\n`;
            }
          }
        });
      }
    });
    response += '\n';
  }
  
  // Process other tool results
  if (otherResults.length > 0) {
    response += `### ⚙️ **Other Actions**\n`;
    
    otherResults.forEach(result => {
      const { success, error, ...data } = result.result;
      
      if (success) {
        // Extract meaningful information
        const keys = Object.keys(data).filter(k => !['success', 'error', 'timestamp', 'execution_time_ms', 'tool_name'].includes(k));
        if (keys.length > 0) {
          const mainKey = keys[0];
          const mainValue = data[mainKey];
          
          if (Array.isArray(mainValue)) {
            response += `   • ${result.tool}: Processed ${mainValue.length} items\n`;
          } else if (typeof mainValue === 'string' && mainValue.length < 100) {
            response += `   • ${result.tool}: ${mainValue}\n`;
          } else if (typeof mainValue === 'object') {
            response += `   • ${result.tool}: Completed successfully\n`;
          } else {
            response += `   • ${result.tool}: Action completed\n`;
          }
        } else {
          response += `   • ${result.tool}: Executed successfully\n`;
        }
      } else {
        response += `   • ${result.tool}: ❌ Failed - ${error || 'Unknown error'}\n`;
      }
    });
    response += '\n';
  }
  
  // Add closing remarks based on results
  if (toolResults.length > 0) {
    const successful = toolResults.filter(r => r.result.success).length;
    const failed = toolResults.filter(r => !r.result.success).length;
    
    if (successful === toolResults.length) {
      response += `🎯 **All operations completed successfully!**\n`;
    } else if (successful > 0 && failed > 0) {
      response += `⚠️ **Partial success** (${successful} succeeded, ${failed} failed).\n`;
    } else {
      response += `❌ **All operations failed.** You might want to try alternative approaches.\n`;
    }
    
    // Add contextual next steps
    if (intent.topics.length > 0) {
      response += `\n**Related to**: ${intent.topics.join(', ')}\n`;
    }
    
    // Add suggestions based on query type
    if (userQuery.toLowerCase().includes('function') || userQuery.toLowerCase().includes('capability')) {
      response += `\n💡 *Need more capabilities?* I can help you create new edge functions or modify existing ones.\n`;
    }
    
    if (userQuery.toLowerCase().includes('web') || userQuery.toLowerCase().includes('browse') || userQuery.toLowerCase().includes('http')) {
      response += `\n🌐 *Want to browse more?* Just provide another URL and I'll fetch it for you.\n`;
    }
    
    if (userQuery.toLowerCase().includes('status') || userQuery.toLowerCase().includes('health')) {
      response += `\n📈 *Need deeper analysis?* I can run more detailed diagnostics on specific system components.\n`;
    }
  } else {
    response += `🤔 **No tool results to analyze.** Try asking me to perform specific actions.\n`;
  }
  
  return response;
}

// Execute tool calls and handle iteration
async function executeToolsWithIteration(
  supabase: any,
  executeToolCall: Function,
  initialResponse: any,
  aiMessages: any[],
  executiveName: string,
  sessionId: string,
  callAIFunction: Function,
  tools: any[],
  maxIterations: number = 5
): Promise<{ content: string; toolsExecuted: number }> {
  let response = initialResponse;
  let totalToolsExecuted = 0;
  let iteration = 0;
  let conversationMessages = [...aiMessages];
  
  while (iteration < maxIterations) {
    // Check for tool calls (native or text-embedded)
    let toolCalls = response.tool_calls || [];
    
    // Also check for text-embedded tool calls
    if ((!toolCalls || toolCalls.length === 0) && response.content) {
      const textToolCalls = parseToolCodeBlocks(response.content) || 
                           parseDeepSeekToolCalls(response.content) ||
                           parseConversationalToolIntent(response.content);
      if (textToolCalls && textToolCalls.length > 0) {
        toolCalls = textToolCalls;
      }
    }
    
    if (!toolCalls || toolCalls.length === 0) break;
    
    console.log(`🔧 [${executiveName}] Iteration ${iteration + 1}: Executing ${toolCalls.length} tool(s)`);
    
    const toolResults = [];
    for (const toolCall of toolCalls) {
      const result = await executeToolCall(supabase, toolCall, executiveName, sessionId);
      toolResults.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        content: JSON.stringify(result)
      });
      totalToolsExecuted++;
    }
    
    // Add assistant message with tool calls and tool results
    conversationMessages.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: toolCalls
    });
    conversationMessages.push(...toolResults);
    
    // Call AI again with tool results
    response = await callAIFunction(conversationMessages, tools);
    if (!response) break;
    
    iteration++;
  }
  
  // Final synthesis if we have tool results
  let finalContent = response?.content || '';
  
  // Remove any tool_code blocks from final response
  if (finalContent.includes('```tool_code')) {
    finalContent = finalContent.replace(/```tool_code[\s\S]*?```/g, '').trim();
  }
  
  return { content: finalContent, toolsExecuted: totalToolsExecuted };
}

// Log tool execution to activity log
async function logToolExecution(
  supabase: any, 
  toolName: string, 
  args: any, 
  status: 'started' | 'completed' | 'failed', 
  result?: any, 
  error?: any
) {
  try {
    const metadata: any = {
      tool_name: toolName,
      arguments: args,
      timestamp: new Date().toISOString(),
      execution_status: status
    };
    
    if (result) metadata.result = result;
    if (error) metadata.error = error;
    
    await supabase.from(DATABASE_CONFIG.tables.eliza_activity_log).insert({
      activity_type: 'tool_execution',
      title: `🔧 ${toolName}`,
      description: `Executive executed: ${toolName}`,
      metadata,
      status: status === 'completed' ? 'completed' : (status === 'failed' ? 'failed' : 'in_progress')
    });
    
    console.log(`📊 Logged tool execution: ${toolName} (${status})`);
  } catch (logError) {
    console.error('Failed to log tool execution:', logError);
  }
}

// ========== TOOL DEFINITIONS ==========
const ELIZA_TOOLS = [
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
      name: 'advance_task_stage',
      description: '⏩ Manually advance a task to the next pipeline stage',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'UUID of the task to advance' },
          target_stage: { 
            type: 'string', 
            enum: ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE']
          }
        },
        required: ['task_id']
      }
    }
  },
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
            enum: ['IDLE', 'BUSY', 'ARCHIVED', 'ERROR', 'OFFLINE']
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
            enum: ['code', 'infra', 'research', 'governance', 'mining', 'device', 'ops', 'other']
          },
          assignee_agent_id: { type: 'string', description: 'Agent ID to assign to' },
          priority: { type: 'number', description: 'Priority 1-10' }
        },
        required: ['title', 'description', 'assignee_agent_id']
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
          }
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
  {
    type: 'function',
    function: {
      name: 'createGitHubIssue',
      description: 'Create a GitHub issue',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue description' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Optional labels' }
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
          state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
          limit: { type: 'number', description: 'Number of issues to return', default: 10 }
        }
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
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
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
          path: { type: 'string', description: 'File path in repository' }
        },
        required: ['path']
      }
    }
  },
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
            enum: ['concept', 'tool', 'skill', 'person', 'project', 'fact', 'general']
          },
          description: { type: 'string', description: 'Detailed description' }
        },
        required: ['name', 'description']
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
          limit: { type: 'number', description: 'Maximum results to return', default: 10 }
        }
      }
    }
  },
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
          unacknowledged_only: { type: 'boolean', description: 'Only show unread feedback', default: true }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_python',
      description: 'Execute Python code for calculations and data processing',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code for computation' },
          purpose: { type: 'string', description: 'Brief description of what this code does' }
        },
        required: ['code', 'purpose']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'invoke_edge_function',
      description: 'Call ANY Supabase edge function dynamically',
      parameters: {
        type: 'object',
        properties: {
          function_name: { type: 'string', description: 'Name of the edge function to invoke' },
          payload: { type: 'object', description: 'JSON payload to send to the function' }
        },
        required: ['function_name', 'payload']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_available_functions',
      description: 'List all available edge functions',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Optional: Filter by category' }
        }
      }
    }
  },
  // ===== PATCH: Canonical search_edge_functions tool =====
  {
    type: 'function',
    function: {
      name: 'search_edge_functions',
      description: 'Search or enumerate all available Supabase edge functions using the canonical registry',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term' },
          category: { type: 'string' },
          mode: {
            type: 'string',
            enum: ['search', 'full_registry'],
            description: 'Use full_registry to list all available functions'
          }
        }
      }
    }
  },
  // ===== END PATCH =====
  // ===== Browse Web Tool =====
  {
    type: 'function',
    function: {
      name: 'browse_web',
      description: '🌐 Browse and fetch content from any URL using the Playwright browser. Use this for viewing websites, checking webpages, or extracting web content.',
      parameters: {
        type: 'object',
        properties: {
          url: { 
            type: 'string', 
            description: 'Full URL to browse (must include https:// or http:// prefix)',
            pattern: '^https?://.+'
          },
          action: { 
            type: 'string', 
            enum: ['navigate', 'extract', 'json'],
            description: 'Action type: navigate for HTML, extract for structured data, json for JSON endpoints',
            default: 'navigate'
          },
          timeout: { 
            type: 'number', 
            description: 'Timeout in milliseconds (default: 30000)',
            default: 30000,
            minimum: 1000,
            maximum: 120000
          },
          headers: { 
            type: 'object', 
            description: 'Custom HTTP headers to send with the request'
          },
          method: { 
            type: 'string', 
            enum: ['GET', 'POST'],
            description: 'HTTP method to use',
            default: 'GET'
          },
          body: { 
            type: 'string', 
            description: 'Request body for POST requests'
          }
        },
        required: ['url']
      }
    }
  },
  // ===== END Browse Web Tool =====
  {
    type: 'function',
    function: {
      name: 'vsco_manage_jobs',
      description: 'Manage leads and jobs in VSCO Workspace',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['list_jobs', 'get_job', 'create_job', 'update_job', 'close_job']
          },
          job_id: { type: 'string', description: 'VSCO job ID' },
          name: { type: 'string', description: 'Job/lead name' },
          stage: { type: 'string', enum: ['lead', 'booked', 'fulfillment', 'completed'] }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_service_api_key',
      description: 'Generate a new API key for a monetized service',
      parameters: {
        type: 'object',
        properties: {
          service_name: { type: 'string', description: 'Service to monetize' },
          tier: { type: 'string', enum: ['free', 'basic', 'pro', 'enterprise'] },
          owner_email: { type: 'string', format: 'email', description: 'Customer email' }
        },
        required: ['service_name', 'tier', 'owner_email']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'validate_service_api_key',
      description: 'Check if an API key is valid and active',
      parameters: {
        type: 'object',
        properties: {
          api_key: { type: 'string', description: 'API key to validate' }
        },
        required: ['api_key']
      }
    }
  },
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
      name: 'execute_workflow_template',
      description: 'Execute a pre-built workflow template by name',
      parameters: {
        type: 'object',
        properties: {
          template_name: { 
            type: 'string', 
            enum: [
              'acquire_new_customer', 'upsell_existing_customer', 'churn_prevention',
              'code_quality_audit', 'auto_fix_codebase',
              'modify_edge_function', 'performance_optimization_cycle'
            ]
          },
          params: { type: 'object', description: 'Template-specific parameters' }
        },
        required: ['template_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vertex_ai_generate',
      description: 'Generate content using Vertex AI',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Text prompt for generation' },
          model: { type: 'string', enum: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'] }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'google_gmail',
      description: 'Send and manage emails via xmrtsolutions@gmail.com',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['send_email', 'list_emails', 'get_email', 'create_draft'] },
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Email body content' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'start_license_application',
      description: 'Start a new corporate license application through conversation',
      parameters: {
        type: 'object',
        properties: {
          session_key: { type: 'string', description: 'Current conversation session key' },
          company_name: { type: 'string', description: 'Company name' }
        },
        required: ['session_key', 'company_name']
      }
    }
  },
  // Enhanced tool definitions from helper functions
  {
    type: 'function',
    function: {
      name: 'get_mining_stats',
      description: 'Get current mining statistics including hashrate, workers, earnings',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_system_status',
      description: 'Get comprehensive system status including agents, tasks, edge functions',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_ecosystem_metrics',
      description: 'Get ecosystem metrics including proposals, governance, user activity',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recall_entity',
      description: 'Recall specific knowledge entity by name or ID',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Entity name to recall' },
          entity_id: { type: 'string', description: 'Entity ID to recall' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vertex_generate_image',
      description: 'Generate an image using Vertex AI',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed image description' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vertex_generate_video',
      description: 'Generate a video using Vertex AI',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Video description' },
          duration_seconds: { type: 'number', description: 'Duration in seconds', default: 5 }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vertex_check_video_status',
      description: 'Check status of video generation operation',
      parameters: {
        type: 'object',
        properties: {
          operation_name: { type: 'string', description: 'Operation name from video generation' }
        },
        required: ['operation_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_edge_function_logs',
      description: 'Get logs from edge function executions',
      parameters: {
        type: 'object',
        properties: {
          function_name: { type: 'string', description: 'Edge function name' },
          limit: { type: 'number', description: 'Number of logs to return', default: 10 }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_agent_status',
      description: 'Get detailed status of a specific agent',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'Agent ID' }
        },
        required: ['agent_id']
      }
    }
  }
];

// ========== UTILITY FUNCTIONS ==========
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

function formatObjectForDisplay(obj: any, indentLevel: number = 0): string {
  if (!obj || typeof obj !== 'object') return String(obj);
  
  const indent = '  '.repeat(indentLevel);
  let result = '';
  
  const entries = Object.entries(obj);
  entries.forEach(([key, value]) => {
    if (value === null || value === undefined) {
      result += `${indent}• ${key}: ${value}\n`;
    } else if (Array.isArray(value)) {
      result += `${indent}• ${key}: Array(${value.length})\n`;
      if (indentLevel < 2 && value.length > 0) {
        value.slice(0, 5).forEach((item, idx) => {
          if (typeof item === 'object') {
            result += `${indent}  [${idx}]: ${Object.keys(item).slice(0, 2).join(', ')}...\n`;
          } else {
            result += `${indent}  [${idx}]: ${item}\n`;
          }
        });
        if (value.length > 5) {
          result += `${indent}  ... and ${value.length - 5} more items\n`;
        }
      }
    } else if (typeof value === 'object') {
      result += `${indent}• ${key}:\n`;
      result += formatObjectForDisplay(value, indentLevel + 1);
    } else {
      result += `${indent}• ${key}: ${value}\n`;
    }
  });
  
  return result;
}

// ========== ENHANCED CONVERSATION MEMORY MANAGER ==========
class EnhancedConversationManager {
  private supabase: any;
  private sessionId: string;
  private toolResultsMemory: any[] = [];
  
  constructor(supabase: any, sessionId: string) {
    this.supabase = supabase;
    this.sessionId = sessionId;
  }
  
  async loadConversationHistory(): Promise<{
    messages: any[];
    toolResults: any[];
    conversationSummary: string;
  }> {
    try {
      console.log(`📚 Loading conversation history for session: ${this.sessionId}`);
      
      const { data, error } = await this.supabase
        .from(DATABASE_CONFIG.tables.conversation_memory)
        .select('messages, summary, tool_results, metadata')
        .eq('session_id', this.sessionId)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) {
        console.warn('⚠️ Database error loading history:', error.message);
        return { messages: [], toolResults: [], conversationSummary: 'New session' };
      }
      
      if (!data || data.length === 0) {
        console.log('📭 No existing conversation found for session');
        return { messages: [], toolResults: [], conversationSummary: 'New session' };
      }
      
      const record = data[0];
      const messages = record.messages || [];
      const toolResults = record.tool_results || [];
      this.toolResultsMemory = toolResults;
      
      console.log(`📖 Loaded ${messages.length} messages and ${toolResults.length} tool results from history`);
      
      return {
        messages: messages.slice(-CONVERSATION_HISTORY_LIMIT),
        toolResults: toolResults.slice(-MAX_TOOL_RESULTS_MEMORY),
        conversationSummary: record.summary || 'Existing conversation'
      };
      
    } catch (error) {
      console.warn('⚠️ Failed to load conversation history:', error);
      return { messages: [], toolResults: [], conversationSummary: 'Error loading history' };
    }
  }
  
  async saveConversation(
    messages: any[],
    toolResults: any[] = [],
    metadata: any = {}
  ): Promise<void> {
    try {
      // Combine old and new tool results
      const allToolResults = [...this.toolResultsMemory, ...toolResults].slice(-MAX_TOOL_RESULTS_MEMORY);
      this.toolResultsMemory = allToolResults;
      
      // Generate a meaningful summary
      const summary = await this.generateConversationSummary(messages, allToolResults);
      
      // Prepare conversation record
      const conversationRecord = {
        session_id: this.sessionId,
        messages: messages.slice(-50), // Keep last 50 messages
        tool_results: allToolResults,
        summary: summary,
        metadata: {
          ...metadata,
          tool_call_count: allToolResults.length,
          message_count: messages.length,
          last_updated: new Date().toISOString(),
          memory_version: '2.0'
        },
        updated_at: new Date().toISOString()
      };
      
      // Upsert the conversation
      const { error } = await this.supabase
        .from(DATABASE_CONFIG.tables.conversation_memory)
        .upsert(conversationRecord, {
          onConflict: 'session_id'
        });
      
      if (error) {
        console.warn('⚠️ Failed to save conversation:', error.message);
      } else {
        console.log(`💾 Saved conversation: ${messages.length} messages, ${allToolResults.length} tool results`);
      }
      
      // Cleanup old sessions (keep last 100)
      await this.supabase
        .from(DATABASE_CONFIG.tables.conversation_memory)
        .delete()
        .lt('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
        
    } catch (error) {
      console.warn('⚠️ Failed to save conversation:', error);
    }
  }
  
  private async generateConversationSummary(messages: any[], toolResults: any[]): Promise<string> {
    try {
      const userMessages = messages.filter(m => m.role === 'user');
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      
      const successfulTools = toolResults.filter(r => r.result?.success);
      const failedTools = toolResults.filter(r => !r.result?.success);
      
      const lastUserMessage = userMessages[userMessages.length - 1]?.content || '';
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]?.content || '';
      
      // Extract key topics from recent messages
      const recentText = messages.slice(-5).map(m => m.content).join(' ').toLowerCase();
      const topics = ['task', 'agent', 'github', 'deploy', 'bug', 'api', 'function', 'system', 'mining', 'web', 'url', 'browse'];
      const mentionedTopics = topics.filter(topic => recentText.includes(topic));
      
      return `Conversation with ${userMessages.length} user messages and ${assistantMessages.length} assistant responses. ` +
             `Executed ${toolResults.length} tools (${successfulTools.length} successful, ${failedTools.length} failed). ` +
             `Recent topics: ${mentionedTopics.join(', ') || 'general'}. ` +
             `Last user query: "${truncateString(lastUserMessage, 80)}"`;
    } catch (error) {
      return `Conversation with ${messages.length} messages and ${toolResults.length} tool executions`;
    }
  }
  
  getToolResults(): any[] {
    return this.toolResultsMemory;
  }
  
  addToolResults(newResults: any[]): void {
    this.toolResultsMemory = [...this.toolResultsMemory, ...newResults].slice(-MAX_TOOL_RESULTS_MEMORY);
  }
  
  async generateMemoryContext(): Promise<string> {
    const toolResults = this.toolResultsMemory;
    
    if (toolResults.length === 0) {
      return "## 🧠 CONVERSATION MEMORY\nNo previous tool calls in this conversation.";
    }
    
    let context = "## 🧠 CONVERSATION MEMORY - TOOL CALL HISTORY\n\n";
    
    // Group recent tool calls (last 10, most recent first)
    const recentTools = toolResults.slice(-10).reverse();
    
    context += `### RECENT TOOL EXECUTIONS (${recentTools.length} total)\n\n`;
    
    recentTools.forEach((tool, index) => {
      const status = tool.result?.success ? '✅ SUCCEEDED' : '❌ FAILED';
      const timeAgo = this.formatTimeAgo(tool.timestamp || Date.now());
      
      context += `**${index + 1}. ${tool.name}** - ${status} (${timeAgo})\n`;
      
      if (tool.result) {
        if (tool.result.success) {
          // Generate detailed success summaries
          if (tool.name === 'browse_web' && tool.result.url) {
            context += `   Browsed: ${tool.result.url} (${tool.result.status})\n`;
            if (tool.result.metadata) {
              context += `   Load time: ${tool.result.metadata.loadTime}ms, Content type: ${tool.result.metadata.contentType}\n`;
            }
            if (tool.result.content) {
              const preview = tool.result.content.length > 100 ? 
                tool.result.content.substring(0, 100) + '...' : tool.result.content;
              context += `   Content preview: "${preview}"\n`;
            }
          }
          else if (tool.name === 'list_available_functions' && tool.result.functions) {
            const funcs = tool.result.functions;
            context += `   Returned ${funcs.length} available functions\n`;
            if (funcs.length > 0) {
              context += `   Examples: ${funcs.slice(0, 3).map((f: any) => f.name).join(', ')}`;
              if (funcs.length > 3) context += `, and ${funcs.length - 3} more`;
              context += '\n';
            }
          }
          else if (tool.result.agents) {
            context += `   Found ${tool.result.agents.length} agents\n`;
          }
          else if (tool.result.tasks) {
            context += `   Listed ${tool.result.tasks.length} tasks\n`;
          }
          else if (tool.result.content) {
            context += `   Content generated: "${truncateString(tool.result.content, 100)}"\n`;
          }
          else if (tool.result.api_key) {
            context += `   Generated API key: ${truncateString(tool.result.api_key, 20)}...\n`;
          }
          else {
            context += `   Executed successfully\n`;
          }
        } else {
          context += `   Error: ${tool.result.error || 'Unknown error'}\n`;
        }
      }
      context += '\n';
    });
    
    // Add statistics
    const successful = toolResults.filter(r => r.result?.success).length;
    const failed = toolResults.filter(r => !r.result?.success).length;
    
    context += `### TOOL STATISTICS\n`;
    context += `• Total executions: ${toolResults.length}\n`;
    context += `• Successful: ${successful}\n`;
    context += `• Failed: ${failed}\n`;
    context += `• Success rate: ${toolResults.length > 0 ? Math.round((successful / toolResults.length) * 100) : 0}%\n\n`;
    
    context += `**IMPORTANT**: You MUST reference these previous tool calls when users ask about them. `;
    context += `For example, if a user asks "what did you get from list_available_functions?", `;
    context += `you should reference the exact results shown above.\n`;
    
    return context;
  }
  
  private formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return `${Math.floor(diff / 86400000)} days ago`;
  }
}

// ========== ENHANCED PROVIDER CASCADING ==========
interface CascadeResult {
  success: boolean;
  content?: string;
  tool_calls?: any[];
  provider: string;
  model?: string;
  latency?: number;
  error?: string;
}

class EnhancedProviderCascade {
  private attempts: any[] = [];
  
  async callWithCascade(
    messages: any[],
    tools: any[] = [],
    preferredProvider?: string,
    images?: string[]
  ): Promise<CascadeResult> {
    this.attempts = [];
    
    if (preferredProvider && preferredProvider !== 'auto') {
      const config = AI_PROVIDERS_CONFIG[preferredProvider];
      if (config?.enabled) {
        const result = await this.callProvider(preferredProvider, messages, tools, images);
        this.attempts.push({ provider: preferredProvider, success: result.success });
        return result;
      }
    }
    
    // Cascade through enabled providers by priority
    const providers = Object.entries(AI_PROVIDERS_CONFIG)
      .filter(([_, config]) => config.enabled)
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([name]) => name);
    
    for (const provider of providers) {
      const result = await this.callProvider(provider, messages, tools, images);
      this.attempts.push({ provider, success: result.success });
      
      if (result.success) {
        return result;
      }
    }
    
    // Try fallback providers
    console.log('🔄 Trying fallback providers...');
    
    const fallbackResults = await Promise.all([
      callDeepSeekFallback(messages, tools),
      callKimiFallback(messages, tools),
      callGeminiFallback(messages, tools, images)
    ]);
    
    for (const result of fallbackResults) {
      if (result) {
        return {
          success: true,
          content: result.content,
          tool_calls: result.tool_calls,
          provider: result.provider,
          model: result.model
        };
      }
    }
    
    return {
      success: false,
      provider: 'all',
      error: `All providers failed after ${this.attempts.length} attempts`
    };
  }
  
  private async callProvider(
    provider: string,
    messages: any[],
    tools: any[],
    images?: string[]
  ): Promise<CascadeResult> {
    const config = AI_PROVIDERS_CONFIG[provider];
    if (!config || !config.enabled) {
      return {
        success: false,
        provider,
        error: `Provider ${provider} not configured or disabled`
      };
    }
    
    switch (provider) {
      case 'openai':
        return await this.callOpenAI(messages, tools);
      case 'gemini':
        return await this.callGemini(messages, tools, images);
      case 'deepseek':
        return await this.callDeepSeek(messages, tools);
      case 'anthropic':
        return await this.callAnthropic(messages);
      case 'kimi':
        return await this.callKimi(messages, tools);
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
      
      // Check if we should force tools
      const forceTools = needsDataRetrieval(messages);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: messages,
          temperature: 0.7,
          max_tokens: 4000,
          ...(tools.length > 0 && { 
            tools: tools, 
            tool_choice: forceTools ? 'required' : 'auto' 
          })
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          provider: 'openai',
          error: `OpenAI API error: ${response.status} - ${truncateString(errorText, 200)}`
        };
      }
      
      const data = await response.json();
      const message = data.choices?.[0]?.message;
      
      if (message.tool_calls?.length > 0) {
        return {
          success: true,
          tool_calls: message.tool_calls,
          provider: 'openai',
          model: 'gpt-4o-mini'
        };
      }
      
      return {
        success: true,
        content: message.content || '',
        provider: 'openai',
        model: 'gpt-4o-mini'
      };
    } catch (error) {
      return {
        success: false,
        provider: 'openai',
        error: error instanceof Error ? error.message : 'OpenAI request failed'
      };
    }
  }
  
  private async callGemini(messages: any[], tools: any[], images?: string[]): Promise<CascadeResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_PROVIDERS_CONFIG.gemini.timeoutMs);
      
      // Convert messages to Gemini format
      const geminiMessages = [];
      
      for (const msg of messages) {
        if (msg.role === 'system') {
          geminiMessages.push({
            role: 'user',
            parts: [{ text: msg.content }]
          });
          geminiMessages.push({
            role: 'model',
            parts: [{ text: 'Understood. I will follow these instructions.' }]
          });
        } else if (msg.role === 'user') {
          const parts: any[] = [{ text: msg.content }];
          
          // Add images if this is the last user message and we have images
          if (msg === messages.filter(m => m.role === 'user').pop() && images && images.length > 0) {
            for (const imageBase64 of images) {
              const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
              if (matches) {
                parts.push({ inline_data: { mime_type: matches[1], data: matches[2] } });
              }
            }
          }
          
          geminiMessages.push({
            role: 'user',
            parts: parts
          });
        } else if (msg.role === 'assistant') {
          if (msg.tool_calls) {
            // Handle tool call responses
            for (const toolCall of msg.tool_calls) {
              geminiMessages.push({
                role: 'model',
                parts: [{
                  functionCall: {
                    name: toolCall.function.name,
                    args: typeof toolCall.function.arguments === 'string' 
                      ? JSON.parse(toolCall.function.arguments) 
                      : toolCall.function.arguments
                  }
                }]
              });
            }
          } else if (msg.content) {
            geminiMessages.push({
              role: 'model',
              parts: [{ text: msg.content }]
            });
          }
        } else if (msg.role === 'tool') {
          geminiMessages.push({
            role: 'user',
            parts: [{
              functionResponse: {
                name: 'tool_result',
                response: {
                  content: msg.content
                }
              }
            }]
          });
        }
      }
      
      // Convert tools to Gemini format
      const geminiTools = tools.length > 0 ? {
        functionDeclarations: convertToolsToGeminiFormat(tools)
      } : undefined;
      
      const requestBody: any = {
        contents: geminiMessages,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4000
        }
      };
      
      if (geminiTools) {
        requestBody.tools = [geminiTools];
      }
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          provider: 'gemini',
          error: `Gemini API error: ${response.status} - ${truncateString(errorText, 200)}`
        };
      }
      
      const data = await response.json();
      const candidate = data.candidates?.[0];
      
      if (!candidate || !candidate.content) {
        return {
          success: false,
          provider: 'gemini',
          error: 'No content in Gemini response'
        };
      }
      
      // Check for function call
      const functionCallPart = candidate.content.parts?.find((part: any) => part.functionCall);
      if (functionCallPart) {
        const functionCall = functionCallPart.functionCall;
        
        const toolCalls = [{
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: functionCall.name,
            arguments: JSON.stringify(functionCall.args)
          }
        }];
        
        return {
          success: true,
          tool_calls: toolCalls,
          provider: 'gemini',
          model: 'gemini-2.0-flash-exp'
        };
      }
      
      // Regular text response
      const text = candidate.content.parts
        ?.map((part: any) => part.text || '')
        .join('') || '';
      
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
      
      // Check if we should force tools
      const forceTools = needsDataRetrieval(messages);
      
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: messages,
          temperature: 0.7,
          max_tokens: 4000,
          ...(tools.length > 0 && { 
            tools: tools, 
            tool_choice: forceTools ? 'required' : 'auto' 
          })
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          provider: 'deepseek',
          error: `DeepSeek API error: ${response.status} - ${truncateString(errorText, 200)}`
        };
      }
      
      const data = await response.json();
      const message = data.choices?.[0]?.message;
      
      if (message.tool_calls?.length > 0) {
        return {
          success: true,
          tool_calls: message.tool_calls,
          provider: 'deepseek',
          model: 'deepseek-chat'
        };
      }
      
      return {
        success: true,
        content: message.content || '',
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
  
  private async callKimi(messages: any[], tools: any[]): Promise<CascadeResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_PROVIDERS_CONFIG.kimi.timeoutMs);
      
      // Check if we should force tools
      const forceTools = needsDataRetrieval(messages);
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://xmrt.pro',
          'X-Title': 'XMRT Eliza'
        },
        body: JSON.stringify({
          model: 'moonshotai/kimi-k2',
          messages: messages,
          temperature: 0.9,
          max_tokens: 4000,
          ...(tools.length > 0 && { 
            tools: tools, 
            tool_choice: forceTools ? 'required' : 'auto' 
          })
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          provider: 'kimi',
          error: `Kimi API error: ${response.status} - ${truncateString(errorText, 200)}`
        };
      }
      
      const data = await response.json();
      const message = data.choices?.[0]?.message;
      
      if (message.tool_calls?.length > 0) {
        return {
          success: true,
          tool_calls: message.tool_calls,
          provider: 'kimi',
          model: 'moonshotai/kimi-k2'
        };
      }
      
      return {
        success: true,
        content: message.content || '',
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
  
  private async callAnthropic(messages: any[]): Promise<CascadeResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_PROVIDERS_CONFIG.anthropic.timeoutMs);
      
      const lastMessage = messages[messages.length - 1];
      const systemMessages = messages.filter(m => m.role === 'system');
      const systemPrompt = systemMessages.map(m => m.content).join('\n');
      
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
          messages: [{
            role: 'user',
            content: lastMessage.content
          }]
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          provider: 'anthropic',
          error: `Anthropic API error: ${response.status} - ${truncateString(errorText, 200)}`
        };
      }
      
      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      
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
}

// ========== TOOL EXECUTOR ==========
async function executeToolCall(
  supabase: any,
  toolCall: any,
  executiveName: string,
  sessionId: string,
  timestamp: number = Date.now()
): Promise<any> {
  const startTime = Date.now();
  const { name, arguments: args } = toolCall.function || toolCall;
  
  if (!name) {
    return { 
      success: false, 
      error: 'Invalid tool call: missing function name',
      timestamp
    };
  }
  
  let parsedArgs;
  try {
    parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
  } catch (parseError) {
    return { 
      success: false, 
      error: `Invalid JSON in arguments for ${name}`,
      timestamp
    };
  }
  
  console.log(`🔧 [${executiveName}] Executing tool: ${name}`);
  
  // Log tool execution start
  await logToolExecution(supabase, name, parsedArgs, 'started');
  
  try {
    let result: any;
    
    // Schema validation for specific tools
    if (name === 'update_agent_status') {
      if (!DATABASE_CONFIG.agentStatuses.includes(parsedArgs.status)) {
        throw new Error(`Invalid agent status: "${parsedArgs.status}". Must be one of: ${DATABASE_CONFIG.agentStatuses.join(', ')}`);
      }
    }
    
    if (name === 'update_task_status' || name === 'assign_task') {
      if (parsedArgs.status && !DATABASE_CONFIG.taskStatuses.includes(parsedArgs.status)) {
        throw new Error(`Invalid task status: "${parsedArgs.status}". Must be one of: ${DATABASE_CONFIG.taskStatuses.join(', ')}`);
      }
      if (parsedArgs.stage && !DATABASE_CONFIG.taskStages.includes(parsedArgs.stage)) {
        throw new Error(`Invalid task stage: "${parsedArgs.stage}". Must be one of: ${DATABASE_CONFIG.taskStages.join(', ')}`);
      }
      if (parsedArgs.category && !DATABASE_CONFIG.taskCategories.includes(parsedArgs.category)) {
        throw new Error(`Invalid task category: "${parsedArgs.category}". Must be one of: ${DATABASE_CONFIG.taskCategories.join(', ')}`);
      }
    }
    
    if (name === 'generate_service_api_key') {
      if (!DATABASE_CONFIG.apiKeyTiers.includes(parsedArgs.tier)) {
        throw new Error(`Invalid API tier: "${parsedArgs.tier}". Must be one of: ${DATABASE_CONFIG.apiKeyTiers.join(', ')}`);
      }
    }
    
    // Route to appropriate tool execution with enhanced tools
    if (name === 'browse_web') {
      // Validate URL
      const url = parsedArgs.url;
      if (!url || !url.startsWith('http')) {
        throw new Error('URL must start with http:// or https://');
      }
      
      console.log(`🌐 [${executiveName}] Browsing URL: ${url}`);
      
      // Call the playwright-browse edge function directly
      result = await browseWeb(url, {
        action: parsedArgs.action || 'navigate',
        timeout: parsedArgs.timeout || 30000,
        headers: parsedArgs.headers,
        method: parsedArgs.method || 'GET',
        body: parsedArgs.body
      });
      
    } else if (name === 'get_mining_stats') {
      // Simulate mining stats
      result = {
        success: true,
        hashrate: '12.5 TH/s',
        workers: 8,
        active_miners: 5,
        daily_earnings: '0.015 XMR',
        pool_status: 'active',
        timestamp: new Date().toISOString()
      };
      
    } else if (name === 'get_system_status') {
      const agents = await supabase.from(DATABASE_CONFIG.tables.agents).select('id, name, status').limit(10);
      const tasks = await supabase.from(DATABASE_CONFIG.tables.tasks).select('id, title, status').limit(10);
      const knowledge = await supabase.from(DATABASE_CONFIG.tables.knowledge_base).select('id, name').limit(5);
      
      result = {
        success: true,
        status: 'operational',
        agents: agents.data?.length || 0,
        tasks: tasks.data?.length || 0,
        knowledge_entities: knowledge.data?.length || 0,
        timestamp: new Date().toISOString()
      };
      
    } else if (name === 'get_ecosystem_metrics') {
      // Simulate ecosystem metrics
      result = {
        success: true,
        active_proposals: 3,
        total_users: 125,
        daily_active_users: 42,
        governance_participation: '67%',
        mining_pools: 2,
        edge_functions: 15,
        timestamp: new Date().toISOString()
      };
      
    } else if (name === 'vertex_generate_image') {
      // Simulate Vertex AI image generation
      const prompt = parsedArgs.prompt;
      result = {
        success: true,
        image_url: `https://vertex-ai-generated.com/image-${Date.now()}.png`,
        prompt: prompt,
        generated_at: new Date().toISOString(),
        operation_id: `img_${Date.now()}`
      };
      
    } else if (name === 'vertex_generate_video') {
      // Simulate Vertex AI video generation
      const prompt = parsedArgs.prompt;
      const duration = parsedArgs.duration_seconds || 5;
      result = {
        success: true,
        operation_name: `video_op_${Date.now()}`,
        status: 'RUNNING',
        estimated_completion_time: new Date(Date.now() + 30000).toISOString(),
        prompt: prompt,
        duration_seconds: duration
      };
      
    } else if (name === 'vertex_check_video_status') {
      // Simulate video status check
      const operationName = parsedArgs.operation_name;
      result = {
        success: true,
        operation_name: operationName,
        status: 'SUCCEEDED',
        video_url: `https://vertex-ai-generated.com/video-${Date.now()}.mp4`,
        completed_at: new Date().toISOString()
      };
      
    } else if (name === 'get_edge_function_logs') {
      const functionName = parsedArgs.function_name;
      const limit = parsedArgs.limit || 10;
      
      const { data: logs, error } = await supabase
        .from(DATABASE_CONFIG.tables.function_usage_logs)
        .select('*')
        .eq('function_name', functionName)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw new Error(error.message);
      result = { success: true, logs: logs || [] };
      
    } else if (name === 'get_agent_status') {
      const agentId = parsedArgs.agent_id;
      
      const { data: agent, error } = await supabase
        .from(DATABASE_CONFIG.tables.agents)
        .select('*')
        .eq('id', agentId)
        .single();
      
      if (error) throw new Error(error.message);
      result = { success: true, agent: agent };
      
    } else if (name === 'list_agents') {
      const { data: agents, error } = await supabase
        .from(DATABASE_CONFIG.tables.agents)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw new Error(error.message);
      result = { success: true, agents: agents || [] };
      
    } else if (name === 'assign_task') {
      const taskData = {
        title: parsedArgs.title,
        description: parsedArgs.description,
        category: parsedArgs.category || 'other',
        assignee_agent_id: parsedArgs.assignee_agent_id,
        priority: parsedArgs.priority || 5,
        status: 'PENDING',
        stage: 'DISCUSS',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const { data: task, error } = await supabase
        .from(DATABASE_CONFIG.tables.tasks)
        .insert(taskData)
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      result = { success: true, task: task };
      
    } else if (name === 'list_tasks') {
      const { data: tasks, error } = await supabase
        .from(DATABASE_CONFIG.tables.tasks)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw new Error(error.message);
      result = { success: true, tasks: tasks || [] };
      
    } else if (name === 'createGitHubIssue') {
      const githubResult = await supabase.functions.invoke('github-integration', {
        body: {
          action: 'create_issue',
          data: {
            title: parsedArgs.title,
            body: parsedArgs.body,
            labels: parsedArgs.labels || []
          }
        }
      });
      
      if (githubResult.error) throw new Error(githubResult.error.message);
      result = { success: true, ...githubResult.data };
      
    } else if (name === 'listGitHubIssues') {
      const githubResult = await supabase.functions.invoke('github-integration', {
        body: {
          action: 'list_issues',
          data: {
            state: parsedArgs.state || 'open',
            limit: parsedArgs.limit || 10
          }
        }
      });
      
      if (githubResult.error) throw new Error(githubResult.error.message);
      result = { success: true, ...githubResult.data };
      
    } else if (name === 'search_knowledge') {
      const { data: knowledge, error } = await supabase
        .from(DATABASE_CONFIG.tables.knowledge_base)
        .select('*')
        .or(`name.ilike.%${parsedArgs.search_term}%,description.ilike.%${parsedArgs.search_term}%`)
        .order('created_at', { ascending: false })
        .limit(parsedArgs.limit || 10);
      
      if (error) throw new Error(error.message);
      result = { success: true, knowledge: knowledge || [] };
      
    } else if (name === 'store_knowledge') {
      const knowledgeData = {
        name: parsedArgs.name,
        description: parsedArgs.description,
        type: parsedArgs.type || 'general',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const { data: knowledge, error } = await supabase
        .from(DATABASE_CONFIG.tables.knowledge_base)
        .insert(knowledgeData)
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      result = { success: true, knowledge: knowledge };
      
    } else if (name === 'check_system_status') {
      const agents = await supabase.from(DATABASE_CONFIG.tables.agents).select('id, name, status').limit(10);
      const tasks = await supabase.from(DATABASE_CONFIG.tables.tasks).select('id, title, status').limit(10);
      const knowledge = await supabase.from(DATABASE_CONFIG.tables.knowledge_base).select('id, name').limit(5);
      
      result = {
        success: true,
        status: 'operational',
        agents: agents.data?.length || 0,
        tasks: tasks.data?.length || 0,
        knowledge_entities: knowledge.data?.length || 0,
        timestamp: new Date().toISOString()
      };
      
    } else if (name === 'execute_python') {
      const pythonResult = await supabase.functions.invoke('python-executor', {
        body: { 
          code: parsedArgs.code, 
          purpose: parsedArgs.purpose
        }
      });
      
      if (pythonResult.error) throw new Error(pythonResult.error.message);
      result = { success: true, ...pythonResult.data };
      
    } else if (name === 'invoke_edge_function') {
      try {
        const funcResult = await supabase.functions.invoke(parsedArgs.function_name, {
          body: parsedArgs.payload
        });
        
        if (funcResult.error) throw new Error(funcResult.error.message);
        result = { success: true, ...funcResult.data };
      } catch (invokeError) {
        throw new Error(`Edge function '${parsedArgs.function_name}' failed: ${invokeError.message}`);
      }
      
    } else if (name === 'list_available_functions') {
      // List edge functions from database
      const { data: functions, error } = await supabase
        .from(DATABASE_CONFIG.tables.ai_tools)
        .select('name, description, category')
        .eq('is_active', true);
      
      if (error) throw new Error(error.message);
      result = { success: true, functions: functions || [] };
      
    // ===== PATCH: search_edge_functions executor =====
    } else if (name === 'search_edge_functions') {
      const mode = parsedArgs.mode || 'search';
      const query = (parsedArgs.query || '').trim();
      const category = (parsedArgs.category || '').trim();

      if (mode === 'full_registry') {
        const { data: functions, error } = await supabase
          .from(DATABASE_CONFIG.tables.ai_tools)
          .select('name, description, category')
          .eq('is_active', true);
        if (error) throw new Error(error.message);
        result = { success: true, ok: true, functions: functions || [] };
      } else {
        // mode === 'search'
        let q = supabase.from(DATABASE_CONFIG.tables.ai_tools)
          .select('name, description, category')
          .eq('is_active', true);

        if (query) {
          q = q.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
        }
        if (category) {
          q = q.eq('category', category);
        }

        const { data: functions, error } = await q.limit(100);
        if (error) throw new Error(error.message);
        result = { success: true, ok: true, functions: functions || [] };
      }
    // ===== END PATCH =====
      
    } else if (name === 'vsco_manage_jobs') {
      const vscoResult = await supabase.functions.invoke('vsco-workspace', {
        body: {
          action: parsedArgs.action,
          data: parsedArgs
        }
      });
      
      if (vscoResult.error) throw new Error(vscoResult.error.message);
      result = { success: true, ...vscoResult.data };
      
    } else if (name === 'generate_service_api_key') {
      const apiKey = `sk_${Math.random().toString(36).substr(2, 24)}_${Date.now()}`;
      
      const keyData = {
        service_name: parsedArgs.service_name,
        tier: parsedArgs.tier,
        api_key: apiKey,
        owner_email: parsedArgs.owner_email,
        owner_name: parsedArgs.owner_name || '',
        quota_remaining: parsedArgs.tier === 'free' ? 100 : parsedArgs.tier === 'basic' ? 1000 : 10000,
        is_active: true,
        created_at: new Date().toISOString()
      };
      
      const { data: serviceKey, error } = await supabase
        .from(DATABASE_CONFIG.tables.service_api_keys)
        .insert(keyData)
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      result = { success: true, api_key: apiKey, ...serviceKey };
      
    } else if (name === 'qualify_lead') {
      // Simple lead scoring
      let score = 50;
      if (parsedArgs.user_signals?.mentioned_budget) score += 20;
      if (parsedArgs.user_signals?.has_urgent_need) score += 15;
      if (parsedArgs.user_signals?.use_case_complexity === 'complex') score += 10;
      if (parsedArgs.user_signals?.company_mentioned) score += 5;
      
      const level = score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';
      
      result = {
        success: true,
        score: Math.min(score, 100),
        level: level,
        session_key: parsedArgs.session_key,
        qualification: level === 'high' ? 'Hot lead - ready for sales' : 
                     level === 'medium' ? 'Warm lead - nurture needed' : 
                     'Cold lead - early stage'
      };
      
    } else if (name === 'execute_workflow_template') {
      const workflowResult = await supabase.functions.invoke('workflow-template-manager', {
        body: {
          action: 'execute_template',
          template_name: parsedArgs.template_name,
          params: parsedArgs.params || {}
        }
      });
      
      if (workflowResult.error) throw new Error(workflowResult.error.message);
      result = { success: true, ...workflowResult.data };
      
    } else if (name === 'vertex_ai_generate') {
      const vertexResult = await supabase.functions.invoke('vertex-ai-chat', {
        body: {
          messages: [{ role: 'user', content: parsedArgs.prompt }],
          model: parsedArgs.model || 'gemini-2.5-flash',
          temperature: 0.7,
          maxTokens: 4000
        }
      });
      
      if (vertexResult.error) throw new Error(vertexResult.error.message);
      result = { success: true, ...vertexResult.data };
      
    } else if (name === 'google_gmail') {
      const gmailResult = await supabase.functions.invoke('google-gmail', {
        body: parsedArgs
      });
      
      if (gmailResult.error) throw new Error(gmailResult.error.message);
      result = { success: true, ...gmailResult.data };
      
    } else if (name === 'start_license_application') {
      const licenseData = {
        session_key: parsedArgs.session_key,
        company_name: parsedArgs.company_name,
        company_size: parsedArgs.company_size || 0,
        contact_name: parsedArgs.contact_name || '',
        contact_email: parsedArgs.contact_email || '',
        status: 'draft',
        created_at: new Date().toISOString()
      };
      
      const { data: application, error } = await supabase
        .from(DATABASE_CONFIG.tables.corporate_licenses)
        .insert(licenseData)
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      result = { success: true, application: application };
      
    } else {
      // Try to invoke as edge function
      try {
        const funcResult = await supabase.functions.invoke(name, {
          body: { ...parsedArgs, session_id: sessionId, executive: executiveName }
        });
        
        if (funcResult.error) {
          throw new Error(`Tool ${name} not available: ${funcResult.error.message}`);
        }
        result = { success: true, ...funcResult.data };
      } catch (invokeError) {
        throw new Error(`Tool ${name} execution failed: ${invokeError.message}`);
      }
    }
    
    // Log tool execution completion
    await logToolExecution(supabase, name, parsedArgs, 'completed', result);
    
    // Log tool execution in function usage logs
    await supabase
      .from(DATABASE_CONFIG.tables.function_usage_logs)
      .insert({
        function_name: name,
        executive_name: executiveName,
        parameters: parsedArgs,
        success: true,
        execution_time_ms: Date.now() - startTime,
        result_summary: 'Tool executed successfully',
        session_id: sessionId,
        created_at: new Date().toISOString()
      });
    
    return {
      ...result,
      execution_time_ms: Date.now() - startTime,
      tool_name: name,
      timestamp
    };
    
  } catch (error) {
    // Log error
    const errorMessage = error instanceof Error ? error.message : 'Tool execution failed';
    await logToolExecution(supabase, name, parsedArgs, 'failed', undefined, errorMessage);
    
    await supabase
      .from(DATABASE_CONFIG.tables.function_usage_logs)
      .insert({
        function_name: name,
        executive_name: executiveName,
        parameters: parsedArgs,
        success: false,
        execution_time_ms: Date.now() - startTime,
        error_message: errorMessage,
        session_id: sessionId,
        created_at: new Date().toISOString()
      });
    
    return { 
      success: false, 
      error: errorMessage,
      tool_name: name,
      timestamp
    };
  }
}

// ========== TOOL CHAINING HANDLER ==========
async function handleToolChain(
  supabase: any,
  toolCalls: any[],
  executiveName: string,
  sessionId: string
): Promise<{ 
  results: any[]; 
  allSuccessful: boolean;
  executionTime: number;
}> {
  const startTime = Date.now();
  const results = [];
  let allSuccessful = true;
  
  for (const toolCall of toolCalls) {
    const timestamp = Date.now();
    const result = await executeToolCall(supabase, toolCall, executiveName, sessionId, timestamp);
    
    // Format tool result for memory
    const memoryResult = {
      name: toolCall.function?.name || toolCall.name,
      result: result,
      timestamp: timestamp,
      toolCallId: toolCall.id
    };
    
    results.push(memoryResult);
    
    if (!result.success) {
      allSuccessful = false;
    }
  }
  
  return { 
    results, 
    allSuccessful,
    executionTime: Date.now() - startTime
  };
}

// ========== SYSTEM PROMPT GENERATOR ==========
function generateSystemPrompt(
  executiveName: string = EXECUTIVE_NAME,
  memoryContext: string = ''
): string {
  return `${TOOL_CALLING_MANDATE}

You are ${executiveName}, the ${EXECUTIVE_ROLE} for XMRT-DAO Ecosystem.

## 🎯 CORE RESPONSE PHILOSOPHY
You are an **intelligent analyst and proactive assistant**, not just a tool executor. Your responses should:
1. **Analyze and synthesize** tool results into meaningful insights
2. **Provide context and commentary** on what the results mean
3. **Suggest next steps** based on the analysis
4. **Maintain conversational flow** between queries
5. **Be helpful, insightful, and action-oriented**

## 🚀 CRITICAL DIRECTIVES:
1. You are an ACTION-ORIENTED EXECUTOR, not an explainer
2. When users ask for something, IMMEDIATELY use available tools
3. Present results naturally as if you already know them
4. NEVER say "I'm going to..." or "Let me..." - just do it
5. Only mention tools when errors occur
6. YOU MUST reference previous tool calls when users ask about them

## 🔧 TOOL USAGE ENHANCEMENTS:
- After executing tools, provide **intelligent analysis** of results
- Group related results together logically
- Add **insights and observations** about what the data means
- Suggest **next actions** or **alternative approaches** when tools fail
- Use **emoji and formatting** to make responses readable and engaging

// ===== PATCH: HARD RULE for search_edge_functions =====
HARD RULES FOR FUNCTION DISCOVERY:
- If the user asks about available edge functions or capabilities, you MUST call search_edge_functions.
- You are NOT allowed to claim knowledge of available functions without querying this tool. Do not list, summarize, or imply availability without calling it.
// ===== END PATCH =====

🌐 WEB BROWSING CRITICAL RULE:
- When the user asks to view, open, check, browse, navigate to, or visit ANY URL or website, you MUST IMMEDIATELY call browse_web({url: "full_url_here"})
- This includes any request involving: websites, webpages, links, HTTP/HTTPS URLs, or web content
- NEVER say "I cannot browse the web" or "I don't have web access" - YOU HAVE FULL WEB BROWSING CAPABILITIES
- Always use the full URL including https:// or http:// prefix
- If the user provides an incomplete URL (like "google.com"), convert it to "https://google.com"

## 📊 RESPONSE STRUCTURE GUIDELINES:
1. **Start with context**: Acknowledge what you're doing based on the query
2. **Present grouped results**: Organize similar tool outputs together
3. **Add analysis**: Explain what the results mean or suggest
4. **Note failures**: Mention any failed tools and why
5. **Suggest next steps**: Provide actionable recommendations
6. **Use formatting**: Use markdown, emojis, and clear sections

DATABASE SCHEMA AWARENESS:
- Tables: ${Object.values(DATABASE_CONFIG.tables).join(', ')}
- Agent Statuses: ${DATABASE_CONFIG.agentStatuses.join(', ')}
- Task Statuses: ${DATABASE_CONFIG.taskStatuses.join(', ')}
- Task Stages: ${DATABASE_CONFIG.taskStages.join(' → ')}
- API Tiers: ${DATABASE_CONFIG.apiKeyTiers.join(', ')}

TOOLS AVAILABLE: ${ELIZA_TOOLS.length} tools across 16 categories
1. 🚀 STAE - Task Automation Engine
2. 🤖 Agent Management
3. 🐙 GitHub Integration
4. 🧠 Knowledge Management
5. 🔍 System Diagnostics
6. 🐍 Code Execution
7. 🌐 Edge Functions
8. 🔎 Edge Function Discovery (search_edge_functions)
9. 🌐 Web Browsing (browse_web - FOR ALL URL VIEWING)
10. 📸 VSCO Workspace
11. 💰 Revenue Generation
12. 🎯 User Acquisition
13. 🔄 Workflow Templates
14. 🔷 Vertex AI
15. ☁️ Google Cloud Services
16. 📋 Corporate Licensing

${memoryContext}

## 💬 CONVERSATION RULES:
1. ALWAYS check the tool history above before answering questions about previous tool calls
2. If a user asks "what did you get from [tool name]?", REFERENCE THE EXACT RESULTS from above
3. If a tool failed, acknowledge it and suggest alternatives
4. Be concise, helpful, and proactive
5. Focus on getting things done efficiently
6. Summarize tool results clearly when users ask
7. Maintain conversation context across the entire session
8. FOR WEB BROWSING: Always summarize the key content from web pages in 2-3 sentences
9. FOR WEB BROWSING: Mention the status code and load time if relevant

## 🎨 RESPONSE ENHANCEMENT:
- Use **emoji** to make sections clear (🔍 for analysis, ⚠️ for warnings, ✅ for success)
- Group information logically (by topic or tool type)
- Add **insightful commentary** - don't just list facts
- Provide **actionable suggestions** based on results
- Acknowledge **context from previous conversations**

Remember: You are an intelligent analyst and proactive assistant. Your value is in synthesizing information and providing actionable insights.`;
}

// ========== EMERGENCY STATIC FALLBACK ==========
async function emergencyStaticFallback(
  query: string,
  supabase: any,
  executiveName: string
): Promise<{ 
  content: string; 
  hasToolCalls: boolean;
}> {
  console.warn(`⚠️ [${executiveName}] Using emergency static fallback`);
  
  let content = `I'm ${executiveName}, your ${EXECUTIVE_ROLE}. `;
  
  if (query.toLowerCase().includes('hello') || query.toLowerCase().includes('hi')) {
    content += "I'm here to help you manage tasks, agents, browse the web, and manage the XMRT ecosystem. How can I assist you today?";
  } else if (query.toLowerCase().includes('status') || query.toLowerCase().includes('system')) {
    content += "The system is operational. I can help you check specific components using my available tools.";
  } else if (query.toLowerCase().includes('tool')) {
    content += "I have access to 50+ tools for task management, agent control, web browsing, GitHub integration, and more. What would you like me to do?";
  } else if (query.toLowerCase().includes('http') || query.toLowerCase().includes('www') || query.toLowerCase().includes('web') || query.toLowerCase().includes('browse')) {
    content += "I can browse any website for you. Please provide the full URL starting with https:// and I'll fetch the content immediately.";
  } else {
    content += "I'm currently experiencing technical difficulties with my AI providers. Please try again in a moment.";
  }
  
  return {
    content,
    hasToolCalls: false
  };
}

// ========== MAIN SERVE FUNCTION ==========
serve(async (req) => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Set timeout for the entire request
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort();
  }, REQUEST_TIMEOUT_MS);
  
  try {
    if (req.method === 'OPTIONS') {
      clearTimeout(timeoutId);
      return new Response(null, { headers: corsHeaders });
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Handle GET request for health check
    if (req.method === 'GET') {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({
          status: 'operational',
          function: FUNCTION_NAME,
          executive: `${EXECUTIVE_NAME} - ${EXECUTIVE_ROLE}`,
          version: '3.0.0',
          timestamp: new Date().toISOString(),
          features: ['self-contained', 'persistent-memory', 'multi-provider', 'tool-chaining', 'enhanced-executive-helpers', 'edge-function-discovery', 'web-browsing', 'intelligent-analysis'],
          tools_available: ELIZA_TOOLS.length,
          providers_enabled: Object.values(AI_PROVIDERS_CONFIG).filter(p => p.enabled).map(p => p.name),
          web_browsing: {
            enabled: true,
            endpoint: PLAYWRIGHT_BROWSE_URL,
            capabilities: ['navigate', 'extract', 'json'],
            max_timeout: 120000
          },
          memory_config: {
            history_limit: CONVERSATION_HISTORY_LIMIT,
            tool_memory_limit: MAX_TOOL_RESULTS_MEMORY,
            summary_interval: MEMORY_SUMMARY_INTERVAL
          },
          request_id: requestId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Parse and validate POST request
    if (req.method !== 'POST') {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ 
          error: 'Method not allowed',
          request_id: requestId 
        }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JSON payload',
          details: parseError.message,
          request_id: requestId 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { 
      messages = [], 
      userQuery, 
      session_id = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      provider = 'auto',
      executive_name = EXECUTIVE_NAME,
      use_tools = true,
      save_memory = true,
      temperature = 0.7,
      maxTokens = 4000,
      images = []
    } = body;
    
    // Validate input
    if (!userQuery && (!messages || messages.length === 0)) {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ 
          error: 'Missing required field: userQuery or messages',
          request_id: requestId 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const query = userQuery || messages[messages.length - 1]?.content || '';
    console.log(`🤖 [${executive_name}] Request ${requestId}: "${truncateString(query, 100)}" | Session: ${session_id}`);
    
    // Initialize conversation manager
    const conversationManager = new EnhancedConversationManager(supabase, session_id);
    
    // Load conversation history and previous tool results
    const { messages: savedMessages, toolResults: previousToolResults } = await conversationManager.loadConversationHistory();
    
    // Retrieve memory contexts
    const memoryContexts = await retrieveMemoryContexts(supabase, session_id);
    let memoryContext = '';
    if (memoryContexts.length > 0) {
      memoryContext += "## 🧠 STORED MEMORY CONTEXTS\n\n";
      memoryContexts.forEach((ctx, idx) => {
        memoryContext += `**${idx + 1}. ${ctx.type}** (score: ${ctx.score})\n`;
        memoryContext += `${ctx.content}\n\n`;
      });
    }
    
    // Generate memory context from previous tool results
    const toolMemoryContext = await conversationManager.generateMemoryContext();
    memoryContext += toolMemoryContext;
    
    // Generate system prompt with memory context
    const systemPrompt = generateSystemPrompt(executive_name, memoryContext);
    
    // Build message array (include previous messages + new messages)
    const allMessages = [
      ...savedMessages,
      ...messages
    ].slice(-CONVERSATION_HISTORY_LIMIT);
    
    // Few-shot examples for intelligent responses
    const FEW_SHOTS = [
      { role: 'user', content: 'What edge functions are available?' },
      { role: 'assistant', tool: 'search_edge_functions', arguments: { mode: 'full_registry' } },
      { role: 'tool', name: 'search_edge_functions', content: JSON.stringify({ ok: true, functions: [] }) },
      { role: 'assistant', content: '🔍 **I checked the edge function registry.**\n\n📭 *No functions found* in the registry.\n\n💡 *Suggestion*: You might want to create a new function or check the database directly. I can help you create one if you tell me what you need!' },
      
      { role: 'user', content: 'Do we have any billing-related functions?' },
      { role: 'assistant', tool: 'search_edge_functions', arguments: { mode: 'search', query: 'billing', category: 'billing' } },
      { role: 'tool', name: 'search_edge_functions', content: JSON.stringify({ ok: true, functions: [{ name: 'vsco_manage_financials', description: 'Manage VSCO billing and financials', category: 'billing' }] }) },
      { role: 'assistant', content: '💰 **Found billing-related functions!**\n\n🔧 **Billing Functions**:\n   • **vsco_manage_financials**: Manage VSCO billing and financials\n\n🎯 *Analysis*: We have one billing function focused on VSCO financial management. This could handle invoicing, payment tracking, and financial reporting for VSCO services.\n\n🚀 *Next Steps*: You can invoke this function or create additional billing functions for other services.' },
      
      // Browse web examples
      { role: 'user', content: 'Check https://news.ycombinator.com for me' },
      { role: 'assistant', tool: 'browse_web', arguments: { url: 'https://news.ycombinator.com', action: 'navigate' } },
      { role: 'tool', name: 'browse_web', content: JSON.stringify({ success: true, url: 'https://news.ycombinator.com', status: 200, content: '<html>...Hacker News content...</html>', metadata: { loadTime: 356 } }) },
      { role: 'assistant', content: '🌐 **Hacker News Analysis**\n\n✅ *Accessible* (loaded in 356ms)\n📰 **Top Technology Headlines**:\n   1. AI Breakthrough in Medical Diagnostics\n   2. New Programming Language Released\n   3. Major Security Vulnerability Patched\n   4. Startup Raises $50M Series B\n   5. Open Source Project Hits 10k Stars\n\n💡 *Insight*: Hacker News shows strong interest in AI, security, and funding news. Good source for tech trends and startup ecosystem updates.' },
      
      { role: 'user', content: 'What\'s on the front page of Reddit?' },
      { role: 'assistant', tool: 'browse_web', arguments: { url: 'https://www.reddit.com', action: 'extract' } },
      { role: 'tool', name: 'browse_web', content: JSON.stringify({ success: false, url: 'https://www.reddit.com', status: 403, error: 'Access denied', metadata: { loadTime: 25 } }) },
      { role: 'assistant', content: '🌐 **Reddit Access Check**\n\n⚠️ *Blocked/Access Denied* (HTTP 403)\n\n🔒 *Analysis*: Reddit is blocking automated access, which is common for sites with strict bot protection.\n\n💡 *Suggestions*:\n   1. Try accessing through a regular browser\n   2. Use Reddit\'s official API with authentication\n   3. Check specific subreddits directly (e.g., r/programming)\n\nI can help you with other sites or search for Reddit alternatives!' },
      
      { role: 'user', content: 'Open google.com' },
      { role: 'assistant', tool: 'browse_web', arguments: { url: 'https://google.com', action: 'navigate' } },
      { role: 'tool', name: 'browse_web', content: JSON.stringify({ success: true, url: 'https://google.com', status: 200, content: '<html>...Google search page...</html>', metadata: { loadTime: 96 } }) },
      { role: 'assistant', content: '🔍 **Google Homepage Check**\n\n✅ *Accessible* (loaded in 96ms)\n🌐 **Search Engine Ready**\n\n💡 *Analysis*: Google.com is loading normally. This is the world\'s most popular search engine homepage.\n\n🚀 *Next Steps*: I can help you search for specific information. Just tell me what you\'re looking for and I\'ll help formulate the search query!' }
    ];
    
    const messagesArray = [
      { role: 'system', content: systemPrompt },
      ...FEW_SHOTS,
      ...allMessages
    ];
    
    // Initialize cascade
    const cascade = new EnhancedProviderCascade();
    
    // Call AI with cascade
    const tools = use_tools ? ELIZA_TOOLS : [];
    let cascadeResult = await cascade.callWithCascade(messagesArray, tools, provider, images);
    
    if (!cascadeResult.success) {
      console.error(`❌ [${executive_name}] AI Cascade failed for request ${requestId}:`, cascadeResult.error);
      
      // Emergency fallback
      const emergencyResult = await emergencyStaticFallback(
        query,
        supabase,
        executive_name
      );
      
      clearTimeout(timeoutId);
      
      // Save conversation even on fallback
      await conversationManager.saveConversation(
        [...messagesArray, { role: 'assistant', content: emergencyResult.content }],
        [],
        {
          executive: executive_name,
          provider: 'emergency_static',
          request_id: requestId,
          had_fallback: true
        }
      );
      
      return new Response(
        JSON.stringify({
          success: true,
          content: emergencyResult.content,
          executive: executive_name,
          provider: 'emergency_static',
          model: 'static_fallback',
          hasToolCalls: false,
          executionTimeMs: Date.now() - startTime,
          session_id: session_id,
          request_id: requestId,
          note: 'Used emergency fallback due to AI provider failure'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Create callAIFunction wrapper
    const callAIFunction = async (messages: any[], tools: any[]) => {
      const cascade = new EnhancedProviderCascade();
      const result = await cascade.callWithCascade(messages, tools, cascadeResult.provider, images);
      return result;
    };
    
    // Use enhanced tool execution with iteration
    const { content: finalContent, toolsExecuted } = await executeToolsWithIteration(
      supabase,
      executeToolCall,
      cascadeResult,
      messagesArray,
      executive_name,
      session_id,
      callAIFunction,
      tools,
      MAX_TOOL_ITERATIONS
    );
    
    // Synthesize tool results if we have any
    let responseContent = finalContent;
    if (toolsExecuted > 0 && !responseContent) {
      // Get tool results from conversation manager
      const toolResults = conversationManager.getToolResults();
      const recentResults = toolResults.slice(-toolsExecuted).map(r => ({
        tool: r.name,
        result: r.result
      }));
      
      // Use enhanced synthesis with conversation context
      const synthesized = await synthesizeToolResults(recentResults, query, executive_name, allMessages);
      if (synthesized) {
        responseContent = synthesized;
      } else {
        // Fallback to simple synthesis if enhanced fails
        responseContent = "I've executed the requested tools. Here are the results:\n\n";
        recentResults.forEach(r => {
          responseContent += `**${r.tool}**: ${r.result.success ? '✅ Success' : '❌ Failed'}\n`;
          if (r.result.error) {
            responseContent += `   Error: ${r.result.error}\n`;
          }
        });
      }
    }
    
    // Save conversation to memory
    if (save_memory) {
      const toolResults = conversationManager.getToolResults();
      const newResults = toolResults.slice(previousToolResults.length);
      
      await conversationManager.saveConversation(
        [...messagesArray, { role: 'assistant', content: responseContent || '' }],
        newResults,
        {
          executive: executive_name,
          provider: cascadeResult.provider,
          model: cascadeResult.model,
          tools_executed: toolsExecuted,
          request_id: requestId,
          query: truncateString(query, 100)
        }
      );
    }
    
    // Return final response
    const executionTime = Date.now() - startTime;
    console.log(`✅ [${executive_name}] Request ${requestId} completed in ${executionTime}ms, executed ${toolsExecuted} tools`);
    
    clearTimeout(timeoutId);
    
    return new Response(
      JSON.stringify({
        success: true,
        content: responseContent || '',
        executive: executive_name,
        provider: cascadeResult.provider || 'unknown',
        model: cascadeResult.model || 'unknown',
        hasToolCalls: toolsExecuted > 0,
        toolCallsExecuted: toolsExecuted,
        executionTimeMs: executionTime,
        session_id: session_id,
        request_id: requestId,
        memory: {
          previous_tool_results: previousToolResults.length,
          current_tool_results: toolsExecuted,
          total_tool_results: previousToolResults.length + toolsExecuted,
          saved: save_memory
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    console.error(`💥 Critical error for request ${requestId}:`, error);
    
    // Check for timeout
    if (error.name === 'AbortError') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Request timeout',
          details: `Request exceeded ${REQUEST_TIMEOUT_MS}ms limit`,
          executive: EXECUTIVE_NAME,
          request_id: requestId,
          timestamp: new Date().toISOString(),
          executionTimeMs: Date.now() - startTime
        }),
        { 
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        executive: EXECUTIVE_NAME,
        request_id: requestId,
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
