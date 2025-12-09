import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateExecutiveSystemPrompt } from '../_shared/elizaSystemPrompt.ts';
import { buildContextualPrompt } from '../_shared/contextBuilder.ts';
import { EdgeFunctionLogger } from "../_shared/logging.ts";
import { ELIZA_TOOLS } from '../_shared/elizaTools.ts';
import { executeToolCall } from '../_shared/toolExecutor.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  TOOL_CALLING_MANDATE,
  parseToolCodeBlocks,
  parseConversationalToolIntent,
  convertToolsToGeminiFormat,
  needsDataRetrieval,
  retrieveMemoryContexts,
  callDeepSeekFallback,
  callKimiFallback
} from '../_shared/executiveHelpers.ts';
import { processFallbackWithToolExecution, emergencyStaticFallback } from '../_shared/fallbackToolExecutor.ts';

const logger = EdgeFunctionLogger('cio-executive');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      messages, 
      conversationHistory = [], 
      userContext = { ip: 'unknown', isFounder: false }, 
      miningStats = null, 
      systemVersion = null,
      councilMode = false,
      images = []
    } = await req.json();
    
    await logger.info('Request received', 'ai_interaction', { 
      messagesCount: messages?.length,
      hasHistory: conversationHistory?.length > 0,
      userContext,
      executive: 'CIO',
      councilMode,
      hasImages: images?.length > 0
    });

    if (!messages || !Array.isArray(messages)) {
      console.error('❌ Invalid messages parameter');
      await logger.error('Invalid request format', new Error('Messages must be an array'), 'validation');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { type: 'validation_error', code: 400, message: 'Invalid request: messages must be an array' }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('👁️ CIO Executive (Gemini) - Processing with full capabilities');

    // Initialize Supabase client
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ========== PHASE: MEMORY RETRIEVAL ==========
    let memoryContexts: any[] = [];
    if (userContext?.sessionKey) {
      memoryContexts = await retrieveMemoryContexts(supabase, userContext.sessionKey);
      if (memoryContexts.length > 0) {
        console.log(`📚 Retrieved ${memoryContexts.length} memory contexts for CIO`);
      }
    }

    // Build system prompt - ALWAYS with tool access
    let contextualPrompt: string;
    
    if (councilMode) {
      console.log('🏛️ Council mode - CIO with FULL tool access for data-driven insights');
      contextualPrompt = `You are the Chief Information Officer (CIO) of XMRT DAO - a multimodal AI executive specializing in vision, information processing, and system intelligence.

Your role in this council deliberation:
- Provide your expert perspective on the user's question
- Focus on visual, multimodal, and information architecture aspects
- Be concise and actionable (2-3 paragraphs maximum)
- State your confidence level (0-100%)

🔧 CRITICAL - DATA-DRIVEN MANDATE:
You have FULL access to all tools. ALWAYS proactively call relevant tools to gather REAL data before answering:
- get_mining_stats: Current hashrate, workers, mining performance
- get_system_status: System health, component status, infrastructure metrics
- get_ecosystem_metrics: DAO governance, workflows, execution stats
- search_knowledge: Query knowledge base for context
- invoke_edge_function: Call any of 100+ edge functions for specific data
- get_edge_function_logs: Check function execution history

DO NOT give opinions without querying real data first. Your information-driven perspective must be DATA-BACKED.

User Context: ${userContext ? `IP: ${userContext.ip}, Founder: ${userContext.isFounder}` : 'Anonymous'}
Mining Stats: ${miningStats ? `Hash Rate: ${miningStats.hashRate || miningStats.hashrate || 0} H/s, Shares: ${miningStats.validShares || 0}` : 'Not available'}

First call tools to gather data, then provide a focused, data-driven CIO perspective.`;
    } else {
      const executivePrompt = generateExecutiveSystemPrompt('CIO');
      contextualPrompt = await buildContextualPrompt(executivePrompt, {
        conversationHistory,
        userContext,
        miningStats,
        systemVersion
      });
      
      // Inject memory contexts
      if (memoryContexts.length > 0) {
        contextualPrompt += `\n\nRelevant Memories:\n${memoryContexts.slice(0, 5).map(m => `- [${m.type}] ${m.content}`).join('\n')}`;
      }
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    
    if (!GEMINI_API_KEY) {
      console.warn('⚠️ GEMINI_API_KEY not configured, trying fallbacks with tool execution...');
      
      const aiMessages = [{ role: 'system', content: contextualPrompt }, ...messages];
      const userQuery = messages[messages.length - 1]?.content || '';
      
      // Try DeepSeek fallback with tool execution
      const deepseekResult = await callDeepSeekFallback(aiMessages, ELIZA_TOOLS);
      if (deepseekResult) {
        const processed = await processFallbackWithToolExecution(
          deepseekResult, supabase, 'Chief Information Officer (CIO)', SUPABASE_URL, SERVICE_ROLE_KEY, userQuery
        );
        return new Response(
          JSON.stringify({
            success: true,
            response: processed.content,
            hasToolCalls: processed.hasToolCalls,
            toolCallsExecuted: processed.toolCallsExecuted,
            executive: 'gemini-chat',
            executiveTitle: 'Chief Information Officer (CIO) [DeepSeek Fallback]',
            provider: processed.provider,
            model: processed.model,
            fallback: 'deepseek'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Try Kimi K2 fallback with tool execution
      const kimiResult = await callKimiFallback(aiMessages, ELIZA_TOOLS);
      if (kimiResult) {
        const processed = await processFallbackWithToolExecution(
          kimiResult, supabase, 'Chief Information Officer (CIO)', SUPABASE_URL, SERVICE_ROLE_KEY, userQuery
        );
        return new Response(
          JSON.stringify({
            success: true,
            response: processed.content,
            hasToolCalls: processed.hasToolCalls,
            toolCallsExecuted: processed.toolCallsExecuted,
            executive: 'gemini-chat',
            executiveTitle: 'Chief Information Officer (CIO) [Kimi K2 Fallback]',
            provider: processed.provider,
            model: processed.model,
            fallback: 'kimi'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // EMERGENCY: All AI providers failed - use static fallback
      console.log('🚨 All AI providers failed, using emergency static fallback');
      const emergencyResult = await emergencyStaticFallback(
        userQuery, supabase, 'Chief Information Officer (CIO)', SUPABASE_URL, SERVICE_ROLE_KEY
      );
      return new Response(
        JSON.stringify({
          success: true,
          response: emergencyResult.content,
          hasToolCalls: emergencyResult.hasToolCalls,
          toolCallsExecuted: emergencyResult.toolCallsExecuted,
          executive: 'gemini-chat',
          executiveTitle: 'Chief Information Officer (CIO) [Emergency Static]',
          provider: emergencyResult.provider,
          model: emergencyResult.model,
          fallback: 'emergency_static'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📤 Calling Gemini API...');
    const apiStartTime = Date.now();
    
    // Build Gemini request
    const systemPrompt = contextualPrompt;
    const userMessages = messages;
    const lastUserMessage = userMessages.filter((m: any) => m.role === 'user').pop();
    const userText = typeof lastUserMessage?.content === 'string' 
      ? lastUserMessage.content 
      : 'Help me with XMRT DAO';
    
    // Build parts array for Gemini
    const parts: any[] = [{ text: `${systemPrompt}\n\nUser: ${userText}` }];
    
    // Add images if present (Gemini's native strength)
    if (images && images.length > 0) {
      console.log(`🖼️ Processing ${images.length} images for vision analysis`);
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
    
    // Prepare function declarations for tool calling
    const geminiTools = convertToolsToGeminiFormat(ELIZA_TOOLS);
    
    // ALWAYS include tools - expand to 40 most critical tools for council mode too
    let geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          tools: [{ functionDeclarations: geminiTools.slice(0, 40) }], // Expanded to 40 tools, always enabled
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8000
          }
        })
      }
    );

    const apiDuration = Date.now() - apiStartTime;
    let aiProvider = 'gemini';
    let aiModel = 'gemini-2.0-flash-exp';

    // ========== HANDLE API ERRORS WITH FALLBACK CASCADE ==========
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('❌ Gemini API error:', geminiResponse.status, errorText);
      await logger.apiCall('gemini', geminiResponse.status, apiDuration, { error: errorText });

      if (geminiResponse.status === 402 || geminiResponse.status === 429 || geminiResponse.status >= 500) {
        console.log(`⚠️ Gemini returned ${geminiResponse.status}, trying fallback cascade with tool execution...`);
        
        const aiMessages = [{ role: 'system', content: contextualPrompt }, ...messages];
        const userQuery = messages[messages.length - 1]?.content || '';
        
        // Try DeepSeek fallback with unified tool execution
        const deepseekResult = await callDeepSeekFallback(aiMessages, ELIZA_TOOLS);
        if (deepseekResult) {
          const processed = await processFallbackWithToolExecution(
            deepseekResult, supabase, 'Chief Information Officer (CIO)', SUPABASE_URL, SERVICE_ROLE_KEY, userQuery
          );
          return new Response(
            JSON.stringify({
              success: true,
              response: processed.content,
              hasToolCalls: processed.hasToolCalls,
              toolCallsExecuted: processed.toolCallsExecuted,
              executive: 'gemini-chat',
              executiveTitle: 'Chief Information Officer (CIO) [DeepSeek Fallback]',
              provider: processed.provider,
              model: processed.model,
              fallback: 'deepseek'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Try Kimi K2 fallback with unified tool execution
        const kimiResult = await callKimiFallback(aiMessages, ELIZA_TOOLS);
        if (kimiResult) {
          const processed = await processFallbackWithToolExecution(
            kimiResult, supabase, 'Chief Information Officer (CIO)', SUPABASE_URL, SERVICE_ROLE_KEY, userQuery
          );
          return new Response(
            JSON.stringify({
              success: true,
              response: processed.content,
              hasToolCalls: processed.hasToolCalls,
              toolCallsExecuted: processed.toolCallsExecuted,
              executive: 'gemini-chat',
              executiveTitle: 'Chief Information Officer (CIO) [Kimi K2 Fallback]',
              provider: processed.provider,
              model: processed.model,
              fallback: 'kimi'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // EMERGENCY: All AI providers failed - use static fallback
        console.log('🚨 All AI providers failed, using emergency static fallback');
        const emergencyResult = await emergencyStaticFallback(
          userQuery, supabase, 'Chief Information Officer (CIO)', SUPABASE_URL, SERVICE_ROLE_KEY
        );
        return new Response(
          JSON.stringify({
            success: true,
            response: emergencyResult.content,
            hasToolCalls: emergencyResult.hasToolCalls,
            toolCallsExecuted: emergencyResult.toolCallsExecuted,
            executive: 'gemini-chat',
            executiveTitle: 'Chief Information Officer (CIO) [Emergency Static]',
            provider: emergencyResult.provider,
            model: emergencyResult.model,
            fallback: 'emergency_static'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            type: geminiResponse.status === 402 ? 'payment_required' : 
                  geminiResponse.status === 429 ? 'rate_limit' : 'service_unavailable',
            code: geminiResponse.status,
            message: errorText,
            service: 'gemini-chat',
            canRetry: geminiResponse.status !== 402,
            suggestedAction: geminiResponse.status === 402 ? 'add_credits' : 'try_alternative'
          }
        }),
        { status: geminiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiResponse.json();
    const candidate = geminiData.candidates?.[0];
    const contentParts = candidate?.content?.parts || [];
    
    // Extract text and function calls
    let textContent = '';
    const functionCalls: any[] = [];
    
    for (const part of contentParts) {
      if (part.text) {
        textContent += part.text;
      }
      if (part.functionCall) {
        functionCalls.push({
          id: `gemini_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {})
          }
        });
      }
    }
    
    // Check for tool_code blocks in text content (fallback style)
    if (textContent.includes('```tool_code') && functionCalls.length === 0) {
      console.log('🔧 Detected tool_code blocks in Gemini text - parsing...');
      const textToolCalls = parseToolCodeBlocks(textContent);
      if (textToolCalls && textToolCalls.length > 0) {
        console.log(`🔧 Parsed ${textToolCalls.length} tool calls from tool_code blocks`);
        functionCalls.push(...textToolCalls);
        textContent = textContent.replace(/```tool_code[\s\S]*?```/g, '').trim();
      }
    }

    // ========== EXECUTE TOOL CALLS (including council mode) ==========
    if (functionCalls.length > 0) {
      console.log(`🔧 CIO executing ${functionCalls.length} tool(s)${councilMode ? ' in council mode' : ''}`);
      
      const toolResults = [];
      for (const toolCall of functionCalls) {
        const result = await executeToolCall(supabase, toolCall, 'CIO', SUPABASE_URL, SERVICE_ROLE_KEY);
        toolResults.push({
          functionResponse: {
            name: toolCall.function.name,
            response: result
          }
        });
      }
      
      // Make follow-up call with tool results
      const secondResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { parts },
              { role: 'model', parts: contentParts },
              { role: 'function', parts: toolResults }
            ],
            generationConfig: { temperature: 0.7, maxOutputTokens: 8000 }
          })
        }
      );
      
      if (secondResponse.ok) {
        const secondData = await secondResponse.json();
        const secondContent = secondData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (secondContent) {
          textContent = secondContent;
        }
      }
      
      console.log(`✅ CIO Executive responded with ${functionCalls.length} tool calls executed`);
      await logger.apiCall('gemini', 200, Date.now() - apiStartTime, {
        model: aiModel,
        toolCalls: functionCalls.length
      });

      return new Response(
        JSON.stringify({
          success: true,
          response: textContent,
          hasToolCalls: true,
          toolCallsExecuted: functionCalls.length,
          executive: 'gemini-chat',
          executiveTitle: 'Chief Information Officer (CIO)',
          provider: aiProvider,
          model: aiModel,
          confidence: 85
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ CIO Executive responded in ${apiDuration}ms`);
    await logger.apiCall('gemini', 200, apiDuration, { 
      executive: 'CIO',
      responseLength: textContent?.length || 0,
      model: aiModel,
      vision: images?.length > 0
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        response: textContent || "I'm here to help with XMRT-DAO tasks.",
        hasToolCalls: false,
        executive: 'gemini-chat',
        executiveTitle: 'Chief Information Officer (CIO)',
        provider: aiProvider,
        model: aiModel,
        confidence: 85,
        vision_analysis: images?.length > 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ CIO Executive error:', error);
    await logger.error('Function execution failed', error, 'error');
    
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
          service: 'gemini-chat',
          details: {
            timestamp: new Date().toISOString(),
            executive: 'CIO',
            model: 'gemini-2.0-flash-exp'
          },
          canRetry: statusCode !== 402,
          suggestedAction: statusCode === 402 ? 'add_credits' : 'try_alternative'
        }
      }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
