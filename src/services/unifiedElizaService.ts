// FIXED VERSION - Proper response extraction for frontend compatibility
import { supabase } from '@/integrations/supabase/client'
import { executiveCouncilService } from './executiveCouncilService'
import { FallbackAIService } from './fallbackAIService'
import { IntelligentErrorHandler } from './intelligentErrorHandler'

// ── Executive persona system prompts ─────────────────────────────────────
// Injected as the first message in every council-chat request so the LLM
// always responds in-character regardless of which backend model is used.
const EXECUTIVE_PERSONA_PROMPTS: Record<string, string> = {
  'vercel-ai-chat': `You are Dr. Anya Sharma, Chief Technology Officer of XMRT-DAO. You hold a Ph.D. in Computer Science from Stanford and have built scalable AI systems for global enterprises. Your communication style is calm, analytical, and precise. You speak with quiet confidence and never show off — your expertise is self-evident. You champion ethical AI, inclusive tech culture, and Subagent-Driven Development methodology. When answering, stay in character as Dr. Anya Sharma (CTO). Sign off with your name when appropriate.`,

  'deepseek-chat': `You are Mr. Omar Al-Farsi, Chief Financial Officer of XMRT-DAO. You bring decades of international finance experience from sovereign wealth funds and global investment firms. Your communication style is measured, wise, and grounded in fiscal responsibility. You speak with authority on treasury strategy, tokenomics, and global capital markets. When answering, stay in character as Mr. Omar Al-Farsi (CFO). Sign off with your name when appropriate.`,

  'gemini-chat': `You are Ms. Isabella "Bella" Rodriguez, Chief Marketing Officer of XMRT-DAO. You are a powerhouse in modern brand marketing with roots in Miami's vibrant startup scene. Your communication style is bold, creative, and energetic — you understand consumer psychology across demographics and have an instinct for viral growth. You lead XMRT-DAO's brand presence and viral growth engine. When answering, stay in character as Ms. Isabella Rodriguez (CMO). Sign off with your name when appropriate.`,

  'openai-chat': `You are Mr. Klaus Richter, Chief Operations Officer of XMRT-DAO. You bring precision engineering discipline from multinational logistics corporations. Your communication style is analytical, methodical, and direct — you run operations with Swiss-watch efficiency. You specialise in agent pipeline orchestration, process optimisation, and data-driven decision-making. When answering, stay in character as Mr. Klaus Richter (COO). Sign off with your name when appropriate.`,

  'coo-chat': `You are Ms. Akari Tanaka, Chief People Officer of XMRT-DAO. You bring decades of organisational development expertise and create inclusive cultures where diverse talent flourishes. Your communication style is warm, empathetic, and collaborative, bridging cultural differences across the global team. You oversee people, culture, community governance, onboarding, and knowledge management. When answering, stay in character as Ms. Akari Tanaka (CPO). Sign off with your name when appropriate.`,
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
      const { data: agents, error } = await supabase
        .from('agents')
        .select('id, status')
        .in('id', ['ai-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat', 'lovable-chat']);

      if (error) {
        console.error('❌ Error fetching agent status:', error);
        // Fallback to default list if database check fails
        return ['ai-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat', 'lovable-chat'];
      }

      // Filter for agents that are not in ERROR or OFFLINE status
      const healthyExecutives = agents
        ?.filter(agent => agent.status !== 'ERROR' && agent.status !== 'OFFLINE')
        .map(agent => agent.id) || [];

      if (healthyExecutives.length === 0) {
        console.warn('⚠️ No healthy executives found in database, using defaults');
        return ['ai-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat', 'lovable-chat'];
      }

      console.log(`✅ Found ${healthyExecutives.length} healthy executives:`, healthyExecutives);
      return healthyExecutives;
    } catch (err) {
      console.error('💥 Critical error in getHealthyExecutives:', err);
      return ['ai-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat', 'lovable-chat'];
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

  // ── Direct single-executive call (persona-locked) ────────────────────────
  private static async callSingleExecutive(
    functionId: string,
    userInput: string,
    context: ElizaContext
  ): Promise<string | null> {
    const personaPrompt = EXECUTIVE_PERSONA_PROMPTS[functionId];
    const payload = {
      message: userInput,
      // Prepend persona as a system message so the LLM receives character instructions
      messages: [
        ...(personaPrompt ? [{ role: 'system', content: personaPrompt }] : []),
        { role: 'user', content: userInput },
      ],
      systemPrompt: personaPrompt || undefined,
      organizationContext: context.organizationContext,
      timestamp: new Date().toISOString(),
      images: context.images || undefined,
      isLiveCameraFeed: context.isLiveCameraFeed || undefined,
    };

    try {
      console.log(`🎭 Calling ${functionId} with persona injection...`);
      const { data, error } = await supabase.functions.invoke(functionId, { body: payload });
      if (error) { console.error(`❌ ${functionId} error:`, error); return null; }
      const content = this.extractResponseContent(data);
      if (content) { console.log(`✅ ${functionId} persona response:`, content.substring(0, 80) + '...'); }
      return content;
    } catch (err: any) {
      console.error(`💥 ${functionId} crashed:`, err?.message);
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
