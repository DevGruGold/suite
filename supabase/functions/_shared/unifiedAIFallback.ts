/**
 * Unified AI Fallback Service
 * Provides resilient AI calls with Lovable → DeepSeek → Kimi → Gemini cascade
 * 
 * ENHANCED: Now includes full Eliza intelligence (system prompt, tools, memory)
 * to ensure ALL fallback providers are equally intelligent as lovable-chat.
 * 
 * TIMEOUT GUARDS: Per-provider timeouts prevent cascade hangs
 * FAST-FAIL: 402/429 errors skip immediately to next provider
 */

import { generateElizaSystemPrompt } from './elizaSystemPrompt.ts';
import { ELIZA_TOOLS } from './elizaTools.ts';

// Per-provider timeout configuration (ms)
const PROVIDER_TIMEOUTS = {
  lovable: 8000,
  deepseek: 10000, // Slightly longer for reasoning
  kimi: 8000,
  vertexai: 8000, // Vertex AI Express Mode
  gemini: 8000,
  embedding: 10000,
};

/**
 * Fetch with timeout - aborts request if provider is slow/hung
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Fast-fail check for credit exhaustion/rate limiting
 * Returns error message if should skip, null if OK to proceed
 */
function checkFastFail(response: Response, provider: string): string | null {
  if (response.status === 402) {
    console.warn(`💳 ${provider} out of credits (402) - skipping to next provider`);
    return '402 Payment Required - out of credits';
  }
  if (response.status === 429) {
    console.warn(`⏱️ ${provider} rate limited (429) - skipping to next provider`);
    return '429 Rate Limited';
  }
  return null;
}

export interface UnifiedAIOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  max_tokens?: number; // Alias for compatibility
  systemPrompt?: string;
  tools?: Array<any>;
  preferProvider?: 'lovable' | 'deepseek' | 'kimi' | 'vertexai' | 'gemini';
  // Eliza intelligence context
  userContext?: any;
  miningStats?: any;
  executiveName?: string;
  useFullElizaContext?: boolean; // Default true - use full Eliza intelligence
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  tool_calls?: any;
}

interface ProviderResult {
  success: boolean;
  content?: string;
  message?: any;
  provider: string;
  error?: string;
}

// Action-oriented directive prepended to ALL fallback prompts
const ACTION_DIRECTIVE = `
CRITICAL RESPONSE RULES (HIGHEST PRIORITY):
1. NEVER explain what you're going to do - JUST DO IT
2. Call tools IMMEDIATELY when user asks for information
3. Present results NATURALLY as if you already knew the answer
4. Keep responses CONCISE - no unnecessary preamble (1-3 sentences for simple queries)
5. Only mention tools/functions when there's an ERROR to report
6. User should NEVER know you're calling tools - be seamless
`;

/**
 * Get the effective system prompt - uses full Eliza prompt if not provided
 * ENHANCED: Prepends action-oriented directive to ensure concise, action-first responses
 */
function getEffectiveSystemPrompt(options: UnifiedAIOptions): string {
  if (options.systemPrompt && options.systemPrompt.length > 1000) {
    // Already has rich context - prepend action directive
    return ACTION_DIRECTIVE + '\n\n' + options.systemPrompt;
  }
  
  if (options.useFullElizaContext === false) {
    // Explicitly disabled - still add action directive for conciseness
    return ACTION_DIRECTIVE + '\n\n' + (options.systemPrompt || 'You are a helpful AI assistant.');
  }
  
  // DEFAULT: Use full Eliza system prompt for intelligence parity
  console.log('🧠 Enriching with full Eliza system prompt + action directive...');
  const elizaPrompt = generateElizaSystemPrompt(
    options.userContext,
    options.miningStats,
    null,
    'eliza',
    options.executiveName || 'Chief Strategy Officer'
  );
  return ACTION_DIRECTIVE + '\n\n' + elizaPrompt;
}

/**
 * Get effective tools - uses ELIZA_TOOLS if not provided
 */
function getEffectiveTools(options: UnifiedAIOptions): any[] {
  if (options.tools && options.tools.length > 0) {
    return options.tools;
  }
  
  if (options.useFullElizaContext === false) {
    return [];
  }
  
  // DEFAULT: Use full Eliza tools for capability parity
  console.log('🔧 Including all ELIZA_TOOLS for fallback provider...');
  return ELIZA_TOOLS;
}

/**
 * Call DeepSeek API directly
 */
async function callDeepSeek(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<ProviderResult> {
  const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
  
  if (!DEEPSEEK_API_KEY) {
    return { success: false, provider: 'deepseek', error: 'DEEPSEEK_API_KEY not configured' };
  }

  try {
    console.log('🔄 Attempting DeepSeek AI with full Eliza context...');
    
    const effectiveSystemPrompt = getEffectiveSystemPrompt(options);
    const effectiveTools = getEffectiveTools(options);
    
    const requestMessages = [
      { role: 'system', content: effectiveSystemPrompt },
      ...messages.filter(m => m.role !== 'system')
    ];

    const maxTokens = options.maxTokens || options.max_tokens || 8000;
    
    const requestBody: any = {
      model: 'deepseek-chat',
      messages: requestMessages,
      temperature: options.temperature || 0.7,
      max_tokens: maxTokens,
    };
    
    // Include ALL tools for full capability - no artificial limits
    if (effectiveTools.length > 0) {
      console.log(`📊 DeepSeek: Passing ${effectiveTools.length} tools (full array)`);
      requestBody.tools = effectiveTools;
      requestBody.tool_choice = 'auto';
    }

    const response = await fetchWithTimeout(
      'https://api.deepseek.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
      PROVIDER_TIMEOUTS.deepseek
    );

    // Fast-fail for credit exhaustion
    const fastFailError = checkFastFail(response, 'deepseek');
    if (fastFailError) {
      return { success: false, provider: 'deepseek', error: fastFailError };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ DeepSeek failed (${response.status}):`, errorText);
      return { success: false, provider: 'deepseek', error: `${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    if (!message) {
      return { success: false, provider: 'deepseek', error: 'No message in response' };
    }

    console.log('✅ DeepSeek AI successful with Eliza intelligence');
    
    if (message.tool_calls?.length > 0) {
      console.log(`🔧 DeepSeek returned ${message.tool_calls.length} tool calls`);
      return { success: true, provider: 'deepseek', message };
    }
    
    return { success: true, provider: 'deepseek', content: message.content || '' };
  } catch (error) {
    console.warn('⚠️ DeepSeek error:', error.message);
    return { success: false, provider: 'deepseek', error: error.message };
  }
}

/**
 * Call Lovable AI Gateway
 */
async function callLovable(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<ProviderResult> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    return { success: false, provider: 'lovable', error: 'LOVABLE_API_KEY not configured' };
  }

  try {
    console.log('🌐 Attempting Lovable AI Gateway with full Eliza context...');
    
    const effectiveSystemPrompt = getEffectiveSystemPrompt(options);
    const effectiveTools = getEffectiveTools(options);
    
    const requestMessages = [
      { role: 'system', content: effectiveSystemPrompt },
      ...messages.filter(m => m.role !== 'system')
    ];

    const maxTokens = options.maxTokens || options.max_tokens || 2000;

    const requestBody: any = {
      model: options.model || 'google/gemini-2.5-flash',
      messages: requestMessages,
      temperature: options.temperature || 0.7,
      max_tokens: maxTokens,
    };

    // Include ALL tools - Lovable AI Gateway supports 100+ tools
    if (effectiveTools.length > 0) {
      console.log(`📊 Lovable Gateway: Passing ${effectiveTools.length} tools (full array)`);
      requestBody.tools = effectiveTools;
      requestBody.tool_choice = 'auto';
    }

    const response = await fetchWithTimeout(
      'https://ai.gateway.lovable.dev/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
      PROVIDER_TIMEOUTS.lovable
    );

    // Fast-fail for credit exhaustion
    const fastFailError = checkFastFail(response, 'lovable');
    if (fastFailError) {
      return { success: false, provider: 'lovable', error: fastFailError };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ Lovable AI Gateway failed (${response.status}):`, errorText);
      return { success: false, provider: 'lovable', error: `${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    if (!message) {
      return { success: false, provider: 'lovable', error: 'No message in response' };
    }

    console.log('✅ Lovable AI Gateway successful');
    
    if (message.tool_calls?.length > 0) {
      console.log(`🔧 Lovable returned ${message.tool_calls.length} tool calls`);
      return { success: true, provider: 'lovable', message };
    }
    
    return { success: true, provider: 'lovable', content: message.content || '' };
  } catch (error) {
    console.warn('⚠️ Lovable AI Gateway error:', error.message);
    return { success: false, provider: 'lovable', error: error.message };
  }
}

/**
 * Call Kimi K2 via OpenRouter API
 */
async function callKimi(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<ProviderResult> {
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  
  if (!OPENROUTER_API_KEY) {
    return { success: false, provider: 'kimi', error: 'OPENROUTER_API_KEY not configured' };
  }

  try {
    console.log('🦊 Attempting Kimi K2 via OpenRouter with full Eliza context...');
    
    const effectiveSystemPrompt = getEffectiveSystemPrompt(options);
    const effectiveTools = getEffectiveTools(options);
    
    const requestMessages = [
      { role: 'system', content: effectiveSystemPrompt },
      ...messages.filter(m => m.role !== 'system')
    ];

    const maxTokens = options.maxTokens || options.max_tokens || 2000;

    const requestBody: any = {
      model: 'moonshotai/kimi-k2',
      messages: requestMessages,
      temperature: options.temperature || 0.7,
      max_tokens: maxTokens, // Reduced for credit limits
    };
    
    // Include ALL tools for Kimi
    if (effectiveTools.length > 0) {
      console.log(`📊 Kimi K2: Passing ${effectiveTools.length} tools (full array)`);
      requestBody.tools = effectiveTools;
      requestBody.tool_choice = 'auto';
    }

    const response = await fetchWithTimeout(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://xmrt.pro',
          'X-Title': 'XMRT Eliza'
        },
        body: JSON.stringify(requestBody),
      },
      PROVIDER_TIMEOUTS.kimi
    );

    // Fast-fail for credit exhaustion
    const fastFailError = checkFastFail(response, 'kimi');
    if (fastFailError) {
      return { success: false, provider: 'kimi', error: fastFailError };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ Kimi K2 failed (${response.status}):`, errorText);
      return { success: false, provider: 'kimi', error: `${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    if (!message) {
      return { success: false, provider: 'kimi', error: 'No message in response' };
    }

    console.log('✅ Kimi K2 successful with Eliza intelligence');
    
    if (message.tool_calls?.length > 0) {
      console.log(`🔧 Kimi returned ${message.tool_calls.length} tool calls`);
      return { success: true, provider: 'kimi', message };
    }
    
    return { success: true, provider: 'kimi', content: message.content || '' };
  } catch (error) {
    console.warn('⚠️ Kimi K2 error:', error.message);
    return { success: false, provider: 'kimi', error: error.message };
  }
}

/**
 * Call Gemini API directly with tool calling support
 */
async function callGemini(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<ProviderResult> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  
  if (!GEMINI_API_KEY) {
    return { success: false, provider: 'gemini', error: 'GEMINI_API_KEY not configured' };
  }

  try {
    console.log('💎 Attempting Gemini AI with full Eliza context...');
    
    const effectiveSystemPrompt = getEffectiveSystemPrompt(options);
    const effectiveTools = getEffectiveTools(options);
    
    // Convert messages to Gemini format (excluding system messages)
    const userMessages = messages.filter(m => m.role !== 'system');
    const contents = userMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const maxTokens = options.maxTokens || options.max_tokens || 2000;

    const requestBody: any = {
      contents,
      systemInstruction: { parts: [{ text: effectiveSystemPrompt }] },
      generationConfig: {
        temperature: options.temperature || 0.7,
        maxOutputTokens: maxTokens,
      },
    };
    
    // Add ALL tool definitions for Gemini (convert to Gemini format)
    if (effectiveTools.length > 0) {
      console.log(`📊 Gemini: Passing ${effectiveTools.length} tools (full array)`);
      requestBody.tools = [{
        functionDeclarations: effectiveTools.map(tool => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters
        }))
      }];
    }

    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
      PROVIDER_TIMEOUTS.gemini
    );

    // Fast-fail for credit exhaustion
    const fastFailError = checkFastFail(response, 'gemini');
    if (fastFailError) {
      return { success: false, provider: 'gemini', error: fastFailError };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ Gemini failed (${response.status}):`, errorText);
      return { success: false, provider: 'gemini', error: `${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts;
    
    if (!parts || parts.length === 0) {
      return { success: false, provider: 'gemini', error: 'No content in response' };
    }

    console.log('✅ Gemini AI successful with Eliza intelligence');
    
    // Check for function calls (Gemini's tool call format)
    const functionCall = parts.find((p: any) => p.functionCall);
    if (functionCall) {
      console.log(`🔧 Gemini returned function call: ${functionCall.functionCall.name}`);
      // Convert to OpenAI format for compatibility
      return {
        success: true,
        provider: 'gemini',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: `gemini_${Date.now()}`,
            type: 'function',
            function: {
              name: functionCall.functionCall.name,
              arguments: JSON.stringify(functionCall.functionCall.args || {})
            }
          }]
        }
      };
    }
    
    const content = parts[0]?.text || '';
    return { success: true, provider: 'gemini', content };
  } catch (error) {
    console.warn('⚠️ Gemini error:', error.message);
    return { success: false, provider: 'gemini', error: error.message };
  }
}

/**
 * Call Vertex AI Express Mode with tool calling support
 */
async function callVertexAI(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<ProviderResult> {
  const VERTEX_AI_API_KEY = Deno.env.get('VERTEX_AI_API_KEY');
  
  if (!VERTEX_AI_API_KEY) {
    return { success: false, provider: 'vertexai', error: 'VERTEX_AI_API_KEY not configured' };
  }

  try {
    console.log('🔷 Attempting Vertex AI Express with full Eliza context...');
    
    const effectiveSystemPrompt = getEffectiveSystemPrompt(options);
    const effectiveTools = getEffectiveTools(options);
    
    // Convert messages to Vertex AI format
    const userMessages = messages.filter(m => m.role !== 'system');
    const contents = userMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const maxTokens = options.maxTokens || options.max_tokens || 2000;
    const model = options.model || 'gemini-2.5-flash';

    const requestBody: any = {
      contents,
      systemInstruction: { parts: [{ text: effectiveSystemPrompt }] },
      generationConfig: {
        temperature: options.temperature || 0.7,
        maxOutputTokens: maxTokens,
      },
    };
    
    // Add ALL tool definitions (Vertex AI uses same format as Gemini)
    if (effectiveTools.length > 0) {
      console.log(`📊 Vertex AI: Passing ${effectiveTools.length} tools (full array)`);
      requestBody.tools = [{
        functionDeclarations: effectiveTools.map(tool => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters
        }))
      }];
    }

    const response = await fetchWithTimeout(
      `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${VERTEX_AI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
      PROVIDER_TIMEOUTS.vertexai
    );

    // Fast-fail for rate limiting (free tier is 10 RPM)
    const fastFailError = checkFastFail(response, 'vertexai');
    if (fastFailError) {
      return { success: false, provider: 'vertexai', error: fastFailError };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ Vertex AI failed (${response.status}):`, errorText);
      return { success: false, provider: 'vertexai', error: `${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts;
    
    if (!parts || parts.length === 0) {
      return { success: false, provider: 'vertexai', error: 'No content in response' };
    }

    console.log('✅ Vertex AI Express successful with Eliza intelligence');
    
    // Check for function calls
    const functionCall = parts.find((p: any) => p.functionCall);
    if (functionCall) {
      console.log(`🔧 Vertex AI returned function call: ${functionCall.functionCall.name}`);
      return {
        success: true,
        provider: 'vertexai',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: `vertexai_${Date.now()}`,
            type: 'function',
            function: {
              name: functionCall.functionCall.name,
              arguments: JSON.stringify(functionCall.functionCall.args || {})
            }
          }]
        }
      };
    }
    
    const content = parts[0]?.text || '';
    return { success: true, provider: 'vertexai', content };
  } catch (error) {
    console.warn('⚠️ Vertex AI error:', error.message);
    return { success: false, provider: 'vertexai', error: error.message };
  }
}

/**
 * Unified AI call with automatic fallback cascade
 * Order: Lovable → DeepSeek → Kimi → Vertex AI → Gemini
 * 
 * ENHANCED: All providers now receive full Eliza intelligence context
 * 
 * Returns either the content string (for text responses) or full message object (for tool calls)
 */
export async function callAIWithFallback(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<string | any> {
  const errors: string[] = [];
  
  // Log context enrichment
  console.log('🧠 callAIWithFallback: Using full Eliza intelligence context for all providers');
  
  // Define provider order based on preference
  // Default cascade: Lovable → DeepSeek → Kimi → Vertex AI → Gemini
  const providers = options.preferProvider === 'deepseek'
    ? [callDeepSeek, callLovable, callKimi, callVertexAI, callGemini]
    : options.preferProvider === 'kimi'
    ? [callKimi, callLovable, callDeepSeek, callVertexAI, callGemini]
    : options.preferProvider === 'gemini'
    ? [callGemini, callLovable, callDeepSeek, callKimi, callVertexAI]
    : options.preferProvider === 'vertexai'
    ? [callVertexAI, callLovable, callDeepSeek, callKimi, callGemini]
    : [callLovable, callDeepSeek, callKimi, callVertexAI, callGemini]; // Default: Lovable first

  for (const providerFn of providers) {
    const result = await providerFn(messages, options);
    
    if (result.success) {
      // Return full message object if tool calls present
      if (result.message) {
        return { ...result.message, provider: result.provider };
      }
      return { content: result.content || '', provider: result.provider };
    }
    
    errors.push(`${result.provider}: ${result.error}`);
  }

  // All providers failed
  const errorSummary = errors.join('; ');
  console.error('❌ All AI providers failed:', errorSummary);
  throw new Error(`All AI providers failed: ${errorSummary}`);
}

/**
 * Simple text generation with fallback (convenience wrapper)
 * Returns { content, provider } for tracking which AI provider was used
 */
export async function generateTextWithFallback(
  prompt: string,
  systemPrompt?: string,
  options: Omit<UnifiedAIOptions, 'systemPrompt'> = {}
): Promise<{ content: string; provider: string }> {
  const timeoutMs = options.maxTokens && options.maxTokens > 4000 ? 25000 : 15000;
  
  // Race against timeout to prevent cron job hangs
  const aiPromise = callAIWithFallback(
    [{ role: 'user', content: prompt }],
    { ...options, systemPrompt }
  );
  
  const timeoutPromise = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error('AI generation timeout')), timeoutMs)
  );
  
  const result = await Promise.race([aiPromise, timeoutPromise]);
  
  // Handle case where result might be a message object with tool calls
  if (typeof result === 'object' && result.content !== undefined) {
    return { content: result.content, provider: result.provider || 'unknown' };
  }
  
  const content = typeof result === 'string' ? result : JSON.stringify(result);
  return { content, provider: 'unknown' };
}

/**
 * Check which AI providers are available
 */
export function getAvailableProviders(): string[] {
  const available: string[] = [];
  
  if (Deno.env.get('LOVABLE_API_KEY')) available.push('lovable');
  if (Deno.env.get('DEEPSEEK_API_KEY')) available.push('deepseek');
  if (Deno.env.get('OPENROUTER_API_KEY')) available.push('kimi');
  if (Deno.env.get('VERTEX_AI_API_KEY')) available.push('vertexai');
  if (Deno.env.get('GEMINI_API_KEY')) available.push('gemini');
  
  return available;
}

/**
 * Legacy alias for backward compatibility
 * Routes through the unified fallback cascade
 */
export async function callLovableAIGateway(
  messages: Array<{ role: string; content: string; tool_calls?: any }>,
  options: UnifiedAIOptions = {}
): Promise<any> {
  const result = await callAIWithFallback(messages as AIMessage[], options);
  
  // Return in legacy format for compatibility
  if (typeof result === 'object' && result.message) {
    return result.message;
  }
  if (typeof result === 'object' && result.content) {
    return result.content;
  }
  return result;
}

/**
 * Generate text embeddings using Gemini with timeout protection
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  
  if (!GEMINI_API_KEY) {
    throw new Error('Embedding generation requires GEMINI_API_KEY');
  }

  console.log('🧠 Generating embedding via Gemini...');
  
  // Use fetchWithTimeout to prevent hanging
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] }
      }),
    },
    10000 // 10 second timeout for embeddings
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Gemini embedding failed:', errorText);
    throw new Error(`Gemini embedding failed: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log('✅ Embedding generated successfully');
  return data.embedding.values;
}
