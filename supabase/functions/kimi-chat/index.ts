import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAICredential, createCredentialRequiredResponse } from "../_shared/credentialCascade.ts";
import { EdgeFunctionLogger } from "../_shared/logging.ts";
import { generateElizaSystemPrompt } from "../_shared/elizaSystemPrompt.ts";
import { buildContextualPrompt } from "../_shared/contextBuilder.ts";
import { ELIZA_TOOLS } from '../_shared/elizaTools.ts';
import { executeToolCall } from '../_shared/toolExecutor.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const logger = EdgeFunctionLogger("kimi-chat");
const FUNCTION_NAME = 'kimi-chat';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parser for text-based tool call formats (some models embed in text)
function parseTextToolCalls(content: string): Array<any> | null {
  // Format: <｜tool▁calls▁begin｜>...<｜tool▁calls▁end｜>
  const toolCallsMatch = content.match(/<｜tool▁calls▁begin｜>(.*?)<｜tool▁calls▁end｜>/s);
  if (!toolCallsMatch) return null;
  
  const toolCallsText = toolCallsMatch[1];
  const toolCallPattern = /<｜tool▁call▁begin｜>(.*?)<｜tool▁sep｜>(.*?)<｜tool▁call▁end｜>/gs;
  const toolCalls: Array<any> = [];
  
  let match;
  while ((match = toolCallPattern.exec(toolCallsText)) !== null) {
    const functionName = match[1].trim();
    let args = match[2].trim();
    
    let parsedArgs = {};
    if (args && args !== '{}') {
      try {
        parsedArgs = JSON.parse(args);
      } catch (e) {
        console.warn(`Failed to parse tool args for ${functionName}:`, args);
      }
    }
    
    toolCalls.push({
      id: `kimi_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: 'function',
      function: {
        name: functionName,
        arguments: JSON.stringify(parsedArgs)
      }
    });
  }
  
  return toolCalls.length > 0 ? toolCalls : null;
}

// Detect if query needs data (should force tool calls)
function needsDataRetrieval(messages: any[]): boolean {
  const lastUser = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || '';
  const dataKeywords = ['what is', 'show me', 'check', 'status', 'how much', 'how many', 'get', 'list', 'find', 'current', 'mining', 'hashrate', 'workers', 'health', 'agents', 'tasks', 'ecosystem', 'stats'];
  return dataKeywords.some(k => lastUser.includes(k));
}

// CRITICAL TOOL CALLING INSTRUCTION
const TOOL_CALLING_MANDATE = `
🚨 CRITICAL TOOL CALLING RULES:
1. When the user asks for data/status/metrics, you MUST call tools using the native function calling mechanism
2. DO NOT describe tool calls in text. DO NOT say "I will call..." or "Let me check..."
3. DIRECTLY invoke functions - the system will handle execution
4. Available critical tools: get_mining_stats, get_system_status, get_ecosystem_metrics, invoke_edge_function
5. If you need current data, ALWAYS use tools. Never guess or make up data.
`;

// Fallback to DeepSeek API
async function callDeepSeekFallback(messages: any[], tools?: any[]): Promise<any> {
  const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
  if (!DEEPSEEK_API_KEY) return null;
  
  console.log('🔄 Trying DeepSeek fallback...');
  
  // Inject tool calling mandate
  const enhancedMessages = messages.map(m => 
    m.role === 'system' ? { ...m, content: TOOL_CALLING_MANDATE + m.content } : m
  );
  
  const forceTools = needsDataRetrieval(messages);
  console.log(`📊 DeepSeek - Data retrieval needed: ${forceTools}`);
  
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: enhancedMessages,
        tools,
        tool_choice: tools ? (forceTools ? 'required' : 'auto') : undefined,
        temperature: 0.9,
        max_tokens: 8000,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ DeepSeek fallback successful');
      return {
        content: data.choices?.[0]?.message?.content || '',
        tool_calls: data.choices?.[0]?.message?.tool_calls || [],
        provider: 'deepseek',
        model: 'deepseek-chat'
      };
    }
  } catch (error) {
    console.warn('⚠️ DeepSeek fallback failed:', error.message);
  }
  return null;
}

// Fallback to Gemini API
async function callGeminiFallback(messages: any[], images?: string[]): Promise<any> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) return null;
  
  console.log('🔄 Trying Gemini fallback...');
  
  try {
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system');
    const lastUserMessage = userMessages.filter(m => m.role === 'user').pop();
    const userText = lastUserMessage?.content || 'Help me with XMRT DAO';
    
    const parts: any[] = [{ text: `${systemPrompt}\n\nUser: ${userText}` }];
    
    // Add images if present
    if (images && images.length > 0) {
      for (const imageBase64 of images) {
        const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          parts.push({
            inline_data: {
              mime_type: matches[1],
              data: matches[2]
            }
          });
        }
      }
    }
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8000 }
        })
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        console.log('✅ Gemini fallback successful');
        return { content: text, provider: 'gemini', model: 'gemini-2.0-flash-exp' };
      }
    }
  } catch (error) {
    console.warn('⚠️ Gemini fallback failed:', error.message);
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Start usage tracking at function entry
  const usageTracker = startUsageTracking(FUNCTION_NAME);

  try {
    const requestBody = await req.json();
    const {
      messages,
      conversationHistory = [],
      userContext = { ip: "unknown", isFounder: false },
      miningStats = null,
      systemVersion = null,
      session_credentials = null,
      images = [],
      councilMode = false
    } = requestBody;

    usageTracker['parameters'] = { messagesCount: messages?.length, councilMode, hasImages: images?.length > 0 };

    await logger.info("Request received", "ai_interaction", {
      messagesCount: messages?.length,
      hasHistory: conversationHistory?.length > 0,
      userContext,
      hasImages: images?.length > 0,
      source: requestBody.source || "unknown",
    });

    const OPENROUTER_API_KEY = getAICredential("openrouter", session_credentials);
    if (!OPENROUTER_API_KEY) {
      console.error("⚠️ OPENROUTER_API_KEY not configured");
      await logger.warning("Missing API key", "security", { credential_type: "openrouter" });
      await usageTracker.failure('OpenRouter API key not configured', 401);
      return new Response(
        JSON.stringify(createCredentialRequiredResponse(
          "openrouter",
          "api_key",
          "OpenRouter API key needed to use this AI service (Kimi K2).",
          "https://openrouter.ai/"
        )),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!messages || !Array.isArray(messages)) {
      console.error("❌ Invalid messages parameter");
      await logger.error("Invalid request format", new Error("Messages must be an array"), "validation");
      await usageTracker.failure('Invalid request: messages must be an array', 400);
      return new Response(
        JSON.stringify({
          success: false,
          error: { type: 'validation_error', code: 400, message: 'Invalid request: messages must be an array' }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("🤖 Kimi K2 - Processing request with full capabilities:", {
      messagesCount: messages?.length,
      hasHistory: conversationHistory?.length > 0,
      hasImages: images?.length > 0,
      councilMode
    });

    // Initialize Supabase client for tool execution
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Build system prompt
    const basePrompt = generateElizaSystemPrompt();
    let systemPrompt = await buildContextualPrompt(basePrompt, {
      conversationHistory,
      userContext,
      miningStats,
      systemVersion,
    });

    if (councilMode) {
      systemPrompt += `\n\n🏛️ COUNCIL MODE: Provide concise 2-4 paragraph response. You have full tool access if needed.`;
    }

    // Prepare messages with system prompt
    const openrouterMessages = [{ role: "system", content: systemPrompt }, ...messages];

    // ========== PRIORITY VISION ROUTING ==========
    if (images && images.length > 0) {
      console.log(`🖼️ Images detected (${images.length}) - routing to vision-capable model`);
      
      // Try Gemini Vision first (best for images)
      const geminiResult = await callGeminiFallback(openrouterMessages, images);
      if (geminiResult) {
        return new Response(
          JSON.stringify({
            success: true,
            response: geminiResult.content,
            hasToolCalls: false,
            executive: "kimi-chat",
            executiveTitle: "Kimi K2 AI Gateway [Vision via Gemini]",
            provider: geminiResult.provider,
            model: geminiResult.model,
            vision_analysis: true
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Try OpenRouter Claude-3-Haiku for vision
      console.log('🔄 Trying OpenRouter Vision (claude-3-haiku)...');
      try {
        const contentParts: any[] = [{ type: 'text', text: openrouterMessages[openrouterMessages.length - 1]?.content || '' }];
        for (const imageBase64 of images) {
          contentParts.push({ type: 'image_url', image_url: { url: imageBase64 } });
        }
        
        const visionResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://xmrt.pro",
            "X-Title": "XMRT Eliza"
          },
          body: JSON.stringify({
            model: "anthropic/claude-3-haiku",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: contentParts }
            ],
            max_tokens: 8000
          }),
        });
        
        if (visionResponse.ok) {
          const visionData = await visionResponse.json();
          const visionContent = visionData.choices?.[0]?.message?.content;
          if (visionContent) {
            console.log('✅ OpenRouter Vision analysis successful');
            return new Response(
              JSON.stringify({
                success: true,
                response: visionContent,
                hasToolCalls: false,
                executive: "kimi-chat",
                executiveTitle: "Kimi K2 AI Gateway [Vision via Claude-3-Haiku]",
                provider: "openrouter",
                model: "claude-3-haiku",
                vision_analysis: true
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      } catch (visionError) {
        console.warn('⚠️ OpenRouter Vision failed:', visionError.message);
      }
    }

    // ========== MAIN API CALL WITH TOOL CALLING ==========
    // Inject tool calling mandate into system prompt
    const enhancedSystemPrompt = TOOL_CALLING_MANDATE + systemPrompt;
    const enhancedMessages = [{ role: "system", content: enhancedSystemPrompt }, ...messages];
    
    // Force tool_choice if query needs data
    const forceTools = needsDataRetrieval(messages);
    console.log(`📤 Calling OpenRouter API (Kimi K2) - Data retrieval: ${forceTools}, tool_choice: ${forceTools ? 'required' : 'auto'}`);
    const apiStartTime = Date.now();
    
    let response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://xmrt.pro",
        "X-Title": "XMRT Eliza"
      },
      body: JSON.stringify({
        model: "moonshotai/kimi-k2",
        messages: enhancedMessages,
        tools: ELIZA_TOOLS,
        tool_choice: forceTools ? "required" : "auto",
        temperature: 0.9,
        max_tokens: 8000,
        stream: false,
      }),
    });

    const apiDuration = Date.now() - apiStartTime;
    let aiProvider = 'openrouter';
    let aiModel = 'moonshotai/kimi-k2';

    // ========== HANDLE API ERRORS WITH FALLBACK CASCADE ==========
    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter API error:", response.status, errorText);
      await logger.apiCall("openrouter", response.status, apiDuration, { error: errorText });

      // Fallback cascade for 402/429/500+ errors
      if (response.status === 402 || response.status === 429 || response.status >= 500) {
        console.log(`⚠️ OpenRouter returned ${response.status}, trying fallback cascade...`);
        
        // 1. Try DeepSeek
        const deepseekResult = await callDeepSeekFallback(openrouterMessages, ELIZA_TOOLS);
        if (deepseekResult) {
          aiProvider = deepseekResult.provider;
          aiModel = deepseekResult.model;
          
          // Process tool calls if any
          if (deepseekResult.tool_calls && deepseekResult.tool_calls.length > 0) {
            console.log(`🔧 Executing ${deepseekResult.tool_calls.length} tool(s) from DeepSeek`);
            const toolResults = [];
            for (const toolCall of deepseekResult.tool_calls) {
              const result = await executeToolCall(supabase, toolCall, 'CIO', SUPABASE_URL, SERVICE_ROLE_KEY);
              toolResults.push({ tool_call_id: toolCall.id, role: 'tool', content: JSON.stringify(result) });
            }
            
            // Get final response after tool execution
            const secondResult = await callDeepSeekFallback([
              ...openrouterMessages,
              { role: 'assistant', content: deepseekResult.content, tool_calls: deepseekResult.tool_calls },
              ...toolResults
            ]);
            
            if (secondResult) {
              return new Response(
                JSON.stringify({
                  success: true,
                  response: secondResult.content,
                  hasToolCalls: true,
                  toolCallsExecuted: deepseekResult.tool_calls.length,
                  executive: "kimi-chat",
                  executiveTitle: "Kimi K2 AI Gateway [DeepSeek Fallback]",
                  provider: aiProvider,
                  model: aiModel,
                  fallback: 'deepseek'
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
          
          return new Response(
            JSON.stringify({
              success: true,
              response: deepseekResult.content,
              hasToolCalls: false,
              executive: "kimi-chat",
              executiveTitle: "Kimi K2 AI Gateway [DeepSeek Fallback]",
              provider: aiProvider,
              model: aiModel,
              fallback: 'deepseek'
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // 2. Try Gemini
        const geminiResult = await callGeminiFallback(openrouterMessages);
        if (geminiResult) {
          return new Response(
            JSON.stringify({
              success: true,
              response: geminiResult.content,
              hasToolCalls: false,
              executive: "kimi-chat",
              executiveTitle: "Kimi K2 AI Gateway [Gemini Fallback]",
              provider: geminiResult.provider,
              model: geminiResult.model,
              fallback: 'gemini'
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Return structured error response
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            type: response.status === 402 ? 'payment_required' : 
                  response.status === 429 ? 'rate_limit' : 'service_unavailable',
            code: response.status,
            message: errorText,
            service: 'kimi-chat',
            canRetry: response.status !== 402,
            suggestedAction: response.status === 402 ? 'add_credits' : 'try_alternative'
          }
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== PROCESS SUCCESSFUL RESPONSE ==========
    const data = await response.json();
    let message = data.choices?.[0]?.message;
    let content = message?.content || '';
    let toolCalls = message?.tool_calls || [];

    // Check for text-embedded tool calls
    if (!toolCalls.length && content) {
      const textToolCalls = parseTextToolCalls(content);
      if (textToolCalls) {
        toolCalls = textToolCalls;
        // Remove tool call markers from content
        content = content.replace(/<｜tool▁calls▁begin｜>.*?<｜tool▁calls▁end｜>/s, '').trim();
      }
    }

    // ========== EXECUTE TOOL CALLS ==========
    if (toolCalls && toolCalls.length > 0) {
      console.log(`🔧 Kimi K2 executing ${toolCalls.length} tool(s)`);
      
      const toolResults = [];
      for (const toolCall of toolCalls) {
        const result = await executeToolCall(supabase, toolCall, 'CIO', SUPABASE_URL, SERVICE_ROLE_KEY);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function?.name,
          content: JSON.stringify(result)
        });
      }
      
      // Make follow-up call with tool results
      const secondResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://xmrt.pro",
          "X-Title": "XMRT Eliza"
        },
        body: JSON.stringify({
          model: "moonshotai/kimi-k2",
          messages: [
            ...openrouterMessages,
            { role: 'assistant', content: content, tool_calls: toolCalls },
            ...toolResults
          ],
          temperature: 0.9,
          max_tokens: 4000,
        }),
      });
      
      if (secondResponse.ok) {
        const secondData = await secondResponse.json();
        content = secondData.choices?.[0]?.message?.content || content;
      }
      
      console.log(`✅ Kimi K2 responded with ${toolCalls.length} tool calls executed`);
      await logger.apiCall("openrouter", 200, Date.now() - apiStartTime, {
        tokens: data.usage,
        model: aiModel,
        toolCalls: toolCalls.length
      });

      return new Response(
        JSON.stringify({
          success: true,
          response: content,
          hasToolCalls: true,
          toolCallsExecuted: toolCalls.length,
          executive: "kimi-chat",
          executiveTitle: "Kimi K2 AI Gateway",
          provider: aiProvider,
          model: aiModel
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ Kimi K2 response:", { hasContent: !!content, usage: data.usage });
    await logger.apiCall("openrouter", 200, apiDuration, { tokens: data.usage, model: aiModel });

    return new Response(
      JSON.stringify({
        success: true,
        response: content || "I'm here to help with XMRT-DAO tasks.",
        hasToolCalls: false,
        executive: "kimi-chat",
        executiveTitle: "Kimi K2 AI Gateway",
        provider: aiProvider,
        model: aiModel
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Kimi K2 chat error:", error);
    await logger.error("Function execution failed", error, "error");
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    let statusCode = 500;
    
    if (errorMessage.includes('402') || errorMessage.includes('Payment Required')) {
      statusCode = 402;
    } else if (errorMessage.includes('429') || errorMessage.includes('Rate limit')) {
      statusCode = 429;
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          type: statusCode === 402 ? 'payment_required' : 
                statusCode === 429 ? 'rate_limit' : 'service_unavailable',
          code: statusCode,
          message: errorMessage,
          service: 'kimi-chat',
          details: { timestamp: new Date().toISOString(), model: 'moonshotai/kimi-k2' },
          canRetry: statusCode !== 402,
          suggestedAction: statusCode === 402 ? 'add_credits' : 'try_alternative'
        }
      }),
      { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
