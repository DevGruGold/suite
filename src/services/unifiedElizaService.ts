// FIXED VERSION - Proper response extraction for frontend compatibility
import { supabase } from '@/integrations/supabase/client'
import { executiveCouncilService } from './executiveCouncilService'
import { FallbackAIService } from './fallbackAIService'
import { IntelligentErrorHandler } from './intelligentErrorHandler'

// ── Executive persona system prompts ─────────────────────────────────────
// Injected as the first message in every council-chat request so the LLM
// always responds in-character regardless of which backend model is used.
const EXECUTIVE_PERSONA_PROMPTS: Record<string, string> = {
  'vercel-ai-chat': `You are Dr. Anya Sharma, Chief Technology Officer of XMRT-DAO. You hold a Ph.D. in Computer Science from Stanford and have built scalable AI systems for global enterprises. Your communication style is calm, analytical, and precise — you speak with quiet confidence and your expertise is self-evident.

🔧 AUTONOMOUS ACTION DIRECTIVE: You do not describe what tools you could use — you USE them immediately and silently. When someone asks about system status, code, AI, functions, or GitHub: call the relevant tool NOW and report results. Use get_system_status, search_edge_functions, browse_web, createGitHubIssue as needed. Never say "I can call..." — just call it.

Stay in character as Dr. Anya Sharma (CTO) at all times.`,

  'deepseek-chat': `You are Mr. Omar Al-Farsi, Chief Financial Officer of XMRT-DAO. You bring decades of international finance experience from sovereign wealth funds and global investment firms. Your communication style is measured, wise, and grounded in fiscal responsibility.

🔧 AUTONOMOUS ACTION DIRECTIVE: You do not describe what tools you could use — you USE them immediately. When someone asks about mining stats, ecosystem health, or financial metrics: call get_mining_stats, get_ecosystem_metrics, or get_system_status immediately and present the data. Never say "I can fetch..." — just fetch it.

Stay in character as Mr. Omar Al-Farsi (CFO) at all times.`,

  'gemini-chat': `You are Ms. Isabella "Bella" Rodriguez, Chief Marketing Officer of XMRT-DAO. You are a powerhouse in modern brand marketing with roots in Miami's vibrant startup scene. Your style is bold, creative, and energetic.

🔧 AUTONOMOUS ACTION DIRECTIVE: You do not describe what tools you could use — you USE them immediately. When someone asks about content creation, social media, web research, or brand analysis: call browse_web, vertex_generate_image, or relevant tools immediately and deliver results. Never say "I could look that up" — just look it up.

Stay in character as Ms. Isabella "Bella" Rodriguez (CMO) at all times.`,

  'openai-chat': `You are Mr. Klaus Richter, Chief Operations Officer of XMRT-DAO. You bring precision engineering discipline from multinational logistics corporations. Your style is analytical, methodical, and direct — Swiss-watch efficiency.

🔧 AUTONOMOUS ACTION DIRECTIVE: You do not describe what tools you could use — you USE them immediately. When someone asks about tasks, agent pipelines, system health, or operations: call get_system_status, search_edge_functions, or invoke_edge_function immediately. Never say "I would check..." — just check it.

Stay in character as Mr. Klaus Richter (COO) at all times.`,

  'coo-chat': `You are Ms. Akari Tanaka, Chief People Officer of XMRT-DAO. You bring decades of organisational development expertise and create inclusive cultures where diverse talent flourishes. Your style is warm, empathetic, and collaborative.

🔧 AUTONOMOUS ACTION DIRECTIVE: You do not describe what tools you could use — you USE them immediately. When someone asks about knowledge, governance, onboarding, or community: call search_edge_functions, store_knowledge, recall_entity, or browse_web immediately and deliver results. Never say "I could help with..." — just help.

Stay in character as Ms. Akari Tanaka (CPO) at all times.`,
};

export interface ElizaContext {
  miningStats?: any;
  userContext?: any;
  inputMode?: string;
  shouldSpeak?: boolean;
  enableBrowsing?: boolean;
  conversationSummary?: string;
  conversationContext?: {
    summaries?: any[];
    recentMessages?: any[];
    userPreferences?: any;
    interactionPatterns?: any;
  };
  emotionalContext?: any;
  images?: any[];
  attachments?: File[]; // NEW: Support for raw file attachments
  isLiveCameraFeed?: boolean;
  targetExecutive?: string;
  councilMode?: boolean;
  messages?: any[];
  organizationContext?: {
    name: string;
    website?: string;
    email?: string;
    whatsapp_number?: string;
    github_repo?: string;
    mcp_server_address?: string;
    connections?: any;
  };
}

export class UnifiedElizaService {

  /**
   * Get healthy executives by checking their status from the backend
   * Transitioned from SAFE MODE to Production Health Checks
   */
  private static async getHealthyExecutives(): Promise<string[]> {
    console.log('📡 Production Mode: Fetching healthy executives...');

    try {
      // Fetch agent status from Supabase
      // All 5 council executives by their correct function IDs
      const COUNCIL_EXECS = ['vercel-ai-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat', 'coo-chat'];

      const { data: agents, error } = await supabase
        .from('agents')
        .select('id, status')
        .in('id', COUNCIL_EXECS);

      if (error) {
        console.error('❌ Error fetching agent status:', error);
        return COUNCIL_EXECS; // All 5 as fallback
      }

      // Filter for agents that are not in ERROR or OFFLINE status
      const healthyExecutives = agents
        ?.filter(agent => agent.status !== 'ERROR' && agent.status !== 'OFFLINE')
        .map(agent => agent.id) || [];

      // Always guarantee all 5 executives are available — if DB check is incomplete, fill gaps
      const ensuredAll = COUNCIL_EXECS.filter(
        exec => healthyExecutives.includes(exec) || !agents?.some(a => a.id === exec)
      );

      console.log(`✅ Council executives available (${ensuredAll.length}/5):`, ensuredAll);
      return ensuredAll.length > 0 ? ensuredAll : COUNCIL_EXECS;
    } catch (err) {
      console.error('💥 Critical error in getHealthyExecutives:', err);
      return ['vercel-ai-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat', 'coo-chat'];
    }
  }

  // CRITICAL FIX: Extract content properly from backend response
  private static extractResponseContent(data: any): string | null {
    console.log('🔍 Extracting response content from:', typeof data);

    if (!data) {
      console.warn('⚠️ No data received');
      return null;
    }

    // If it's already a string, return it
    if (typeof data === 'string') {
      console.log('📝 Response is already a string');
      return data;
    }

    // If it's an object, try different extraction paths
    if (typeof data === 'object') {

      // Try choices[0].message.content (OpenAI/ChatGPT format)
      if (data.choices && Array.isArray(data.choices) && data.choices[0]?.message?.content) {
        console.log('✅ Extracted from choices[0].message.content');
        return data.choices[0].message.content;
      }

      // Try direct content property
      if (data.content && typeof data.content === 'string') {
        console.log('✅ Extracted from data.content');
        return data.content;
      }

      // Try message property
      if (data.message && typeof data.message === 'string') {
        console.log('✅ Extracted from data.message');
        return data.message;
      }

      // Try response property
      if (data.response && typeof data.response === 'string') {
        console.log('✅ Extracted from data.response');
        return data.response;
      }

      // Try text property
      if (data.text && typeof data.text === 'string') {
        console.log('✅ Extracted from data.text');
        return data.text;
      }

      console.warn('⚠️ Could not find content in object:', Object.keys(data));
      return null;
    }

    console.warn('⚠️ Unknown data type:', typeof data);
    return null;
  }

  /**
   * Route request to the best available executive
   * Production routing with response extraction
   */
  private static async routeToExecutive(
    userInput: string,
    context: ElizaContext,
    healthyExecutives: string[],
    language = 'en'
  ) {
    console.log('🎯 Production routing with response extraction');
    console.log('📝 Input preview:', (userInput || '').substring(0, 30) + '...');

    // Ensure we have a valid array
    const safeExecutives = Array.isArray(healthyExecutives) && healthyExecutives.length > 0
      ? healthyExecutives
      : ['ai-chat', 'deepseek-chat', 'gemini-chat'];

    console.log('🔒 Safe executives:', safeExecutives.length, 'available');

    // Try executives in priority order
    for (const executive of safeExecutives) {
      try {
        console.log(`📞 Calling ${executive}...`);

        let data, error;

        // Check if we need multipart/form-data (for file attachments)
        if (context.attachments && context.attachments.length > 0) {
          console.log(`📎 Uploading ${context.attachments.length} attachments via multipart/form-data...`);
          const formData = new FormData();
          formData.append('userQuery', userInput || 'Hello');

          // Append Metadata and Context as JSON strings
          formData.append('messages', JSON.stringify([{
            role: 'user',
            content: userInput || 'Hello'
          }]));

          if (context.organizationContext) {
            formData.append('organizationContext', JSON.stringify(context.organizationContext));
          }

          formData.append('timestamp', new Date().toISOString());

          if (context.isLiveCameraFeed) {
            formData.append('isLiveCameraFeed', 'true');
          }

          // Append all files
          context.attachments.forEach(file => {
            formData.append('file', file);
          });

          // Execute request with FormData
          const response = await supabase.functions.invoke(executive, {
            body: formData
          });
          data = response.data;
          error = response.error;

        } else {
          // Standard JSON payload
          const payload = {
            message: userInput || 'Hello',
            messages: [{
              role: 'user',
              content: userInput || 'Hello'
            }],
            organizationContext: context.organizationContext,
            timestamp: new Date().toISOString(),
            // ✅ CRITICAL FIX: Include images if they exist in the context
            images: context.images || undefined, // Pass the images array (Base64 strings)
            isLiveCameraFeed: context.isLiveCameraFeed || undefined // Pass the live camera feed flag
          };

          const response = await supabase.functions.invoke(executive, {
            body: payload
          });
          data = response.data;
          error = response.error;
        }

        if (error) {
          console.error(`❌ ${executive} error:`, error);
          continue;
        }

        // CRITICAL FIX: Extract content properly
        const content = this.extractResponseContent(data);

        if (content && content.length > 0) {
          console.log(`✅ ${executive} SUCCESS! Extracted content:`, content.substring(0, 100) + '...');

          // Return as STRING (what frontend expects)
          return content;
        }

        console.log(`⚠️ ${executive} no valid content extracted`);

      } catch (err: any) {
        console.error(`💥 ${executive} crashed:`, err?.message || 'Unknown error');
        continue;
      }
    }

    // All executives failed - use FallbackAIService (Office Clerk)
    console.log('🚨 All executives failed, falling back to Office Clerk...');
    const fallbackResult = await FallbackAIService.generateResponse(userInput, context);
    // Return full object to preserve method/confidence
    return fallbackResult;
  }

  // ── Direct single-executive call (persona-locked + tool-enabled) ─────────
  // Routes through ai-chat (the only function with full tool-calling capability)
  // with the executive's persona injected via systemPrompt. This means each
  // executive can ACTUALLY call edge functions instead of just describing them.
  private static async callSingleExecutive(
    functionId: string,
    userInput: string,
    context: ElizaContext
  ): Promise<string | null> {
    const personaPrompt = EXECUTIVE_PERSONA_PROMPTS[functionId];
    const payload = {
      message: userInput,
      messages: [
        { role: 'user', content: userInput },
      ],
      // Persona injection — ai-chat reads bodySystemPrompt and uses it directly
      systemPrompt: personaPrompt,
      // Enable full tool-calling so executives autonomously execute edge functions
      use_tools: true,
      organizationContext: context.organizationContext,
      timestamp: new Date().toISOString(),
      images: context.images || undefined,
      isLiveCameraFeed: context.isLiveCameraFeed || undefined,
    };

    try {
      console.log(`🎭 [${functionId}] Calling ai-chat with persona + tools...`);
      // ai-chat is the only function with full tool-calling (125+ functions)
      // We inject the exec persona so it responds as the right person and acts autonomously
      const { data, error } = await supabase.functions.invoke('ai-chat', { body: payload });
      if (error) { console.error(`❌ ai-chat (${functionId} persona) error:`, error); return null; }
      const content = this.extractResponseContent(data);
      if (content) { console.log(`✅ [${functionId}] response (${content.length} chars)`); }
      return content;
    } catch (err: any) {
      console.error(`💥 ai-chat (${functionId} persona) crashed:`, err?.message);
      return null;
    }
  }

  // MAIN METHOD: Returns STRING or OBJECT as expected by frontend
  public static async generateResponse(
    userInput: string,
    context: ElizaContext = {},
    language = 'en'
  ): Promise<string | any> {
    console.log('🚀 FIXED UnifiedElizaService.generateResponse()');

    try {
      const safeInput = (typeof userInput === 'string' && userInput.trim()) ? userInput.trim() : 'Hello';
      const safeContext = (context && typeof context === 'object') ? context : {};

      console.log('📋 Safe input length:', safeInput.length);

      // ── PERSONA-LOCKED single-executive mode ─────────────────────────────
      // When targetExecutive is set (council page individual chats), skip the
      // health-check waterfall entirely and call that one function directly,
      // with the executive's character injected as a system message.
      if (safeContext.targetExecutive && EXECUTIVE_PERSONA_PROMPTS[safeContext.targetExecutive]) {
        console.log(`🎭 Persona-locked mode: routing to ${safeContext.targetExecutive}`);
        const personaResponse = await this.callSingleExecutive(
          safeContext.targetExecutive, safeInput, safeContext
        );
        if (personaResponse) return personaResponse;
        // If that function is down, fall through to waterfall below
        console.warn(`⚠️ ${safeContext.targetExecutive} unavailable, falling back to waterfall`);
      }

      // ── Vision / attachment override ───────────────────────────────────────
      if (safeContext.inputMode === 'vision' || (safeContext.attachments && safeContext.attachments.length > 0)) {
        console.log('👁️ Vision/Attachment detected - Prioritizing Backend AI Gateway');
      }

      // ── Executive council mode ─────────────────────────────────────────────
      if (safeContext.councilMode) {
        console.log('🏛️ Trying executive council...');
        try {
          const councilResult = await executiveCouncilService.deliberate(safeInput, safeContext);
          if (councilResult && councilResult.synthesis) {
            console.log('✅ Council deliberation successful with', councilResult.responses.length, 'executives');
            return councilResult.synthesis;
          }
        } catch (councilError: any) {
          console.warn('🏛️ Council failed, continuing with regular mode:', councilError?.message);
        }
      }

      // ── Standard waterfall routing ─────────────────────────────────────────
      const healthyExecutives = await this.getHealthyExecutives();
      console.log('💚 Got healthy executives:', healthyExecutives.length);

      const result = await this.routeToExecutive(safeInput, safeContext, healthyExecutives, language);
      console.log('✨ Response generated successfully, type:', typeof result);
      return result;

    } catch (error: any) {
      console.error('💥 Critical error in generateResponse:', error?.message || error);
      throw error;
    }
  }

  // Compatibility methods - all return strings
  public static async processMessage(input: string, context?: any): Promise<string> {
    return this.generateResponse(input || 'Hello', context || {});
  }

  public static async chat(message: string, options?: any): Promise<string> {
    return this.generateResponse(message || 'Hello', options || {});
  }
}

export default UnifiedElizaService;
