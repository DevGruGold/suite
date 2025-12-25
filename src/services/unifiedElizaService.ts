// FIXED VERSION - Proper response extraction for frontend compatibility
import { supabase } from '../lib/supabase'
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
  isLiveCameraFeed?: boolean;
  targetExecutive?: string;
  councilMode?: boolean;
  messages?: any[];
}

export class UnifiedElizaService {
  
  // SAFE: Always return healthy executives array
  private static async getHealthyExecutives(): Promise<string[]> {
    console.log('🔧 SAFE MODE - Using all executives as healthy');
    
    const executivesList = [
      'ai-chat',
      'deepseek-chat', 
      'gemini-chat',
      'openai-chat',
      'lovable-chat'
    ];
    
    console.log('✅ Healthy executives:', executivesList.length);
    return executivesList;
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

  // ENHANCED: Routing with 402/503 error handling and executive cycling
  private static async routeToExecutive(
    userInput: string, 
    context: ElizaContext, 
    healthyExecutives: string[], 
    language = 'en'
  ) {
    console.log('🎯 Enhanced routing with 402/503 error handling and executive cycling');
    console.log('📝 Input preview:', (userInput || '').substring(0, 30) + '...');
    
    // Ensure we have a valid array
    // Prioritize executive-specific functions, then the general ai-chat as a last resort
    const defaultExecutives = ['deepseek-chat', 'gemini-chat', 'openai-chat', 'lovable-chat', 'ai-chat'];
    
    const safeExecutives = Array.isArray(healthyExecutives) && healthyExecutives.length > 0 
      ? healthyExecutives.filter(exec => exec !== 'ai-chat').concat('ai-chat') // Ensure ai-chat is last
      : defaultExecutives;
    
    console.log('🔒 Safe executives:', safeExecutives.length, 'available');
    
    const failedExecutives: Array<{name: string, reason: string}> = [];
    
    // Try executives in priority order
    for (const executive of safeExecutives) {
      try {
        console.log(`📞 Calling ${executive}...`);
        
        // Build comprehensive payload with all context
        const payload = {
          message: userInput || 'Hello',
          messages: [{ 
            role: 'user', 
            content: userInput || 'Hello' 
          }],
          conversationHistory: context.conversationContext,
          userContext: context.userContext,
          miningStats: context.miningStats,
          emotionalContext: context.emotionalContext,
          images: context.images,
          timestamp: new Date().toISOString()
        };
        
        const result = await supabase.functions.invoke(executive, {
          body: payload
        });
        
        // Check for 402 Payment Required or 503 Service Unavailable errors
        if (result.error) {
          const errorMessage = typeof result.error === 'object' ? JSON.stringify(result.error) : String(result.error);
          
          // Check if error indicates depleted credits/tokens or service unavailable
          if (errorMessage.includes('402') || 
              errorMessage.includes('503') ||
              errorMessage.includes('quota') || 
              errorMessage.includes('credit') ||
              errorMessage.includes('insufficient') ||
              errorMessage.includes('payment required') ||
              errorMessage.includes('service unavailable') ||
              errorMessage.includes('non-2xx status code')) {
            console.warn(`💳 ${executive} unavailable (402/503), trying next executive...`);
            failedExecutives.push({name: executive, reason: 'service_unavailable_or_depleted_credits'});
            continue;
          }
          
          console.error(`❌ ${executive} error:`, result.error);
          failedExecutives.push({name: executive, reason: 'error'});
          continue;
        }
        
        // Check response status for 402 or 503
        if (result.data?.status === 402 || result.data?.statusCode === 402 ||
            result.data?.status === 503 || result.data?.statusCode === 503) {
          console.warn(`💳 ${executive} returned ${result.data?.status || result.data?.statusCode} status, trying next executive...`);
          failedExecutives.push({name: executive, reason: 'service_unavailable_or_depleted_credits'});
          continue;
        }
        
        // CRITICAL FIX: Extract content properly
        const content = this.extractResponseContent(result.data);
        
        if (content && content.length > 0) {
          console.log(`✅ ${executive} SUCCESS! Extracted content:`, content.substring(0, 100) + '...');
          
          // Log which executives were skipped due to depleted credits or unavailability
          if (failedExecutives.length > 0) {
            const unavailableExecs = failedExecutives.filter(e => e.reason === 'service_unavailable_or_depleted_credits').map(e => e.name);
            if (unavailableExecs.length > 0) {
              console.log(`ℹ️ Skipped executives (depleted credits or unavailable): ${unavailableExecs.join(', ')}`);
            }
          }
          
          // Return as STRING (what frontend expects)
          return content;
        }
        
        console.log(`⚠️ ${executive} no valid content extracted`);
        failedExecutives.push({name: executive, reason: 'no_content'});
        
      } catch (err: any) {
        const errorMessage = err?.message || 'Unknown error';
        
        // Check if the error is related to depleted credits or service unavailable
        if (errorMessage.includes('402') || 
            errorMessage.includes('503') ||
            errorMessage.includes('quota') || 
            errorMessage.includes('credit') ||
            errorMessage.includes('insufficient') ||
            errorMessage.includes('service unavailable') ||
            errorMessage.includes('non-2xx status code')) {
          console.warn(`💳 ${executive} threw unavailability error, trying next executive...`);
          failedExecutives.push({name: executive, reason: 'service_unavailable_or_depleted_credits'});
        } else {
          console.error(`💥 ${executive} crashed:`, errorMessage);
          failedExecutives.push({name: executive, reason: 'crashed'});
        }
        continue;
      }
    }
    
    // All executives failed - log summary and use FallbackAIService (Office Clerk)
    console.log('🚨 All executives failed:');
    failedExecutives.forEach(exec => {
      console.log(`  - ${exec.name}: ${exec.reason}`);
    });
    
    console.log('🤖 Falling back to Office Clerk (local AI)...');
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
          const councilResult = await executiveCouncilService.generateResponse(safeInput, safeContext, language);
          if (councilResult && councilResult.content) {
            return councilResult.content; // Return string content
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
