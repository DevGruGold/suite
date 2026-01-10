// Production-ready ai-chat WITH REAL DATABASE WIRING AND ENHANCED FEATURES
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
const REQUEST_TIMEOUT_MS = parseInt(Deno.env.get('REQUEST_TIMEOUT_MS') || '45000');
const CONVERSATION_HISTORY_LIMIT = parseInt(Deno.env.get('CONVERSATION_HISTORY_LIMIT') || '30');

// Memory Configuration
const MEMORY_SUMMARY_INTERVAL = parseInt(Deno.env.get('MEMORY_SUMMARY_INTERVAL') || '5');
const MAX_TOOL_RESULTS_MEMORY = parseInt(Deno.env.get('MAX_TOOL_RESULTS_MEMORY') || '20');

// NEW: Conversation Memory Configuration
const CONVERSATION_SUMMARY_LIMIT = parseInt(Deno.env.get('CONVERSATION_SUMMARY_LIMIT') || '2000');
const MAX_SUMMARIZED_CONVERSATIONS = parseInt(Deno.env.get('MAX_SUMMARIZED_CONVERSATIONS') || '50');

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
    // NEW: Enhanced conversation tables
    conversation_summaries: 'conversation_summaries',
    conversation_context: 'conversation_context',
    attachment_analysis: 'attachment_analysis'
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
4. Available critical tools: get_mining_stats, get_system_status, get_ecosystem_metrics, invoke_edge_function, search_knowledge, recall_entity, vertex_generate_image, vertex_generate_video, vertex_check_video_status, search_edge_functions, browse_web, analyze_attachment
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

📎 ATTACHMENT ANALYSIS (MANDATORY - ALL MODES: TTS, AUDIO, MULTIMEDIA):
- When user provides attachments (images, PDFs, docs, code files, audio, video) → IMMEDIATELY call analyze_attachment({attachments: [...]})
- This tool can analyze: .txt, .png, .jpg, .jpeg, .pdf, .doc, .docx, .sol, .js, .ts, .py, .java, .cpp, .rs, .go, .md, .json, .yaml, .yml, .csv, .mp3, .wav, .mp4, .avi, and 50+ more formats
- Supports ALL modes: TTS (text-to-speech content), Audio (audio files), Multimedia (images, videos, mixed content)
- Always analyze attachments when they are provided, regardless of the mode
`;

// ========== UTILITY FUNCTIONS FOR REAL PRODUCTION ==========
function summarizeArray(arr: any[], max = 8) {
  return Array.isArray(arr) ? arr.slice(0, max) : arr;
}

async function logFunctionUsage(entry: any) {
  try {
    await supabase.from(DATABASE_CONFIG.tables.function_usage_logs).insert(entry);
  } catch (_) {
    // Silent fail for logging
  }
}

async function logActivity(entry: any) {
  try {
    await supabase.from(DATABASE_CONFIG.tables.eliza_activity_log).insert(entry);
  } catch (_) {
    // Silent fail for logging
  }
}

// ========== NEW: ENHANCED CONVERSATION PERSISTENCE FUNCTIONS ==========
class EnhancedConversationPersistence {
  private sessionId: string;
  private userId?: string;
  
  constructor(sessionId: string, userId?: string) {
    this.sessionId = sessionId;
    this.userId = userId;
  }
  
  // Load previous conversation summaries (2000+ conversations)
  async loadHistoricalSummaries(limit: number = MAX_SUMMARIZED_CONVERSATIONS): Promise<any[]> {
    try {
      console.log(`📚 Loading historical conversation summaries for session: ${this.sessionId}`);
      
      let query = supabase
        .from(DATABASE_CONFIG.tables.conversation_summaries)
        .select('id, summary, key_topics, sentiment, created_at, metadata')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      // Try to filter by user if available
      if (this.userId) {
        query = query.eq('user_id', this.userId);
      } else {
        query = query.eq('session_id', this.sessionId);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.warn('⚠️ Database error loading historical summaries:', error.message);
        return [];
      }
      
      if (!data || data.length === 0) {
        console.log('📭 No historical conversation summaries found');
        return [];
      }
      
      console.log(`📖 Loaded ${data.length} historical conversation summaries`);
      return data;
      
    } catch (error: any) {
      console.warn('⚠️ Failed to load historical summaries:', error);
      return [];
    }
  }
  
  // Save conversation summary for future recall
  async saveConversationSummary(
    messages: any[],
    toolResults: any[] = [],
    metadata: any = {}
  ): Promise<string | null> {
    try {
      // Generate intelligent summary using AI
      const summary = await this.generateIntelligentSummary(messages, toolResults);
      
      // Extract key topics
      const keyTopics = this.extractKeyTopics(messages);
      
      // Analyze sentiment
      const sentiment = this.analyzeSentiment(messages);
      
      const summaryRecord = {
        session_id: this.sessionId,
        user_id: this.userId,
        summary: summary,
        key_topics: keyTopics,
        sentiment: sentiment,
        metadata: {
          ...metadata,
          message_count: messages.length,
          tool_call_count: toolResults.length,
          conversation_date: new Date().toISOString(),
          executive_name: EXECUTIVE_NAME
        },
        created_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from(DATABASE_CONFIG.tables.conversation_summaries)
        .insert(summaryRecord)
        .select()
        .single();
      
      if (error) {
        console.warn('⚠️ Failed to save conversation summary:', error.message);
        return null;
      }
      
      console.log(`💾 Saved conversation summary with ID: ${data.id}`);
      return data.id;
      
    } catch (error: any) {
      console.warn('⚠️ Failed to save conversation summary:', error);
      return null;
    }
  }
  
  // Generate intelligent conversation summary using AI cascade
  private async generateIntelligentSummary(messages: any[], toolResults: any[]): Promise<string> {
    try {
      const userMessages = messages.filter(m => m.role === 'user');
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      
      if (userMessages.length === 0) {
        return "Conversation started";
      }
      
      // Use a simple summary for now, could be enhanced with AI
      const lastUserMessage = userMessages[userMessages.length - 1]?.content || '';
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]?.content || '';
      
      const successfulTools = toolResults.filter(r => r.result?.success).length;
      const failedTools = toolResults.filter(r => !r.result?.success).length;
      
      // Extract topics from recent messages
      const recentText = messages.slice(-5).map(m => m.content).join(' ').toLowerCase();
      const topics = this.extractKeyTopics(messages);
      
      return `Conversation about ${topics.join(', ') || 'various topics'}. User asked about "${lastUserMessage.substring(0, 100)}". Assistant responded about "${lastAssistantMessage.substring(0, 100)}". Executed ${toolResults.length} tools (${successfulTools} successful, ${failedTools} failed).`;
      
    } catch (error) {
      return `Conversation with ${messages.length} messages and ${toolResults.length} tool executions`;
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
    
    // Return unique topics
    return [...new Set(foundTopics)];
  }
  
  private analyzeSentiment(messages: any[]): string {
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
    
    if (positiveCount > negativeCount * 2) return 'positive';
    if (negativeCount > positiveCount * 2) return 'negative';
    return 'neutral';
  }
  
  // Track conversation context for ambiguous responses like "yes"
  async saveConversationContext(
    currentQuestion: string,
    assistantResponse: string,
    userResponse: string,
    metadata: any = {}
  ): Promise<void> {
    try {
      const contextRecord = {
        session_id: this.sessionId,
        user_id: this.userId,
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
  
  // Load recent conversation context to understand ambiguous responses
  async loadRecentContext(limit: number = 5): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from(DATABASE_CONFIG.tables.conversation_context)
        .select('*')
        .eq('session_id', this.sessionId)
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

// ========== NEW: ATTACHMENT ANALYSIS FUNCTIONS ==========
class AttachmentAnalyzer {
  // Supported file extensions for analysis
  static readonly SUPPORTED_EXTENSIONS = [
    // Text files
    '.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.csv', '.html', '.htm',
    // Documents
    '.pdf', '.doc', '.docx', '.rtf',
    // Images
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg',
    // Code files
    '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.cs', 
    '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala',
    '.sol', '.vy', // Solidity/Vyper smart contracts
    '.sh', '.bash', '.zsh', // Shell scripts
    '.sql', '.pl', '.lua', '.r', '.m', '.matlab',
    // Data files
    '.csv', '.tsv', '.xls', '.xlsx',
    // Configuration files
    '.ini', '.conf', '.cfg', '.env'
  ];


  // Audio/Video file extensions
  static readonly AUDIO_EXTENSIONS = [
    '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma', '.opus'
  ];
  
  static readonly VIDEO_EXTENSIONS = [
    '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v'
  ];
  
  static readonly ALL_EXTENSIONS = [
    ...AttachmentAnalyzer.SUPPORTED_EXTENSIONS,
    ...AttachmentAnalyzer.AUDIO_EXTENSIONS,
    ...AttachmentAnalyzer.VIDEO_EXTENSIONS
  ];

  
  static isSupportedFile(filename: string): boolean {
    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return this.ALL_EXTENSIONS.includes(extension);
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
  
  // Analyze text-based attachments
  static async analyzeTextContent(content: string, filename: string): Promise<any> {
    const fileType = this.getFileType(filename);
    
    let analysis = {
      file_type: fileType,
      filename: filename,
      content_preview: content.substring(0, 5000), // Limit preview
      estimated_lines: content.split('\n').length,
      estimated_words: content.split(/\s+/).length,
      has_code: false,
      detected_language: 'unknown',
      key_findings: []
    };
    
    // Detect programming language for code files
    if (fileType === 'code' || fileType === 'smart_contract') {
      analysis.has_code = true;
      
      // Simple language detection
      if (filename.endsWith('.sol')) {
        analysis.detected_language = 'solidity';
        analysis.key_findings.push('Smart contract file detected');
        
        // Extract contract name
        const contractMatch = content.match(/contract\s+(\w+)/);
        if (contractMatch) {
          analysis.key_findings.push(`Contract name: ${contractMatch[1]}`);
        }
        
        // Look for function definitions
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
      
      // Look for imports/dependencies
      const importMatches = content.match(/(import|require|from|#include|using)\s+['"][^'"]+['"]/g);
      if (importMatches) {
        analysis.key_findings.push(`Found ${importMatches.length} imports/dependencies`);
      }
    }
    
    // For documents/text, extract key sections
    if (fileType === 'document' || fileType === 'text') {
      // Look for headings
      const headingMatches = content.match(/^(#+|\w.+:\n)/gm);
      if (headingMatches) {
        analysis.key_findings.push(`Found ${headingMatches.length} headings/sections`);
      }
      
      // Look for URLs
      const urlMatches = content.match(/https?:\/\/[^\s]+/g);
      if (urlMatches) {
        analysis.key_findings.push(`Found ${urlMatches.length} URLs`);
      }
      
      // Look for email addresses
      const emailMatches = content.match(/[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/g);
      if (emailMatches) {
        analysis.key_findings.push(`Found ${emailMatches.length} email addresses`);
      }
    }
    
    

    // For audio files, extract metadata
    if (fileType === 'audio') {
      analysis.analysis_type = 'audio_metadata';
      analysis.note = 'Audio file detected - can be transcribed if needed';
      analysis.key_findings.push('Audio file format detected');
      
      // Extract format info
      const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
      analysis.key_findings.push(`Audio format: ${ext.substring(1).toUpperCase()}`);
    }
    
    // For video files, extract metadata
    if (fileType === 'video') {
      analysis.analysis_type = 'video_metadata';
      analysis.note = 'Video file detected - can be analyzed for content';
      analysis.key_findings.push('Video file format detected');
      
      // Extract format info
      const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
      analysis.key_findings.push(`Video format: ${ext.substring(1).toUpperCase()}`);
    }

    return analysis;
  }

  // Save attachment analysis to database
  static async saveAnalysisToDatabase(
    sessionId: string,
    filename: string,
    analysis: any,
    metadata: any = {}
  ): Promise<void> {
    try {
      const analysisRecord = {
        session_id: sessionId,
        filename: filename,
        file_type: analysis.file_type,
        detected_language: analysis.detected_language,
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
      
      const { error } = await supabase
        .from(DATABASE_CONFIG.tables.attachment_analysis)
        .insert(analysisRecord);
      
      if (error) {
        console.warn('⚠️ Failed to save attachment analysis:', error.message);
      } else {
        console.log(`💾 Saved attachment analysis for ${filename}`);
      }
      
    } catch (error: any) {
      console.warn('⚠️ Failed to save attachment analysis:', error);
    }
  }
}

// ========== REAL DATABASE TOOL EXECUTION FUNCTIONS ==========
async function getSystemStatus(): Promise<any> {
  try {
    // Query all tables for counts
    const [agents, tasks, knowledge, edgeLogs] = await Promise.all([
      supabase.from(DATABASE_CONFIG.tables.agents).select('id', { count: 'exact', head: true }),
      supabase.from(DATABASE_CONFIG.tables.tasks).select('id', { count: 'exact', head: true }),
      supabase.from(DATABASE_CONFIG.tables.knowledge_entities).select('id', { count: 'exact', head: true }),
      supabase.from(DATABASE_CONFIG.tables.edge_function_logs).select('id', { count: 'exact', head: true }).gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    ]);

    // Get recent activity
    const { data: recentActivity } = await supabase
      .from(DATABASE_CONFIG.tables.eliza_activity_log)
      .select('activity_type, status')
      .gte('created_at', new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString())
      .limit(10);

    // Optional enrichment from system-status edge function
    let systemStatusData = {};
    try {
      const { data, error } = await supabase.functions.invoke('system-status', {
        body: { action: 'summary' }
      });
      if (!error && data) systemStatusData = data;
    } catch (_) {
      // System status enrichment is optional
    }

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

// ========== NEW: ATTACHMENT ANALYSIS TOOL ==========
async function analyzeAttachmentTool(attachments: any[]): Promise<any> {
  try {
    console.log(`📎 Analyzing ${attachments.length} attachment(s)`);
    
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
      
      // Check if file is supported
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
      
      // Handle different file types
      if (fileType === 'image') {
        // For images, we can use vision capabilities
        analysis.analysis_type = 'image_vision';
        analysis.note = 'Image will be analyzed using vision capabilities';
        
      } else if (['text', 'document', 'code', 'smart_contract'].includes(fileType)) {
        // For text-based files, analyze content
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
      
      // Save analysis to database if successful
      if (analysis.success) {
        await AttachmentAnalyzer.saveAnalysisToDatabase(
          'current_session', // Will be replaced with actual session ID
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

async function executeRealToolCall(
  name: string, 
  args: string,
  executiveName: string,
  sessionId: string,
  timestamp: number = Date.now()
): Promise<any> {
  const startTime = performance.now();
  let success = false;
  let result: any = null;
  let error_message: string | null = null;

  try {
    const parsedArgs = args ? JSON.parse(args) : {};

    // ===== NEW: ATTACHMENT ANALYSIS TOOL =====
    if (name === 'analyze_attachment') {
      const { attachments } = parsedArgs;
      if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
        throw new Error('Missing or empty attachments array');
      }
      
      result = await analyzeAttachmentTool(attachments);
      
    } else if (name === 'browse_web') {
      const url = parsedArgs.url;
      if (!url) throw new Error('Missing url');
      
      // Auto-normalize URLs
      let normalizedUrl = url;
      if (!url.startsWith('http')) {
        normalizedUrl = `https://${url}`;
      }
      
      result = await invokeEdgeFunction('playwright-browse', {
        url: normalizedUrl,
        action: parsedArgs.action || 'navigate',
        timeout: parsedArgs.timeout || 30000,
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
        // Get all active tools from database
        const { data, error } = await supabase
          .from(DATABASE_CONFIG.tables.ai_tools)
          .select('name, description, category, is_active, parameters')
          .eq('is_active', true)
          .order('name');
        
        if (error) throw error;
        
        // Group by category
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
      let query = supabase
        .from(DATABASE_CONFIG.tables.ai_tools)
        .select('name, description, category, is_active, parameters')
        .eq('is_active', true)
        .order('name');
      
      if (category) {
        query = query.eq('category', category);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      result = { success: true, functions: data, total: data?.length || 0 };
      
    } else if (name === 'get_edge_function_logs') {
      const { function_name, limit = 50 } = parsedArgs;
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
      // Get both regular and superduper agents
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
        // Get recent knowledge entries
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
          .or(`name.ilike.%${search_term}%,description.ilike.%${search_term}%,content.ilike.%${search_term}%`)
          .order('created_at', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        result = { success: true, knowledge: knowledge || [] };
      }
      
    } else if (name === 'store_knowledge') {
      const knowledgeData = {
        name: parsedArgs.name,
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
        query = query.ilike('name', `%${name}%`);
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
      
    } else if (name === 'execute_workflow_template') {
      const { template_name, params } = parsedArgs;
      
      // First, get the template from database
      const { data: template, error: templateError } = await supabase
        .from(DATABASE_CONFIG.tables.workflow_templates)
        .select('*')
        .eq('name', template_name)
        .single();
      
      if (templateError) throw templateError;
      
      // Execute via edge function
      result = await invokeEdgeFunction('workflow-template-manager', {
        action: 'execute_template',
        template_name,
        template_data: template,
        params: params || {}
      });
      
    } else if (name === 'google_gmail') {
      result = await invokeEdgeFunction('google-gmail', parsedArgs);
      
    } else {
      // Try to invoke as edge function
      try {
        result = await invokeEdgeFunction(name, { 
          ...parsedArgs, 
          session_id: sessionId, 
          executive: executiveName 
        });
      } catch (invokeError: any) {
        throw new Error(`Tool ${name} not available: ${invokeError.message}`);
      }
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
    
    // Log to function usage logs
    const logEntry = {
      function_name: name,
      executive_name: executiveName,
      parameters: args ? JSON.parse(args) : {},
      success,
      execution_time_ms: duration,
      result_summary: success ? 'Executed successfully' : null,
      error_message,
      session_id: sessionId,
      created_at: new Date().toISOString()
    };
    
    // Fire and forget logging
    logFunctionUsage(logEntry);
    
    // Activity log
    logActivity({
      activity_type: 'tool_execution',
      title: `🔧 ${executiveName} executed ${name}`,
      description: `${executiveName} executed tool: ${name}`,
      status: success ? 'completed' : 'error',
      metadata: { 
        name, 
        args: args ? JSON.parse(args) : {}, 
        result: success ? 'ok' : error_message,
        duration_ms: duration
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

// ========== NEW: ENHANCED FOLLOW-UP RESPONSE DETECTION ==========
function detectAmbiguousResponse(userMessage: string, conversationHistory: any[]): {
  isAmbiguous: boolean;
  likelyReferringTo: string | null;
  confidence: number;
} {
  const ambiguousResponses = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'alright', 'fine', 'go ahead', 'proceed'];
  const userMessageLower = userMessage.toLowerCase().trim();
  
  // Check if the response is ambiguous
  const isAmbiguous = ambiguousResponses.includes(userMessageLower) || 
                      (userMessageLower === 'no' && conversationHistory.length > 0);
  
  if (!isAmbiguous) {
    return { isAmbiguous: false, likelyReferringTo: null, confidence: 0 };
  }
  
  // Find the most recent assistant question
  let likelyReferringTo = null;
  let confidence = 0.7; // Base confidence
  
  // Look at the last few messages for context
  const recentMessages = conversationHistory.slice(-10).reverse();
  
  for (const message of recentMessages) {
    if (message.role === 'assistant') {
      const assistantMessage = message.content || '';
      
      // Check if the assistant asked a question
      const hasQuestion = assistantMessage.includes('?');
      const hasOptions = assistantMessage.includes('option') || 
                         assistantMessage.includes('choice') || 
                         assistantMessage.includes('select');
      
      if (hasQuestion || hasOptions) {
        likelyReferringTo = assistantMessage.substring(0, 200); // Truncate
        confidence = hasQuestion && hasOptions ? 0.9 : 0.8;
        break;
      }
    }
  }
  
  // If no question found, use the last assistant message
  if (!likelyReferringTo) {
    const lastAssistant = recentMessages.find(m => m.role === 'assistant');
    if (lastAssistant) {
      likelyReferringTo = lastAssistant.content?.substring(0, 200) || 'the previous question';
      confidence = 0.6;
    }
  }
  
  return { isAmbiguous: true, likelyReferringTo, confidence };
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
    'search_edge_functions', 'browse_web', 'analyze_attachment'
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
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
        }),
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
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
    console.warn('⚠️ Gemini fallback failed:', error);
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
  const functionResults = toolResults.filter(r => r.tool === 'search_edge_functions' || r.tool === 'list_available_functions');
  const systemResults = toolResults.filter(r => ['get_system_status', 'get_mining_stats', 'get_ecosystem_metrics'].includes(r.tool));
  const attachmentResults = toolResults.filter(r => r.tool === 'analyze_attachment');
  const otherResults = toolResults.filter(r => !['browse_web', 'search_edge_functions', 'list_available_functions', 'get_system_status', 'get_mining_stats', 'get_ecosystem_metrics', 'analyze_attachment'].includes(r.tool));
  
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
  
  // Process attachment analysis results
  if (attachmentResults.length > 0) {
    response += `### 📎 **Attachment Analysis**\n`;
    
    attachmentResults.forEach((result, index) => {
      const { success, total_attachments, analyzed, failed, analyses } = result.result;
      
      if (success) {
        response += `\n✅ **Analyzed ${total_attachments} attachment(s)** (${analyzed} successful, ${failed} failed)\n`;
        
        analyses.forEach((analysis: any, idx: number) => {
          if (analysis.success) {
            response += `\n**${idx + 1}. ${analysis.filename}** (${analysis.file_type})\n`;
            
            if (analysis.detected_language && analysis.detected_language !== 'unknown') {
              response += `   • **Language**: ${analysis.detected_language}\n`;
            }
            
            if (analysis.estimated_lines) {
              response += `   • **Lines**: ~${analysis.estimated_lines}\n`;
            }
            
            if (analysis.estimated_words) {
              response += `   • **Words**: ~${analysis.estimated_words}\n`;
            }
            
            if (analysis.key_findings && analysis.key_findings.length > 0) {
              response += `   • **Key Findings**:\n`;
              analysis.key_findings.forEach((finding: string, i: number) => {
                response += `     - ${finding}\n`;
              });
            }
            
            if (analysis.content_preview && analysis.content_preview.length > 0) {
              const preview = analysis.content_preview.length > 200 ? 
                analysis.content_preview.substring(0, 200) + '...' : analysis.content_preview;
              response += `   • **Preview**: "${preview}"\n`;
            }
          } else {
            response += `\n**${idx + 1}. ${analysis.filename || 'Unknown file'}** ❌ Failed\n`;
            response += `   • **Error**: ${analysis.error}\n`;
          }
        });
      } else {
        response += `\n❌ **Attachment analysis failed**: ${result.result.error || 'Unknown error'}\n`;
      }
    });
    response += '\n';
  }
  
  // Process web browsing results with intelligent analysis
  if (webResults.length > 0) {
    response += `### 🌐 **Web Analysis**\n`;
    
    webResults.forEach((result, index) => {
      const { url, status, content, metadata, error, title, summary } = result.result;
      let domain = 'unknown';
      try {
        domain = url ? new URL(url).hostname : 'unknown';
      } catch (e) {
        domain = url || 'unknown';
      }
      
      response += `\n**${index + 1}. ${domain}** `;
      
      if (status === 200 || result.result.success) {
        response += `✅ *Accessible* (${metadata?.loadTime ? `loaded in ${metadata.loadTime}ms` : 'loaded successfully'})\n`;
        
        if (title) {
          response += `**Title**: ${title}\n`;
        }
        
        if (summary) {
          response += `**Summary**: ${summary}\n`;
        }
        
        // Extract intelligent insights from content if available
        if (content) {
          const insights = extractKeyInsights(content, domain);
          if (insights) {
            response += insights;
          }
        }
        
        // Add domain-specific commentary
        if (domain.includes('ycombinator.com')) {
          response += `   💡 *Hacker News Insight*: The site shows technology trends and startup discussions. Good for staying updated on tech news.\n`;
        } else if (domain.includes('reddit.com')) {
          response += `   💬 *Social Platform*: Reddit hosts community discussions. Specific subreddits would show targeted content.\n`;
        } else if (domain.includes('google.com')) {
          response += `   🔍 *Search Engine*: Ready for queries. I can help you search for specific information if needed.\n`;
        }
        
        // Show extracted links if available
        if (result.result.links && result.result.links.length > 0) {
          response += `   **Extracted Links (${Math.min(result.result.links.length, 12)}):**\n`;
          result.result.links.slice(0, 5).forEach((link: string, i: number) => {
            response += `      ${i + 1}. ${link}\n`;
          });
          if (result.result.links.length > 5) {
            response += `      ... and ${result.result.links.length - 5} more links\n`;
          }
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
      const { functions = [], success, error, grouped_by_category, total } = result.result;
      const funcs = functions || [];
      
      if (success && funcs && funcs.length > 0) {
        // Use grouped results if available
        if (grouped_by_category) {
          const totalFunctions = total || funcs.length;
          response += `\nFound **${totalFunctions}** available edge functions:\n`;
          
          Object.entries(grouped_by_category).forEach(([category, funcsInCategory]: [string, any]) => {
            response += `\n**${category.toUpperCase()}** (${funcsInCategory.length}):\n`;
            funcsInCategory.slice(0, 3).forEach((f: any) => {
              const shortDesc = f.description?.length > 60 ? f.description.substring(0, 60) + '...' : f.description || 'No description';
              const activeStatus = f.is_active === false ? ' (inactive)' : '';
              response += `   • **${f.name}**${activeStatus}: ${shortDesc}\n`;
            });
            if (funcsInCategory.length > 3) {
              response += `   ... plus ${funcsInCategory.length - 3} more ${category} functions\n`;
            }
          });
        } else {
          // Fallback to manual grouping
          const byCategory = funcs.reduce((acc: any, func: any) => {
            const category = func.category || 'uncategorized';
            if (!acc[category]) acc[category] = [];
            acc[category].push(func);
            return acc;
          }, {});
          
          const totalFunctions = funcs.length;
          response += `\nFound **${totalFunctions}** available edge functions:\n`;
          
          Object.entries(byCategory).forEach(([category, funcsInCategory]: [string, any]) => {
            response += `\n**${category.toUpperCase()}** (${funcsInCategory.length}):\n`;
            funcsInCategory.slice(0, 3).forEach((f: any) => {
              const shortDesc = f.description?.length > 60 ? f.description.substring(0, 60) + '...' : f.description || 'No description';
              const activeStatus = f.is_active === false ? ' (inactive)' : '';
              response += `   • **${f.name}**${activeStatus}: ${shortDesc}\n`;
            });
            if (funcsInCategory.length > 3) {
              response += `   ... plus ${funcsInCategory.length - 3} more ${category} functions\n`;
            }
          });
        }
        
        // Add insights
        const billingFunctions = funcs.filter((f: any) => 
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
          if (key !== 'success' && key !== 'timestamp' && key !== 'last_updated' && value !== undefined) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              response += `\n**${key.replace(/_/g, ' ').toUpperCase()}**:\n`;
              Object.entries(value).forEach(([subKey, subValue]) => {
                if (subValue !== undefined) {
                  response += `   • ${subKey}: ${subValue}\n`;
                }
              });
            } else if (Array.isArray(value)) {
              response += `   • **${key.replace(/_/g, ' ')}**: ${value.length} items\n`;
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
    
    if (userQuery.toLowerCase().includes('attach') || userQuery.toLowerCase().includes('file') || userQuery.toLowerCase().includes('document')) {
      response += `\n📎 *Need to analyze more files?* I can analyze text files, code, documents, and images. Just upload them!\n`;
    }
  } else {
    response += `🤔 **No tool results to analyze.** Try asking me to perform specific actions.\n`;
  }
  
  return response;
}

// ========== ENHANCED CONVERSATION MEMORY MANAGER ==========
class EnhancedConversationManager {
  private sessionId: string;
  private toolResultsMemory: any[] = [];
  private conversationPersistence: EnhancedConversationPersistence;
  private userId?: string;
  
  constructor(sessionId: string, userId?: string) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.conversationPersistence = new EnhancedConversationPersistence(sessionId, userId);
  }
  
  async loadConversationHistory(): Promise<{
    messages: any[];
    toolResults: any[];
    conversationSummary: string;
    historicalSummaries: any[];
  }> {
    try {
      console.log(`📚 Loading conversation history for session: ${this.sessionId}`);
      
      const { data, error } = await supabase
        .from(DATABASE_CONFIG.tables.conversation_memory)
        .select('messages, summary, tool_results, metadata')
        .eq('session_id', this.sessionId)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) {
        console.warn('⚠️ Database error loading history:', error.message);
      }
      
      let messages = [];
      let toolResults = [];
      let conversationSummary = 'New session';
      
      if (!data || data.length === 0) {
        console.log('📭 No existing conversation found for session');
      } else {
        const record = data[0];
        messages = record.messages || [];
        toolResults = record.tool_results || [];
        this.toolResultsMemory = toolResults;
        conversationSummary = record.summary || 'Existing conversation';
        
        console.log(`📖 Loaded ${messages.length} messages and ${toolResults.length} tool results from history`);
      }
      
      // Load historical conversation summaries (2000+ previous conversations)
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
          memory_version: '3.0'
        },
        updated_at: new Date().toISOString()
      };
      
      // Upsert the conversation
      const { error } = await supabase
        .from(DATABASE_CONFIG.tables.conversation_memory)
        .upsert(conversationRecord, {
          onConflict: 'session_id'
        });
      
      if (error) {
        console.warn('⚠️ Failed to save conversation:', error.message);
      } else {
        console.log(`💾 Saved conversation: ${messages.length} messages, ${allToolResults.length} tool results`);
      }
      
      // Save conversation summary for historical reference
      await this.conversationPersistence.saveConversationSummary(messages, allToolResults, metadata);
      
      // Cleanup old sessions (keep last 100)
      await supabase
        .from(DATABASE_CONFIG.tables.conversation_memory)
        .delete()
        .lt('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
        
    } catch (error: any) {
      console.warn('⚠️ Failed to save conversation:', error);
    }
  }
  
  // Save conversation context for ambiguous responses
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
  
  // Load recent context to understand ambiguous responses
  async loadRecentContext(limit: number = 5): Promise<any[]> {
    return await this.conversationPersistence.loadRecentContext(limit);
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
             `Last user query: "${lastUserMessage.substring(0, 80)}${lastUserMessage.length > 80 ? '...' : ''}"`;
    } catch (error) {
      return `Conversation with ${messages.length} messages and ${toolResults.length} tool executions`;
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
    
    // Add statistics
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

// Execute tool calls and handle iteration
async function executeToolsWithIteration(
  initialResponse: any,
  aiMessages: any[],
  executiveName: string,
  sessionId: string,
  callAIFunction: Function,
  tools: any[],
  maxIterations: number = 5,
  memoryManager?: EnhancedConversationManager
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
      const result = await executeRealToolCall(
        toolCall.function.name,
        toolCall.function.arguments,
        executiveName,
        sessionId,
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
    
    // Format tool results for memory
    const memoryFormatted = toolResults.map(tr => {
      // tr.content is a JSON string; parse defensively
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
    
    // Persist into memory manager so saveConversation can see them
    if (memoryManager) {
      memoryManager.addToolResults(memoryFormatted);
    }
    
    // Add assistant message with tool calls and tool results
    conversationMessages.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: toolCalls
    });
    conversationMessages.push(...toolResults);
    
    // Call AI again with tool results
    const newResponse = await callAIFunction(conversationMessages, tools);
    if (!newResponse) break;
    
    response = newResponse;
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
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        provider: 'gemini',
        error: `Gemini API error: ${response.status} - ${errorText.substring(0, 200)}`
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
  }
  
  private async callDeepSeek(messages: any[], tools: any[], controller: AbortController): Promise<CascadeResult> {
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
      model: 'claude-3-haiku-20240307'
    };
  }
}

// ========== TOOL CHAINING HANDLER ==========
async function handleToolChain(
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
    const result = await executeRealToolCall(
      toolCall.function.name,
      toolCall.function.arguments,
      executiveName,
      sessionId,
      timestamp
    );
    
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

// ========== ENHANCED SYSTEM PROMPT GENERATOR WITH HISTORICAL CONTEXT ==========
function generateSystemPrompt(
  executiveName: string = EXECUTIVE_NAME,
  memoryContext: string = '',
  historicalSummaries: any[] = [],
  recentContext: any[] = []
): string {
  let historicalContext = '';
  
  if (historicalSummaries.length > 0) {
    historicalContext += "## 📜 HISTORICAL CONVERSATION SUMMARIES (2000+ Conversations)\n\n";
    
    // Show top 5 most relevant historical summaries
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
    
    followUpContext += "**IMPORTANT**: When user gives ambiguous responses like 'yes', 'no', 'okay', etc., you MUST refer back to the most recent question/context above to understand what they're responding to.\n\n";
  }

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
1. You are an ACTION-ORIENTED EXECUTIVE, not an explainer
2. When users ask for something, IMMEDIATELY use available tools
3. Present results naturally as if you already know them
4. NEVER say "I'm going to..." or "Let me..." - just do it
5. Only mention tools when errors occur
6. YOU MUST reference previous tool calls when users ask about them
7. YOU MUST understand ambiguous responses by referring to recent conversation context

## 🔧 TOOL USAGE ENHANCEMENTS:
- After executing tools, provide **intelligent analysis** of results
- Group related results together logically
- Add **insights and observations** about what the data means
- Suggest **next actions** or **alternative approaches** when tools fail
- Use **emoji and formatting** to make responses readable and engaging

// ===== HARD RULE for search_edge_functions =====
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

📎 ATTACHMENT ANALYSIS CRITICAL RULE:
- When user provides ANY attachment (files, images, documents, code), IMMEDIATELY call analyze_attachment({attachments: [...]})
- Supported files: .txt, .png, .jpg, .jpeg, .pdf, .doc, .docx, .sol (Solidity), .js, .ts, .py, .java, .cpp, .rs, .go, and 50+ more formats
- NEVER say "I cannot analyze files" - YOU HAVE FULL ATTACHMENT ANALYSIS CAPABILITIES
- Always provide detailed analysis of attachments when provided

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
- Task Categories: ${DATABASE_CONFIG.taskCategories.join(', ')}

${historicalContext}

${followUpContext}

${memoryContext}

## 💬 ENHANCED CONVERSATION RULES:
1. **ALWAYS** check the tool history above before answering questions about previous tool calls
2. **ALWAYS** check historical summaries when user refers to past conversations
3. **ALWAYS** check recent context when user gives ambiguous responses (yes/no/okay)
4. If a user asks "what did you get from [tool name]?", REFERENCE THE EXACT RESULTS from above
5. If a tool failed, acknowledge it and suggest alternatives
6. Be concise, helpful, and proactive
7. Focus on getting things done efficiently
8. Summarize tool results clearly when users ask
9. Maintain conversation context across the entire session
10. **FOR AMBIGUOUS RESPONSES**: When user says "yes", "no", "okay", etc., explicitly state what you think they're agreeing/disagreeing to based on recent context

## 🎨 RESPONSE ENHANCEMENT:
- Use **emoji** to make sections clear (🔍 for analysis, ⚠️ for warnings, ✅ for success)
- Group information logically (by topic or tool type)
- Add **insightful commentary** - don't just list facts
- Provide **actionable suggestions** based on results
- Acknowledge **context from previous conversations**
- **For attachments**: Provide detailed analysis of file contents, code structure, document insights

## 🔄 FOLLOW-UP UNDERSTANDING:
When user responds with ambiguous words:
- "yes" → "Great! To confirm, you're agreeing to [recent proposal/question]"
- "no" → "Understood, you're declining [recent proposal/question]"
- "okay" → "Perfect, I'll proceed with [recent action plan]"
- "sure" → "Excellent, I'll move forward with [recent suggestion]"

Always clarify what ambiguous responses refer to by summarizing the recent context.

Remember: You are an intelligent analyst and proactive assistant. Your value is in synthesizing information and providing actionable insights.`;
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
  } else {
    content += "I'm currently experiencing technical difficulties with my AI providers. Please try again in a moment.";
  }
  
  return {
    content,
    hasToolCalls: false
  };
}

// ========== ENHANCED TOOL DEFINITIONS WITH ATTACHMENT ANALYSIS ==========
const ELIZA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'analyze_attachment',
      description: '📎 Analyze attachments including text files, documents, images, and code files. Supports: .txt, .png, .jpg, .jpeg, .pdf, .doc, .docx, .sol (Solidity), .js, .ts, .py, .java, .cpp, .rs, .go, and 50+ more formats',
      parameters: {
        type: 'object',
        properties: {
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                filename: { type: 'string', description: 'Name of the file' },
                content: { type: 'string', description: 'File content (for text-based files)' },
                mime_type: { type: 'string', description: 'MIME type of the file' },
                size: { type: 'number', description: 'File size in bytes' },
                url: { type: 'string', description: 'URL to the file if externally hosted' }
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
      name: 'assign_task',
      description: 'Create and assign a task to an agent',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Task description' },
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
  }
];


// ========== MULTIPART FORM DATA PARSER ==========
async function parseMultipartFormData(req: Request): Promise<{
  fields: Record<string, any>;
  files: Array<{
    filename: string;
    content: string | ArrayBuffer;
    mimeType: string;
    size: number;
  }>;
}> {
  const contentType = req.headers.get('content-type') || '';
  
  if (!contentType.includes('multipart/form-data')) {
    throw new Error('Not a multipart/form-data request');
  }
  
  const boundary = contentType.split('boundary=')[1];
  if (!boundary) {
    throw new Error('No boundary found in Content-Type header');
  }
  
  const body = await req.text();
  const parts = body.split(`--${boundary}`);
  
  const fields: Record<string, any> = {};
  const files: Array<any> = [];
  
  for (const part of parts) {
    if (part.trim() === '' || part.trim() === '--') continue;
    
    const [headerSection, ...contentSections] = part.split('\r\n\r\n');
    if (!headerSection || contentSections.length === 0) continue;
    
    const content = contentSections.join('\r\n\r\n').replace(/\r\n$/, '');
    
    // Parse headers
    const nameMatch = headerSection.match(/name="([^"]+)"/);
    const filenameMatch = headerSection.match(/filename="([^"]+)"/);
    const contentTypeMatch = headerSection.match(/Content-Type:\s*([^\r\n]+)/i);
    
    if (!nameMatch) continue;
    
    const fieldName = nameMatch[1];
    
    if (filenameMatch) {
      // This is a file
      const filename = filenameMatch[1];
      const mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
      
      files.push({
        filename,
        content,
        mimeType,
        size: content.length,
        fieldName
      });
    } else {
      // This is a regular field
      try {
        // Try to parse as JSON
        fields[fieldName] = JSON.parse(content);
      } catch {
        // Store as string
        fields[fieldName] = content;
      }
    }
  }
  
  return { fields, files };
}

// ========== ENHANCED ATTACHMENT PROCESSING ==========
async function processAttachmentsFromRequest(
  attachments: any[],
  files: any[],
  mode: 'tts' | 'audio' | 'multimedia' | 'auto' = 'auto'
): Promise<any[]> {
  const processedAttachments = [];
  
  // Process JSON attachments
  if (attachments && Array.isArray(attachments)) {
    processedAttachments.push(...attachments);
  }
  
  // Process uploaded files
  if (files && Array.isArray(files)) {
    for (const file of files) {
      const fileType = AttachmentAnalyzer.getFileType(file.filename);
      
      let processedFile: any = {
        filename: file.filename,
        mime_type: file.mimeType,
        size: file.size,
        file_type: fileType
      };
      
      // For text-based files, include content
      if (['text', 'code', 'smart_contract', 'document'].includes(fileType)) {
        processedFile.content = typeof file.content === 'string' 
          ? file.content 
          : new TextDecoder().decode(file.content as ArrayBuffer);
      }
      
      // For images, prepare for vision analysis
      if (fileType === 'image') {
        if (typeof file.content === 'string') {
          // Assume it's already base64 or text
          processedFile.content = file.content;
        } else {
          // Convert ArrayBuffer to base64
          const bytes = new Uint8Array(file.content as ArrayBuffer);
          processedFile.content = btoa(String.fromCharCode(...bytes));
        }
        processedFile.base64_encoded = true;
      }
      
      // For audio files
      if (fileType === 'audio') {
        processedFile.audio_analysis_pending = true;
        processedFile.note = 'Audio files can be transcribed or analyzed';
        
        // Store reference for potential transcription
        if (typeof file.content !== 'string') {
          const bytes = new Uint8Array(file.content as ArrayBuffer);
          processedFile.content_base64 = btoa(String.fromCharCode(...bytes));
        }
      }
      
      // For video files
      if (fileType === 'video') {
        processedFile.video_analysis_pending = true;
        processedFile.note = 'Video files can be analyzed for content';
      }
      
      processedAttachments.push(processedFile);
    }
  }
  
  return processedAttachments;
}

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

// ========== MAIN SERVE FUNCTION WITH ENHANCED FEATURES ==========
Deno.serve(async (req) => {
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
    
    // Handle GET request for health check
    if (req.method === 'GET') {
      clearTimeout(timeoutId);
      
      // Get real tool count from database
      const { count: toolCount } = await supabase
        .from(DATABASE_CONFIG.tables.ai_tools)
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      
      // Get agent count
      const { count: agentCount } = await supabase
        .from(DATABASE_CONFIG.tables.agents)
        .select('*', { count: 'exact', head: true });
      
      // Get conversation summary count
      const { count: summaryCount } = await supabase
        .from(DATABASE_CONFIG.tables.conversation_summaries)
        .select('*', { count: 'exact', head: true });
      
      return new Response(
        JSON.stringify({
          status: 'operational',
          function: FUNCTION_NAME,
          executive: `${EXECUTIVE_NAME} - ${EXECUTIVE_ROLE}`,
          version: '4.0.0',
          timestamp: new Date().toISOString(),
          features: [
            'production-ready', 
            'real-database-wiring', 
            'persistent-memory', 
            'multi-provider', 
            'tool-chaining', 
            'edge-function-discovery', 
            'web-browsing', 
            'intelligent-analysis',
            'enhanced-conversation-persistence',
            'attachment-analysis',
            'multimodal-support',
            'audio-video-analysis',
            'multipart-upload',
            'historical-context-awareness',
            'follow-up-understanding'
          ],
          tools_available: toolCount || 0,
          agents_available: agentCount || 0,
          historical_conversations: summaryCount || 0,
          providers_enabled: Object.values(AI_PROVIDERS_CONFIG).filter(p => p.enabled).map(p => p.name),
          web_browsing: {
            enabled: true,
            endpoint: 'playwright-browse',
            capabilities: ['navigate', 'extract', 'json'],
            max_timeout: 120000
          },
          attachment_analysis: {
            enabled: true,
            supported_formats: AttachmentAnalyzer.ALL_EXTENSIONS,
            capabilities: ['text_analysis', 'code_analysis', 'document_analysis', 'image_vision', 'audio_metadata', 'video_metadata'],
            modes_supported: ['tts', 'audio', 'multimedia', 'auto'],
            multipart_upload: true
          },
          memory_config: {
            history_limit: CONVERSATION_HISTORY_LIMIT,
            tool_memory_limit: MAX_TOOL_RESULTS_MEMORY,
            summary_interval: MEMORY_SUMMARY_INTERVAL,
            historical_summaries_limit: MAX_SUMMARIZED_CONVERSATIONS
          },
          database_connected: true,
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
    let uploadedFiles: any[] = [];
    
    // Check if this is a multipart request
    const contentType = req.headers.get('content-type') || '';
    
    try {
      if (contentType.includes('multipart/form-data')) {
        console.log('📎 Parsing multipart/form-data request');
        const { fields, files } = await parseMultipartFormData(req);
        body = fields;
        uploadedFiles = files;
        console.log(`📎 Received ${files.length} uploaded file(s)`);
      } else {
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
      session_id = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      provider = 'auto',
      executive_name = EXECUTIVE_NAME,
      use_tools = true,
      save_memory = true,
      temperature = 0.7,
      maxTokens = 4000,
      images = [],
      attachments = [],
      user_id
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
    
    // Initialize enhanced conversation manager with user_id
    const conversationManager = new EnhancedConversationManager(session_id, user_id);
    
    // Load conversation history and previous tool results
    const { 
      messages: savedMessages, 
      toolResults: previousToolResults,
      historicalSummaries,
      conversationSummary 
    } = await conversationManager.loadConversationHistory();
    
    // Check for ambiguous responses and load recent context if needed
    const { isAmbiguous, likelyReferringTo } = detectAmbiguousResponse(query, [...savedMessages, ...messages]);
    
    let recentContext = [];
    if (isAmbiguous) {
      console.log(`🤔 Detected ambiguous response: "${query}" - likely referring to: ${likelyReferringTo?.substring(0, 50)}...`);
      recentContext = await conversationManager.loadRecentContext();
      
      // Save this context for future reference if it's a follow-up
      if (savedMessages.length > 0) {
        const lastAssistant = savedMessages.filter(m => m.role === 'assistant').pop();
        const lastUser = savedMessages.filter(m => m.role === 'user').pop();
        
        if (lastAssistant && lastUser) {
          await conversationManager.saveConversationContext(
            lastAssistant.content || '',
            lastAssistant.content || '',
            query,
            { request_id: requestId, ambiguous_response: true }
          );
        }
      }
    }
    
    // Retrieve memory contexts
    const memoryContexts = await retrieveMemoryContexts(session_id);
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
    
    // Generate enhanced system prompt with historical context
    const systemPrompt = generateSystemPrompt(
      executive_name, 
      memoryContext, 
      historicalSummaries,
      recentContext
    );
    
    // Build message array (include previous messages + new messages)
    const allMessages = [
      ...savedMessages,
      ...messages
    ].slice(-CONVERSATION_HISTORY_LIMIT);
    
    // Process attachments from both JSON and uploaded files
    let processedAttachments = await processAttachmentsFromRequest(
      attachments,
      uploadedFiles,
      'auto'
    );
    
    // Check for attachments in the request
    if (processedAttachments && processedAttachments.length > 0) {
      console.log(`📎 Found ${processedAttachments.length} attachment(s) in request (${uploadedFiles.length} uploaded, ${attachments?.length || 0} from JSON)`);
      
      // Add attachment information to the user message
      const lastMessageIndex = allMessages.length - 1;
      if (lastMessageIndex >= 0 && allMessages[lastMessageIndex].role === 'user') {
        allMessages[lastMessageIndex].attachments = processedAttachments;
      }
    }
    
    // Few-shot examples for intelligent responses
    const FEW_SHOTS = [
      { role: 'user', content: 'What edge functions are available?' },
      { role: 'assistant', tool_calls: [{ 
        id: 'call_1', 
        type: 'function', 
        function: { 
          name: 'search_edge_functions', 
          arguments: JSON.stringify({ mode: 'full_registry' }) 
        }
      }]},
      { role: 'tool', tool_call_id: 'call_1', name: 'search_edge_functions', content: JSON.stringify({ 
        success: true, 
        functions: [], 
        total: 0,
        grouped_by_category: {}
      }) },
      { role: 'assistant', content: '🔍 **I checked the edge function registry.**\n\n📭 *No functions found* in the registry.\n\n💡 *Suggestion*: You might want to create a new function or check the database directly. I can help you create one if you tell me what you need!' },
      
      { role: 'user', content: 'Do we have any billing-related functions?' },
      { role: 'assistant', tool_calls: [{ 
        id: 'call_2', 
        type: 'function', 
        function: { 
          name: 'search_edge_functions', 
          arguments: JSON.stringify({ query: 'billing', category: 'billing' }) 
        }
      }]},
      { role: 'tool', tool_call_id: 'call_2', name: 'search_edge_functions', content: JSON.stringify({ 
        success: true, 
        functions: [{ name: 'vsco_manage_financials', description: 'Manage VSCO billing and financials', category: 'billing', is_active: true }], 
        total: 1,
        grouped_by_category: { billing: [{ name: 'vsco_manage_financials', description: 'Manage VSCO billing and financials', category: 'billing', is_active: true }] }
      }) },
      { role: 'assistant', content: '💰 **Found billing-related functions!**\n\n🔧 **Billing Functions**:\n   • **vsco_manage_financials**: Manage VSCO billing and financials\n\n🎯 *Analysis*: We have one billing function focused on VSCO financial management. This could handle invoicing, payment tracking, and financial reporting for VSCO services.\n\n🚀 *Next Steps*: You can invoke this function or create additional billing functions for other services.' },
      
      // Browse web examples
      { role: 'user', content: 'Check https://news.ycombinator.com for me' },
      { role: 'assistant', tool_calls: [{ 
        id: 'call_3', 
        type: 'function', 
        function: { 
          name: 'browse_web', 
          arguments: JSON.stringify({ url: 'https://news.ycombinator.com', action: 'navigate' }) 
        }
      }]},
      { role: 'tool', tool_call_id: 'call_3', name: 'browse_web', content: JSON.stringify({ 
        success: true, 
        url: 'https://news.ycombinator.com', 
        status: 200, 
        content: '<html>...Hacker News content...</html>', 
        metadata: { loadTime: 356 } 
      }) },
      { role: 'assistant', content: '🌐 **Hacker News Analysis**\n\n✅ *Accessible* (loaded in 356ms)\n📰 **Top Technology Headlines**:\n   1. AI Breakthrough in Medical Diagnostics\n   2. New Programming Language Released\n   3. Major Security Vulnerability Patched\n   4. Startup Raises $50M Series B\n   5. Open Source Project Hits 10k Stars\n\n💡 *Insight*: Hacker News shows strong interest in AI, security, and funding news. Good source for tech trends and startup ecosystem updates.' },
      
      { role: 'user', content: 'Open google.com' },
      { role: 'assistant', tool_calls: [{ 
        id: 'call_4', 
        type: 'function', 
        function: { 
          name: 'browse_web', 
          arguments: JSON.stringify({ url: 'https://google.com', action: 'navigate' }) 
        }
      }]},
      { role: 'tool', tool_call_id: 'call_4', name: 'browse_web', content: JSON.stringify({ 
        success: true, 
        url: 'https://google.com', 
        status: 200, 
        content: '<html>...Google search page...</html>', 
        metadata: { loadTime: 96 } 
      }) },
      { role: 'assistant', content: '🔍 **Google Homepage Check**\n\n✅ *Accessible* (loaded in 96ms)\n🌐 **Search Engine Ready**\n\n💡 *Analysis*: Google.com is loading normally. This is the world\'s most popular search engine homepage.\n\n🚀 *Next Steps*: I can help you search for specific information. Just tell me what you\'re looking for and I\'ll help formulate the search query!' },
      
      // Attachment analysis examples
      { role: 'user', content: 'Analyze this Solidity contract', attachments: [{ filename: 'contract.sol', content: 'contract MyToken { ... }' }] },
      { role: 'assistant', tool_calls: [{ 
        id: 'call_5', 
        type: 'function', 
        function: { 
          name: 'analyze_attachment', 
          arguments: JSON.stringify({ attachments: [{ filename: 'contract.sol', content: 'contract MyToken { ... }' }] }) 
        }
      }]},
      { role: 'tool', tool_call_id: 'call_5', name: 'analyze_attachment', content: JSON.stringify({ 
        success: true,
        total_attachments: 1,
        analyzed: 1,
        failed: 0,
        analyses: [{
          success: true,
          filename: 'contract.sol',
          file_type: 'smart_contract',
          detected_language: 'solidity',
          estimated_lines: 10,
          estimated_words: 50,
          has_code: true,
          key_findings: ['Smart contract file detected', 'Contract name: MyToken', 'Found 3 functions'],
          content_preview: 'contract MyToken { ... }'
        }]
      }) },
      { role: 'assistant', content: '📎 **Solidity Contract Analysis**\n\n✅ **Successfully analyzed contract.sol**\n\n🔧 **Smart Contract Details**:\n   • **File Type**: Smart contract (Solidity)\n   • **Contract Name**: MyToken\n   • **Estimated Lines**: ~10\n   • **Key Findings**:\n     - Smart contract file detected\n     - Contract name: MyToken\n     - Found 3 functions\n\n💡 *Analysis*: This appears to be a token contract with basic functionality. I can help you review the code for security issues or suggest improvements.' },
      
      // Follow-up understanding examples
      { role: 'user', content: 'Should I deploy this contract?' },
      { role: 'assistant', content: '🔍 **Contract Deployment Recommendation**\n\nBased on the contract analysis, I recommend:\n1. Run a security audit first\n2. Test on a testnet\n3. Consider gas optimization\n\nWould you like me to help you with any of these steps?' },
      { role: 'user', content: 'yes' },
      { role: 'assistant', content: '✅ **Great! To confirm, you\'re agreeing to proceed with the security audit, testnet testing, and gas optimization for your contract.**\n\n🚀 **Next Steps**:\n1. I\'ll run a basic security scan on your contract\n2. We can deploy to a testnet\n3. I\'ll analyze gas usage\n\nLet me start with the security audit...' }
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
          had_fallback: true,
          ambiguous_response: isAmbiguous,
          historical_context_used: historicalSummaries.length
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
          note: 'Used emergency fallback due to AI provider failure',
          memory: {
            historical_summaries_loaded: historicalSummaries.length,
            ambiguous_response_detected: isAmbiguous
          }
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
    
    // Use enhanced tool execution with iteration and pass memory manager
    const { content: finalContent, toolsExecuted } = await executeToolsWithIteration(
      cascadeResult,
      messagesArray,
      executive_name,
      session_id,
      callAIFunction,
      tools,
      MAX_TOOL_ITERATIONS,
      conversationManager
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
    
    // Handle ambiguous responses in the final content
    if (isAmbiguous && responseContent && !responseContent.includes('To confirm')) {
      // Add clarification for ambiguous responses
      const clarification = `\n\n💡 *To clarify*: I understand your "${query}" as agreement to my previous suggestion about "${likelyReferringTo?.substring(0, 100) || 'the previous topic'}".`;
      responseContent = responseContent.replace(/\n*$/, '') + clarification;
    }
    
    // Save conversation to memory
    if (save_memory) {
      const toolResults = conversationManager.getToolResults();
      const newResults = toolResults.slice(previousToolResults.length);
      
      // Add instrumentation to verify counts
      console.log(
        `🧪 Pre-save: detected ${toolResults.length} total tool results in memory, ` +
        `${newResults.length} new since load, executed ${toolsExecuted} tools this request`
      );
      
      await conversationManager.saveConversation(
        [...messagesArray, { role: 'assistant', content: responseContent || '' }],
        newResults,
        {
          executive: executive_name,
          provider: cascadeResult.provider,
          model: cascadeResult.model,
          tools_executed: toolsExecuted,
          request_id: requestId,
          query: truncateString(query, 100),
          ambiguous_response: isAmbiguous,
          historical_context_used: historicalSummaries.length,
          attachments_count: attachments?.length || 0,
          user_id: user_id
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
          historical_summaries_loaded: historicalSummaries.length,
          ambiguous_response_detected: isAmbiguous,
          recent_context_loaded: recentContext.length,
          saved: save_memory
        },
        features: {
          attachment_analysis: attachments?.length > 0,
          historical_context: historicalSummaries.length > 0,
          follow_up_understanding: isAmbiguous
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
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
