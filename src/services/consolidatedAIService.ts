/**
 * Consolidated AI Service
 * Merges: fallbackAIService, multimodalGeminiService, geminiImageService, harpaAIService
 * 
 * Provides unified AI interface with automatic provider selection and fallback
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[]; // Base64 or URLs
}

interface AIOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  includeImages?: boolean;
}

interface AIProvider {
  name: string;
  chat: (messages: AIMessage[], options?: AIOptions) => Promise<string>;
  isAvailable: () => boolean;
  supportsImages: boolean;
}

class ConsolidatedAIService {
  private providers: AIProvider[] = [];
  private currentProvider: AIProvider | null = null;
  private geminiClient: GoogleGenerativeAI | null = null;

  constructor() {
    this.setupProviders();
  }

  private setupProviders() {
    // Provider 1: Gemini (supports multimodal)
    this.providers.push({
      name: 'Gemini',
      supportsImages: true,
      isAvailable: () => !!import.meta.env.VITE_GEMINI_API_KEY,
      chat: async (messages: AIMessage[], options?: AIOptions) => {
        if (!this.geminiClient) {
          this.geminiClient = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
        }

        const model = this.geminiClient.getGenerativeModel({ 
          model: 'gemini-2.0-flash-exp',
          generationConfig: {
            temperature: options?.temperature || 0.7,
            maxOutputTokens: options?.maxTokens || 2048
          }
        });

        // Build conversation history
        const history = messages.slice(0, -1).map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        }));

        const chat = model.startChat({ history });
        
        // Handle last message with potential images
        const lastMessage = messages[messages.length - 1];
        let parts: any[] = [{ text: lastMessage.content }];

        if (lastMessage.images && lastMessage.images.length > 0) {
          // Add images to the request
          for (const imageData of lastMessage.images) {
            // Assuming base64 images
            const base64Data = imageData.split(',')[1] || imageData;
            parts.push({
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data
              }
            });
          }
        }

        const result = await chat.sendMessage(parts);
        return result.response.text();
      }
    });

    // Provider 2: OpenAI (fallback for text)
    this.providers.push({
      name: 'OpenAI',
      supportsImages: false,
      isAvailable: () => !!import.meta.env.VITE_OPENAI_API_KEY,
      chat: async (messages: AIMessage[], options?: AIOptions) => {
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
        
        const formattedMessages = messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }));

        if (options?.systemPrompt) {
          formattedMessages.unshift({
            role: 'system',
            content: options.systemPrompt
          });
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: formattedMessages,
            temperature: options?.temperature || 0.7,
            max_tokens: options?.maxTokens || 2048
          })
        });

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
      }
    });

    // Provider 3: Edge function fallback (uses Supabase edge functions)
    this.providers.push({
      name: 'EdgeFunction',
      supportsImages: false,
      isAvailable: () => true, // Always available as last resort
      chat: async (messages: AIMessage[], options?: AIOptions) => {
        const { supabase } = await import('@/integrations/supabase/client');
        
        const { data, error } = await supabase.functions.invoke('gemini-chat', {
          body: { 
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            temperature: options?.temperature,
            maxTokens: options?.maxTokens
          }
        });

        if (error) throw error;
        return data.response;
      }
    });
  }

  async chat(messages: AIMessage[], options?: AIOptions): Promise<string> {
    // Determine if we need image support
    const needsImages = messages.some(m => m.images && m.images.length > 0);

    // Try providers in order
    for (const provider of this.providers) {
      // Skip if images needed but provider doesn't support
      if (needsImages && !provider.supportsImages) continue;
      
      if (!provider.isAvailable()) continue;

      try {
        const response = await provider.chat(messages, options);
        this.currentProvider = provider;
        return response;
      } catch (error) {
        console.warn(`${provider.name} failed:`, error);
        continue;
      }
    }

    throw new Error('All AI providers failed');
  }

  async analyzeImage(imageData: string, prompt: string): Promise<string> {
    return this.chat([
      {
        role: 'user',
        content: prompt,
        images: [imageData]
      }
    ]);
  }

  getCurrentProvider(): string {
    return this.currentProvider?.name || 'None';
  }

  async streamChat(
    messages: AIMessage[], 
    options: AIOptions,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    // Streaming implementation for real-time responses
    if (!this.geminiClient && import.meta.env.VITE_GEMINI_API_KEY) {
      this.geminiClient = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
    }

    if (this.geminiClient) {
      const model = this.geminiClient.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      const lastMessage = messages[messages.length - 1];
      
      const result = await model.generateContentStream(lastMessage.content);
      
      for await (const chunk of result.stream) {
        const text = chunk.text();
        onChunk(text);
      }
    } else {
      // Fallback to non-streaming
      const response = await this.chat(messages, options);
      onChunk(response);
    }
  }
}

export const consolidatedAI = new ConsolidatedAIService();

