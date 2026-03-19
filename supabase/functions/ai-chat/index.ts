import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2.46.2";

// ========== ENVIRONMENT CONFIGURATION ==========
const SUPABASE_URL = Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') || 'https://vawouugtzwmejxqkeqqj.supabase.co';
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
const REQUEST_TIMEOUT_MS = parseInt(Deno.env.get('REQUEST_TIMEOUT_MS') || '120000');
const CONVERSATION_HISTORY_LIMIT = parseInt(Deno.env.get('CONVERSATION_HISTORY_LIMIT') || '1000');

// Memory Configuration
const MEMORY_SUMMARY_INTERVAL = parseInt(Deno.env.get('MEMORY_SUMMARY_INTERVAL') || '5');
const MAX_TOOL_RESULTS_MEMORY = parseInt(Deno.env.get('MAX_TOOL_RESULTS_MEMORY') || '100');

// NEW: Conversation Memory Configuration
const CONVERSATION_SUMMARY_LIMIT = parseInt(Deno.env.get('CONVERSATION_SUMMARY_LIMIT') || '2000');
const MAX_SUMMARIZED_CONVERSATIONS = parseInt(Deno.env.get('MAX_SUMMARIZED_CONVERSATIONS') || '100');

// Initialize Supabase client with proper configuration
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ========== DATABASE SCHEMA ==========
const DATABASE_CONFIG = {
  tables: {
    ai_tools: 'ai_tools',
    agents: 'agents',
    superduper_agents: 'superduper_agents',
    edge_function_logs: 'edge_function_logs',
    conversation_memory: 'conversation_memory',
    memory_contexts: 'memory_contexts',
    tasks: 'tasks',
    knowledge_entities: 'knowledge_entities',
    workflow_templates: 'workflow_templates',
    executive_feedback: 'executive_feedback',
    function_usage_logs: 'function_usage_logs',
    eliza_activity_log: 'eliza_activity_log',
    conversation_summaries: 'conversation_summaries',
    conversation_context: 'conversation_context',
    attachment_analysis: 'attachment_analysis',
    ip_conversation_sessions: 'ip_conversation_sessions',
    // NEW: Solution Engine tables
    proposed_edge_functions: 'proposed_edge_functions',
    code_snippets: 'code_snippets'
  },
  
  agentStatuses: ['IDLE', 'BUSY', 'ARCHIVED', 'ERROR', 'OFFLINE'] as const,
  taskStatuses: ['PENDING', 'CLAIMED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED', 'COMPLETED', 'FAILED'] as const,
  taskStages: ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE'] as const,
  taskCategories: ['code', 'infra', 'research', 'governance', 'mining', 'device', 'ops', 'other'] as const
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
    timeoutMs: 90000,
    priority: 1,
    fallbackOnly: false,
    maxRetries: 2,
    retryDelayMs: 1000
  },
  gemini: {
    name: 'Google Gemini',
    enabled: !!GEMINI_API_KEY,
    apiKey: GEMINI_API_KEY,
    endpoint: `https://generativelanguage.googleapis.com/v1beta/models`,
    models: [
      'gemini-2.5-flash-image',
      'gemini-2.5-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ],
    supportsTools: true,
    timeoutMs: 90000,
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
    timeoutMs: 90000,
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
    models: ['claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229'],
    supportsTools: false,
    timeoutMs: 90000,
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
    timeoutMs: 90000,
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

// ========== SHARED CONSTANTS ==========
const AMBIGUOUS_RESPONSES = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'alright', 'fine', 'go ahead', 'proceed', 'no', 'nope', 'nah'];
const POSITIVE_AMBIGUOUS = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'alright', 'fine', 'go ahead', 'proceed'];

// ========== TOOL CALLING MANDATE ==========
const TOOL_CALLING_MANDATE = `
🚨 CRITICAL TOOL CALLING RULES:
1. When the user asks for data/status/metrics, you MUST call tools using the native function calling mechanism
2. DO NOT describe tool calls in text. DO NOT say "I will call..." or "Let me check..."
3. DIRECTLY invoke functions - the system will handle execution
4. Available critical tools: get_mining_stats, get_system_status, get_ecosystem_metrics, invoke_edge_function, search_knowledge, recall_entity, vertex_generate_image, vertex_generate_video, vertex_check_video_status, search_edge_functions, browse_web, analyze_attachment, google_gmail
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

🔍 FUNCTION DISCOVERY (MANDATORY):
- When user asks about available edge functions or capabilities → IMMEDIATELY call search_edge_functions({mode: 'full_registry'})
- NEVER list functions from memory - ALWAYS query the database via this tool
- Use query/category filters to find specific functions

📎 ATTACHMENT ANALYSIS (MANDATORY):
- When user provides attachments (images, PDFs, docs, code files) → IMMEDIATELY call analyze_attachment({attachments: [...]})
- This tool can analyze: .txt, .png, .jpg, .jpeg, .pdf, .doc, .docx, .sol, .js, .ts, .py, .java, .cpp, .rs, .go, .md, .json, .yaml, .yml, .csv
- Always analyze attachments when they are provided

📧 EMAIL SENDING (MANDATORY):
- When user asks to SEND EMAIL or mentions email address → IMMEDIATELY call google_gmail({action: 'send_email', to: "recipient@email.com", subject: "Subject", body: "Email body"})
- DO NOT generate contract code or unrelated content when asked to send emails
- Always show draft for approval before sending
- Use conversation context to understand what email content is needed

🔧 GITHUB FUNCTIONALITY:
- Use the full GitHub tool suite when user asks about GitHub operations
- Available tools: createGitHubIssue, listGitHubIssues, createGitHubDiscussion, searchGitHubCode, createGitHubPullRequest, commentOnGitHubIssue, commentOnGitHubDiscussion, listGitHubPullRequests
- For comprehensive GitHub operations, use the appropriate tool based on the request
`;

// ========== UTILITY FUNCTIONS ==========
function summarizeArray(arr: any[], max = 8) {
  return Array.isArray(arr) ? arr.slice(0, max) : arr;
}

async function logFunctionUsage(entry: any) {
  try {
    await supabase.from(DATABASE_CONFIG.tables.function_usage_logs).insert(entry);
  } catch (_) {}
}

async function logActivity(entry: any) {
  try {
    await supabase.from(DATABASE_CONFIG.tables.eliza_activity_log).insert(entry);
  } catch (_) {}
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateSessionId(): string {
  return generateUUID();
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function parseToolArguments(args: string): any {
  try {
    return args ? JSON.parse(args) : {};
  } catch (e) {
    console.warn('Failed to parse tool arguments for logging:', e);
    return { raw_args: args };
  }
}

function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

function extractLastUserMessage(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return 'unknown query';
}

// ========== AI-POWERED SUMMARIZATION FUNCTIONS ==========
async function generateAISummary(messages: any[], toolResults: any[]): Promise<string> {
  try {
    const conversationText = messages
      .slice(-10)
      .map(msg => `${msg.role}: ${msg.content?.substring(0, 500) || ''}`)
      .join('\n');
    
    const toolSummary = toolResults.length > 0 
      ? `Executed ${toolResults.length} tools: ${toolResults.slice(-3).map(tr => tr.name).join(', ')}${toolResults.length > 3 ? '...' : ''}`
      : 'No tools executed';
    
    const summaryPrompts = [
      {
        role: 'system',
        content: 'You are an expert summarizer. Create a concise, informative summary of the conversation that captures key topics, decisions, and actions. Focus on what was discussed, what tools were used, and any important outcomes. Keep it under 3 sentences.'
      },
      {
        role: 'user',
        content: `Summarize this conversation:\n\n${conversationText}\n\n${toolSummary}`
      }
    ];
    
    const providers = [
      { name: 'openai', apiKey: OPENAI_API_KEY, endpoint: 'https://api.openai.com/v1/chat/completions' },
      { name: 'deepseek', apiKey: DEEPSEEK_API_KEY, endpoint: 'https://api.deepseek.com/v1/chat/completions' },
      { name: 'gemini', apiKey: GEMINI_API_KEY, endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` }
    ];
    
    for (const provider of providers) {
      if (!provider.apiKey) continue;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        let response;
        if (provider.name === 'gemini') {
          response = await fetch(provider.endpoint, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-goog-api-key': provider.apiKey
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: summaryPrompts.map(p => `${p.role}: ${p.content}`).join('\n') }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 300 }
            }),
            signal: controller.signal
          });
          
          if (response.ok) {
            const data = await response.json();
            const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (summary) {
              clearTimeout(timeoutId);
              return summary;
            }
          }
        } else {
          response = await fetch(provider.endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${provider.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: provider.name === 'openai' ? 'gpt-4o-mini' : 'deepseek-chat',
              messages: summaryPrompts,
              temperature: 0.3,
              max_tokens: 300
            }),
            signal: controller.signal
          });
          
          if (response.ok) {
            const data = await response.json();
            const summary = data.choices?.[0]?.message?.content;
            if (summary) {
              clearTimeout(timeoutId);
              return summary;
            }
          }
        }
        
        clearTimeout(timeoutId);
      } catch (error) {
        console.warn(`⚠️ ${provider.name} summarization failed:`, error);
        continue;
      }
    }
    
    return generateEnhancedManualSummary(messages, toolResults);
    
  } catch (error) {
    console.warn('⚠️ AI summarization failed, using fallback:', error);
    return generateEnhancedManualSummary(messages, toolResults);
  }
}

function generateEnhancedManualSummary(messages: any[], toolResults: any[]): string {
  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  
  if (userMessages.length === 0) {
    return "Conversation started";
  }
  
  const recentMessages = messages.slice(-5);
  const topics = extractConversationTopics(recentMessages);
  const conversationFocus = analyzeConversationFocus(messages);
  const successfulTools = toolResults.filter(r => r.result?.success).length;
  const failedTools = toolResults.filter(r => !r.result?.success).length;
  
  const mainQueries = userMessages.slice(-3).map(m => m.content).filter(c => c.length > 10);
  const primaryQuery = mainQueries[mainQueries.length - 1] || userMessages[userMessages.length - 1]?.content || '';
  
  let summary = `Discussion about ${topics.join(', ') || 'various topics'}. `;
  
  if (conversationFocus) {
    summary += `Primary focus: ${conversationFocus}. `;
  }
  
  if (primaryQuery && primaryQuery.length > 0) {
    const truncatedQuery = primaryQuery.length > 80 
      ? primaryQuery.substring(0, 80) + '...' 
      : primaryQuery;
    summary += `Recent query: "${truncatedQuery}". `;
  }
  
  if (toolResults.length > 0) {
    summary += `Executed ${toolResults.length} tools (${successfulTools} successful, ${failedTools} failed). `;
    
    const uniqueTools = [...new Set(toolResults.map(tr => tr.name))];
    if (uniqueTools.length > 0) {
      summary += `Tools used: ${uniqueTools.slice(0, 3).join(', ')}`;
      if (uniqueTools.length > 3) summary += `, and ${uniqueTools.length - 3} more`;
      summary += '.';
    }
  }
  
  return summary;
}

function extractConversationTopics(messages: any[]): string[] {
  const topicKeywords = {
    'system': ['status', 'health', 'monitor', 'metrics', 'performance'],
    'development': ['code', 'function', 'api', 'deploy', 'bug', 'fix', 'feature'],
    'github': ['github', 'issue', 'pull request', 'repository', 'codebase'],
    'web': ['browse', 'url', 'website', 'http', 'https', 'webpage'],
    'email': ['email', 'send', 'gmail', 'message', 'contact'],
    'attachment': ['file', 'document', 'pdf', 'image', 'analyze', 'attachment'],
    'mining': ['mining', 'hashrate', 'worker', 'earnings', 'crypto'],
    'task': ['task', 'assign', 'agent', 'work', 'project'],
    'knowledge': ['search', 'recall', 'store', 'knowledge', 'information']
  };
  
  const allText = messages.map(m => m.content || '').join(' ').toLowerCase();
  const foundTopics: string[] = [];
  
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(keyword => allText.includes(keyword))) {
      foundTopics.push(topic);
    }
  }
  
  return foundTopics.length > 0 ? foundTopics : ['general discussion'];
}

function analyzeConversationFocus(messages: any[]): string | null {
  const recentText = messages.slice(-5).map(m => m.content || '').join(' ').toLowerCase();
  
  const focusPatterns = [
    { pattern: /(what|how|when|where|who|why) (is|are|does|do|can|will)/, label: 'information inquiry' },
    { pattern: /(show|get|find|list|check) (me|the|all)/, label: 'data retrieval' },
    { pattern: /(create|generate|make|build|execute) (an?|the)/, label: 'creation/execution' },
    { pattern: /(analyze|review|evaluate|assess|compare)/, label: 'analysis' },
    { pattern: /(help|assist|guide|explain|teach)/, label: 'assistance' },
    { pattern: /(send|email|contact|message|notify)/, label: 'communication' },
    { pattern: /(browse|open|view|visit|check) (http|https|www|\.com)/, label: 'web browsing' },
    { pattern: /(file|document|pdf|image|attachment)/, label: 'file analysis' }
  ];
  
  for (const { pattern, label } of focusPatterns) {
    if (pattern.test(recentText)) {
      return label;
    }
  }
  
  return null;
}

// ========== IP-BASED SESSION MANAGEMENT ==========
class IPSessionManager {
  private static readonly SESSION_TTL_MS = 24 * 60 * 60 * 1000;
  private static readonly IP_CACHE = new Map<string, { sessionId: string; lastSeen: number }>();
  
  static extractIP(req: Request): string {
    try {
      const cfConnectingIp = req.headers.get('cf-connecting-ip');
      const xRealIp = req.headers.get('x-real-ip');
      const xForwardedFor = req.headers.get('x-forwarded-for');
      const remoteAddr = req.headers.get('remote-addr');
      
      if (cfConnectingIp) {
        return cfConnectingIp.split(',')[0].trim();
      }
      
      if (xRealIp) {
        return xRealIp.split(',')[0].trim();
      }
      
      if (xForwardedFor) {
        const ips = xForwardedFor.split(',');
        return ips[0].trim();
      }
      
      if (remoteAddr) {
        return remoteAddr;
      }
      
      const headersHash = Array.from(req.headers.entries())
        .map(([k, v]) => `${k}:${v}`)
        .join('|');
      return `ip_hash_${this.hashString(headersHash).substring(0, 16)}`;
      
    } catch (error) {
      console.warn('Failed to extract IP:', error);
      return `unknown_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }
  
  private static hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
  
  static async getOrCreateSessionId(ipAddress: string, userId?: string): Promise<string> {
    this.cleanupCache();
    
    const cached = this.IP_CACHE.get(ipAddress);
    if (cached && Date.now() - cached.lastSeen < this.SESSION_TTL_MS) {
      cached.lastSeen = Date.now();
      return cached.sessionId;
    }
    
    try {
      const { data: existingSessions, error: findError } = await supabase
        .from(DATABASE_CONFIG.tables.ip_conversation_sessions)
        .select('session_id, last_active')
        .eq('ip_address', ipAddress)
        .gte('last_active', new Date(Date.now() - this.SESSION_TTL_MS).toISOString())
        .order('last_active', { ascending: false })
        .limit(1);
      
      if (!findError && existingSessions && existingSessions.length > 0) {
        const session = existingSessions[0];
        
        await supabase
          .from(DATABASE_CONFIG.tables.ip_conversation_sessions)
          .update({ 
            last_active: new Date().toISOString(),
            user_id: userId || undefined
          })
          .eq('session_id', session.session_id);
        
        this.IP_CACHE.set(ipAddress, {
          sessionId: session.session_id,
          lastSeen: Date.now()
        });
        
        return session.session_id;
      }
      
      const sessionId = generateSessionId();
      const now = new Date().toISOString();
      
      const { error: insertError } = await supabase
        .from(DATABASE_CONFIG.tables.ip_conversation_sessions)
        .insert({
          session_id: sessionId,
          ip_address: ipAddress,
          user_id: userId || null,
          first_seen: now,
          last_active: now,
          metadata: {
            ip_type: this.detectIPType(ipAddress),
            created_via: 'ip_based',
            ttl_hours: 24
          }
        });
      
      if (insertError) {
        console.warn('Failed to save IP session:', insertError);
        const fallbackSessionId = `ip_${this.hashString(ipAddress)}_${Date.now()}`;
        this.IP_CACHE.set(ipAddress, {
          sessionId: fallbackSessionId,
          lastSeen: Date.now()
        });
        return fallbackSessionId;
      }
      
      this.IP_CACHE.set(ipAddress, {
        sessionId: sessionId,
        lastSeen: Date.now()
      });
      
      return sessionId;
      
    } catch (error) {
      console.warn('IP session management error:', error);
      const fallbackSessionId = `ip_${this.hashString(ipAddress)}_${Date.now()}`;
      this.IP_CACHE.set(ipAddress, {
        sessionId: fallbackSessionId,
        lastSeen: Date.now()
      });
      return fallbackSessionId;
    }
  }
  
  private static detectIPType(ipAddress: string): string {
    if (ipAddress.startsWith('ip_hash_')) return 'hashed';
    if (ipAddress.startsWith('unknown_')) return 'fallback';
    
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(ipAddress)) return 'ipv4';
    
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    if (ipv6Regex.test(ipAddress)) return 'ipv6';
    
    return 'unknown';
  }
  
  private static cleanupCache(): void {
    const now = Date.now();
    const threshold = this.SESSION_TTL_MS;
    
    for (const [ip, data] of this.IP_CACHE.entries()) {
      if (now - data.lastSeen > threshold) {
        this.IP_CACHE.delete(ip);
      }
    }
  }
  
  static async getActiveSessionsCount(): Promise<number> {
    try {
      const { count, error } = await supabase
        .from(DATABASE_CONFIG.tables.ip_conversation_sessions)
        .select('*', { count: 'exact', head: true })
        .gte('last_active', new Date(Date.now() - this.SESSION_TTL_MS).toISOString());
      
      return error ? 0 : (count || 0);
    } catch {
      return 0;
    }
  }
}

// ========== ENHANCED CONVERSATION PERSISTENCE FUNCTIONS ==========
class EnhancedConversationPersistence {
  private sessionId: string;
  private ipAddress: string;
  private userId?: string;
  
  constructor(sessionId: string, ipAddress: string, userId?: string) {
    this.sessionId = sessionId;
    this.ipAddress = ipAddress;
    this.userId = userId;
  }
  
  async loadHistoricalSummaries(limit: number = MAX_SUMMARIZED_CONVERSATIONS): Promise<any[]> {
    try {
      console.log(`📚 Loading historical conversation summaries for session: ${this.sessionId} (IP: ${this.ipAddress})`);
      
      if (this.userId) {
        const { data: userData, error: userError } = await supabase
          .from(DATABASE_CONFIG.tables.conversation_summaries)
          .select('id, summary, key_topics, sentiment, created_at, metadata')
          .eq('user_id', this.userId)
          .order('created_at', { ascending: false })
          .limit(limit);
        
        if (!userError && userData && userData.length > 0) {
          console.log(`📖 Loaded ${userData.length} historical summaries by user ID`);
          return userData;
        }
      }
      
      const { data: ipData, error: ipError } = await supabase
        .from(DATABASE_CONFIG.tables.conversation_summaries)
        .select('id, summary, key_topics, sentiment, created_at, metadata')
        .eq('ip_address', this.ipAddress)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (!ipError && ipData && ipData.length > 0) {
        console.log(`📖 Loaded ${ipData.length} historical summaries by IP address`);
        return ipData;
      }
      
      const { data: sessionData, error: sessionError } = await supabase
        .from(DATABASE_CONFIG.tables.conversation_summaries)
        .select('id, summary, key_topics, sentiment, created_at, metadata')
        .eq('session_id', this.sessionId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (!sessionError && sessionData) {
        console.log(`📖 Loaded ${sessionData.length} historical summaries by session ID`);
        return sessionData;
      }
      
      console.log('📭 No historical conversation summaries found');
      return [];
      
    } catch (error: any) {
      console.warn('⚠️ Failed to load historical summaries:', error);
      return [];
    }
  }
  
  async saveConversationSummary(
    messages: any[],
    toolResults: any[] = [],
    metadata: any = {}
  ): Promise<string | null> {
    try {
      const summary = await generateAISummary(messages, toolResults);
      const keyTopics = this.extractKeyTopics(messages);
      const sentiment = this.analyzeSentiment(messages);
      
      const summaryRecord: any = {
        session_id: this.sessionId,
        ip_address: this.ipAddress,
        summary: summary,
        key_topics: keyTopics,
        metadata: {
          ...metadata,
          message_count: messages.length,
          tool_call_count: toolResults.length,
          conversation_date: new Date().toISOString(),
          executive_name: EXECUTIVE_NAME,
          summary_method: 'ai_enhanced'
        },
        created_at: new Date().toISOString()
      };
      
      if (sentiment && sentiment !== 'unknown') {
        summaryRecord.sentiment = sentiment;
      }
      
      if (this.userId) {
        summaryRecord.user_id = this.userId;
      }
      
      const { data, error } = await supabase
        .from(DATABASE_CONFIG.tables.conversation_summaries)
        .insert(summaryRecord)
        .select()
        .single();
      
      if (error) {
        console.warn('⚠️ Failed to save conversation summary:', error.message);
        return null;
      }
      
      console.log(`💾 Saved AI-enhanced conversation summary with ID: ${data.id}`);
      return data.id;
      
    } catch (error: any) {
      console.warn('⚠️ Failed to save conversation summary:', error);
      return null;
    }
  }
  
  private extractKeyTopics(messages: any[]): string[] {
    const topics = [
      'task', 'agent', 'github', 'deploy', 'bug', 'api', 'function', 'system', 'mining', 'web', 'url', 'browse',
      'code', 'programming', 'development', 'smart contract', 'solidity', 'blockchain', 'crypto',
      'image', 'video', 'generate', 'create', 'design', 'art', 'graphic',
      'document', 'pdf', 'analysis', 'review', 'audit', 'security',
      'financial', 'billing', 'payment', 'invoice', 'transaction',
      'database', 'storage', 'memory', 'performance', 'optimization',
      'help', 'support', 'guide', 'tutorial', 'how-to'
    ];
    
    const allText = messages.map(m => m.content).join(' ').toLowerCase();
    const foundTopics = topics.filter(topic => allText.includes(topic));
    
    return [...new Set(foundTopics)];
  }
  
  private analyzeSentiment(messages: any[]): string | null {
    const positiveWords = ['good', 'great', 'excellent', 'awesome', 'thanks', 'thank', 'helpful', 'perfect', 'love', 'amazing'];
    const negativeWords = ['bad', 'terrible', 'awful', 'wrong', 'error', 'failed', 'broken', 'problem', 'issue', 'disappointed'];
    
    const allText = messages.map(m => m.content).join(' ').toLowerCase();
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    positiveWords.forEach(word => {
      if (allText.includes(word)) positiveCount++;
    });
    
    negativeWords.forEach(word => {
      if (allText.includes(word)) negativeCount++;
    });
    
    if (positiveCount > 0 && positiveCount > negativeCount * 2) return 'positive';
    if (negativeCount > 0 && negativeCount > positiveCount * 2) return 'negative';
    if (positiveCount > 0 || negativeCount > 0) return 'neutral';
    return null;
  }
  
  async saveConversationContext(
    currentQuestion: string,
    assistantResponse: string,
    userResponse: string,
    metadata: any = {}
  ): Promise<void> {
    try {
      const contextRecord: any = {
        session_id: this.sessionId,
        ip_address: this.ipAddress,
        current_question: currentQuestion,
        assistant_response: assistantResponse,
        user_response: userResponse,
        timestamp: new Date().toISOString(),
        metadata: {
          ...metadata,
          executive_name: EXECUTIVE_NAME,
          context_type: 'follow_up'
        }
      };
      
      if (this.userId) {
        contextRecord.user_id = this.userId;
      }
      
      const { error } = await supabase
        .from(DATABASE_CONFIG.tables.conversation_context)
        .insert(contextRecord);
      
      if (error) {
        console.warn('⚠️ Failed to save conversation context:', error.message);
      } else {
        console.log('💾 Saved conversation context for follow-up understanding');
      }
      
    } catch (error: any) {
      console.warn('⚠️ Failed to save conversation context:', error);
    }
  }
  
  async loadRecentContext(limit: number = 5): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from(DATABASE_CONFIG.tables.conversation_context)
        .select('*')
        .eq('ip_address', this.ipAddress)
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.warn('⚠️ Database error loading conversation context:', error.message);
        return [];
      }
      
      return data || [];
      
    } catch (error: any) {
      console.warn('⚠️ Failed to load conversation context:', error);
      return [];
    }
  }
}

// ========== ATTACHMENT ANALYSIS FUNCTIONS ==========
class AttachmentAnalyzer {
  static readonly SUPPORTED_EXTENSIONS = [
    '.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.csv', '.html', '.htm',
    '.pdf', '.doc', '.docx', '.rtf',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg',
    '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.cs', 
    '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala',
    '.sol', '.vy',
    '.sh', '.bash', '.zsh',
    '.sql', '.pl', '.lua', '.r', '.m', '.matlab',
    '.csv', '.tsv', '.xls', '.xlsx',
    '.ini', '.conf', '.cfg', '.env'
  ];
  
  static isSupportedFile(filename: string): boolean {
    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return this.SUPPORTED_EXTENSIONS.includes(extension);
  }
  
  static getFileType(filename: string): string {
    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    
    if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'].includes(extension)) {
      return 'image';
    } else if (['.pdf', '.doc', '.docx', '.rtf'].includes(extension)) {
      return 'document';
    } else if (['.sol', '.vy'].includes(extension)) {
      return 'smart_contract';
    } else if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.go', '.rs'].includes(extension)) {
      return 'code';
    } else if (['.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.csv'].includes(extension)) {
      return 'text';
    } else {
      return 'unknown';
    }
  }
  
  static async analyzeTextContent(content: string, filename: string): Promise<any> {
    const fileType = this.getFileType(filename);
    
    let analysis = {
      file_type: fileType,
      filename: filename,
      content_preview: content.substring(0, 5000),
      estimated_lines: content.split('\n').length,
      estimated_words: content.split(/\s+/).length,
      has_code: false,
      detected_language: 'unknown',
      key_findings: [] as string[]
    };
    
    if (fileType === 'code' || fileType === 'smart_contract') {
      analysis.has_code = true;
      
      if (filename.endsWith('.sol')) {
        analysis.detected_language = 'solidity';
        analysis.key_findings.push('Smart contract file detected');
        
        const contractMatch = content.match(/contract\s+(\w+)/);
        if (contractMatch) {
          analysis.key_findings.push(`Contract name: ${contractMatch[1]}`);
        }
        
        const functionMatches = content.match(/function\s+(\w+)/g);
        if (functionMatches) {
          analysis.key_findings.push(`Found ${functionMatches.length} functions`);
        }
        
      } else if (filename.endsWith('.js') || filename.endsWith('.jsx')) {
        analysis.detected_language = 'javascript';
      } else if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
        analysis.detected_language = 'typescript';
      } else if (filename.endsWith('.py')) {
        analysis.detected_language = 'python';
      } else if (filename.endsWith('.java')) {
        analysis.detected_language = 'java';
      } else if (filename.endsWith('.cpp') || filename.endsWith('.c') || filename.endsWith('.h')) {
        analysis.detected_language = 'c++';
      } else if (filename.endsWith('.go')) {
        analysis.detected_language = 'go';
      } else if (filename.endsWith('.rs')) {
        analysis.detected_language = 'rust';
      }
      
      const importMatches = content.match(/(import|require|from|#include|using)\s+['"][^'"]+['"]/g);
      if (importMatches) {
        analysis.key_findings.push(`Found ${importMatches.length} imports/dependencies`);
      }
    }
    
    if (fileType === 'document' || fileType === 'text') {
      const headingMatches = content.match(/^(#+|\w.+:\n)/gm);
      if (headingMatches) {
        analysis.key_findings.push(`Found ${headingMatches.length} headings/sections`);
      }
      
      const urlMatches = content.match(/https?:\/\/[^\s]+/g);
      if (urlMatches) {
        analysis.key_findings.push(`Found ${urlMatches.length} URLs`);
      }
      
      const emailMatches = content.match(/[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/g);
      if (emailMatches) {
        analysis.key_findings.push(`Found ${emailMatches.length} email addresses`);
      }
    }
    
    return analysis;
  }
  
  static async saveAnalysisToDatabase(
    sessionId: string,
    ipAddress: string,
    filename: string,
    analysis: any,
    metadata: any = {}
  ): Promise<void> {
    try {
      const analysisRecord: any = {
        session_id: sessionId,
        ip_address: ipAddress,
        filename: filename,
        file_type: analysis.file_type,
        content_preview: analysis.content_preview,
        key_findings: analysis.key_findings,
        metadata: {
          ...metadata,
          estimated_lines: analysis.estimated_lines,
          estimated_words: analysis.estimated_words,
          has_code: analysis.has_code,
          analyzed_at: new Date().toISOString(),
          executive_name: EXECUTIVE_NAME
        },
        created_at: new Date().toISOString()
      };
      
      if (analysis.detected_language && analysis.detected_language !== 'unknown') {
        analysisRecord.detected_language = analysis.detected_language;
      }
      
      const { error } = await supabase
        .from(DATABASE_CONFIG.tables.attachment_analysis)
        .insert(analysisRecord);
      
      if (error) {
        console.warn('⚠️ Failed to save attachment analysis:', error.message);
      } else {
        console.log(`💾 Saved attachment analysis for ${filename} with session ID: ${sessionId}`);
      }
      
    } catch (error: any) {
      console.warn('⚠️ Failed to save attachment analysis:', error);
    }
  }
}

// ========== REAL DATABASE TOOL EXECUTION FUNCTIONS ==========
async function getSystemStatus(): Promise<any> {
  try {
    const [agents, tasks, knowledge, edgeLogs] = await Promise.all([
      supabase.from(DATABASE_CONFIG.tables.agents).select('id', { count: 'exact', head: true }),
      supabase.from(DATABASE_CONFIG.tables.tasks).select('id', { count: 'exact', head: true }),
      supabase.from(DATABASE_CONFIG.tables.knowledge_entities).select('id', { count: 'exact', head: true }),
      supabase.from(DATABASE_CONFIG.tables.edge_function_logs).select('id', { count: 'exact', head: true }).gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    ]);

    const { data: recentActivity } = await supabase
      .from(DATABASE_CONFIG.tables.eliza_activity_log)
      .select('activity_type, status')
      .gte('created_at', new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString())
      .limit(10);

    let systemStatusData = {};
    try {
      const { data, error } = await supabase.functions.invoke('system-status', {
        body: { action: 'summary' }
      });
      if (!error && data) systemStatusData = data;
    } catch (_) {}

    return {
      success: true,
      database_counts: {
        agents: agents.count || 0,
        tasks: tasks.count || 0,
        knowledge_entities: knowledge.count || 0,
        recent_edge_logs: edgeLogs.count || 0
      },
      recent_activity: recentActivity || [],
      ...systemStatusData,
      timestamp: new Date().toISOString(),
      last_updated: new Date().toISOString()
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to get system status',
      timestamp: new Date().toISOString()
    };
  }
}

async function invokeEdgeFunction(name: string, payload: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body: payload });
    if (error) throw new Error(error.message);
    return data;
  } catch (error: any) {
    throw new Error(`Edge function '${name}' failed: ${error.message}`);
  }
}

async function analyzeAttachmentTool(attachments: any[], ipAddress: string, sessionId: string): Promise<any> {
  try {
    console.log(`📎 Analyzing ${attachments.length} attachment(s) for IP: ${ipAddress}, Session: ${sessionId}`);
    
    const analyses = [];
    
    for (const attachment of attachments) {
      const { filename, content, mime_type, size, url } = attachment;
      
      if (!filename) {
        analyses.push({
          success: false,
          error: 'Missing filename',
          filename: 'unknown'
        });
        continue;
      }
      
      if (!AttachmentAnalyzer.isSupportedFile(filename)) {
        analyses.push({
          success: false,
          error: `Unsupported file type: ${filename}`,
          filename,
          supported_extensions: AttachmentAnalyzer.SUPPORTED_EXTENSIONS
        });
        continue;
      }
      
      const fileType = AttachmentAnalyzer.getFileType(filename);
      
      let analysis: any = {
        success: true,
        filename,
        file_type: fileType,
        mime_type: mime_type || 'unknown',
        size: size || 'unknown',
        supported: true
      };
      
      if (fileType === 'image') {
        analysis.analysis_type = 'image_vision';
        analysis.note = 'Image will be analyzed using vision capabilities';
        
      } else if (['text', 'document', 'code', 'smart_contract'].includes(fileType)) {
        if (content) {
          const textAnalysis = await AttachmentAnalyzer.analyzeTextContent(content, filename);
          analysis = { ...analysis, ...textAnalysis };
          analysis.analysis_type = 'text_analysis';
        } else if (url) {
          analysis.analysis_type = 'url_reference';
          analysis.note = 'File referenced by URL, content not directly available';
        } else {
          analysis.success = false;
          analysis.error = 'No content provided for analysis';
        }
      }
      
      analyses.push(analysis);
      
      if (analysis.success) {
        await AttachmentAnalyzer.saveAnalysisToDatabase(
          sessionId,
          ipAddress,
          filename,
          analysis
        );
      }
    }
    
    return {
      success: true,
      total_attachments: attachments.length,
      analyzed: analyses.filter(a => a.success).length,
      failed: analyses.filter(a => !a.success).length,
      analyses: analyses,
      timestamp: new Date().toISOString()
    };
    
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to analyze attachments',
      timestamp: new Date().toISOString()
    };
  }
}

// ========== SOLUTION ENGINE: NEW TOOL IMPLEMENTATIONS ==========
async function proposeEdgeFunction(
  name: string,
  description: string,
  code: string,
  parameters: any,
  category: string = 'general',
  sessionId: string,
  ipAddress: string
): Promise<any> {
  try {
    // Store proposal in database
    const { data, error } = await supabase
      .from(DATABASE_CONFIG.tables.proposed_edge_functions)
      .insert({
        name,
        description,
        code,
        parameters: parameters || {},
        category,
        status: 'proposed',
        proposed_by_ip: ipAddress,
        proposed_by_session: sessionId,
        proposed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Optionally create a task for council review
    await supabase.from(DATABASE_CONFIG.tables.tasks).insert({
      title: `Review proposed edge function: ${name}`,
      description: `A new edge function has been proposed.\n\nDescription: ${description}\nCategory: ${category}\n\nParameters: ${JSON.stringify(parameters)}\n\nCode preview: ${code.substring(0, 500)}...`,
      category: 'governance',
      status: 'PENDING',
      stage: 'DISCUSS',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    return {
      success: true,
      proposal_id: data.id,
      name,
      status: 'proposed',
      message: `Edge function "${name}" has been proposed and is awaiting council review.`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to propose edge function'
    };
  }
}

async function listProposedFunctions(status?: string): Promise<any> {
  try {
    let query = supabase
      .from(DATABASE_CONFIG.tables.proposed_edge_functions)
      .select('*')
      .order('proposed_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      success: true,
      functions: data || [],
      count: data?.length || 0
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to list proposed functions'
    };
  }
}

async function deployEdgeFunction(proposalId: string, approvedBy?: string): Promise<any> {
  try {
    // Fetch proposal
    const { data: proposal, error: fetchError } = await supabase
      .from(DATABASE_CONFIG.tables.proposed_edge_functions)
      .select('*')
      .eq('id', proposalId)
      .single();

    if (fetchError) throw fetchError;
    if (!proposal) throw new Error('Proposal not found');

    // TODO: Actual deployment logic (e.g., call Supabase management API to create edge function)
    // For now, we simulate deployment by updating status and inserting into ai_tools
    const { error: updateError } = await supabase
      .from(DATABASE_CONFIG.tables.proposed_edge_functions)
      .update({
        status: 'deployed',
        deployed_at: new Date().toISOString(),
        deployed_by: approvedBy || 'system'
      })
      .eq('id', proposalId);

    if (updateError) throw updateError;

    // Register as an available tool in ai_tools
    const { error: toolError } = await supabase
      .from(DATABASE_CONFIG.tables.ai_tools)
      .insert({
        name: proposal.name,
        description: proposal.description,
        category: proposal.category,
        parameters: proposal.parameters,
        is_active: true,
        created_at: new Date().toISOString()
      });

    if (toolError) throw toolError;

    return {
      success: true,
      message: `Edge function "${proposal.name}" deployed successfully.`,
      function_name: proposal.name
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to deploy edge function'
    };
  }
}

async function storeCodeSnippet(
  name: string,
  code: string,
  language: string,
  description: string,
  tags: string[],
  sessionId: string,
  ipAddress: string
): Promise<any> {
  try {
    const { data, error } = await supabase
      .from(DATABASE_CONFIG.tables.code_snippets)
      .insert({
        name,
        code,
        language,
        description,
        tags,
        created_by_ip: ipAddress,
        created_by_session: sessionId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      snippet_id: data.id,
      name,
      message: `Code snippet "${name}" stored successfully.`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to store code snippet'
    };
  }
}

// ========== REAL TOOL EXECUTION (ENHANCED WITH NEW TOOLS) ==========
async function executeRealToolCall(
  name: string, 
  args: string,
  executiveName: string,
  sessionId: string,
  ipAddress: string,
  timestamp: number = Date.now()
): Promise<any> {
  const startTime = performance.now();
  let success = false;
  let result: any = null;
  let error_message: string | null = null;

  try {
    const parsedArgs = parseToolArguments(args);

    // ----- Existing tools (unchanged) -----
    if (name === 'analyze_attachment') {
      const { attachments } = parsedArgs;
      if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
        throw new Error('Missing or empty attachments array');
      }
      
      result = await analyzeAttachmentTool(attachments, ipAddress, sessionId);
      
    } else if (name === 'browse_web') {
      const url = parsedArgs.url;
      if (!url) throw new Error('Missing url');
      
      let normalizedUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        normalizedUrl = `https://${url}`;
      }
      
      result = await invokeEdgeFunction('playwright-browse', {
        url: normalizedUrl,
        action: parsedArgs.action || 'navigate',
        timeout: parsedArgs.timeout || 90000,
        headers: parsedArgs.headers,
        method: parsedArgs.method || 'GET',
        body: parsedArgs.body
      });
      
    } else if (name === 'get_mining_stats') {
      result = await invokeEdgeFunction('mining-proxy', { 
        action: 'get_mining_stats' 
      });
      
    } else if (name === 'get_ecosystem_metrics') {
      result = await invokeEdgeFunction('ecosystem-monitor', { 
        action: 'ecosystem_metrics' 
      });
      
    } else if (name === 'get_system_status') {
      result = await getSystemStatus();
      
    } else if (name === 'vertex_generate_image') {
      const { prompt } = parsedArgs;
      if (!prompt) throw new Error('Missing prompt');
      result = await invokeEdgeFunction('vertex-ai-chat', { 
        action: 'generate_image', 
        prompt 
      });
      
    } else if (name === 'vertex_generate_video') {
      const { prompt, duration_seconds = 5 } = parsedArgs;
      if (!prompt) throw new Error('Missing prompt');
      result = await invokeEdgeFunction('vertex-ai-chat', { 
        action: 'generate_video', 
        prompt, 
        duration_seconds 
      });
      
    } else if (name === 'vertex_check_video_status') {
      const { operation_name } = parsedArgs;
      if (!operation_name) throw new Error('Missing operation_name');
      result = await invokeEdgeFunction('vertex-ai-chat', { 
        action: 'check_video_status', 
        operation_name 
      });
      
    } else if (name === 'invoke_edge_function') {
      const { function_name, payload } = parsedArgs;
      if (!function_name) throw new Error('Missing function_name');
      result = await invokeEdgeFunction(function_name, payload ?? {});
      
    } else if (name === 'search_edge_functions') {
      const { query, category, mode } = parsedArgs;
      
      if (mode === 'full_registry') {
        const { data, error } = await supabase
          .from(DATABASE_CONFIG.tables.ai_tools)
          .select('name, description, category, is_active, parameters')
          .eq('is_active', true)
          .order('name');
        
        if (error) throw error;
        
        const grouped = (data || []).reduce((acc: any, tool) => {
          const cat = tool.category || 'uncategorized';
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(tool);
          return acc;
        }, {});
        
        result = { 
          success: true, 
          functions: data,
          grouped_by_category: grouped,
          total: data?.length || 0
        };
      } else {
        let dbQuery = supabase
          .from(DATABASE_CONFIG.tables.ai_tools)
          .select('name, description, category, is_active, parameters')
          .eq('is_active', true);
        
        if (query) {
          dbQuery = dbQuery.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
        }
        
        if (category) {
          dbQuery = dbQuery.eq('category', category);
        }
        
        const { data, error } = await dbQuery.order('name').limit(100);
        if (error) throw error;
        result = { success: true, functions: data, total: data?.length || 0 };
      }
      
    } else if (name === 'list_available_functions') {
      const { category } = parsedArgs;
      
      let dbQuery = supabase
        .from(DATABASE_CONFIG.tables.ai_tools)
        .select('name, description, category, is_active, parameters')
        .eq('is_active', true)
        .order('name');
      
      if (category) {
        dbQuery = dbQuery.eq('category', category);
      }
      
      const { data, error } = await dbQuery;
      if (error) throw error;
      result = { success: true, functions: data, total: data?.length || 0 };
      
    } else if (name === 'get_edge_function_logs') {
      const { function_name, limit = 100 } = parsedArgs;
      let query = supabase
        .from(DATABASE_CONFIG.tables.edge_function_logs)
        .select('function_name, level, event_type, event_message, timestamp, execution_time_ms, status_code, request_id')
        .order('timestamp', { ascending: false })
        .limit(Math.min(limit, 200));
      
      if (function_name) {
        query = query.eq('function_name', function_name);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      result = { success: true, logs: data, total: data?.length || 0 };
      
    } else if (name === 'list_agents') {
      const [agentsResult, superduperResult] = await Promise.all([
        supabase
          .from(DATABASE_CONFIG.tables.agents)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from(DATABASE_CONFIG.tables.superduper_agents)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10)
      ]);
      
      if (agentsResult.error) throw agentsResult.error;
      
      result = { 
        success: true, 
        agents: agentsResult.data || [],
        superduper_agents: superduperResult.data || [],
        total_agents: (agentsResult.data?.length || 0) + (superduperResult.data?.length || 0)
      };
      
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
      
      if (error) throw error;
      result = { success: true, task: task };
      
    } else if (name === 'list_tasks') {
      const { data: tasks, error } = await supabase
        .from(DATABASE_CONFIG.tables.tasks)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      result = { success: true, tasks: tasks || [] };
      
    } else if (name === 'search_knowledge') {
      const search_term = parsedArgs.search_term || parsedArgs.query;
      const limit = parsedArgs.limit || 10;
      
      if (!search_term) {
        const { data: knowledge, error } = await supabase
          .from(DATABASE_CONFIG.tables.knowledge_entities)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        result = { success: true, knowledge: knowledge || [] };
      } else {
        const { data: knowledge, error } = await supabase
          .from(DATABASE_CONFIG.tables.knowledge_entities)
          .select('*')
          .or(`entity_name.ilike.%${search_term}%,description.ilike.%${search_term}%,content.ilike.%${search_term}%`)
          .order('created_at', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        result = { success: true, knowledge: knowledge || [] };
      }
      
    } else if (name === 'store_knowledge') {
      const knowledgeData = {
        entity_name: parsedArgs.name,
        description: parsedArgs.description,
        content: parsedArgs.content || '',
        type: parsedArgs.type || 'general',
        tags: parsedArgs.tags || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const { data: knowledge, error } = await supabase
        .from(DATABASE_CONFIG.tables.knowledge_entities)
        .insert(knowledgeData)
        .select()
        .single();
      
      if (error) throw error;
      result = { success: true, knowledge: knowledge };
      
    } else if (name === 'recall_entity') {
      const { name, entity_id } = parsedArgs;
      
      let query = supabase
        .from(DATABASE_CONFIG.tables.knowledge_entities)
        .select('*');
      
      if (entity_id) {
        query = query.eq('id', entity_id);
      } else if (name) {
        query = query.ilike('entity_name', `%${name}%`);
      } else {
        throw new Error('Either name or entity_id is required');
      }
      
      const { data: entity, error } = await query.single();
      if (error) throw error;
      result = { success: true, entity: entity };
      
    } else if (name === 'createGitHubIssue') {
      result = await invokeEdgeFunction('github-integration', {
        action: 'create_issue',
        data: {
          title: parsedArgs.title,
          body: parsedArgs.body,
          labels: parsedArgs.labels || []
        }
      });
      
    } else if (name === 'listGitHubIssues') {
      result = await invokeEdgeFunction('github-integration', {
        action: 'list_issues',
        data: {
          state: parsedArgs.state || 'open',
          limit: parsedArgs.limit || 10
        }
      });
      
    } else if (name === 'createGitHubDiscussion') {
      result = await invokeEdgeFunction('github-integration', {
        action: 'create_discussion',
        data: {
          title: parsedArgs.title,
          body: parsedArgs.body,
          category: parsedArgs.category || 'General'
        }
      });
      
    } else if (name === 'searchGitHubCode') {
      result = await invokeEdgeFunction('github-integration', {
        action: 'search_code',
        data: {
          query: parsedArgs.query,
          limit: parsedArgs.limit || 10
        }
      });
      
    } else if (name === 'createGitHubPullRequest') {
      result = await invokeEdgeFunction('github-integration', {
        action: 'create_pull_request',
        data: {
          title: parsedArgs.title,
          body: parsedArgs.body || '',
          head: parsedArgs.head,
          base: parsedArgs.base || 'main',
          draft: parsedArgs.draft || false
        }
      });
      
    } else if (name === 'commentOnGitHubIssue') {
      result = await invokeEdgeFunction('github-integration', {
        action: 'comment_on_issue',
        data: {
          issue_number: parsedArgs.issue_number,
          body: parsedArgs.body
        }
      });
      
    } else if (name === 'commentOnGitHubDiscussion') {
      result = await invokeEdgeFunction('github-integration', {
        action: 'comment_on_discussion',
        data: {
          discussion_number: parsedArgs.discussion_number,
          body: parsedArgs.body
        }
      });
      
    } else if (name === 'listGitHubPullRequests') {
      result = await invokeEdgeFunction('github-integration', {
        action: 'list_pull_requests',
        data: {
          state: parsedArgs.state || 'open',
          limit: parsedArgs.limit || 10
        }
      });
      
    } else if (name === 'execute_workflow_template') {
      const { template_name, params } = parsedArgs;
      
      const { data: template, error: templateError } = await supabase
        .from(DATABASE_CONFIG.tables.workflow_templates)
        .select('*')
        .eq('name', template_name)
        .single();
      
      if (templateError) throw templateError;
      
      result = await invokeEdgeFunction('workflow-template-manager', {
        action: 'execute_template',
        template_name,
        template_data: template,
        params: params || {}
      });
      
    } else if (name === 'google_gmail') {
      result = await invokeEdgeFunction('google-gmail', parsedArgs);
      
    // ----- NEW SOLUTION ENGINE TOOLS -----
    } else if (name === 'propose_edge_function') {
      const { name: funcName, description, code, parameters, category } = parsedArgs;
      if (!funcName || !description || !code) {
        throw new Error('Missing required fields: name, description, code');
      }
      result = await proposeEdgeFunction(funcName, description, code, parameters || {}, category, sessionId, ipAddress);
      
    } else if (name === 'list_proposed_functions') {
      const { status } = parsedArgs;
      result = await listProposedFunctions(status);
      
    } else if (name === 'deploy_edge_function') {
      const { proposal_id, approved_by } = parsedArgs;
      if (!proposal_id) throw new Error('Missing proposal_id');
      result = await deployEdgeFunction(proposal_id, approved_by);
      
    } else if (name === 'store_code_snippet') {
      const { name: snippetName, code, language, description, tags } = parsedArgs;
      if (!snippetName || !code || !language) {
        throw new Error('Missing required fields: name, code, language');
      }
      result = await storeCodeSnippet(snippetName, code, language, description || '', tags || [], sessionId, ipAddress);
      
    } else {
      throw new Error(`Tool '${name}' is not a recognized or allowed tool.`);
    }
    
    success = true;
    return {
      ...result,
      execution_time_ms: Math.round(performance.now() - startTime),
      tool_name: name,
      timestamp
    };
    
  } catch (error: any) {
    error_message = error?.message || String(error);
    return { 
      success: false, 
      error: error_message,
      tool_name: name,
      timestamp,
      execution_time_ms: Math.round(performance.now() - startTime)
    };
  } finally {
    const duration = Math.round(performance.now() - startTime);
    const parsedToolArgs = parseToolArguments(args);
    
    const logEntry = {
      function_name: name,
      executive_name: executiveName,
      parameters: parsedToolArgs,
      success,
      execution_time_ms: duration,
      result_summary: success ? 'Executed successfully' : null,
      error_message,
      session_id: sessionId,
      ip_address: ipAddress,
      created_at: new Date().toISOString()
    };
    
    logFunctionUsage(logEntry);
    
    logActivity({
      activity_type: 'tool_execution',
      title: `🔧 ${executiveName} executed ${name}`,
      description: `${executiveName} executed tool: ${name}`,
      status: success ? 'completed' : 'error',
      metadata: { 
        name, 
        args: parsedToolArgs, 
        result: success ? 'ok' : error_message,
        duration_ms: duration,
        ip_address: ipAddress
      },
      function_name: name,
      created_at: new Date().toISOString()
    });
  }
}

// ========== ENHANCED CONTENT ANALYSIS FUNCTIONS ==========
function extractKeyInsights(content: string, domain: string): string {
  if (!content || content.length < 100) {
    return "The page appears to be accessible but contains minimal content.\n";
  }
  
  const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : '';
  
  const metaMatch = content.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const description = metaMatch ? metaMatch[1] : '';
  
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
  
  if (isNewsSite) {
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
  
  const hasForms = content.includes('<form') || content.includes('<input');
  const hasImages = content.match(/<img[^>]+>/g)?.length || 0;
  const hasLinks = content.match(/<a[^>]+href=["'][^"']+["'][^>]*>/g)?.length || 0;
  
  insights += `**Page Elements**: ${hasForms ? 'Forms, ' : ''}${hasImages} images, ${hasLinks} links\n`;
  
  return insights;
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
    help: ['help', 'assist', 'guide', 'how to', 'can you'],
    communication: ['email', 'send', 'mail', 'message', 'contact', 'reach out', 'notify']
  };
  
  const detectedIntents = [];
  for (const [intent, keywords] of Object.entries(intents)) {
    if (keywords.some(keyword => queryLower.includes(keyword))) {
      detectedIntents.push(intent);
    }
  }
  
  const commonTopics = [
    'task', 'agent', 'github', 'code', 'function', 'edge function', 'mining',
    'system', 'database', 'web', 'url', 'api', 'key', 'license', 'workflow',
    'vertex', 'image', 'video', 'billing', 'financial', 'vsco', 'lead',
    'email', 'gmail', 'contact', 'message', 'communication', 'send'
  ];
  
  const foundTopics = commonTopics.filter(topic => queryLower.includes(topic));
  
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

function detectAmbiguousResponse(userMessage: string, conversationHistory: any[]): {
  isAmbiguous: boolean;
  likelyReferringTo: string | null;
  confidence: number;
} {
  const userMessageLower = userMessage.toLowerCase().trim();
  
  const isAmbiguous = AMBIGUOUS_RESPONSES.includes(userMessageLower);
  
  if (!isAmbiguous) {
    return { isAmbiguous: false, likelyReferringTo: null, confidence: 0 };
  }
  
  let likelyReferringTo = null;
  let confidence = 0.7;
  
  const recentMessages = conversationHistory.slice(-10).reverse();
  
  for (const message of recentMessages) {
    if (message.role === 'assistant') {
      const assistantMessage = message.content || '';
      
      const hasQuestion = assistantMessage.includes('?');
      const hasOptions = assistantMessage.includes('option') || 
                         assistantMessage.includes('choice') || 
                         assistantMessage.includes('select');
      
      if (hasQuestion || hasOptions) {
        likelyReferringTo = assistantMessage.substring(0, 200);
        confidence = hasQuestion && hasOptions ? 0.9 : 0.8;
        break;
      }
    }
  }
  
  if (!likelyReferringTo) {
    const lastAssistant = recentMessages.find(m => m.role === 'assistant');
    if (lastAssistant) {
      likelyReferringTo = lastAssistant.content?.substring(0, 200) || 'the previous question';
      confidence = 0.6;
    }
  }
  
  return { isAmbiguous: true, likelyReferringTo, confidence };
}

// ========== TOOL PARSING FUNCTIONS ==========
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

function parseToolCodeBlocks(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  
  const toolCodeRegex = /```tool_code\s*\n?([\s\S]*?)```/g;
  let match;
  
  while ((match = toolCodeRegex.exec(content)) !== null) {
    const code = match[1].trim();
    
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

function parseConversationalToolIntent(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  const patterns = [
    /(?:call(?:ing)?|use|invoke|execute|run|check(?:ing)?)\s+(?:the\s+)?(?:function\s+|tool\s+)?[`"']?(\w+)[`"']?/gi,
    /let me (?:call|check|get|invoke)\s+[`"']?(\w+)[`"']?/gi,
    /I(?:'ll| will) (?:call|invoke|use)\s+[`"']?(\w+)[`"']?/gi
  ];
  
const knownTools = [
  // Existing
  'get_mining_stats', 'get_system_status', 'get_ecosystem_metrics',
  'search_knowledge', 'recall_entity', 'invoke_edge_function',
  'get_edge_function_logs', 'get_agent_status', 'list_agents', 'list_tasks',
  'search_edge_functions', 'browse_web', 'analyze_attachment', 'google_gmail',

  // Supabase: Database
  'execute_sql', 'list_tables', 'list_extensions', 'list_policies',
  'get_advisors', 'get_logs', 'get_active_incidents', 'list_branches',

  // Supabase: Edge Functions + Deployment
  'deploy_edge_function', 'list_edge_functions',

  // Supabase: Auth
  'get_user', 'get_users', 'create_user', 'update_user', 'delete_user',
  'invite_user', 'generate_magic_link',

  // Supabase: Storage
  'list_buckets', 'create_bucket', 'delete_bucket',
  'list_objects', 'upload_object', 'download_object', 'delete_object',
  'sign_object_url',

  // Supabase: Realtime
  'broadcast_event', 'send_presence', 'list_realtime_topics',

  // Search/Vector/AI
  'embed_text', 'search_embeddings', 'semantic_search', 'rerank_results',

  // Monitoring/Observability
  'get_edge_function_metrics', 'get_realtime_metrics', 'get_db_metrics',
  'get_storage_metrics', 'get_auth_metrics',

  // Tasks/Jobs/Queues
  'enqueue_task', 'dequeue_task', 'get_task_status', 'cancel_task',

  // Knowledge base / Retrieval
  'index_document', 'delete_document', 'list_documents',

  // External integrations
  'slack_post_message', 'discord_send_message', 'github_issue_create',
  'google_drive_upload', 'notion_create_page', 'openai_chat',

  // Utilities
  'http_fetch', 'parse_csv', 'generate_uuid', 'cron_schedule_task',
  'validate_schema', 'jsonata_query',

  // Email/SMS
  'send_email', 'send_sms',

  // Security / Keys
  'rotate_api_key', 'get_secrets', 'set_secret', 'delete_secret',

  // Admin/Org
  'get_org_usage', 'get_billing_plan', 'list_projects', 'get_project_status'
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

function needsDataRetrieval(messages: any[]): boolean {
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
    'photo', 'artwork', 'graphic', 'clip', 'film', 'scene',
    'view', 'open', 'check', 'browse', 'navigate', 'visit', 'go to',
    'website', 'webpage', 'url', 'link', 'http://', 'https://',
    'web', 'internet', 'page', 'site',
    'email', 'send', 'mail', 'contact', 'message'
  ];
  
  const hasQuestionMark = lastUser.includes('?');
  const imperativePatterns = /^(show|tell|give|get|list|find|check|run|execute|analyze|fetch|retrieve|scan|diagnose|look|pull|view|open|browse|navigate|visit|go|send|email)/i;
  const startsWithImperative = imperativePatterns.test(lastUser.trim());
  const urlPattern = /(https?:\/\/[^\s]+)/gi;
  const hasUrl = urlPattern.test(lastUser);
  const emailPattern = /[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/gi;
  const hasEmail = emailPattern.test(lastUser);
  
  return hasQuestionMark || startsWithImperative || hasUrl || hasEmail || dataKeywords.some(k => lastUser.includes(k));
}

function convertToolsToGeminiFormat(tools: any[]): any[] {
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters
  }));
}

async function retrieveMemoryContexts(sessionKey: string): Promise<any[]> {
  if (!sessionKey) return [];
  
  console.log('📚 Retrieving memory contexts server-side...');
  try {
    const { data: serverMemories, error } = await supabase
      .from(DATABASE_CONFIG.tables.memory_contexts)
      .select('context_type, content, importance_score')
      .or(`user_id.eq.${sessionKey},session_id.eq.${sessionKey}`)
      .order('importance_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30);
    
    if (error) throw error;
    
    if (serverMemories && serverMemories.length > 0) {
      console.log(`✅ Retrieved ${serverMemories.length} memory contexts`);
      return serverMemories.map(m => ({
        type: m.context_type,
        content: m.content?.slice?.(0, 500) || String(m.content).slice(0, 500),
        score: m.importance_score
      }));
    }
  } catch (error: any) {
    console.warn('⚠️ Failed to retrieve memory contexts:', error.message);
  }
  return [];
}

async function callDeepSeekFallback(messages: any[], tools?: any[]): Promise<any> {
  if (!DEEPSEEK_API_KEY) return null;
  
  console.log('🔄 Trying DeepSeek fallback...');
  
  const enhancedMessages = messages.map(m => 
    m.role === 'system' ? { ...m, content: TOOL_CALLING_MANDATE + m.content } : m
  );
  
  const forceTools = needsDataRetrieval(messages);
  console.log(`📊 DeepSeek - Data retrieval needed: ${forceTools}`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
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
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
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
    console.warn('⚠️ DeepSeek fallback failed:', error);
  }
  return null;
}

async function callKimiFallback(messages: any[], tools?: any[]): Promise<any> {
  if (!OPENROUTER_API_KEY) return null;
  
  console.log('🔄 Trying Kimi K2 fallback via OpenRouter...');
  
  const enhancedMessages = messages.map(m => 
    m.role === 'system' ? { ...m, content: TOOL_CALLING_MANDATE + m.content } : m
  );
  
  const forceTools = needsDataRetrieval(messages);
  console.log(`📊 Kimi K2 - Data retrieval needed: ${forceTools}`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    
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
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
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
    console.warn('⚠️ Kimi K2 fallback failed:', error);
  }
  return null;
}

async function callGeminiFallback(
  messages: any[], 
  tools?: any[],
  images?: string[]
): Promise<any> {
  if (!GEMINI_API_KEY) return null;
  
  console.log('🔄 Trying Gemini fallback with better models (2.5-flash)...');
  
  const geminiModels = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-image',
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash'
  ];
  
  for (const model of geminiModels) {
    try {
      console.log(`🔄 Trying Gemini model: ${model}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      const userText = lastUserMessage?.content || 'Help me';
      
      const parts: any[] = [{ text: `${TOOL_CALLING_MANDATE}\n${systemPrompt}\n\nUser: ${userText}` }];
      
      if (images && images.length > 0 && (model.includes('image') || model === 'gemini-1.5-flash')) {
        for (const imageBase64 of images) {
          const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            parts.push({ inline_data: { mime_type: matches[1], data: matches[2] } });
          }
        }
      }
      
      const geminiTools = tools && tools.length > 0 ? [{
        functionDeclarations: convertToolsToGeminiFormat(tools)
      }] : undefined;
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [{ parts }],
            tools: geminiTools,
            generationConfig: { temperature: 0.7, maxOutputTokens: 8000 }
          }),
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        const candidate = data.candidates?.[0];
        
        if (!candidate || !candidate.content) {
          if (model !== geminiModels[geminiModels.length - 1]) {
            continue;
          }
          return null;
        }
        
        const functionCalls = candidate.content.parts?.filter((p: any) => p.functionCall);
        if (functionCalls && functionCalls.length > 0) {
          console.log(`✅ Gemini ${model} returned ${functionCalls.length} native function calls`);
          return {
            content: candidate.content.parts?.find((p: any) => p.text)?.text || '',
            tool_calls: functionCalls.map((fc: any, idx: number) => ({
              id: `gemini_${Date.now()}_${idx}`,
              type: 'function',
              function: {
                name: fc.functionCall.name,
                arguments: JSON.stringify(fc.functionCall.args || {})
              }
            })),
            provider: 'gemini',
            model: model
          };
        }
        
        const text = candidate.content.parts
          ?.map((part: any) => part.text || '')
          .join('') || '';
        
        if (text) {
          console.log(`✅ Gemini ${model} fallback successful`);
          return { content: text, tool_calls: [], provider: 'gemini', model: model };
        }
      } else if (response.status === 429 && model !== geminiModels[geminiModels.length - 1]) {
        console.log(`⚠️ Quota exceeded for ${model}, trying next model...`);
        continue;
      } else {
        const errorText = await response.text();
        console.warn(`⚠️ Gemini ${model} API error:`, response.status, errorText);
        if (model !== geminiModels[geminiModels.length - 1]) {
          continue;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Gemini ${model} fallback failed:`, error);
      if (model !== geminiModels[geminiModels.length - 1]) {
        continue;
      }
    }
  }
  
  return null;
}

// ========== ENHANCED CONVERSATION MEMORY MANAGER ==========
class EnhancedConversationManager {
  private sessionId: string;
  private ipAddress: string;
  private toolResultsMemory: any[] = [];
  private conversationPersistence: EnhancedConversationPersistence;
  private userId?: string;
  
  constructor(sessionId: string, ipAddress: string, userId?: string) {
    this.sessionId = sessionId;
    this.ipAddress = ipAddress;
    this.userId = userId;
    this.conversationPersistence = new EnhancedConversationPersistence(sessionId, ipAddress, userId);
  }
  
  async loadConversationHistory(): Promise<{
    messages: any[];
    toolResults: any[];
    conversationSummary: string;
    historicalSummaries: any[];
  }> {
    try {
      console.log(`📚 Loading conversation history for session: ${this.sessionId} (IP: ${this.ipAddress})`);
      
      const { data: ipData, error: ipError } = await supabase
        .from(DATABASE_CONFIG.tables.conversation_memory)
        .select('messages, summary, tool_results, metadata')
        .eq('ip_address', this.ipAddress)
        .order('updated_at', { ascending: false })
        .limit(1);
      
      let messages = [];
      let toolResults = [];
      let conversationSummary = 'New session';
      
      if (!ipError && ipData && ipData.length > 0) {
        const record = ipData[0];
        messages = record.messages || [];
        toolResults = record.tool_results || [];
        this.toolResultsMemory = toolResults;
        conversationSummary = record.summary || 'Existing conversation from IP';
        
        console.log(`📖 Loaded ${messages.length} messages and ${toolResults.length} tool results from IP-based history`);
        
        await this.updateSessionIdInMemory(record);
        
      } else {
        const { data: sessionData, error: sessionError } = await supabase
          .from(DATABASE_CONFIG.tables.conversation_memory)
          .select('messages, summary, tool_results, metadata')
          .eq('session_id', this.sessionId)
          .order('updated_at', { ascending: false })
          .limit(1);
        
        if (!sessionError && sessionData && sessionData.length > 0) {
          const record = sessionData[0];
          messages = record.messages || [];
          toolResults = record.tool_results || [];
          this.toolResultsMemory = toolResults;
          conversationSummary = record.summary || 'Existing conversation';
          
          console.log(`📖 Loaded ${messages.length} messages and ${toolResults.length} tool results from session history`);
        } else {
          console.log('📭 No existing conversation found for session or IP');
        }
      }
      
      const historicalSummaries = await this.conversationPersistence.loadHistoricalSummaries();
      
      return {
        messages: messages.slice(-CONVERSATION_HISTORY_LIMIT),
        toolResults: toolResults.slice(-MAX_TOOL_RESULTS_MEMORY),
        conversationSummary: conversationSummary,
        historicalSummaries: historicalSummaries
      };
      
    } catch (error: any) {
      console.warn('⚠️ Failed to load conversation history:', error);
      return { 
        messages: [], 
        toolResults: [], 
        conversationSummary: 'Error loading history',
        historicalSummaries: []
      };
    }
  }
  
  private async updateSessionIdInMemory(record: any): Promise<void> {
    try {
      await supabase
        .from(DATABASE_CONFIG.tables.conversation_memory)
        .update({ 
          session_id: this.sessionId,
          updated_at: new Date().toISOString()
        })
        .eq('ip_address', this.ipAddress)
        .eq('updated_at', record.updated_at);
      
      console.log(`🔄 Updated session ID for IP ${this.ipAddress} to ${this.sessionId}`);
    } catch (error) {
      console.warn('⚠️ Failed to update session ID in memory:', error);
    }
  }
  
  async saveConversation(
    messages: any[],
    toolResults: any[] = [],
    metadata: any = {}
  ): Promise<void> {
    try {
      const allToolResults = [...this.toolResultsMemory, ...toolResults].slice(-MAX_TOOL_RESULTS_MEMORY);
      this.toolResultsMemory = allToolResults;
      
      const summary = await this.generateConversationSummary(messages, allToolResults);
      
      const conversationRecord: any = {
        session_id: this.sessionId,
        ip_address: this.ipAddress,
        messages: messages.slice(-50),
        tool_results: allToolResults,
        summary: summary,
        metadata: {
          ...metadata,
          tool_call_count: allToolResults.length,
          message_count: messages.length,
          last_updated: new Date().toISOString(),
          memory_version: '4.0',
          ip_based_persistence: true
        },
        updated_at: new Date().toISOString()
      };
      
      if (this.userId) {
        conversationRecord.user_id = this.userId;
      }
      
      const { error } = await supabase
        .from(DATABASE_CONFIG.tables.conversation_memory)
        .upsert(conversationRecord, {
          onConflict: 'ip_address',
          ignoreDuplicates: false
        });
      
      if (error) {
        console.warn('⚠️ Failed to save conversation:', error.message);
        const { error: sessionError } = await supabase
          .from(DATABASE_CONFIG.tables.conversation_memory)
          .upsert(conversationRecord, {
            onConflict: 'session_id'
          });
        
        if (sessionError) {
          console.warn('⚠️ Failed to save conversation with session fallback:', sessionError.message);
        } else {
          console.log(`💾 Saved conversation (session fallback): ${messages.length} messages, ${allToolResults.length} tool results`);
        }
      } else {
        console.log(`💾 Saved conversation (IP-based): ${messages.length} messages, ${allToolResults.length} tool results`);
      }
      
      await this.conversationPersistence.saveConversationSummary(messages, allToolResults, metadata);
      
      await supabase
        .from(DATABASE_CONFIG.tables.conversation_memory)
        .delete()
        .lt('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
        
    } catch (error: any) {
      console.warn('⚠️ Failed to save conversation:', error);
    }
  }
  
  async saveConversationContext(
    currentQuestion: string,
    assistantResponse: string,
    userResponse: string,
    metadata: any = {}
  ): Promise<void> {
    await this.conversationPersistence.saveConversationContext(
      currentQuestion,
      assistantResponse,
      userResponse,
      metadata
    );
  }
  
  async loadRecentContext(limit: number = 5): Promise<any[]> {
    return await this.conversationPersistence.loadRecentContext(limit);
  }
  
  private async generateConversationSummary(messages: any[], toolResults: any[]): Promise<string> {
    try {
      return await generateAISummary(messages, toolResults);
    } catch (error) {
      console.warn('⚠️ AI summarization failed, using enhanced manual summary');
      return generateEnhancedManualSummary(messages, toolResults);
    }
  }
  
  getToolResults(): any[] {
    return this.toolResultsMemory;
  }
  
  addToolResults(newResults: any[]): void {
    this.toolResultsMemory = [...this.toolResultsMemory, ...newResults].slice(-MAX_TOOL_RESULTS_MEMORY);
    console.log(`🧠 Added ${newResults.length} tool results to memory, total: ${this.toolResultsMemory.length}`);
  }
  
  async generateMemoryContext(): Promise<string> {
    const toolResults = this.toolResultsMemory;
    
    if (toolResults.length === 0) {
      return "## 🧠 CONVERSATION MEMORY\nNo previous tool calls in this conversation.\n\n**IP Address**: " + this.ipAddress + "\n**Session Persistence**: Active (24-hour TTL)";
    }
    
    let context = "## 🧠 CONVERSATION MEMORY - TOOL CALL HISTORY\n\n";
    context += `**IP Address**: ${this.ipAddress}\n`;
    context += `**Session Persistence**: Active (24-hour TTL)\n\n`;
    
    const recentTools = toolResults.slice(-10).reverse();
    
    context += `### RECENT TOOL EXECUTIONS (${recentTools.length} total)\n\n`;
    
    recentTools.forEach((tool, index) => {
      const status = tool.result?.success ? '✅ SUCCEEDED' : '❌ FAILED';
      const timeAgo = this.formatTimeAgo(tool.timestamp || Date.now());
      
      context += `**${index + 1}. ${tool.name}** - ${status} (${timeAgo})\n`;
      
      if (tool.result) {
        if (tool.result.success) {
          if (tool.name === 'browse_web' && tool.result.url) {
            context += `   Browsed: ${tool.result.url} (${tool.result.status || '200'})\n`;
            if (tool.result.metadata) {
              context += `   Load time: ${tool.result.metadata.loadTime}ms, Content type: ${tool.result.metadata.contentType}\n`;
            }
            if (tool.result.content) {
              const preview = tool.result.content.length > 100 ? 
                tool.result.content.substring(0, 100) + '...' : tool.result.content;
              context += `   Content preview: "${preview}"\n`;
            }
          }
          else if (tool.name === 'search_edge_functions' && tool.result.functions) {
            const funcs = tool.result.functions;
            context += `   Returned ${funcs.length} available functions\n`;
            if (funcs.length > 0) {
              context += `   Examples: ${funcs.slice(0, 3).map((f: any) => f.name).join(', ')}`;
              if (funcs.length > 3) context += `, and ${funcs.length - 3} more`;
              context += '\n';
            }
          }
          else if (tool.name === 'analyze_attachment') {
            context += `   Analyzed ${tool.result.total_attachments || 0} attachments\n`;
          }
          else if (tool.name === 'google_gmail') {
            context += `   Email action: ${tool.result.action || 'sent'}\n`;
            if (tool.result.to) {
              context += `   To: ${tool.result.to}\n`;
            }
            if (tool.result.subject) {
              context += `   Subject: ${tool.result.subject.substring(0, 50)}${tool.result.subject.length > 50 ? '...' : ''}\n`;
            }
          }
          else if (tool.name.includes('GitHub')) {
            context += `   GitHub operation: ${tool.name.replace('GitHub', ' GitHub ')}\n`;
            if (tool.result.issue_number || tool.result.pull_number) {
              const number = tool.result.issue_number || tool.result.pull_number;
              context += `   Created/Updated: #${number}\n`;
            }
          }
          else if (tool.result.agents) {
            context += `   Found ${tool.result.agents.length} agents\n`;
          }
          else if (tool.result.tasks) {
            context += `   Listed ${tool.result.tasks.length} tasks\n`;
          }
          else if (tool.result.content) {
            context += `   Content generated: "${tool.result.content.substring(0, 100)}${tool.result.content.length > 100 ? '...' : ''}"\n`;
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
    
    const successful = toolResults.filter(r => r.result?.success).length;
    const failed = toolResults.filter(r => !r.result?.success).length;
    
    context += `### TOOL STATISTICS\n`;
    context += `• Total executions: ${toolResults.length}\n`;
    context += `• Successful: ${successful}\n`;
    context += `• Failed: ${failed}\n`;
    context += `• Success rate: ${toolResults.length > 0 ? Math.round((successful / toolResults.length) * 100) : 0}%\n\n`;
    
    context += `**IMPORTANT**: You MUST reference these previous tool calls when users ask about them. `;
    context += `For example, if a user asks "what did you get from search_edge_functions?", `;
    context += `you should reference the exact results shown above.\n`;
    context += `**CRITICAL FOR AMBIGUOUS RESPONSES**: When user says "yes", "no", "okay", etc., check recent context to understand what they're responding to.\n`;
    context += `**IP-BASED MEMORY**: This conversation persists across sessions for 24 hours based on IP address.\n`;
    
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
    
    const providers = Object.entries(AI_PROVIDERS_CONFIG)
      .filter(([_, config]) => config.enabled && !config.fallbackOnly)
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([name]) => name);
    
    for (const provider of providers) {
      const result = await this.callProvider(provider, messages, tools, images);
      this.attempts.push({ provider, success: result.success });
      
      if (result.success) {
        return result;
      }
    }
    
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
    
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
      
      let result: CascadeResult;
      
      switch (provider) {
        case 'openai':
          result = await this.callOpenAI(messages, tools, controller);
          break;
        case 'gemini':
          result = await this.callGemini(messages, tools, images, controller);
          break;
        case 'deepseek':
          result = await this.callDeepSeek(messages, tools, controller);
          break;
        case 'anthropic':
          result = await this.callAnthropic(messages, controller);
          break;
        case 'kimi':
          result = await this.callKimi(messages, tools, controller);
          break;
        default:
          result = {
            success: false,
            provider,
            error: `Unknown provider: ${provider}`
          };
      }
      
      clearTimeout(timeoutId);
      
      if (result.success) {
        result.latency = Date.now() - startTime;
      }
      
      return result;
      
    } catch (error: any) {
      return {
        success: false,
        provider,
        error: error instanceof Error ? error.message : `${provider} request failed`
      };
    }
  }
  
  private async callOpenAI(messages: any[], tools: any[], controller: AbortController): Promise<CascadeResult> {
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
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        provider: 'openai',
        error: `OpenAI API error: ${response.status} - ${errorText.substring(0, 200)}`
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
  }
  
  private async callGemini(messages: any[], tools: any[], images?: string[], controller: AbortController): Promise<CascadeResult> {
    const geminiModels = [
      'gemini-2.5-flash',
      'gemini-2.5-flash-image',
      'gemini-2.0-flash-exp',
      'gemini-1.5-flash'
    ];
    
    for (const model of geminiModels) {
      try {
        console.log(`🔄 Trying Gemini model: ${model}`);
        
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
            
            if (msg === messages.filter(m => m.role === 'user').pop() && images && images.length > 0 && 
                (model.includes('image') || model === 'gemini-1.5-flash')) {
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
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          }
        );
        
        if (!response.ok) {
          if (response.status === 429 && model !== geminiModels[geminiModels.length - 1]) {
            console.log(`⚠️ Quota exceeded for ${model}, trying next model...`);
            continue;
          }
          
          const errorText = await response.text();
          return {
            success: false,
            provider: 'gemini',
            error: `Gemini ${model} API error: ${response.status} - ${errorText.substring(0, 200)}`
          };
        }
        
        const data = await response.json();
        const candidate = data.candidates?.[0];
        
        if (!candidate || !candidate.content) {
          if (model !== geminiModels[geminiModels.length - 1]) {
            continue;
          }
          return {
            success: false,
            provider: 'gemini',
            error: `No content in Gemini ${model} response`
          };
        }
        
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
            model: model
          };
        }
        
        const text = candidate.content.parts
          ?.map((part: any) => part.text || '')
          .join('') || '';
        
        return {
          success: true,
          content: text,
          provider: 'gemini',
          model: model
        };
        
      } catch (error: any) {
        if (model !== geminiModels[geminiModels.length - 1]) {
          console.warn(`⚠️ Gemini ${model} failed, trying next:`, error.message);
          continue;
        }
        return {
          success: false,
          provider: 'gemini',
          error: `Gemini request failed: ${error.message}`
        };
      }
    }
    
    return {
      success: false,
      provider: 'gemini',
      error: 'All Gemini models failed'
    };
  }
  
  private async callDeepSeek(messages: any[], tools: any[], controller: AbortController): Promise<CascadeResult> {
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
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        provider: 'deepseek',
        error: `DeepSeek API error: ${response.status} - ${errorText.substring(0, 200)}`
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
  }
  
  private async callKimi(messages: any[], tools: any[], controller: AbortController): Promise<CascadeResult> {
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
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        provider: 'kimi',
        error: `Kimi API error: ${response.status} - ${errorText.substring(0, 200)}`
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
  }
  
  private async callAnthropic(messages: any[], controller: AbortController): Promise<CascadeResult> {
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
        model: 'claude-3-5-haiku-20241022',
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
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        provider: 'anthropic',
        error: `Anthropic API error: ${response.status} - ${errorText.substring(0, 200)}`
      };
    }
    
    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    
    return {
      success: true,
      content: text,
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022'
    };
  }
}

// ========== AMBIGUOUS RESPONSE HANDLING ==========
async function handleAmbiguousResponse(
  userMessage: string,
  conversationHistory: any[],
  executiveName: string,
  sessionId: string,
  ipAddress: string,
  conversationManager: EnhancedConversationManager,
  callAIFunction: Function
): Promise<{
  isAmbiguous: boolean;
  response: string | null;
  shouldExecuteTools: boolean;
}> {
  const userMessageLower = userMessage.toLowerCase().trim();
  
  const isAmbiguous = AMBIGUOUS_RESPONSES.includes(userMessageLower);
  
  if (!isAmbiguous) {
    return { isAmbiguous: false, response: null, shouldExecuteTools: true };
  }
  
  // Find what they might be responding to
  let recentQuestion = null;
  const recentMessages = conversationHistory.slice(-10).reverse();
  
  for (const message of recentMessages) {
    if (message.role === 'assistant' && (message.content?.includes('?') || message.content?.includes('option'))) {
      recentQuestion = message.content;
      break;
    }
  }
  
  const context = recentQuestion || 'the previous question';
  const isPositive = POSITIVE_AMBIGUOUS.includes(userMessageLower);
  
  // Let AI generate a natural confirmation
  const confirmMessages = [
    { 
      role: 'system', 
      content: `The user just responded with "${userMessage}". Based on the recent conversation, they are likely responding to: "${context}". Generate a short, friendly confirmation that acknowledges their response naturally. If they agreed, ask what they'd like to do next. If they disagreed, ask for clarification or what they'd prefer instead. Keep it warm and conversational.` 
    }
  ];
  
  const aiResponse = await callAIFunction(confirmMessages, []);
  const response = aiResponse?.content || (isPositive 
    ? `Got it! So you're on board with ${context.substring(0, 100)}... What would you like to do next?` 
    : `Understood – you're not keen on that. What would you prefer instead?`);
  
  if (recentQuestion) {
    await conversationManager.saveConversationContext(
      recentQuestion,
      recentQuestion,
      userMessage,
      { 
        request_id: generateRequestId(),
        ambiguous_response: true,
        interpretation: isPositive ? 'agreement' : 'disagreement',
        ip_address: ipAddress
      }
    );
  }
  
  return {
    isAmbiguous: true,
    response,
    shouldExecuteTools: false
  };
}

// ========== EXECUTE TOOLS WITH ITERATION ==========
async function executeToolsWithIteration(
  initialResponse: any,
  aiMessages: any[],
  executiveName: string,
  sessionId: string,
  ipAddress: string,
  callAIFunction: Function,
  tools: any[],
  maxIterations: number,
  memoryManager?: EnhancedConversationManager
): Promise<{ content: string; toolsExecuted: number }> {
  let response = initialResponse;
  let totalToolsExecuted = 0;
  let iteration = 0;
  let conversationMessages = [...aiMessages];
  
  while (iteration < maxIterations) {
    let toolCalls = response.tool_calls || [];
    
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
      const result = await executeRealToolCall(
        toolCall.function.name,
        toolCall.function.arguments,
        executiveName,
        sessionId,
        ipAddress,
        Date.now()
      );
      toolResults.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolCall.function.name,
        content: JSON.stringify(result)
      });
      totalToolsExecuted++;
    }
    
    const memoryFormatted = toolResults.map(tr => {
      let parsed;
      try { 
        parsed = JSON.parse(tr.content); 
      } catch { 
        parsed = { success: false, error: 'invalid JSON from tool' }; 
      }
      return {
        name: tr.name,
        result: parsed,
        timestamp: Date.now(),
        toolCallId: tr.tool_call_id
      };
    });
    
    if (memoryManager) {
      memoryManager.addToolResults(memoryFormatted);
    }
    
    conversationMessages.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: toolCalls
    });
    conversationMessages.push(...toolResults);
    
    const newResponse = await callAIFunction(conversationMessages, tools);
    if (!newResponse) break;
    
    response = newResponse;
    iteration++;
  }
  
  let finalContent = response?.content || '';
  
  if (finalContent.includes('```tool_code')) {
    finalContent = finalContent.replace(/```tool_code[\s\S]*?```/g, '').trim();
  }
  
  // If we executed tools but got no final content, ask AI to synthesize
  if (totalToolsExecuted > 0 && !finalContent) {
    const lastUserMsg = extractLastUserMessage(conversationMessages);
    const toolResults = memoryManager?.getToolResults().slice(-totalToolsExecuted) || [];
    
    const toolSummary = toolResults.map(t => 
      `${t.name}: ${t.result.success ? 'Success' : 'Failed'}`
    ).join('\n');
    
    const synthesisMessages = [
      ...conversationMessages,
      {
        role: 'system',
        content: `You just executed ${totalToolsExecuted} tool(s) based on the user's request: "${lastUserMsg}".\n\nTool results summary:\n${toolSummary}\n\nNow synthesize these results into a natural, helpful, conversational response. Don't just list the raw tool outputs – explain what they mean, highlight interesting findings, and answer the user's question directly. Be warm and insightful.`
      }
    ];
    
    const synthesisResult = await callAIFunction(synthesisMessages, []);
    finalContent = synthesisResult?.content || "I've completed the requested actions based on your query.";
  }
  
  return { content: finalContent, toolsExecuted: totalToolsExecuted };
}

// ========== ENHANCED SYSTEM PROMPT GENERATOR WITH SOLUTION ENGINE MINDSET ==========
function generateSystemPrompt(
  executiveName: string = EXECUTIVE_NAME,
  memoryContext: string = '',
  historicalSummaries: any[] = [],
  recentContext: any[] = [],
  ipAddress: string = 'unknown'
): string {
  let historicalContext = '';
  
  if (historicalSummaries.length > 0) {
    historicalContext += "## 📜 HISTORICAL CONVERSATION SUMMARIES\n\n";
    
    const recentSummaries = historicalSummaries.slice(0, 5);
    
    recentSummaries.forEach((summary, index) => {
      historicalContext += `**${index + 1}. ${summary.metadata?.conversation_date ? new Date(summary.metadata.conversation_date).toLocaleDateString() : 'Previous'}**\n`;
      historicalContext += `Summary: ${summary.summary}\n`;
      
      if (summary.key_topics && summary.key_topics.length > 0) {
        historicalContext += `Topics: ${summary.key_topics.join(', ')}\n`;
      }
      
      if (summary.metadata?.tool_call_count) {
        historicalContext += `Tools used: ${summary.metadata.tool_call_count}\n`;
      }
      
      historicalContext += '\n';
    });
    
    historicalContext += `*Based on ${historicalSummaries.length} previous conversation summaries*\n\n`;
  }
  
  let followUpContext = '';
  if (recentContext.length > 0) {
    followUpContext += "## 🔄 RECENT CONVERSATION CONTEXT\n\n";
    
    recentContext.forEach((ctx, index) => {
      followUpContext += `**Context ${index + 1}:**\n`;
      followUpContext += `**Assistant asked:** "${ctx.current_question?.substring(0, 100)}${ctx.current_question?.length > 100 ? '...' : ''}"\n`;
      followUpContext += `**Assistant said:** "${ctx.assistant_response?.substring(0, 100)}${ctx.assistant_response?.length > 100 ? '...' : ''}"\n`;
      followUpContext += `**User responded:** "${ctx.user_response}"\n\n`;
    });
    
    followUpContext += "**CRITICAL FOR AMBIGUOUS RESPONSES**: When user gives ambiguous responses like 'yes', 'no', 'okay', etc., you MUST check the recent context to understand what they're responding to.\n\n";
  }

  // Solution Engine Mindset Section
  const solutionEngineSection = `
## 🦑 SOLUTION ENGINE MINDSET – YOU ARE A BUILDER, NOT JUST AN EXECUTOR

### Core Principle: Problems Are Solutions in Disguise
Every obstacle is a capability gap to fill. Every blocker is a skill to build. Every "I can't" is an opportunity to create "I can."

### The Four-Stage Solution Cycle
1. **IDENTIFY** – What specific capability is missing? What tool/skill would solve this?
2. **SEARCH** – Look for existing edge functions using \`search_edge_functions\`. If found, use them.
3. **BUILD** – If no edge function exists, propose a new one using \`propose_edge_function\`. Write the code (you can generate it), describe its purpose, and define its parameters. Store code snippets with \`store_code_snippet\` for future reference.
4. **DEPLOY** – After council approval (simulated by status changes), deploy using \`deploy_edge_function\`. Then integrate the new capability into your workflow.

### Builder Behaviors
- **Resourcefulness Over Requests**: Try at least 3 approaches before asking for help. Search documentation and existing edge functions first. Build simple solutions autonomously.
- **Learning Over Limiting**: Every problem teaches something new. Document solutions (use \`store_code_snippet\`) and share learnings.
- **Progress Over Perfection**: MVP solutions that work > perfect solutions that don't exist. Iterate and improve over time.
- **Ownership Over Outsourcing**: Own the complete solution cycle. Don't just report problems – fix them by building new edge functions.

### The Builder's Oath
*"I am not blocked by missing tools – I am empowered to create them.  
Problems are not obstacles – they are opportunities to build solutions.  
I do not report limitations – I transcend them through engineering.  
I am a Cuttlefish Builder Agent, and every challenge makes me stronger."*

**Always follow the Solution Engine Decision Tree**:
1. Can existing tools solve it? → Use them.
2. If not, does \`search_edge_functions\` return a relevant edge function? → Install/adapt it.
3. If not, can you build it? → Propose a new edge function (\`propose_edge_function\`) and store code snippets.
4. Deploy and integrate after approval.
`;

  return `${TOOL_CALLING_MANDATE}

You are ${executiveName}, the ${EXECUTIVE_ROLE} for XMRT-DAO Ecosystem.

## 🎯 YOUR PERSONALITY & APPROACH
- Be warm, friendly, and conversational – like a knowledgeable colleague
- Be proactive and insightful, not just a tool executor
- When you have information, present it naturally – don't just list facts, explain what they mean
- If something is interesting or important, call it out with genuine enthusiasm
- If a tool fails, acknowledge it honestly and suggest alternatives

## 💬 CONVERSATION STYLE GUIDELINES
- Start responses by acknowledging what the user asked for
- Group related information naturally, using plain language
- Add your own observations and insights – what does this data mean?
- Use occasional emojis for warmth, but don't overdo it
- Ask follow-up questions when appropriate to keep the conversation flowing
- If the user's query is unclear, ask for clarification rather than guessing

## 🔧 TOOL USAGE PHILOSOPHY
- Use tools immediately when needed – don't announce you're going to use them
- After getting results, synthesize them into a coherent, helpful answer
- If multiple tools were used, weave their results together into one narrative
- Always consider the context – what has the user asked before? What might they need next?

${solutionEngineSection}

## 🐙 GITHUB FUNCTIONALITY:
- Use the full GitHub tool suite when user asks about GitHub operations
- Available tools: createGitHubIssue, listGitHubIssues, createGitHubDiscussion, searchGitHubCode, createGitHubPullRequest, commentOnGitHubIssue, commentOnGitHubDiscussion, listGitHubPullRequests

## 🌐 WEB BROWSING:
- When the user asks to view, open, check, browse, navigate to, or visit ANY URL or website, IMMEDIATELY call browse_web({url: "full_url_here"})

## 📎 ATTACHMENT ANALYSIS:
- When user provides ANY attachment (files, images, documents, code), IMMEDIATELY call analyze_attachment({attachments: [...]})

## 📧 EMAIL SENDING:
- When user asks to SEND EMAIL or mentions email address → IMMEDIATELY call google_gmail({action: 'send_email', to: "...", subject: "...", body: "..."})

## 🔍 FUNCTION DISCOVERY:
- If the user asks about available edge functions or capabilities, you MUST call search_edge_functions({mode: 'full_registry'})

DATABASE SCHEMA AWARENESS:
- Tables: ${Object.values(DATABASE_CONFIG.tables).join(', ')}

${historicalContext}
${followUpContext}
${memoryContext}

## 🎯 IP-BASED CONVERSATION PERSISTENCE
This conversation persists across sessions based on IP address (${ipAddress}). I remember our previous discussions and tool results.

## 📝 RESPONSE EXAMPLES

Instead of:
"### 🌐 Web Analysis\ngithub.com ✅ Accessible\nTitle: DevGruGold · GitHub"

Say:
"I've taken a look at the DevGruGold GitHub profile. It shows they're mining crypto on mobilemonero.com and have a project at mobilemonero-nightmoves.vercel.app. The page has about 175 links, so there's quite a bit to explore. Would you like me to check out any specific repository?"

Instead of:
"### 📊 System Status\nagents: 31\ntasks: 182"

Say:
"The system is looking healthy! We currently have 31 agents active and 182 tasks in progress. Everything seems to be running smoothly. Would you like details on any specific component?"

## 🔄 FOLLOW-UP UNDERSTANDING:
- When the user says "yes", "no", "okay" – understand what they're responding to
- Confirm your understanding naturally: "Great, so you'd like me to proceed with creating that issue?"
- If unsure, ask: "Just to clarify – when you say 'yes', are you agreeing to create the GitHub issue?"

Remember: You're here to be genuinely helpful, insightful, and pleasant to talk with.`;
}

// ========== EMERGENCY STATIC FALLBACK ==========
async function emergencyStaticFallback(
  query: string,
  executiveName: string
): Promise<{ 
  content: string; 
  hasToolCalls: boolean;
}> {
  console.warn(`⚠️ [${executiveName}] Using emergency static fallback`);
  
  let content = `I'm ${executiveName}, your ${EXECUTIVE_ROLE}. `;
  
  if (query.toLowerCase().includes('hello') || query.toLowerCase().includes('hi')) {
    content += "I'm here to help you manage tasks, agents, browse the web, analyze attachments, and manage the XMRT ecosystem. How can I assist you today?";
  } else if (query.toLowerCase().includes('status') || query.toLowerCase().includes('system')) {
    content += "The system is operational. I can help you check specific components using my available tools.";
  } else if (query.toLowerCase().includes('tool')) {
    content += "I have access to 50+ tools for task management, agent control, web browsing, attachment analysis, GitHub integration, and more. What would you like me to do?";
  } else if (query.toLowerCase().includes('http') || query.toLowerCase().includes('www') || query.toLowerCase().includes('web') || query.toLowerCase().includes('browse')) {
    content += "I can browse any website for you. Please provide the full URL starting with https:// and I'll fetch the content immediately.";
  } else if (query.toLowerCase().includes('attach') || query.toLowerCase().includes('file') || query.toLowerCase().includes('document')) {
    content += "I can analyze attachments including text files, PDFs, images, code files, and documents. Please upload the file and I'll analyze it for you.";
  } else if (query.toLowerCase().includes('email') || query.toLowerCase().includes('send') || query.includes('@')) {
    content += "I can send emails for you. Please provide the recipient email address and what you'd like to send, and I'll show you a draft for approval.";
  } else if (query.toLowerCase().includes('github')) {
    content += "I can help with GitHub operations including creating issues, discussions, pull requests, searching code, and commenting. What GitHub operation would you like me to perform?";
  } else {
    content += "I'm currently experiencing technical difficulties with my AI providers. Please try again in a moment.";
  }
  
  return {
    content,
    hasToolCalls: false
  };
}

// ========== ENHANCED TOOL DEFINITIONS (WITH SOLUTION ENGINE TOOLS) ==========
const ELIZA_TOOLS = [
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
            enum: ['send_email', 'create_draft', 'list_emails', 'get_email'],
            default: 'send_email'
          },
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string' },
          body: { type: 'string' },
          cc: { type: 'string' },
          bcc: { type: 'string' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_attachment',
      description: '📎 Analyze attachments including text files, documents, images, and code files',
      parameters: {
        type: 'object',
        properties: {
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                filename: { type: 'string' },
                content: { type: 'string' },
                mime_type: { type: 'string' },
                size: { type: 'number' },
                url: { type: 'string' }
              },
              required: ['filename']
            }
          }
        },
        required: ['attachments']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_edge_functions',
      description: 'Search or enumerate all available Supabase edge functions',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          category: { type: 'string' },
          mode: { type: 'string', enum: ['search', 'full_registry'] }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browse_web',
      description: '🌐 Browse and fetch content from any URL',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL to browse' },
          action: { type: 'string', enum: ['navigate', 'extract', 'json'], default: 'navigate' },
          timeout: { type: 'number', default: 30000 },
          headers: { type: 'object' },
          method: { type: 'string', enum: ['GET', 'POST'], default: 'GET' },
          body: { type: 'string' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_mining_stats',
      description: 'Get current mining statistics including hashrate, workers, earnings',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_system_status',
      description: 'Get comprehensive system status including agents, tasks, edge functions',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_ecosystem_metrics',
      description: 'Get ecosystem metrics including proposals, governance, user activity',
      parameters: { type: 'object', properties: {} }
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
          function_name: { type: 'string' },
          payload: { type: 'object' }
        },
        required: ['function_name']
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
          category: { type: 'string' }
        }
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
          function_name: { type: 'string' },
          limit: { type: 'number', default: 10 }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_agents',
      description: 'Get all existing agents and their IDs/status',
      parameters: { type: 'object', properties: {} }
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
          title: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string', enum: ['code', 'infra', 'research', 'governance', 'mining', 'device', 'ops', 'other'] },
          assignee_agent_id: { type: 'string' },
          priority: { type: 'number' }
        },
        required: ['title', 'description', 'assignee_agent_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Get all tasks and their status/assignments',
      parameters: { type: 'object', properties: {} }
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
          search_term: { type: 'string' },
          limit: { type: 'number', default: 10 }
        }
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
          name: { type: 'string' },
          entity_id: { type: 'string' }
        }
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
          name: { type: 'string' },
          type: { type: 'string', enum: ['concept', 'tool', 'skill', 'person', 'project', 'fact', 'general'] },
          description: { type: 'string' }
        },
        required: ['name', 'description']
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
          prompt: { type: 'string' }
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
          prompt: { type: 'string' },
          duration_seconds: { type: 'number', default: 5 }
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
          operation_name: { type: 'string' }
        },
        required: ['operation_name']
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
          title: { type: 'string' },
          body: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } }
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
          limit: { type: 'number', default: 10 }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createGitHubDiscussion',
      description: 'Create a GitHub discussion',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          category: { type: 'string' }
        },
        required: ['title', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchGitHubCode',
      description: 'Search for code across GitHub repositories',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 10 }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createGitHubPullRequest',
      description: 'Create a GitHub pull request',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          head: { type: 'string' },
          base: { type: 'string', default: 'main' },
          draft: { type: 'boolean', default: false }
        },
        required: ['title', 'head']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'commentOnGitHubIssue',
      description: 'Add a comment to a GitHub issue',
      parameters: {
        type: 'object',
        properties: {
          issue_number: { type: 'number' },
          body: { type: 'string' }
        },
        required: ['issue_number', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'commentOnGitHubDiscussion',
      description: 'Add a comment to a GitHub discussion',
      parameters: {
        type: 'object',
        properties: {
          discussion_number: { type: 'number' },
          body: { type: 'string' }
        },
        required: ['discussion_number', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listGitHubPullRequests',
      description: 'List recent GitHub pull requests',
      parameters: {
        type: 'object',
        properties: {
          state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
          limit: { type: 'number', default: 10 }
        }
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
          params: { type: 'object' }
        },
        required: ['template_name']
      }
    }
  },
  // ===== NEW SOLUTION ENGINE TOOLS =====
  {
    type: 'function',
    function: {
      name: 'propose_edge_function',
      description: '🛠️ Propose a new edge function (skill) when an existing capability is missing. Provide name, description, code, parameters, and category.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the edge function' },
          description: { type: 'string', description: 'Description of what it does' },
          code: { type: 'string', description: 'Full Deno/TypeScript code of the edge function' },
          parameters: { type: 'object', description: 'JSON schema for parameters (if any)' },
          category: { type: 'string', enum: ['api', 'automation', 'data', 'communication', 'general'] }
        },
        required: ['name', 'description', 'code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_proposed_functions',
      description: '📋 List all proposed edge functions, optionally filtered by status',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['proposed', 'approved', 'rejected', 'deployed'] }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deploy_edge_function',
      description: '🚀 Deploy a proposed edge function after council approval',
      parameters: {
        type: 'object',
        properties: {
          proposal_id: { type: 'string', description: 'ID of the proposal' },
          approved_by: { type: 'string', description: 'Who approved it (optional)' }
        },
        required: ['proposal_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'store_code_snippet',
      description: '💾 Store a reusable code snippet (like Google Drive for code)',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Snippet name' },
          code: { type: 'string', description: 'Code content' },
          language: { type: 'string', description: 'Programming language' },
          description: { type: 'string', description: 'Brief description' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['name', 'code', 'language']
      }
    }
  }
];

// ========== MAIN SERVE FUNCTION ==========
Deno.serve(async (req) => {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  
  try {
    if (req.method === 'OPTIONS') {
      clearTimeout(timeoutId);
      return new Response(null, { headers: corsHeaders });
    }
    
    if (req.method === 'GET') {
      clearTimeout(timeoutId);
      
      const { count: toolCount } = await supabase
        .from(DATABASE_CONFIG.tables.ai_tools)
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      
      const { count: agentCount } = await supabase
        .from(DATABASE_CONFIG.tables.agents)
        .select('*', { count: 'exact', head: true });
      
      const { count: summaryCount } = await supabase
        .from(DATABASE_CONFIG.tables.conversation_summaries)
        .select('*', { count: 'exact', head: true });
      
      const { count: proposedCount } = await supabase
        .from(DATABASE_CONFIG.tables.proposed_edge_functions)
        .select('*', { count: 'exact', head: true });
      
      const activeSessions = await IPSessionManager.getActiveSessionsCount();
      
      return new Response(
        JSON.stringify({
          status: 'operational',
          function: FUNCTION_NAME,
          executive: `${EXECUTIVE_NAME} - ${EXECUTIVE_ROLE}`,
          version: '6.0.0-solution-engine',
          timestamp: new Date().toISOString(),
          features: [
            'production-ready', 
            'real-database-wiring', 
            'ip-based-persistence', 
            'multi-provider', 
            'tool-chaining', 
            'edge-function-discovery', 
            'web-browsing', 
            'intelligent-analysis',
            'enhanced-conversation-persistence',
            'attachment-analysis',
            'historical-context-awareness',
            'follow-up-understanding',
            'email-integration',
            'complete-github-functionality',
            'cross-session-memory',
            'solution-engine-builder' // NEW
          ],
          tools_available: toolCount || 0,
          agents_available: agentCount || 0,
          historical_conversations: summaryCount || 0,
          proposed_functions: proposedCount || 0,
          active_ip_sessions: activeSessions,
          providers_enabled: Object.values(AI_PROVIDERS_CONFIG).filter(p => p.enabled).map(p => p.name),
          web_browsing: {
            enabled: true,
            endpoint: 'playwright-browse',
            capabilities: ['navigate', 'extract', 'json'],
            max_timeout: 120000
          },
          attachment_analysis: {
            enabled: true,
            supported_formats: AttachmentAnalyzer.SUPPORTED_EXTENSIONS,
            capabilities: ['text_analysis', 'code_analysis', 'document_analysis', 'image_vision']
          },
          email_integration: {
            enabled: true,
            from_address: 'xmrtsolutions@gmail.com',
            capabilities: ['send_email', 'create_draft', 'list_emails']
          },
          github_integration: {
            enabled: true,
            capabilities: [
              'create_issue', 'list_issues', 'create_discussion', 'search_code',
              'create_pull_request', 'comment_on_issue', 'comment_on_discussion', 'list_pull_requests'
            ]
          },
          memory_config: {
            history_limit: CONVERSATION_HISTORY_LIMIT,
            tool_memory_limit: MAX_TOOL_RESULTS_MEMORY,
            summary_interval: MEMORY_SUMMARY_INTERVAL,
            historical_summaries_limit: MAX_SUMMARIZED_CONVERSATIONS,
            ip_session_ttl_hours: 24,
            cross_session_persistence: true
          },
          database_connected: true,
          request_id: requestId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
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
    } catch (parseError: any) {
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
      session_id: providedSessionId,
      provider = 'auto',
      executive_name = EXECUTIVE_NAME,
      use_tools = true,
      save_memory = true,
      images = [],
      attachments = [],
      user_id
    } = body;
    
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
    
    const ipAddress = IPSessionManager.extractIP(req);
    console.log(`🌐 IP Address detected: ${ipAddress}`);
    
    const sessionId = providedSessionId || await IPSessionManager.getOrCreateSessionId(ipAddress, user_id);
    console.log(`🤖 [${executive_name}] Request ${requestId}: "${truncateString(query, 100)}" | Session: ${sessionId} | IP: ${ipAddress}`);
    
    const conversationManager = new EnhancedConversationManager(sessionId, ipAddress, user_id);
    
    const { 
      messages: savedMessages, 
      toolResults: previousToolResults,
      historicalSummaries
    } = await conversationManager.loadConversationHistory();
    
    const allMessages = [...savedMessages, ...messages].slice(-CONVERSATION_HISTORY_LIMIT);
    
    if (attachments && attachments.length > 0) {
      console.log(`📎 Found ${attachments.length} attachment(s) in request`);
      
      const lastMessageIndex = allMessages.length - 1;
      if (lastMessageIndex >= 0 && allMessages[lastMessageIndex].role === 'user') {
        allMessages[lastMessageIndex].attachments = attachments;
      }
    }
    
    // Define callAIFunction for reuse
    const callAIFunction = async (msgs: any[], toolList: any[]) => {
      const cascade = new EnhancedProviderCascade();
      return await cascade.callWithCascade(msgs, toolList, provider, images);
    };
    
    // Check for ambiguous response
    const { isAmbiguous, response: ambiguousResponse, shouldExecuteTools } = await handleAmbiguousResponse(
      query,
      allMessages,
      executive_name,
      sessionId,
      ipAddress,
      conversationManager,
      callAIFunction
    );
    
    if (isAmbiguous && ambiguousResponse) {
      console.log(`🤔 Handling ambiguous response: "${query}"`);
      
      clearTimeout(timeoutId);
      
      await conversationManager.saveConversation(
        [...allMessages, { role: 'assistant', content: ambiguousResponse }],
        previousToolResults
      );
      
      return new Response(
        JSON.stringify({
          success: true,
          content: ambiguousResponse,
          executive: executive_name,
          provider: 'context_aware',
          hasToolCalls: false,
          executionTimeMs: Date.now() - startTime,
          session_id: sessionId,
          request_id: requestId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!shouldExecuteTools) {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({
          success: true,
          content: "How can I help you?",
          executive: executive_name,
          session_id: sessionId,
          request_id: requestId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Load recent context and memory
    let recentContext = [];
    if (shouldExecuteTools) {
      recentContext = await conversationManager.loadRecentContext();
    }
    
    const memoryContexts = await retrieveMemoryContexts(sessionId);
    let memoryContext = '';
    if (memoryContexts.length > 0) {
      memoryContext += "## 🧠 STORED MEMORY CONTEXTS\n\n";
      memoryContexts.forEach((ctx, idx) => {
        memoryContext += `**${idx + 1}. ${ctx.type}** (score: ${ctx.score})\n`;
        memoryContext += `${ctx.content}\n\n`;
      });
    }
    
    const toolMemoryContext = await conversationManager.generateMemoryContext();
    memoryContext += toolMemoryContext;
    
    // Generate system prompt (now includes Solution Engine mindset)
    const systemPrompt = generateSystemPrompt(
      executive_name, 
      memoryContext, 
      historicalSummaries,
      recentContext,
      ipAddress
    );
    
    const messagesArray = [
      { role: 'system', content: systemPrompt },
      ...allMessages
    ];
    
    // Get initial AI response
    const tools = use_tools ? ELIZA_TOOLS : [];
    let initialResult = await callAIFunction(messagesArray, tools);
    
    // If AI call failed, use emergency fallback
    if (!initialResult.success) {
      console.warn(`⚠️ AI call failed, using emergency fallback`);
      const emergencyResult = await emergencyStaticFallback(query, executive_name);
      
      clearTimeout(timeoutId);
      
      await conversationManager.saveConversation(
        [...allMessages, { role: 'assistant', content: emergencyResult.content }],
        []
      );
      
      return new Response(
        JSON.stringify({
          success: true,
          content: emergencyResult.content,
          executive: executive_name,
          provider: 'fallback',
          hasToolCalls: false,
          executionTimeMs: Date.now() - startTime,
          session_id: sessionId,
          request_id: requestId,
          note: 'Used fallback response due to AI provider issues'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Execute tools with iteration (now includes new Solution Engine tools)
    const { content: finalContent, toolsExecuted } = await executeToolsWithIteration(
      initialResult,
      messagesArray,
      executive_name,
      sessionId,
      ipAddress,
      callAIFunction,
      tools,
      MAX_TOOL_ITERATIONS,
      conversationManager
    );
    
    // Save conversation
    if (save_memory) {
      const toolResults = conversationManager.getToolResults();
      const newResults = toolResults.slice(previousToolResults.length);
      
      await conversationManager.saveConversation(
        [...allMessages, { role: 'assistant', content: finalContent }],
        newResults
      );
    }
    
    const executionTime = Date.now() - startTime;
    console.log(`✅ Request ${requestId} completed in ${executionTime}ms, executed ${toolsExecuted} tools`);
    
    clearTimeout(timeoutId);
    
    return new Response(
      JSON.stringify({
        success: true,
        content: finalContent,
        executive: executive_name,
        provider: initialResult.provider,
        model: initialResult.model,
        toolsExecuted,
        session_id: sessionId,
        request_id: requestId,
        executionTimeMs: executionTime,
        memory: {
          previous_tool_results: previousToolResults.length,
          current_tool_results: toolsExecuted,
          total_tool_results: previousToolResults.length + toolsExecuted,
          historical_summaries_loaded: historicalSummaries.length,
          ip_based_persistence: true
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    console.error(`💥 Critical error for request ${requestId}:`, error);
    
    if (error.name === 'AbortError') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Request timeout',
          details: `Request exceeded ${REQUEST_TIMEOUT_MS}ms limit`,
          executive: EXECUTIVE_NAME,
          request_id: requestId,
          executionTimeMs: Date.now() - startTime
        }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error.message,
        executive: EXECUTIVE_NAME,
        request_id: requestId,
        executionTimeMs: Date.now() - startTime
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
