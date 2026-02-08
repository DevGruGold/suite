/**
 * Enhanced Fallback AI Service
 * 
 * Priority Chain:
 * 1. MLC-LLM (WebLLM): Uses WebGPU + SmolLM2-1.7B-Instruct (High Quality, Vision support)
 * 2. Transformers.js (WASM): Uses CPU + SmolLM2-135M-Instruct (Low Quality, Text only, Universal Compat)
 * 
 * This ensures the best available offline experience while maintaining a "last resort" fallback.
 */

import { pipeline, env } from '@huggingface/transformers';
import { xmrtKnowledge } from '../data/xmrtKnowledgeBase';
import type { MiningStats } from '../services/unifiedDataService';
import { supabase } from '@/integrations/supabase/client';
import { memoryContextService } from './memoryContextService';
import { MLCLLMService } from './mlcLLMService';

// Configure transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

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

export class FallbackAIService {
  private static textGenerationPipeline: any = null;
  private static isInitializingWasm = false;
  private static contextCache: Map<string, { data: any; timestamp: number }> = new Map();
  private static CACHE_DURATION = {
    knowledge: 5 * 60 * 1000, // 5 minutes
    stats: 1 * 60 * 1000, // 1 minute
  };

  // Initialize SmolLM2-135M (WASM/CPU)
  private static async initializeWasmAI(): Promise<void> {
    if (this.isInitializingWasm) return;

    this.isInitializingWasm = true;
    try {
      console.log('🏢 Initializing Office Clerk (WASM Fallback)...');

      this.textGenerationPipeline = await pipeline(
        'text-generation',
        'HuggingFaceTB/SmolLM2-135M-Instruct',
        {
          device: 'wasm',
          dtype: 'fp32'
        }
      );
      console.log('✅ Office Clerk ready (WASM/CPU)');
    } catch (error) {
      console.error('❌ Office Clerk (WASM) initialization failed:', error);
      this.textGenerationPipeline = null;
    } finally {
      this.isInitializingWasm = false;
    }
  }

  // Helper: Database Stats
  private static async getDatabaseStats(): Promise<string> {
    const cacheKey = 'db_stats';
    const cached = this.contextCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION.stats) {
      return cached.data;
    }

    try {
      const stats: string[] = [];
      const { data: devices } = await supabase.from('active_devices_view').select('id').limit(100);
      if (devices) stats.push(`Active Mining Devices: ${devices.length}`);

      const result = stats.join('\n') || 'Database stats unavailable';
      this.contextCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch {
      return 'Real-time stats unavailable';
    }
  }

  // Helper: Memory Context
  private static async getMemoryContext(userId: string, userInput: string): Promise<string> {
    try {
      const memories = await memoryContextService.getRelevantContexts(userId, 3, userInput);
      if (memories.length === 0) return '';
      return `\nRECENT CONVERSATION CONTEXT:\n${memories.map(m => `- ${m.content}`).join('\n')}`;
    } catch {
      return '';
    }
  }

  // Helper: Build Context
  private static async buildEnhancedContext(
    userInput: string,
    context: { miningStats?: MiningStats; userContext?: any }
  ): Promise<EnhancedContext> {
    const relevantKnowledge = xmrtKnowledge.searchKnowledge(userInput);
    const knowledgeContext = relevantKnowledge
      .slice(0, 3)
      .map(k => `[${k.topic}] ${k.content.slice(0, 200)}`)
      .join('\n\n');

    const databaseStats = await this.getDatabaseStats();
    const userContextStr = context.userContext ? JSON.stringify(context.userContext, null, 2) : 'No user context available';
    const sessionKey = context.userContext?.sessionKey || 'unknown';
    const memoryContext = await this.getMemoryContext(sessionKey, userInput);

    return {
      knowledgeBase: knowledgeContext,
      databaseStats,
      conversationHistory: '',
      userContext: userContextStr,
      memoryContext
    };
  }

  // Generate Response via WASM (fallback)
  private static async generateWasmResponse(
    userInput: string,
    context: { miningStats?: MiningStats; userContext?: any }
  ): Promise<AIResponse> {
    try {
      await this.initializeWasmAI();

      if (!this.textGenerationPipeline) {
        throw new Error('WASM model not initialized');
      }

      console.log('🏢 Office Clerk (WASM) processing...');
      const enhancedContext = await this.buildEnhancedContext(userInput, context);

      const systemPrompt = `You are the Office Clerk for XMRT-DAO (WASM Mode).
      
CTX:
${enhancedContext.databaseStats}
${enhancedContext.knowledgeBase}

User: ${userInput}
Clerk:`;

      const result = await this.textGenerationPipeline(systemPrompt, {
        max_new_tokens: 100,
        temperature: 0.6,
        do_sample: false, // Greedy for speed
        return_full_text: false,
      });

      const generatedText = result[0]?.generated_text?.trim() || '';
      const cleanResponse = generatedText.replace(/^(Response:|Answer:|Office Clerk:|Assistant:)/i, '').trim();

      if (cleanResponse) {
        return {
          text: cleanResponse + '\n\n*(Generated via Offline CPU Fallback)*',
          method: 'Office Clerk (WASM/CPU)',
          confidence: 0.7
        };
      }
      throw new Error('Empty WASM response');
    } catch (error) {
      console.error('❌ WASM Fallback failed:', error);
      throw error;
    }
  }

  // MAIN ENTRY POINT
  static async generateResponse(
    userInput: string,
    context: {
      miningStats?: MiningStats;
      userContext?: any;
      images?: string[];
      attachments?: File[];
    } = {}
  ): Promise<AIResponse> {

    // 1. Try MLC-LLM (WebGPU - High Quality & Vision)
    try {
      if (MLCLLMService.isWebGPUSupported()) {
        console.log('🚀 Attempting High-Performance Offline AI (WebLLM)...');
        const mlcResponse = await MLCLLMService.generateConversationResponse(userInput, context);
        return mlcResponse;
      }
    } catch (mlcError) {
      console.warn('⚠️ WebLLM failed, trying WASM fallback:', mlcError);
    }

    // 2. Try WASM (CPU - Low Quality, Text Only)
    try {
      console.log('⚠️ Falling back to Lightweight Offline AI (WASM)...');

      // Notify about ignored images if present
      const hasImages = (context.images?.length ?? 0) > 0 || (context.attachments?.length ?? 0) > 0;
      let prompt = userInput;
      if (hasImages) {
        prompt += '\n\n(System Note: User attached images, but you are in basic text-only offline mode. Ignore images.)';
      }

      const wasmResponse = await this.generateWasmResponse(prompt, context);
      return wasmResponse;
    } catch (wasmError) {
      console.error('❌ All Offline AI methods failed:', wasmError);
    }

    // 3. Ultimate Fallback
    throw new Error(
      '🚨 ALL SYSTEMS OFFLINE. Unable to generate response.\n' +
      'Please check your connection or enable WebGPU support.'
    );
  }
}