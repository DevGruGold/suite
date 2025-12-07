import { XMRT_KNOWLEDGE_BASE } from '@/data/xmrtKnowledgeBase';
import { unifiedDataService, type MiningStats, type UserContext } from './unifiedDataService';
import { harpaAIService, HarpaAIService, type HarpaBrowsingContext } from './harpaAIService';
import { renderAPIService } from './renderAPIService';
import { supabase } from '@/integrations/supabase/client';
import { openAIApiKeyManager } from './openAIApiKeyManager';
import { enhancedTTS } from './enhancedTTSService';
import { IntelligentErrorHandler } from './intelligentErrorHandler';

// Get session credentials if available (outside React component)
let sessionCredentials: any = null;
try {
  const credentialContext = (window as any).__credentialSessionContext;
  if (credentialContext) {
    sessionCredentials = credentialContext.getAll();
  }
} catch (e) {
  // Context not available, will use null
}

export interface EmotionalContext {
  currentEmotion: string;
  emotionConfidence: number;
  voiceEmotions?: Array<{ name: string; score: number }>;
  facialEmotions?: Array<{ name: string; score: number }>;
  lastUpdate: number;
}

export interface ElizaContext {
  miningStats?: MiningStats | null;
  userContext?: UserContext | null;
  inputMode?: string;
  shouldSpeak?: boolean; // Control TTS to prevent duplication
  enableBrowsing?: boolean; // Enable Harpa AI agentic browsing
  conversationSummary?: string; // Previous conversation context
  conversationContext?: {
    summaries: Array<{ summaryText: string; messageCount: number; createdAt: Date }>;
    recentMessages: Array<{ content: string; sender: 'user' | 'assistant'; timestamp: Date }>;
    userPreferences: Record<string, any>;
    interactionPatterns: Array<{ patternName: string; frequency: number; confidence: number }>;
    totalMessageCount: number;
    sessionStartedAt: Date | null;
  }; // Enhanced conversation context for better understanding
  councilMode?: boolean; // Enable multi-executive council deliberation
  emotionalContext?: EmotionalContext; // Real-time emotional state from voice and video
  images?: string[]; // Base64 encoded images for vision/multimodal analysis
  isLiveCameraFeed?: boolean; // Flag indicating images are from live webcam, not uploaded files
}

// Unified Eliza response service that both text and voice modes can use
export class UnifiedElizaService {

  /**
   * Check for new autonomous activity and generate summary for Eliza to mention
   */
  // DISABLED: This function was appending autonomous activity to user messages
  // The AI can check eliza_activity_log via tools when contextually relevant
  // private static async checkAndReportAutonomousActivity(
  //   lastCheckTimestamp: string = new Date(Date.now() - 3600000).toISOString() // Default: last hour
  // ): Promise<string> {
  //   try {
  //     const { data: newActivities, error } = await supabase
  //       .from('eliza_activity_log')
  //       .select('*')
  //       .eq('mentioned_to_user', false)
  //       .gt('created_at', lastCheckTimestamp)
  //       .order('created_at', { ascending: false })
  //       .limit(5);
  // 
  //     if (error || !newActivities || newActivities.length === 0) {
  //       return '';
  //     }
  // 
  //     // Mark as mentioned
  //     const activityIds = newActivities.map((a: any) => a.id);
  //     await supabase
  //       .from('eliza_activity_log')
  //       .update({ mentioned_to_user: true })
  //       .in('id', activityIds);
  // 
  //     // Generate human-readable summary
  //     const summaries = newActivities.map((activity: any) => {
  //       const timeDiff = Math.floor((Date.now() - new Date(activity.created_at).getTime()) / 60000);
  //       const timeStr = timeDiff < 1 ? 'just now' : timeDiff === 1 ? '1 min ago' : `${timeDiff} min ago`;
  //       
  //       return `• ${activity.title} (${timeStr}): ${activity.description}`;
  //     }).join('\n');
  // 
  //     return `\n\n**🔔 NEW AUTONOMOUS ACTIVITY (not yet mentioned to user):**\n${summaries}\n\n**You should mention these updates in your response if relevant!**`;
  //   } catch (err) {
  //     console.error('Error checking autonomous activity:', err);
  //     return '';
  //   }
  // }

  /**
   * REMOVED: Frontend code execution is now FORBIDDEN
   * All code execution must happen via backend tools (execute_python)
   * This method is kept as a no-op to prevent breaking changes
   */
  private static async validateAndExecuteResponse(response: string): Promise<string> {
    // Code blocks should NEVER appear in responses - Eliza must use tools
    if (response.includes('```python')) {
      console.warn('⚠️ [PROTOCOL VIOLATION] Code block found in response! Eliza should use execute_python tool instead.');
    }
    return response;
  }

  public static async generateResponse(
    userInput: string, 
    context: ElizaContext = {}, 
    language: string = 'en'
  ): Promise<string | { type: 'council_deliberation'; deliberation: any }> {
    console.log('🤖 Eliza: Starting optimized response generation for:', userInput);
    
    // Check if council mode is enabled
    if (context.councilMode) {
      console.log('🏛️ Council mode enabled - initiating multi-executive deliberation');
      const { executiveCouncilService } = await import('./executiveCouncilService');
      const deliberation = await executiveCouncilService.deliberate(userInput, context);
      
      return {
        type: 'council_deliberation',
        deliberation
      };
    }
    
    try {
      console.log('🤖 Eliza: Processing user input:', userInput);
      
      // Get user context, mining stats, AND memory contexts from database
      const [userContext, miningStats] = await Promise.all([
        unifiedDataService.getUserContext(),
        unifiedDataService.getMiningStats()
      ]);
      
      // Import memory service dynamically to fetch stored contexts
      const { memoryContextService } = await import('./memoryContextService');
      
      // Get memory contexts using semantic search (minimized for performance)
      const sessionKey = `ip-${userContext.ip}`;
      const memoryContexts = await memoryContextService.getRelevantContexts(
        sessionKey, 
        10, // Further reduced from 20 to 10 for faster loading
        userInput // Pass user input for semantic search
      );
      console.log(`📚 Loaded ${memoryContexts.length} semantically relevant memory contexts`);
      
      // Get system version info from Render deployment
      let systemVersion = null;
      if (userInput.toLowerCase().includes('version') || 
          userInput.toLowerCase().includes('deployment') ||
          userInput.toLowerCase().includes('system status')) {
        console.log('🚀 Fetching XMRT system version from Render...');
        systemVersion = await renderAPIService.getSystemVersion();
        console.log('📦 System version:', systemVersion);
      }
      
      console.log('📊 Context loaded - User:', userContext, 'Mining:', miningStats);
      console.log('🧠 Memory contexts retrieved:', memoryContexts.length, 'entries');
      
      // Search knowledge base for relevant information (minimized)
      const xmrtContext = XMRT_KNOWLEDGE_BASE.filter(item => 
        userInput.toLowerCase().includes(item.category.toLowerCase()) ||
        userInput.toLowerCase().includes(item.topic.toLowerCase())
      ).slice(0, 2); // Reduced from 3 to 2
      console.log('🧠 Knowledge context found:', xmrtContext.length, 'entries');
      
      let webIntelligence = '';
      let multiStepResults = '';
      
      // Intelligently determine if browsing is needed
      const needsBrowsing = this.shouldUseBrowsing(userInput);
      const shouldUseBrowsing = needsBrowsing && (context.enableBrowsing !== false) && harpaAIService.isAvailable();
      console.log('🌐 Eliza: HARPA AI status:', {
        needsBrowsing,
        enableBrowsing: context.enableBrowsing,
        shouldUseBrowsing,
        harpaAvailable: harpaAIService.isAvailable(),
        harpaStatus: harpaAIService.getStatus()
      });
      
      if (shouldUseBrowsing) {
        try {
          console.log('🌐 Eliza: Performing multi-step agentic browsing with HARPA AI...');
          const category = this.determineBrowsingCategory(userInput);
          console.log('📂 Eliza: Browse category determined:', category);
          
          // Step 1: Search for information
          console.log('🔍 Eliza: Step 1 - Searching...');
          const searchResults = await harpaAIService.browse({
            query: userInput,
            action: 'search',
            category,
            maxResults: 3
          });
          console.log('✅ Eliza: Search results:', searchResults.length, 'items');
          
          if (searchResults.length > 0) {
            // Step 2: Analyze the search results
            console.log('🔬 Eliza: Step 2 - Analyzing...');
            const analysisResults = await harpaAIService.browse({
              query: `Analyze and extract key insights from: ${searchResults.map(r => r.title + ' - ' + r.summary).join('; ')}`,
              action: 'analyze',
              category,
              maxResults: 2
            });
            console.log('✅ Eliza: Analysis results:', analysisResults.length, 'items');
            
            // Step 3: Summarize the findings
            console.log('📝 Eliza: Step 3 - Summarizing...');
            const summaryResults = await harpaAIService.browse({
              query: `Provide concise summary of findings for user question: ${userInput}`,
              action: 'summarize',
              category,
              maxResults: 1
            });
            console.log('✅ Eliza: Summary results:', summaryResults.length, 'items');
            
            webIntelligence = HarpaAIService.formatBrowsingResults(searchResults);
            multiStepResults = `Analysis: ${HarpaAIService.formatBrowsingResults(analysisResults)}\nSummary: ${HarpaAIService.formatBrowsingResults(summaryResults)}`;
            console.log('🎯 Eliza: Completed multi-step agentic browsing - Web intelligence available');
          } else {
            console.warn('⚠️ Eliza: No search results from HARPA AI');
          }
        } catch (error) {
          console.error('❌ Eliza: HARPA AI agentic browsing failed:', error);
          console.error('🔍 Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
          });
        }
      }
      
      // Generate response using Gemini AI Gateway
      console.log('🔧 Calling Gemini AI Gateway with Gemini...');
      
      const result = await this.generateOpenAIResponse(userInput, {
        userContext,
        miningStats,
        xmrtContext,
        webIntelligence,
        multiStepResults,
        systemVersion,
        context,
        language
      });
      
      console.log('✅ Eliza: Generated AI response');
      
      // Edge function now always returns strings, validate and log warning if not
      const responseStr = result.response || '';
      if (typeof responseStr !== 'string') {
        console.warn('⚠️ Response is not a string:', typeof responseStr, responseStr);
      }
      
      console.log('📏 Response length:', responseStr?.length);
      if (responseStr && responseStr.length > 0) {
        console.log('🔍 Response preview:', responseStr.substring(0, 200) + '...');
      }
      console.log('🔧 Has tool calls:', result.hasToolCalls);
      console.log('🔧 Tool calls count:', result.tool_calls?.length || 0);
      
      // Store the hasToolCalls flag, tool calls, and executive for the frontend to use
      (window as any).__lastElizaHasToolCalls = result.hasToolCalls;
      (window as any).__lastElizaToolCalls = result.tool_calls || [];
      console.log(`✅ Response generated by: ${this.getExecutiveTitle((window as any).__lastElizaExecutive || 'gemini-chat')}`);
      
      // Validate and execute any code in the response before returning
      // Ensure response is a string before validation
      const responseForValidation = typeof result.response === 'string'
        ? result.response
        : JSON.stringify(result.response || '');
      
      const validatedResponse = await this.validateAndExecuteResponse(responseForValidation);
      console.log('🔍 [ResponseValidator] Validation complete');
      
      return validatedResponse;
      
    } catch (error) {
      console.error('❌ Eliza: Critical error generating response:', error);
      
      // Import intelligent error handler
      const { IntelligentErrorHandler } = await import('./intelligentErrorHandler');
      
      // Diagnose the error
      const diagnosis = await IntelligentErrorHandler.diagnoseError(error, {
        userInput,
        attemptedExecutive: (window as any).__lastElizaExecutive,
        fallbacksAttempted: ['lovable_gateway']
      });
      
      console.log('🔍 Error Diagnosis:', diagnosis);
      
      // Attempt automated workaround
      const workaroundResult = await IntelligentErrorHandler.attemptWorkaround(diagnosis);
      
      if (workaroundResult.success && workaroundResult.response) {
        console.log('✅ Workaround succeeded:', workaroundResult.method);
        // Don't return the workaround response directly - throw detailed error for UI to handle
      }
      
      // Generate detailed explanation
      const explanation = IntelligentErrorHandler.generateExplanation(diagnosis);
      throw new Error(`DIAGNOSTIC:${explanation}`);
    }
  }

  // Helper to detect complex agentic tasks
  private static isComplexAgenticTask(input: string): boolean {
    const complexPatterns = [
      /analyze.*and.*create/i,
      /multi[- ]?step|multiple steps/i,
      /coordinate|orchestrate/i,
      /plan.*and.*execute/i,
      /research.*and.*summarize/i,
      /compare.*across.*sources/i,
      /integrate.*data.*from/i,
      /build.*workflow/i,
      /complex.*analysis/i,
      /autonomous.*task/i
    ];
    return complexPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Get healthy executives from API key health status
   * Returns array of executive names sorted by health and priority
   */
  private static async getHealthyExecutives(): Promise<string[]> {
    try {
      const { getAPIKeyHealth } = await import('./credentialManager');
      const healthData = await getAPIKeyHealth();
      
      // Map service names to executive edge functions
      const serviceToExecMap: Record<string, string> = {
        'gemini': 'gemini-chat',
        'vercel_ai': 'vercel-ai-chat',
        'deepseek': 'deepseek-chat',
        'gemini_ai': 'gemini-chat',
        'openai': 'openai-chat'
      };
      
      // Filter healthy services and map to executives
      const healthyExecs = healthData
        .filter(h => h.is_healthy && !h.error_message)
        .map(h => serviceToExecMap[h.service_name])
        .filter(Boolean);
      
      console.log('💚 Healthy executives available:', healthyExecs);
      
      // ALWAYS include all executives in fallback (xAI first as lead AI)
      // Even if health check fails, they might work (health check != actual usage)
      const allExecutives = ['vercel-ai-chat', 'gemini-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat'];
      
      // Return healthy executives first, then others
      if (healthyExecs.length > 0) {
        const unhealthyExecs = allExecutives.filter(e => !healthyExecs.includes(e));
        return [...healthyExecs, ...unhealthyExecs];
      }
      
      // If none are healthy, return all in default order
      return allExecutives;
    } catch (error) {
      console.warn('⚠️ Could not fetch executive health, using defaults:', error);
      return ['vercel-ai-chat', 'gemini-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat'];
    }
  }

  /**
   * Intelligently select which AI Executive to call based on:
   * 1. Task characteristics (code, vision, strategy, etc.)
   * 2. Executive health/availability
   * Returns the edge function name to invoke
   */
  private static async selectAIExecutive(userInput: string, context: ElizaContext): Promise<string> {
    const input = userInput.toLowerCase();
    
    // Get currently healthy executives
    const healthyExecs = await this.getHealthyExecutives();
    
    // Helper to find first healthy match
    const findHealthyExec = (preferred: string[]): string | null => {
      for (const exec of preferred) {
        if (healthyExecs.includes(exec)) {
          return exec;
        }
      }
      return null;
    };
    
    // Chief Technology Officer (DeepSeek R1) - Code & Technical Architecture
    if (
      /code|debug|refactor|syntax|error|bug|technical|architecture|implementation|algorithm|optimize.*code/i.test(userInput) ||
      context.inputMode === 'code_review'
    ) {
      const exec = findHealthyExec(['deepseek-chat', 'gemini-chat', 'vercel-ai-chat']);
      if (exec) {
        console.log(`🎯 Routing to ${exec === 'deepseek-chat' ? 'CTO' : 'available exec'} (${exec}): Technical/Code task`);
        return exec;
      }
    }
    
    // Chief Information Officer (Gemini Multimodal) - Vision & Media
    if (
      /image|photo|picture|visual|diagram|chart|analyze.*image|what.*see|describe.*image|screenshot/i.test(userInput) ||
      context.inputMode === 'vision' ||
      userInput.includes('🖼️') || userInput.includes('📸')
    ) {
      const exec = findHealthyExec(['gemini-chat', 'vercel-ai-chat', 'openai-chat']);
      if (exec) {
        console.log(`🎯 Routing to ${exec === 'gemini-chat' ? 'CIO' : 'available exec'} (${exec}): Vision/Multimodal task`);
        return exec;
      }
    }
    
    // Chief Analytics Officer (GPT/OpenAI) - Complex Reasoning & Strategic Planning
    if (
      /analyze.*complex|strategic.*plan|forecast|predict|multi.*step.*reasoning|philosophical|ethical.*dilemma|compare.*analyze|synthesize.*information/i.test(userInput) ||
      this.isComplexAgenticTask(userInput) ||
      context.inputMode === 'strategic_analysis'
    ) {
      const exec = findHealthyExec(['openai-chat', 'vercel-ai-chat', 'gemini-chat']);
      if (exec) {
        console.log(`🎯 Routing to ${exec === 'openai-chat' ? 'CAO' : 'available exec'} (${exec}): Complex reasoning task`);
        return exec;
      }
    }
    
    // Default: Use first healthy executive (dynamic based on availability)
    const primaryExec = healthyExecs[0] || 'vercel-ai-chat';
    console.log(`🎯 Routing to primary healthy exec (${primaryExec}): General task`);
    return primaryExec;
  }

  /**
   * Get human-readable executive title
   */
  public static getExecutiveTitle(executive: string): string {
    const titles: Record<string, string> = {
      'vercel-ai-chat': 'Chief Strategy Officer (CSO)',
      'deepseek-chat': 'Chief Technology Officer (CTO)',
      'gemini-chat': 'Chief Information Officer (CIO)',
      'openai-chat': 'Chief Analytics Officer (CAO)',
      'lovable-chat': 'Suite Assistant',
      'lovable-gateway': '🌐 Lovable AI Gateway (Gemini 2.5 Flash)'
    };
    return titles[executive] || 'Executive';
  }

  /**
   * Get AI provider name from executive for display
   */
  private static getProviderFromExecutive(executive: string): string {
    const providers: Record<string, string> = {
      'vercel-ai-chat': 'Vercel AI',
      'deepseek-chat': 'DeepSeek',
      'gemini-chat': 'Gemini',
      'openai-chat': 'OpenAI',
      'lovable-chat': 'Lovable AI',
      'lovable-gateway': 'Lovable AI',
      'ai-chat': 'AI Chat',
      'kimi-chat': 'Kimi K2'
    };
    return providers[executive] || 'AI';
  }

  // Generate response using AI Executive C-Suite
  private static async generateOpenAIResponse(userInput: string, contextData: any): Promise<{ response: string; hasToolCalls: boolean; reasoning?: any[]; tool_calls?: any[] }> {
    const {
      userContext,
      miningStats,
      xmrtContext,
      webIntelligence,
      multiStepResults,
      systemVersion,
      context,
      language
    } = contextData;

    console.log('🧠 AI Executive C-Suite: Analyzing request...');
    console.log('🌎 Language setting:', language);

    // Get session key for database access
    const sessionKey = `ip-${userContext?.ip || 'unknown'}`;
    
    // Import memory and conversation services
    const { memoryContextService } = await import('./memoryContextService');
    const { conversationPersistence } = await import('./conversationPersistenceService');
    
      // Fetch memory data with reduced limits for performance
    const [memoryContexts, fullConversationContext] = await Promise.all([
      memoryContextService.getRelevantContexts(sessionKey, 30), // Increased from 20 to 30 for better recall
      conversationPersistence.getFullConversationContext()
    ]);
    
    console.log('🧠 Retrieved memory contexts:', memoryContexts.length);
    console.log('💬 Retrieved conversation context:', {
      summaries: fullConversationContext.summaries?.length || 0,
      messages: fullConversationContext.recentMessages?.length || 0,
      patterns: fullConversationContext.interactionPatterns?.length || 0
    });
    
    // Prepare comprehensive conversation history with ALL available context
    const conversationHistory = {
      summaries: fullConversationContext.summaries || [],
      recentMessages: fullConversationContext.recentMessages || [],
      totalMessageCount: fullConversationContext.totalMessageCount || 0,
      userPreferences: fullConversationContext.userPreferences || {},
      interactionPatterns: fullConversationContext.interactionPatterns || [],
      memoryContexts: memoryContexts.map(m => ({
        content: m.content,
        contextType: m.contextType,
        importanceScore: m.importanceScore,
        timestamp: m.timestamp
      }))
    };

    // Autonomous activity checking removed - AI can query eliza_activity_log when needed

    // Get latest session credentials
    try {
      const credContext = (window as any).__credentialSessionContext;
      if (credContext) {
        sessionCredentials = credContext.getAll();
        console.log('🔑 Session credentials available:', Object.keys(sessionCredentials || {}));
      }
    } catch (e) {
      console.log('⚠️ Could not retrieve session credentials');
    }

    // Common request body for all executives
    // Convert last 10 messages from conversation history to structured format for proper AI context
    const structuredMessages: Array<{ role: 'user' | 'assistant', content: string }> = [];
    
    if (conversationHistory.recentMessages && conversationHistory.recentMessages.length > 0) {
      // Take last 10 messages for context (prevents token bloat while maintaining context)
      const recentMessages = conversationHistory.recentMessages.slice(-10);
      
      for (const msg of recentMessages) {
        structuredMessages.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      }
    }
    
    // Add current user message at the end
    structuredMessages.push({ 
      role: 'user', 
      content: userInput
    });

    // Build emotional context string if available
    let emotionalContextStr = '';
    if (context.emotionalContext) {
      const ec = context.emotionalContext;
      emotionalContextStr = `\n\n**USER EMOTIONAL STATE (Real-time):**
- Primary emotion: ${ec.currentEmotion} (${Math.round(ec.emotionConfidence * 100)}% confidence)
${ec.voiceEmotions?.length ? `- Voice tone emotions: ${ec.voiceEmotions.slice(0, 3).map(e => `${e.name} (${Math.round(e.score * 100)}%)`).join(', ')}` : ''}
${ec.facialEmotions?.length ? `- Facial expression emotions: ${ec.facialEmotions.slice(0, 3).map(e => `${e.name} (${Math.round(e.score * 100)}%)`).join(', ')}` : ''}
- Adjust your response tone to be empathetic and appropriate to the user's emotional state.`;
      
      console.log('🎭 Including emotional context in request:', ec.currentEmotion);
    }

    // Log images being passed to edge function
    console.log('📸 Images being sent to edge function:', context.images?.length || 0);
    if (context.images && context.images.length > 0) {
      console.log('🖼️ First image preview:', context.images[0].substring(0, 80) + '...');
      if (context.isLiveCameraFeed) {
        console.log('📹 Images are from LIVE CAMERA FEED - Eliza can see the user in real-time!');
      }
    }

    const requestBody = {
      messages: structuredMessages, // Now includes conversation context for yes/no understanding
      conversationHistory, // Keep for backward compatibility with edge functions
      emotionalContext: context.emotionalContext, // Real-time emotional state
      emotionalContextStr, // Formatted string for system prompt
      images: context.images, // Base64 encoded images for vision analysis
      isLiveCameraFeed: context.isLiveCameraFeed || false, // Flag for live webcam vs uploaded images
      userContext: {
        isFounder: userContext?.isFounder || false,
        ip: userContext?.ip || 'unknown',
        sessionKey
      },
      miningStats: miningStats ? {
        hashRate: miningStats.hashRate,
        validShares: miningStats.validShares,
        amountDue: miningStats.amountDue,
        amountPaid: miningStats.amountPaid,
        isOnline: miningStats.isOnline,
        totalHashes: miningStats.totalHashes
      } : null,
      systemVersion: systemVersion ? {
        version: systemVersion.version,
        deploymentId: systemVersion.deploymentId,
        commitHash: systemVersion.commitHash,
        commitMessage: systemVersion.commitMessage,
        deployedAt: systemVersion.deployedAt,
        status: systemVersion.status,
        serviceUrl: systemVersion.serviceUrl
      } : null,
      session_credentials: sessionCredentials
    };

    // ELIZA USES EDGE FUNCTIONS EXCLUSIVELY FOR INTELLIGENCE
    // Edge functions contain all memory, learning, and tool calling capabilities
    // CRITICAL: Route ALL chat through lovable-chat which has tool calling capabilities
    // lovable-chat internally handles executive selection and fallback chain
    const primaryExecutive = 'lovable-chat'; // Always use lovable-chat for tool calling
    console.log(`🏛️ AI Executive C-Suite: Dispatching to ${primaryExecutive} with tool calling enabled`);
    
    // Try lovable-chat (it has its own internal fallback chain)
    try {
      console.log(`🎯 Calling ${primaryExecutive} with full tool calling support...`);
      
      const { data, error } = await supabase.functions.invoke(primaryExecutive, {
        body: requestBody
      });

      if (!error && data?.success) {
        console.log(`✅ ${primaryExecutive} responded successfully`);
        
        // Store which executive and provider responded for transparency
        (window as any).__lastElizaExecutive = primaryExecutive;
        (window as any).__lastElizaProvider = data.provider || 'Lovable AI';
        (window as any).__lastElizaExecutiveTitle = data.executiveTitle || '';
        console.log(`✅ Response generated by: lovable-chat (provider: ${data.provider || 'Lovable AI'})`);
        
        // Handle tool results vs direct responses
        if (data.toolResult && data.toolName) {
          const formattedResponse = this.formatToolResult(data.toolName, data.toolResult);
          return {
            response: formattedResponse,
            hasToolCalls: true,
            reasoning: data.reasoning || [],
            tool_calls: data.tool_calls || []
          };
        } else if (data.response) {
          // Embed reasoning in response if available (for frontend to extract)
          let responseWithReasoning = data.response;
          if (data.reasoning && data.reasoning.length > 0) {
            responseWithReasoning = `<reasoning>${JSON.stringify(data.reasoning)}</reasoning>${data.response}`;
          }
          return {
            response: responseWithReasoning,
            hasToolCalls: data.hasToolCalls || false,
            reasoning: data.reasoning || [],
            tool_calls: data.tool_calls || []
          };
        }
      }
      
      // lovable-chat failed - check for payment/rate limit errors
      const errorMsg = error?.message || data?.error || 'Unknown error';
      console.error(`❌ lovable-chat failed: ${errorMsg}`);
      
      // Surface payment/rate limit errors immediately - don't cascade
      if (errorMsg.includes('402') || errorMsg.includes('payment_required') || errorMsg.includes('Not enough credits')) {
        throw new Error('💳 Lovable AI Gateway credits exhausted. Please add credits at Settings → Workspace → Usage to continue using AI features.');
      }
      if (errorMsg.includes('429') || errorMsg.includes('rate_limit') || errorMsg.includes('Too Many Requests')) {
        throw new Error('⏱️ Lovable AI Gateway rate limit reached. Please wait a moment and try again.');
      }
      if (errorMsg.includes('quota') || errorMsg.includes('insufficient_quota')) {
        throw new Error('💳 Lovable AI Gateway quota exceeded. Please check your billing settings.');
      }
    } catch (err) {
      const errorMsg = err?.message || 'Unknown exception';
      console.error(`❌ lovable-chat exception: ${errorMsg}`);
      
      // Surface payment/rate limit errors immediately - don't cascade
      if (errorMsg.includes('402') || errorMsg.includes('payment_required') || errorMsg.includes('credits')) {
        throw new Error('💳 Lovable AI Gateway credits exhausted. Please add credits at Settings → Workspace → Usage to continue using AI features.');
      }
      if (errorMsg.includes('429') || errorMsg.includes('rate_limit')) {
        throw new Error('⏱️ Lovable AI Gateway rate limit reached. Please wait a moment and try again.');
      }
      if (errorMsg.includes('quota')) {
        throw new Error('💳 Lovable AI Gateway quota exceeded. Please check your billing settings.');
      }
    }
    
    // lovable-chat failed - try ai-chat fallback with its own cascade
    console.log('⚠️ lovable-chat unavailable - trying ai-chat fallback...');
    
    try {
      const { data: aiChatData, error: aiChatError } = await supabase.functions.invoke('ai-chat', {
        body: {
          text: userInput  // ai-chat expects 'text', not 'messages'
        }
      });

      if (!aiChatError && aiChatData?.ai_response) {  // ai-chat returns 'ai_response'
        console.log('✅ ai-chat responded successfully');
        (window as any).__lastElizaExecutive = 'ai-chat';
        (window as any).__lastElizaProvider = aiChatData.provider || 'AI Chat';
        (window as any).__lastElizaExecutiveTitle = 'AI Chat Service';
        
        return {
          response: `🤖 **[via AI Chat Service]**\n\n${aiChatData.ai_response}`,
          hasToolCalls: false,
          tool_calls: []
        };
      }
      
      console.warn(`⚠️ ai-chat failed: ${aiChatError?.message || aiChatData?.error}`);
    } catch (aiChatErr) {
      console.warn(`⚠️ ai-chat exception: ${aiChatErr?.message}`);
    }
    
    // ai-chat failed - try direct executives as fallback
    console.log('⚠️ lovable-chat unavailable - trying direct executives without tools...');
    
    // Get healthy executives for fallback chain (original behavior)
    const healthyExecs = await this.getHealthyExecutives();
    
    console.log('🔄 Executive fallback chain (without tools):', healthyExecs.map(e => 
      `${e} (${this.getExecutiveTitle(e)})`
    ));
    
    // Try executives in priority order
    for (const executive of healthyExecs) {
      try {
        console.log(`🎯 Calling ${executive} (${this.getExecutiveTitle(executive)})...`);
        
        const { data, error } = await supabase.functions.invoke(executive, {
          body: requestBody
        });

        if (!error && data?.success) {
          console.log(`✅ ${executive} (${this.getExecutiveTitle(executive)}) responded successfully`);
          
          // Store which executive and provider responded for transparency
          (window as any).__lastElizaExecutive = executive;
          (window as any).__lastElizaProvider = data.provider || this.getProviderFromExecutive(executive);
          (window as any).__lastElizaExecutiveTitle = data.executiveTitle || this.getExecutiveTitle(executive);
          console.log(`✅ Response generated by: ${this.getExecutiveTitle(executive)} (provider: ${(window as any).__lastElizaProvider})`);
          
          // Handle tool results vs direct responses
          if (data.toolResult && data.toolName) {
            const formattedResponse = this.formatToolResult(data.toolName, data.toolResult);
            return {
              response: formattedResponse,
              hasToolCalls: true,
              reasoning: data.reasoning || [],
              tool_calls: data.tool_calls || []
            };
          } else if (data.response) {
            // Embed reasoning in response if available (for frontend to extract)
            let responseWithReasoning = data.response;
            if (data.reasoning && data.reasoning.length > 0) {
              responseWithReasoning = `<reasoning>${JSON.stringify(data.reasoning)}</reasoning>${data.response}`;
            }
            return {
              response: responseWithReasoning,
              hasToolCalls: data.hasToolCalls || false,
              reasoning: data.reasoning || [],
              tool_calls: data.tool_calls || []
            };
          }
        }
        
        // Log detailed error for debugging
        const errorMsg = error?.message || data?.error || 'Unknown error';
        console.warn(`⚠️ ${executive} failed: ${errorMsg} - trying next executive`);
        
        // Check for payment/quota errors and surface to user
        if (errorMsg.includes('402') || errorMsg.includes('payment_required') || errorMsg.includes('Not enough credits')) {
          console.error(`💳 ${executive} out of credits - needs payment`);
        }
        if (errorMsg.includes('quota') || errorMsg.includes('insufficient_quota')) {
          console.error(`💳 ${executive} quota exceeded - needs billing update`);
        }
      } catch (err) {
        const errorMsg = err?.message || 'Unknown exception';
        console.warn(`⚠️ ${executive} exception: ${errorMsg} - trying next executive`);
        
        // Check for payment/quota errors
        if (errorMsg.includes('402') || errorMsg.includes('payment') || errorMsg.includes('quota')) {
          console.error(`💳 ${executive} payment/quota issue: ${errorMsg}`);
        }
      }
    }
    
    // Track all attempted executives for comprehensive error reporting
    const attemptedExecutives = [...healthyExecs];
    const executiveErrors: Record<string, any> = {};
    
    healthyExecs.forEach(exec => {
      executiveErrors[exec] = 'Service unavailable or failed';
    });
    
    // All services failed - use Office Clerk as absolute last resort
    console.log('🏢 All cloud services unavailable - using Office Clerk (browser-based AI)...');
    
    // LAST RESORT: Office Clerk (MLC-LLM or legacy fallback)
    attemptedExecutives.push('office-clerk-mlc');
    
    try {
      const { MLCLLMService } = await import('./mlcLLMService');
      
      // Check if WebGPU is supported
      if (!MLCLLMService.isWebGPUSupported()) {
        console.warn('⚠️ WebGPU not supported - using legacy Office Clerk');
        const { FallbackAIService } = await import('./fallbackAIService');
        const localResponse = await FallbackAIService.generateResponse(userInput, {
          miningStats: contextData.miningStats,
          userContext: contextData
        });
        
        console.log(`✅ Legacy Office Clerk responded: ${localResponse.method}`);
        (window as any).__lastElizaExecutive = 'office-clerk-legacy';
        
        const clerkResponse = `🤖 **[via Office Clerk - Browser AI]**\n\n${localResponse.text}\n\n` +
          `*Note: Lovable AI Gateway is currently unavailable. This response was generated locally in your browser using ${localResponse.method}. For full AI capabilities, please check your Lovable workspace credits.*`;
        
        return {
          response: clerkResponse,
          hasToolCalls: false,
          tool_calls: []
        };
      }
      
      // Use MLC-LLM
      const localResponse = await MLCLLMService.generateConversationResponse(userInput, {
        miningStats: contextData.miningStats,
        userContext: { sessionKey: sessionKey }
      });
      
      console.log(`✅ Office Clerk (MLC-LLM) responded: ${localResponse.method}`);
      (window as any).__lastElizaExecutive = 'office-clerk-mlc';
      
      const clerkResponse = `🏢 **[via Office Clerk - MLC-LLM]**\n\n${localResponse.text}\n\n` +
        `*Note: Lovable AI Gateway is currently unavailable. This response was generated locally in your browser using ${localResponse.method}. For full AI capabilities, please check your Lovable workspace credits.*`;
      
      return {
        response: clerkResponse,
        hasToolCalls: false,
        tool_calls: []
      };
    } catch (clerkError: any) {
      executiveErrors['office-clerk-mlc'] = clerkError;
      console.error('❌ Even the Office Clerk failed:', clerkError);
      
      // Generate comprehensive multi-service error diagnosis
      const finalError = new Error('All AI services exhausted');
      (finalError as any).executiveErrors = executiveErrors;
      (finalError as any).attemptedExecutives = attemptedExecutives;
      
      const diagnosis = await IntelligentErrorHandler.diagnoseError(finalError, {
        userInput,
        fallbacksAttempted: attemptedExecutives
      });
      
      const explanation = IntelligentErrorHandler.generateExplanation(diagnosis, attemptedExecutives);
      
      throw new Error(explanation);
    }
  }

  // Reset OpenAI instance to force re-initialization with new API key
  public static resetOpenAIInstance(): void {
    // Clear any cached states if needed
    console.log('🔄 OpenAI instance reset - will re-initialize with current API key');
  }

  // Determine the appropriate browsing category based on user input
  private static determineBrowsingCategory(userInput: string): HarpaBrowsingContext['category'] {
    const queryLower = userInput.toLowerCase();
    
    if (queryLower.includes('mining') || queryLower.includes('hashrate') || 
        queryLower.includes('pool') || queryLower.includes('difficulty') ||
        queryLower.includes('mobile mining') || queryLower.includes('monero')) {
      return 'mining';
    } else if (queryLower.includes('dao') || queryLower.includes('governance') || 
               queryLower.includes('voting') || queryLower.includes('proposal') ||
               queryLower.includes('treasury') || queryLower.includes('token')) {
      return 'dao';
    } else if (queryLower.includes('blockchain') || queryLower.includes('crypto') || 
               queryLower.includes('wallet') || queryLower.includes('transaction') ||
               queryLower.includes('address') || queryLower.includes('coin')) {
      return 'technical';
    } else if (queryLower.includes('price') || queryLower.includes('market') || 
               queryLower.includes('exchange') || queryLower.includes('trading') ||
               queryLower.includes('value') || queryLower.includes('chart')) {
      return 'market';
    } else if (queryLower.includes('news') || queryLower.includes('update') || 
               queryLower.includes('announcement') || queryLower.includes('recent') ||
               queryLower.includes('latest') || queryLower.includes('today')) {
      return 'news';
    } else {
      return 'general';
    }
  }

  // Determine if browsing is needed based on user input
  private static shouldUseBrowsing(userInput: string): boolean {
    const queryLower = userInput.toLowerCase();
    
    // Keywords that indicate need for real-time information
    const browsingKeywords = [
      'current', 'latest', 'recent', 'today', 'now', 'price', 'news',
      'update', 'happening', 'new', 'market', 'trending', 'status',
      'real-time', 'live', 'breaking', 'announcement', 'released'
    ];
    
    // Questions that typically need web search
    const questionIndicators = [
      'what is the current', 'what happened', 'latest news', 'recent update',
      'price of', 'market cap', 'how much is', 'when did', 'who announced'
    ];
    
    return browsingKeywords.some(keyword => queryLower.includes(keyword)) ||
           questionIndicators.some(phrase => queryLower.includes(phrase));
  }

  // Format tool results naturally in context
  private static formatToolResult(toolName: string, result: any): string {
    // For most tools, just present the data naturally without mentioning the tool
    switch (toolName) {
      case 'listAgents':
        if (!result || (Array.isArray(result) && result.length === 0)) {
          return "No agents are currently deployed.";
        }
        const agents = Array.isArray(result) ? result : [result];
        const agentsList = agents.map((agent: any) => {
          const statusIcon = agent.status === 'IDLE' ? '🟢' : '🔴';
          const skills = Array.isArray(agent.skills) ? agent.skills.join(', ') : 'None';
          return `${statusIcon} **${agent.name}** (${agent.role})\n   Status: ${agent.status}\n   Skills: ${skills}`;
        }).join('\n\n');
        return `Here's the current agent status:\n\n${agentsList}`;

      case 'listTasks':
        if (!result || (Array.isArray(result) && result.length === 0)) {
          return "There are no tasks in the queue.";
        }
        const tasks = Array.isArray(result) ? result : [result];
        const tasksList = tasks.map((task: any) => {
          const statusIcon = task.status === 'COMPLETED' ? '✅' : task.status === 'FAILED' ? '❌' : task.status === 'BLOCKED' ? '🚫' : '🔄';
          return `${statusIcon} **${task.title}**\n   Status: ${task.status} | Priority: ${task.priority}/10\n   Repo: ${task.repo} | Assignee: ${task.assignee_agent_id || 'Unassigned'}`;
        }).join('\n\n');
        return `Current task queue (${tasks.length} tasks):\n\n${tasksList}`;

      case 'getMiningStats':
        if (!result) return "Mining stats are currently unavailable.";
        return `Current hashrate is ${result.hashRate || result.hash_rate || 0} H/s with ${result.validShares || result.valid_shares || 0} valid shares. You've earned ${result.amountDue || result.amount_due || 0} XMR so far.`;

      case 'getSystemStatus':
        if (!result) return "System status is currently unavailable.";
        return `System is ${result.overall_status || result.status || 'operational'}. ${result.details ? JSON.stringify(result.details) : ''}`;

      case 'createGitHubIssue':
        if (!result) return "Issue creation status unknown.";
        return `Created issue: ${result.html_url || result.url || 'Issue created successfully'}`;

      case 'executePython':
      case 'executePythonCode':
        if (!result) return "No output from execution.";
        const output = result.output || result.stdout || result.result || '';
        return output.trim() || "Execution completed with no output.";

      default:
        // For unknown tool types, try to present the data reasonably
        if (typeof result === 'string') return result;
        if (typeof result === 'number') return result.toString();
        if (Array.isArray(result)) return `Found ${result.length} items: ${JSON.stringify(result, null, 2)}`;
        if (typeof result === 'object' && result !== null) {
          // Try to find a meaningful representation
          if (result.message) return result.message;
          if (result.content) return result.content;
          if (result.data) return this.formatToolResult(toolName, result.data);
          return JSON.stringify(result, null, 2);
        }
        return "Operation completed.";
    }
  }

}

export const unifiedElizaService = new UnifiedElizaService();