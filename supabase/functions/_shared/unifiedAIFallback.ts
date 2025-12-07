/**
 * Unified AI Fallback Service
 * Provides resilient AI calls with Lovable → DeepSeek → Gemini cascade
 * Ensures edge functions never fail due to single provider outages
 */

export interface UnifiedAIOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  systemPrompt?: string;
  tools?: Array<any>;
  preferProvider?: 'lovable' | 'deepseek' | 'kimi' | 'gemini';
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
    console.log('🔄 Attempting DeepSeek AI...');
    
    const requestMessages = options.systemPrompt
      ? [{ role: 'system', content: options.systemPrompt }, ...messages]
      : messages;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: requestMessages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 4000,
        ...(options.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
      }),
    });

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

    console.log('✅ DeepSeek AI successful');
    
    // Return full message if tool calls present
    if (message.tool_calls?.length > 0) {
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
    console.log('🌐 Attempting Lovable AI Gateway...');
    
    const requestMessages = options.systemPrompt
      ? [{ role: 'system', content: options.systemPrompt }, ...messages]
      : messages;

    const requestBody: any = {
      model: options.model || 'google/gemini-2.5-flash',
      messages: requestMessages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 2000,
    };

    if (options.tools?.length) {
      requestBody.tools = options.tools.slice(0, 39); // Limit tools
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

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
    console.log('🦊 Attempting Kimi K2 via OpenRouter...');
    
    const requestMessages = options.systemPrompt
      ? [{ role: 'system', content: options.systemPrompt }, ...messages]
      : messages;

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
        messages: requestMessages,
        temperature: options.temperature || 0.9,
        max_tokens: options.max_tokens || 8000,
      }),
    });

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

    console.log('✅ Kimi K2 successful');
    
    if (message.tool_calls?.length > 0) {
      return { success: true, provider: 'kimi', message };
    }
    
    return { success: true, provider: 'kimi', content: message.content || '' };
  } catch (error) {
    console.warn('⚠️ Kimi K2 error:', error.message);
    return { success: false, provider: 'kimi', error: error.message };
  }
}

/**
 * Call Gemini API directly
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
    console.log('💎 Attempting Gemini AI...');
    
    // Convert messages to Gemini format
    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    // Add system instruction if provided
    const systemInstruction = options.systemPrompt
      ? { parts: [{ text: options.systemPrompt }] }
      : undefined;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction,
          generationConfig: {
            temperature: options.temperature || 0.7,
            maxOutputTokens: options.max_tokens || 2000,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ Gemini failed (${response.status}):`, errorText);
      return { success: false, provider: 'gemini', error: `${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      return { success: false, provider: 'gemini', error: 'No content in response' };
    }

    console.log('✅ Gemini AI successful');
    return { success: true, provider: 'gemini', content };
  } catch (error) {
    console.warn('⚠️ Gemini error:', error.message);
    return { success: false, provider: 'gemini', error: error.message };
  }
}

/**
 * Unified AI call with automatic fallback cascade
 * Order: Lovable → DeepSeek → Gemini
 * 
 * Returns either the content string (for text responses) or full message object (for tool calls)
 */
export async function callAIWithFallback(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<string | any> {
  const errors: string[] = [];
  
  // Define provider order based on preference
  // Default cascade: Lovable → DeepSeek → Kimi → Gemini
  const providers = options.preferProvider === 'deepseek'
    ? [callDeepSeek, callLovable, callKimi, callGemini]
    : options.preferProvider === 'kimi'
    ? [callKimi, callLovable, callDeepSeek, callGemini]
    : options.preferProvider === 'gemini'
    ? [callGemini, callLovable, callDeepSeek, callKimi]
    : [callLovable, callDeepSeek, callKimi, callGemini]; // Default: Lovable first

  for (const providerFn of providers) {
    const result = await providerFn(messages, options);
    
    if (result.success) {
      // Return full message object if tool calls present
      if (result.message) {
        return result.message;
      }
      return result.content || '';
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
 */
export async function generateTextWithFallback(
  prompt: string,
  systemPrompt?: string,
  options: Omit<UnifiedAIOptions, 'systemPrompt'> = {}
): Promise<string> {
  const result = await callAIWithFallback(
    [{ role: 'user', content: prompt }],
    { ...options, systemPrompt }
  );
  
  // Handle case where result might be a message object with tool calls
  if (typeof result === 'object' && result.content) {
    return result.content;
  }
  
  return typeof result === 'string' ? result : JSON.stringify(result);
}

/**
 * Check which AI providers are available
 */
export function getAvailableProviders(): string[] {
  const available: string[] = [];
  
  if (Deno.env.get('LOVABLE_API_KEY')) available.push('lovable');
  if (Deno.env.get('DEEPSEEK_API_KEY')) available.push('deepseek');
  if (Deno.env.get('OPENROUTER_API_KEY')) available.push('kimi');
  if (Deno.env.get('GEMINI_API_KEY')) available.push('gemini');
  
  return available;
}
