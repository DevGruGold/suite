/**
 * Backend AI Gateway Fallback
 * Provides Lovable AI Gateway access for all edge functions
 * Auto-fallback to DeepSeek when Lovable fails (402/429/500)
 */

export interface AIGatewayOptions {
  model?: 'google/gemini-2.5-flash' | 'google/gemini-2.5-pro' | 'openai/gpt-5-mini';
  temperature?: number;
  max_tokens?: number;
  systemPrompt?: string;
  tools?: Array<any>;
}

/**
 * Call Kimi K2 via OpenRouter as fallback
 */
async function callKimiFallback(
  messages: Array<{ role: string; content: string }>,
  options: AIGatewayOptions = {}
): Promise<any> {
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured - Kimi fallback unavailable');
  }

  console.log('🦊 Falling back to Kimi K2 via OpenRouter...');
  
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
    console.error('❌ Kimi fallback failed:', response.status, errorText);
    throw new Error(`Kimi fallback failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;

  if (!message) {
    throw new Error('No message in Kimi response');
  }

  console.log('✅ Kimi K2 fallback successful');

  if (message.tool_calls?.length > 0) {
    console.log(`🔧 Kimi returned ${message.tool_calls.length} tool calls`);
    return message;
  }

  return message.content || '';
}

/**
 * Call DeepSeek API as fallback when Lovable fails
 */
async function callDeepSeekFallback(
  messages: Array<{ role: string; content: string }>,
  options: AIGatewayOptions = {}
): Promise<any> {
  const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
  
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY not configured - no fallback available');
  }

  console.log('🔄 Falling back to DeepSeek CTO...');
  
  const requestMessages = options.systemPrompt
    ? [{ role: 'system', content: options.systemPrompt }, ...messages]
    : messages;

  const requestBody: any = {
    model: 'deepseek-chat',
    messages: requestMessages,
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 4000,
  };

  if (options.tools?.length) {
    requestBody.tools = options.tools.slice(0, 50);
    requestBody.tool_choice = 'auto';
  }

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ DeepSeek fallback also failed:', response.status, errorText);
    throw new Error(`DeepSeek fallback failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;

  if (!message) {
    throw new Error('No message in DeepSeek response');
  }

  console.log('✅ DeepSeek fallback successful');

  if (message.tool_calls?.length > 0) {
    console.log(`🔧 DeepSeek returned ${message.tool_calls.length} tool calls`);
    return message;
  }

  return message.content || '';
}

export async function callLovableAIGateway(
  messages: Array<{ role: string; content: string; tool_calls?: any }>,
  options: AIGatewayOptions = {}
): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
  
  // If no Lovable key but DeepSeek available, go straight to DeepSeek
  if (!LOVABLE_API_KEY) {
    if (DEEPSEEK_API_KEY) {
      console.log('⚠️ LOVABLE_API_KEY not configured, using DeepSeek directly');
      return await callDeepSeekFallback(messages, options);
    }
    throw new Error('No AI provider configured (LOVABLE_API_KEY or DEEPSEEK_API_KEY required)');
  }

  console.log('🌐 Calling Lovable AI Gateway...');
  console.log('📦 Request details:', {
    model: options.model || 'google/gemini-2.5-flash',
    messageCount: messages.length,
    hasSystemPrompt: !!options.systemPrompt,
    toolsCount: options.tools?.length || 0
  });
  
  const requestBody: any = {
    model: options.model || 'google/gemini-2.5-flash',
    messages: options.systemPrompt 
      ? [{ role: 'system', content: options.systemPrompt }, ...messages]
      : messages,
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 2000
  };
  
  if (options.tools && options.tools.length > 0) {
    const toolLimit = options.model?.includes('pro') ? 20 : 39;
    requestBody.tools = options.tools.slice(0, toolLimit);
    requestBody.tool_choice = 'auto';
  }
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn('⚠️ Lovable AI Gateway error:', response.status, errorText);
    
    // For 402/429/5xx errors - try fallback cascade: DeepSeek → Kimi
    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    
    if (response.status === 402 || response.status === 429 || response.status >= 500) {
      // Try DeepSeek first
      if (DEEPSEEK_API_KEY) {
        console.log(`🔄 Lovable returned ${response.status}, attempting DeepSeek fallback...`);
        try {
          return await callDeepSeekFallback(messages, options);
        } catch (deepseekError) {
          console.warn('⚠️ DeepSeek fallback failed:', deepseekError.message);
        }
      }
      
      // Try Kimi K2 as second fallback
      if (OPENROUTER_API_KEY) {
        console.log(`🔄 DeepSeek unavailable, attempting Kimi K2 fallback...`);
        try {
          return await callKimiFallback(messages, options);
        } catch (kimiError) {
          console.warn('⚠️ Kimi K2 fallback failed:', kimiError.message);
        }
      }
    }
    
    throw new Error(`Lovable AI Gateway error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  
  if (!message) {
    throw new Error('No message in Lovable AI Gateway response');
  }
  
  if (message.tool_calls && message.tool_calls.length > 0) {
    console.log(`🔧 Gateway returned ${message.tool_calls.length} tool calls`);
    return message;
  }
  
  const content = message.content || '';
  console.log(`✅ Gateway returned content length: ${content.length}`);
  return content;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  
  if (GEMINI_API_KEY) {
    console.log('🧠 Attempting Gemini embedding generation...');
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: { parts: [{ text }] }
          }),
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Gemini embedding generated');
        return data.embedding.values;
      }
      
      const errorText = await response.text();
      console.warn('⚠️ Gemini embedding failed:', errorText);
    } catch (error) {
      console.warn('⚠️ Gemini embedding error:', error.message);
    }
  }
  
  throw new Error('Embedding generation requires GEMINI_API_KEY');
}
