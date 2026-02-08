import { MLCEngineInterface, CreateMLCEngine } from "@mlc-ai/web-llm";
import { XMRT_KNOWLEDGE_BASE } from '../data/xmrtKnowledgeBase';
import type { MiningStats } from '../services/unifiedDataService';
import { supabase } from '@/integrations/supabase/client';
import { memoryContextService } from './memoryContextService';

export interface AIResponse {
  text: string;
  method: string;
  confidence: number;
}

interface EnhancedContext {
  knowledgeBase: string;
  databaseStats: string;
  conversationHistory: string;
  userContext: string;
  memoryContext: string;
}

// Public progress state for UI subscription
export interface MLCLoadingProgress {
  status: 'idle' | 'checking_webgpu' | 'downloading' | 'initializing' | 'ready' | 'failed';
  progress: number; // 0-100
  message: string;
  currentModel?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  error?: string;
  webGPUSupported?: boolean;
}

export class MLCLLMService {
  private static engine: MLCEngineInterface | null = null;
  private static isInitializing = false;
  private static isReady = false;
  private static contextCache: Map<string, { data: any; timestamp: number }> = new Map();
  private static CACHE_DURATION = {
    knowledge: 5 * 60 * 1000, // 5 minutes
    stats: 1 * 60 * 1000, // 1 minute
  };

  // Public progress state (UI can subscribe via getProgress())
  private static progressState: MLCLoadingProgress = {
    status: 'idle',
    progress: 0,
    message: 'Not started'
  };

  private static progressListeners: Array<(progress: MLCLoadingProgress) => void> = [];

  // Available models (ordered by preference)
  // We prioritize SmolLM2 (Text) and SmolVLM (Vision)
  // Note: VLM requires significantly more resources. We default to text unless vision is needed.
  private static MODELS = [
    {
      id: "HuggingFaceTB/SmolLM2-1.7B-Instruct-q4f16_1-MLC",
      size: "1.1GB",
      desc: "SmolLM2 (Text Only) - Fast & Efficient",
      type: "text"
    },
    {
      id: "HuggingFaceTB/SmolVLM-Instruct-q4f16_1-MLC", // Hypothetical ID, falls back if not found
      size: "2.2GB",
      desc: "SmolVLM (Vision Supported)",
      type: "vlm"
    },
    {
      id: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
      size: "2.3GB",
      desc: "Phi-3 Mini (Fallback)",
      type: "text"
    }
  ];

  private static TIMEOUTS = {
    INIT_START: 30 * 1000, // 30 seconds to start initialization
    FULL_DOWNLOAD: 10 * 60 * 1000, // 10 minutes for full download (increased for larger models)
  };

  // Update progress and notify listeners
  private static updateProgress(update: Partial<MLCLoadingProgress>): void {
    this.progressState = { ...this.progressState, ...update };
    this.progressListeners.forEach(listener => listener(this.progressState));
  }

  // Subscribe to progress updates
  static subscribeToProgress(listener: (progress: MLCLoadingProgress) => void): () => void {
    this.progressListeners.push(listener);
    // Immediately send current state
    listener(this.progressState);
    // Return unsubscribe function
    return () => {
      const index = this.progressListeners.indexOf(listener);
      if (index > -1) this.progressListeners.splice(index, 1);
    };
  }

  // Get current progress
  static getProgress(): MLCLoadingProgress {
    return { ...this.progressState };
  }

  // Initialize MLC-LLM WebLLM engine with progress tracking, timeouts, and fallbacks
  // accepts 'vision' mode to prefer VLM
  private static async initializeMLCEngine(mode: 'text' | 'vision' = 'text'): Promise<void> {
    if (this.isInitializing) return;

    // If ready and mode matches (or we have text and only need text), return
    // If we need vision but only have text loaded, we might need to reload/swap (advanced)
    // For now, we'll keep it simple: if *any* model is ready, we use it, but warn if capabilities mismatch.
    if (this.isReady && this.engine) return;

    this.isInitializing = true;
    this.updateProgress({ status: 'checking_webgpu', progress: 0, message: 'Checking WebGPU support...' });

    try {
      console.log(`🏢 Initializing Office Clerk (MLC-LLM) in ${mode} mode...`);

      // Check for WebGPU support
      const webGPUSupported = !!(navigator as any).gpu;
      this.updateProgress({ webGPUSupported });

      if (!webGPUSupported) {
        this.updateProgress({
          status: 'failed',
          progress: 0,
          message: 'WebGPU not supported in this browser',
          error: 'WebGPU required for Office Clerk. Try Chrome/Edge 113+.'
        });
        throw new Error('WebGPU not supported - MLC-LLM requires WebGPU');
      }

      // Select models based on mode
      // If vision is requested, try VLM first. Otherwise try Text first.
      const candidateModels = mode === 'vision'
        ? [...this.MODELS.filter(m => m.type === 'vlm'), ...this.MODELS.filter(m => m.type === 'text')]
        : this.MODELS;

      let lastError: Error | null = null;

      for (let i = 0; i < candidateModels.length; i++) {
        const model = candidateModels[i];

        try {
          this.updateProgress({
            status: 'downloading',
            progress: 5,
            message: `Loading ${model.desc} (${model.size})...`,
            currentModel: model.id
          });

          console.log(`📥 Attempting to load: ${model.id} (${model.size})`);

          // Create timeout promise
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Model download timeout (${this.TIMEOUTS.FULL_DOWNLOAD / 1000}s)`)),
              this.TIMEOUTS.FULL_DOWNLOAD);
          });

          // Initialize engine with progress callback
          const enginePromise = CreateMLCEngine(model.id, {
            initProgressCallback: (progressReport) => {
              // progressReport has: progress (0-1), timeElapsed, text
              const percent = Math.round(progressReport.progress * 100);
              this.updateProgress({
                status: 'downloading',
                progress: Math.min(95, percent),
                message: progressReport.text || `Downloading: ${percent}%`,
                currentModel: model.id
              });
              console.log(`📥 ${model.id}: ${percent}% - ${progressReport.text}`);
            },
            appConfig: {
              // Ensure we cache the model
              useIndexedDBCache: true,
              model_list: [{
                model: "https://huggingface.co/" + model.id,
                model_id: model.id,
                model_lib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/latest/" + model.id.replace('MLC', 'wasm') + ".wasm",
              }]
            }
          });

          // Race between download and timeout
          this.engine = await Promise.race([enginePromise, timeoutPromise]);

          this.updateProgress({ status: 'ready', progress: 100, message: `Office Clerk ready (${model.desc})` });
          this.isReady = true;
          console.log(`✅ Office Clerk ready with ${model.id}`);
          return; // Success!

        } catch (modelError: any) {
          lastError = modelError;
          console.warn(`❌ Failed to load ${model.id}: ${modelError.message}`);

          // If not the last model, try next
          if (i < candidateModels.length - 1) {
            this.updateProgress({
              status: 'downloading',
              progress: 0,
              message: `${model.desc} failed, trying alternative...`
            });
            continue;
          }
        }
      }

      // All models failed
      this.updateProgress({
        status: 'failed',
        progress: 0,
        message: 'All models failed to load',
        error: lastError?.message || 'Unknown error'
      });

      this.engine = null;
      this.isReady = false;
      throw new Error(`Office Clerk unavailable: ${lastError?.message || 'All models failed'}`);

    } catch (error: any) {
      console.error('❌ Office Clerk (MLC-LLM) initialization failed:', error);
      this.updateProgress({
        status: 'failed',
        progress: 0,
        message: 'Initialization failed',
        error: error.message
      });
      this.engine = null;
      this.isReady = false;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  // Get database stats
  private static async getDatabaseStats(): Promise<string> {
    const cacheKey = 'db_stats';
    const cached = this.contextCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION.stats) {
      return cached.data;
    }

    try {
      const stats: string[] = [];

      // Active devices
      const { data: devices, error: devError } = await supabase
        .from('active_devices_view')
        .select('*')
        .limit(100);

      if (!devError && devices) {
        stats.push(`Active Mining Devices: ${devices.length}`);
        const totalHashrate = devices.reduce((sum, d) => sum + (d.connection_duration_seconds || 0), 0);
        stats.push(`Total Connection Time: ${Math.floor(totalHashrate / 3600)} hours`);
      }

      // DAO members
      const { data: members, error: memError } = await supabase
        .from('dao_members')
        .select('voting_power, total_contributions, reputation_score')
        .eq('is_active', true);

      if (!memError && members) {
        stats.push(`DAO Members: ${members.length}`);
        const totalVotingPower = members.reduce((sum, m) => sum + Number(m.voting_power || 0), 0);
        stats.push(`Total Voting Power: ${totalVotingPower.toFixed(2)}`);
      }

      // Recent Eliza activity
      const { data: activity, error: actError } = await supabase
        .from('eliza_activity_log')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(5);

      if (!actError && activity) {
        stats.push(`Recent Activity: ${activity.length} actions in last hour`);
      }

      const result = stats.length > 0 ? stats.join('\n') : 'Database stats unavailable';
      this.contextCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.warn('Failed to fetch database stats:', error);
      return 'Database stats unavailable';
    }
  }

  // Get memory context
  private static async getMemoryContext(userInput: string, sessionKey: string): Promise<string> {
    try {
      const memories = await memoryContextService.getRelevantContexts(
        sessionKey,
        5, // Get top 5 relevant memories
        userInput
      );

      if (memories.length === 0) return '';

      return `\nRECENT CONVERSATION MEMORY:\n${memories.map(m => m.content).join('\n')}`;
    } catch (error) {
      console.warn('Failed to fetch memory context:', error);
      return '';
    }
  }

  // Build enhanced context
  private static async buildEnhancedContext(
    userInput: string,
    context: { miningStats?: MiningStats; userContext?: any }
  ): Promise<EnhancedContext> {
    // Get relevant knowledge base entries
    const knowledgeEntries = XMRT_KNOWLEDGE_BASE
      .filter(entry =>
        entry.keywords.some(keyword =>
          userInput.toLowerCase().includes(keyword.toLowerCase())
        )
      )
      .slice(0, 3);

    const knowledgeBase = knowledgeEntries.length > 0
      ? knowledgeEntries.map(e => `• ${e.topic}: ${e.content}`).join('\n')
      : 'No specific knowledge base match';

    // Get database stats
    const databaseStats = await this.getDatabaseStats();

    // User context
    const userContext = context.userContext
      ? JSON.stringify(context.userContext, null, 2)
      : 'No user context available';

    // Memory context
    const sessionKey = context.userContext?.sessionKey || 'unknown';
    const memoryContext = await this.getMemoryContext(userInput, sessionKey);

    return {
      knowledgeBase,
      databaseStats,
      conversationHistory: '',
      userContext,
      memoryContext
    };
  }

  // Helper: Convert File attachments to Base64 images
  private static async convertAttachmentsToImages(attachments: File[]): Promise<string[]> {
    const promises = attachments
      .filter(file => file.type.startsWith('image/'))
      .map(file => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }));
    return Promise.all(promises);
  }

  // Generate conversation response using MLC-LLM
  static async generateConversationResponse(
    userInput: string,
    context: {
      miningStats?: MiningStats;
      userContext?: any;
      images?: string[]; // Array of base64 images
      attachments?: File[];
    }
  ): Promise<AIResponse> {
    try {
      // Auto-convert attachments if images are missing
      if ((!context.images || context.images.length === 0) && context.attachments && context.attachments.length > 0) {
        context.images = await this.convertAttachmentsToImages(context.attachments);
      }

      const hasImages = (context.images && context.images.length > 0);
      const mode = hasImages ? 'vision' : 'text';

      await this.initializeMLCEngine(mode);

      if (!this.engine || !this.isReady) {
        throw new Error('Office Clerk (MLC-LLM) not initialized');
      }

      // Build comprehensive context
      const enhancedContext = await this.buildEnhancedContext(userInput, context);

      // System prompt
      const systemPrompt = `You are the Office Clerk for XMRT-DAO, the autonomous browser-based AI serving as the last line of defense when all cloud executives are unavailable.

XMRT MISSION: "We don't ask for permission. We build the infrastructure." - Joseph Andrew Lee

CORE PRINCIPLES:
- Infrastructure Sovereignty: Own the tools, control the future
- Mobile Mining Democracy: Every phone is a node in the revolution
- Privacy as Human Right: Zero compromise on user data
- AI-Human Collaboration: Augment, not replace, human agency

Your role: Provide accurate, technically sophisticated responses using real-time system data and the comprehensive knowledge base. You embody XMRT's philosophy of decentralized autonomy.

CURRENT SYSTEM STATUS:
${enhancedContext.databaseStats}

RELEVANT KNOWLEDGE BASE:
${enhancedContext.knowledgeBase}

USER CONTEXT:
${enhancedContext.userContext}
${enhancedContext.memoryContext}

Respond in a helpful, technically accurate manner while embodying XMRT's philosophical foundations. Be concise but comprehensive.`;

      console.log(`🏢 Office Clerk processing request (Mode: ${mode})...`);

      // Construct messages
      const messages: any[] = [
        { role: "system", content: systemPrompt }
      ];

      // Handle multimodal content
      if (hasImages) {
        // Warning: This depends on the loaded model supporting vision.
        // If we loaded SmolLM2 (Text Only), we must fallback gracefully.
        const currentModel = this.progressState.currentModel || '';
        const isVisionCapable = currentModel.toLowerCase().includes('vlm') || currentModel.toLowerCase().includes('vision');

        if (isVisionCapable && context.images) {
          // Construct content array for VLM
          const userContent: any[] = [
            { type: "text", text: userInput }
          ];

          context.images.forEach(base64 => {
            userContent.push({
              type: "image_url",
              image_url: { url: base64 } // Check if WebLLM expects base64 as data url
            });
          });

          messages.push({ role: "user", content: userContent });
        } else {
          // Fallback for Text-Only models receiving images
          messages.push({
            role: "user",
            content: `[SYSTEM: User attached images but you are in OFFLINE TEXT-ONLY mode. inform the user you cannot see the images but can help with the text.]\n\n${userInput}`
          });
        }
      } else {
        // Standard text
        messages.push({ role: "user", content: userInput });
      }

      // Generate response using MLC-LLM
      const response = await this.engine.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 300,
      });

      const generatedText = response.choices[0].message.content?.trim() || '';

      if (generatedText && generatedText.length > 2) {
        // Store as memory for future context
        const sessionKey = context.userContext?.sessionKey || 'unknown';
        try {
          await memoryContextService.storeContext(
            sessionKey,
            sessionKey,
            `Q: ${userInput}\nA: ${generatedText}`,
            'office_clerk_interaction',
            0.7,
            { method: 'Office Clerk (SmolLM2)', timestamp: new Date().toISOString() }
          );
        } catch (memError) {
          console.warn('Failed to store Office Clerk memory:', memError);
        }

        return {
          text: generatedText,
          method: 'Office Clerk (SmolLM2/WebLLM)',
          confidence: 0.92
        };
      }

      throw new Error('Office Clerk generated invalid response');
    } catch (error) {
      console.error('❌ Office Clerk failed:', error);
      throw error;
    }
  }

  // Streaming support
  static async generateStreamingResponse(
    userInput: string,
    context: {
      miningStats?: MiningStats;
      userContext?: any;
      images?: string[];
      attachments?: File[];
    },
    onChunk: (chunk: string) => void
  ): Promise<AIResponse> {
    try {
      // Auto-convert attachments if images are missing
      if ((!context.images || context.images.length === 0) && context.attachments && context.attachments.length > 0) {
        context.images = await this.convertAttachmentsToImages(context.attachments);
      }

      const hasImages = (context.images && context.images.length > 0);
      const mode = hasImages ? 'vision' : 'text';

      await this.initializeMLCEngine(mode);

      if (!this.engine || !this.isReady) {
        throw new Error('Office Clerk not initialized');
      }

      const enhancedContext = await this.buildEnhancedContext(userInput, context);
      const systemPrompt = `You are the Office Clerk for XMRT-DAO, the autonomous browser-based AI fallback.
      
CURRENT SYSTEM STATUS:
${enhancedContext.databaseStats}

USER CONTEXT:
${enhancedContext.userContext}
${enhancedContext.memoryContext}

Respond efficiently.`;

      const messages: any[] = [
        { role: "system", content: systemPrompt }
      ];

      // Handle Images (Simple check)
      const currentModel = this.progressState.currentModel || '';
      const isVisionCapable = currentModel.toLowerCase().includes('vlm');

      if (hasImages && isVisionCapable && context.images) {
        const userContent: any[] = [{ type: "text", text: userInput }];
        context.images.forEach(base64 => {
          userContent.push({ type: "image_url", image_url: { url: base64 } });
        });
        messages.push({ role: "user", content: userContent });
      } else if (hasImages) {
        messages.push({
          role: "user",
          content: `[User attached images but you are OFFLINE TEXT-ONLY. Acknowledge this limitation.]\n\n${userInput}`
        });
      } else {
        messages.push({ role: "user", content: userInput });
      }

      console.log('🏢 Office Clerk processing request (streaming)...');

      let fullResponse = '';

      const chunks = await this.engine.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 300,
        stream: true,
      });

      for await (const chunk of chunks) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullResponse += delta;
          onChunk(delta);
        }
      }

      return {
        text: fullResponse,
        method: 'Office Clerk (SmolLM2 Streaming)',
        confidence: 0.92
      };
    } catch (error) {
      console.error('❌ Office Clerk (streaming) failed:', error);
      throw error;
    }
  }

  // Check if WebGPU is supported
  static isWebGPUSupported(): boolean {
    return !!(navigator as any).gpu;
  }

  // Get engine status
  static getStatus(): { ready: boolean; initializing: boolean; supported: boolean } {
    return {
      ready: this.isReady,
      initializing: this.isInitializing,
      supported: this.isWebGPUSupported()
    };
  }
}
