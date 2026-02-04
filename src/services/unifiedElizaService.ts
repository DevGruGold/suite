// FIXED VERSION - Proper response extraction for frontend compatibility
import { supabase } from '@/integrations/supabase/client'
import { executiveCouncilService } from './executiveCouncilService'
import { FallbackAIService } from './fallbackAIService'
import { IntelligentErrorHandler } from './intelligentErrorHandler'

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
    return fallbackResult.text;
  }

  // MAIN METHOD: Returns STRING as expected by frontend
  public static async generateResponse(
    userInput: string,
    context: ElizaContext = {},
    language = 'en'
  ): Promise<string> {
    console.log('🚀 FIXED UnifiedElizaService.generateResponse()');

    try {
      // Validate inputs safely
      const safeInput = (typeof userInput === 'string' && userInput.trim()) ? userInput.trim() : 'Hello';
      const safeContext = (context && typeof context === 'object') ? context : {};

      console.log('📋 Safe input length:', safeInput.length);

      // Executive council mode (if requested)
      if (safeContext.councilMode) {
        console.log('🏛️ Trying executive council...');
        try {
          const councilResult = await executiveCouncilService.deliberate(safeInput, safeContext);
          if (councilResult && councilResult.synthesis) {
            console.log('✅ Council deliberation successful with', councilResult.responses.length, 'executives');
            return councilResult.synthesis; // Return synthesized council response
          }
        } catch (councilError: any) {
          console.warn('🏛️ Council failed, continuing with regular mode:', councilError?.message);
        }
      }

      // Get healthy executives (guaranteed array)
      const healthyExecutives = await this.getHealthyExecutives();
      console.log('💚 Got healthy executives:', healthyExecutives.length);

      // Route to best executive and get STRING response
      const result = await this.routeToExecutive(safeInput, safeContext, healthyExecutives, language);

      console.log('✨ Response generated successfully, type:', typeof result);
      return result; // Return string directly

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
