/**
 * Backend AI Gateway Fallback
 * Provides Lovable AI Gateway access for all edge functions
 * Fallback cascade: Lovable → DeepSeek → Kimi K2 → Gemini (FREE ultimate fallback)
 * 
 * ENHANCED: All providers now receive full Eliza intelligence context
 */

import { generateElizaSystemPrompt } from './elizaSystemPrompt.ts';
import { ELIZA_TOOLS } from './elizaTools.ts';

export interface AIGatewayOptions {
  model?: 'google/gemini-2.5-flash' | 'google/gemini-2.5-pro' | 'openai/gpt-5-mini';
  temperature?: number;
  max_tokens?: number;
  systemPrompt?: string;
  tools?: Array<any>;
  // Eliza context enrichment
  userContext?: any;
  miningStats?: any;
  useFullElizaContext?: boolean; // Default true
}

/**
 * Get effective system prompt - uses full Eliza if not provided
 */
function getEffectiveSystemPrompt(options: AIGatewayOptions): string | undefined {
  if (options.systemPrompt && options.systemPrompt.length > 1000) {
    return options.systemPrompt;
  }
  
  if (options.useFullElizaContext === false) {
    return options.systemPrompt;
  }
  
  // DEFAULT: Use full Eliza system prompt
  console.log('🧠 Gemini fallback: Enriching with full Eliza system prompt...');
  return generateElizaSystemPrompt(
    options.userContext,
    options.miningStats,
    null,
    'eliza',
    'Chief Strategy Officer'
  );
}

/**
 * Get effective tools - uses ELIZA_TOOLS if not provided
 */
function getEffectiveTools(options: AIGatewayOptions): any[] {
  if (options.tools && options.tools.length > 0) {
    return options.tools;
  }
  
  if (options.useFullElizaContext === false) {
    return [];
  }
  
  console.log('🔧 Gemini fallback: Including ELIZA_TOOLS...');
  return ELIZA_TOOLS;
}

/**
 * Call Gemini as ultimate fallback (FREE tier available)
 * ENHANCED: Now includes full Eliza system prompt and tool calling support
 */
async function callGeminiFallback(
  messages: Array<{ role: string; content: string }>,
  options: AIGatewayOptions = {}
): Promise<any> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured - Gemini fallback unavailable');
  }

  console.log('💎 Falling back to Gemini with full Eliza intelligence...');
  
  const effectiveSystemPrompt = getEffectiveSystemPrompt(options);
  const effectiveTools = getEffectiveTools(options);
  
  // Convert messages to Gemini format (exclude system messages)
  const conversationMessages = messages.filter(m => m.role !== 'system');
  const contents = conversationMessages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const requestBody: any = {
    contents,
    generationConfig: {
      temperature: options.temperature || 0.7,
      maxOutputTokens: options.max_tokens || 2000
    }
  };
  
  // Add system instruction with full Eliza prompt
  if (effectiveSystemPrompt) {
    requestBody.systemInstruction = { parts: [{ text: effectiveSystemPrompt }] };
  }
  
  // Add tool definitions for Gemini (convert to Gemini format)
  if (effectiveTools.length > 0) {
    requestBody.tools = [{
      functionDeclarations: effectiveTools.slice(0, 30).map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      }))
    }];
    console.log(`🔧 Gemini fallback: Enabled ${Math.min(effectiveTools.length, 30)} tools`);
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Gemini fallback failed:', response.status, errorText);
    throw new Error(`Gemini fallback failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts;

  if (!parts || parts.length === 0) {
    throw new Error('No content in Gemini response');
  }
  
  // Check for function calls (Gemini's tool call format)
  const functionCall = parts.find((p: any) => p.functionCall);
  if (functionCall) {
    console.log(`🔧 Gemini returned function call: ${functionCall.functionCall.name}`);
    // Convert to OpenAI format for compatibility
    return {
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
    };
  }

  const content = parts[0]?.text;
  if (!content) {
    throw new Error('No text content in Gemini response');
  }

  console.log('✅ Gemini fallback successful with Eliza intelligence');
  return content;
}

/**
 * Call Kimi K2 via OpenRouter as fallback
 * ENHANCED: Now includes full Eliza system prompt and tool calling support
 */
async function callKimiFallback(
  messages: Array<{ role: string; content: string }>,
  options: AIGatewayOptions = {}
): Promise<any> {
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured - Kimi fallback unavailable');
  }

  console.log('🦊 Falling back to Kimi K2 with full Eliza intelligence...');
  
  const effectiveSystemPrompt = getEffectiveSystemPrompt(options);
  const effectiveTools = getEffectiveTools(options);
  
  const requestMessages = [
    { role: 'system', content: effectiveSystemPrompt || 'You are a helpful AI assistant.' },
    ...messages.filter(m => m.role !== 'system')
  ];

  const requestBody: any = {
    model: 'moonshotai/kimi-k2',
    messages: requestMessages,
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 2000,
  };
  
  // Include tools for Kimi
  if (effectiveTools.length > 0) {
    requestBody.tools = effectiveTools.slice(0, 40);
    requestBody.tool_choice = 'auto';
    console.log(`🔧 Kimi fallback: Enabled ${Math.min(effectiveTools.length, 40)} tools`);
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://xmrt.pro',
      'X-Title': 'XMRT Eliza'
    },
    body: JSON.stringify(requestBody),
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

  console.log('✅ Kimi K2 fallback successful with Eliza intelligence');

  if (message.tool_calls?.length > 0) {
    console.log(`🔧 Kimi returned ${message.tool_calls.length} tool calls`);
    return message;
  }

  return message.content || '';
}

/**
 * Call DeepSeek API as fallback when Lovable fails
 * ENHANCED: Now includes full Eliza system prompt and tool calling support
 */
async function callDeepSeekFallback(
  messages: Array<{ role: string; content: string }>,
  options: AIGatewayOptions = {}
): Promise<any> {
  const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
  
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY not configured - no fallback available');
  }

  console.log('🔄 Falling back to DeepSeek with full Eliza intelligence...');
  
  const effectiveSystemPrompt = getEffectiveSystemPrompt(options);
  const effectiveTools = getEffectiveTools(options);
  
  const requestMessages = [
    { role: 'system', content: effectiveSystemPrompt || 'You are a helpful AI assistant.' },
    ...messages.filter(m => m.role !== 'system')
  ];

  const requestBody: any = {
    model: 'deepseek-chat',
    messages: requestMessages,
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 4000,
  };

  // Include tools for DeepSeek
  if (effectiveTools.length > 0) {
    requestBody.tools = effectiveTools.slice(0, 50);
    requestBody.tool_choice = 'auto';
    console.log(`🔧 DeepSeek fallback: Enabled ${Math.min(effectiveTools.length, 50)} tools`);
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

  console.log('✅ DeepSeek fallback successful with Eliza intelligence');

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
      
      // Try Gemini as ULTIMATE fallback (FREE tier)
      const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
      if (GEMINI_API_KEY) {
        console.log(`🔄 Paid providers exhausted, attempting Gemini FREE fallback...`);
        try {
          return await callGeminiFallback(messages, options);
        } catch (geminiError) {
          console.warn('⚠️ Gemini fallback failed:', geminiError.message);
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
