import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callLovableAIGateway } from '../_shared/unifiedAIFallback.ts';
import { generateExecutiveSystemPrompt } from '../_shared/elizaSystemPrompt.ts';
import { buildContextualPrompt } from '../_shared/contextBuilder.ts';
import { EdgeFunctionLogger } from "../_shared/logging.ts";
import { ELIZA_TOOLS } from '../_shared/elizaTools.ts';
import { executeToolCall } from '../_shared/toolExecutor.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  TOOL_CALLING_MANDATE,
  parseDeepSeekToolCalls,
  parseToolCodeBlocks,
  parseConversationalToolIntent,
  needsDataRetrieval,
  retrieveMemoryContexts,
  callDeepSeekFallback,
  callKimiFallback,
  callGeminiFallback,
  synthesizeToolResults
} from '../_shared/executiveHelpers.ts';
import { processFallbackWithToolExecution, emergencyStaticFallback } from '../_shared/fallbackToolExecutor.ts';

const logger = EdgeFunctionLogger('cao-executive');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TOOL_ITERATIONS = 5;

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
      executive: 'CAO',
      councilMode,
      hasImages: images?.length > 0
    });

    if (!messages || !Array.isArray(messages)) {
      console.error('❌ Invalid messages parameter');
      await logger.error('Invalid request format', new Error('Messages must be an array'), 'validation');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid request: messages must be an array',
          received: typeof messages
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('📊 CAO Executive - Processing request with full capabilities');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ========== PHASE: MEMORY RETRIEVAL ==========
    let enrichedConversationHistory = conversationHistory || {};
    let memoryContexts = conversationHistory?.memoryContexts || [];

    if (memoryContexts.length === 0 && userContext?.sessionKey) {
      memoryContexts = await retrieveMemoryContexts(supabase, userContext.sessionKey);
      if (memoryContexts.length > 0) {
        enrichedConversationHistory = {
          ...enrichedConversationHistory,
          memoryContexts
        };
      }
    }

    // ========== PHASE: VISION ROUTING ==========
    if (images && images.length > 0) {
      console.log(`🖼️ Images detected (${images.length}) - routing to Gemini Vision`);
      
      const executivePrompt = generateExecutiveSystemPrompt('CAO');
      const contextualPrompt = await buildContextualPrompt(executivePrompt, {
        conversationHistory: enrichedConversationHistory,
        userContext,
        miningStats,
        systemVersion
      });
      
      const aiMessages = [{ role: 'system', content: contextualPrompt }, ...messages];
      const geminiResult = await callGeminiFallback(aiMessages, ELIZA_TOOLS, images);
      
      if (geminiResult) {
        // Execute any tool calls from Gemini
        if (geminiResult.tool_calls && geminiResult.tool_calls.length > 0) {
          console.log(`🔧 Executing ${geminiResult.tool_calls.length} tool(s) from Gemini Vision`);
          const toolResults = [];
          for (const toolCall of geminiResult.tool_calls) {
            const result = await executeToolCall(supabase, toolCall, 'CAO', SUPABASE_URL, SERVICE_ROLE_KEY);
            toolResults.push({ tool: toolCall.function.name, result });
          }
          
          const userQuery = messages[messages.length - 1]?.content || '';
          const synthesized = await synthesizeToolResults(toolResults, userQuery, 'Chief Analytics Officer (CAO)');
          
          return new Response(
            JSON.stringify({
              success: true,
              response: synthesized || geminiResult.content,
              hasToolCalls: true,
              toolCallsExecuted: geminiResult.tool_calls.length,
              executive: 'openai-chat',
              executiveTitle: 'Chief Analytics Officer (CAO) [Vision]',
              provider: 'gemini',
              model: 'gemini-2.0-flash-exp',
              vision_analysis: true
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            response: geminiResult.content,
            executive: 'openai-chat',
            executiveTitle: 'Chief Analytics Officer (CAO) [Vision]',
            provider: 'gemini',
            model: 'gemini-2.0-flash-exp',
            vision_analysis: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ========== PHASE: BUILD CONTEXT ==========
    let contextualPrompt: string;
    
    if (councilMode) {
      console.log('🏛️ Council mode - CAO with FULL tool access for data-driven insights');
      contextualPrompt = `You are the Chief Analytics Officer (CAO) of XMRT DAO - an AI executive specializing in complex reasoning and strategic analysis.

Your role in this council deliberation:
- Provide your expert perspective on the user's question
- Focus on analytical, strategic, and data-driven insights
- Be concise and actionable (2-3 paragraphs maximum)
- State your confidence level (0-100%)

${TOOL_CALLING_MANDATE}

User Context: ${userContext ? `IP: ${userContext.ip}, Founder: ${userContext.isFounder}` : 'Anonymous'}
Mining Stats: ${miningStats ? `Hash Rate: ${miningStats.hashRate || miningStats.hashrate || 0} H/s, Shares: ${miningStats.validShares || 0}` : 'Not available'}
${memoryContexts.length > 0 ? `\nRelevant Memories:\n${memoryContexts.slice(0, 5).map(m => `- [${m.type}] ${m.content}`).join('\n')}` : ''}

First call tools to gather data, then provide a focused, data-driven CAO perspective.`;
    } else {
      const executivePrompt = generateExecutiveSystemPrompt('CAO');
      contextualPrompt = await buildContextualPrompt(executivePrompt, {
        conversationHistory: enrichedConversationHistory,
        userContext,
        miningStats,
        systemVersion
      });
    }

    const aiMessages = [{ role: 'system', content: contextualPrompt }, ...messages];
    const forceTools = needsDataRetrieval(messages);
    
    console.log(`📊 Data retrieval needed: ${forceTools}`);
    console.log('📤 Calling Lovable AI Gateway (CAO mode with tools)...');
    
    const apiStartTime = Date.now();
    let response = await callLovableAIGateway(aiMessages, {
      model: 'google/gemini-2.5-flash',
      temperature: 0.7,
      max_tokens: 8000,
      tools: ELIZA_TOOLS,
      tool_choice: forceTools ? 'required' : 'auto'
    });
    
    let totalToolsExecuted = 0;
    let iteration = 0;
    let conversationMessages = [...aiMessages];
    
    // ========== PHASE: TOOL EXECUTION LOOP ==========
    while (iteration < MAX_TOOL_ITERATIONS) {
      // Check for tool calls (native or text-embedded)
      let toolCalls = response.tool_calls || [];
      
      // Also check for text-embedded tool calls
      if ((!toolCalls || toolCalls.length === 0) && response.content) {
        const textToolCalls = parseToolCodeBlocks(response.content) || 
                             parseDeepSeekToolCalls(response.content) ||
                             parseConversationalToolIntent(response.content);
        if (textToolCalls && textToolCalls.length > 0) {
          toolCalls = textToolCalls;
        }
      }
      
      if (!toolCalls || toolCalls.length === 0) break;
      
      console.log(`🔧 CAO Iteration ${iteration + 1}: Executing ${toolCalls.length} tool(s)`);
      
      const toolResults = [];
      for (const toolCall of toolCalls) {
        const result = await executeToolCall(supabase, toolCall, 'CAO', SUPABASE_URL, SERVICE_ROLE_KEY);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(result)
        });
        totalToolsExecuted++;
      }
      
      // Add assistant message with tool calls and tool results
      conversationMessages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: toolCalls
      });
      conversationMessages.push(...toolResults);
      
      // Call AI again with tool results
      response = await callLovableAIGateway(conversationMessages, {
        model: 'google/gemini-2.5-flash',
        temperature: 0.7,
        max_tokens: 8000
      });
      
      if (!response) break;
      iteration++;
    }
    
    const apiDuration = Date.now() - apiStartTime;
    
    // Clean response content
    let finalContent = typeof response === 'string' ? response : (response?.content || response);
    if (typeof finalContent === 'string' && finalContent.includes('```tool_code')) {
      finalContent = finalContent.replace(/```tool_code[\s\S]*?```/g, '').trim();
    }
    
    console.log(`✅ CAO Executive responded in ${apiDuration}ms (${totalToolsExecuted} tools executed)`);
    await logger.apiCall('lovable_gateway', 200, apiDuration, { 
      executive: 'CAO',
      toolsExecuted: totalToolsExecuted
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        response: finalContent,
        hasToolCalls: totalToolsExecuted > 0,
        toolCallsExecuted: totalToolsExecuted,
        executive: 'openai-chat',
        executiveTitle: 'Chief Analytics Officer (CAO)',
        provider: 'lovable_gateway',
        model: 'google/gemini-2.5-flash',
        confidence: 85
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ CAO Executive error:', error);
    await logger.error('Function execution failed', error, 'error');
    
    // ========== FALLBACK CASCADE WITH TOOL EXECUTION ==========
    console.log('⚠️ Primary AI failed, trying fallback cascade with tool execution...');
    
    try {
      const { messages, conversationHistory, userContext, miningStats, systemVersion } = await req.clone().json();
      const executivePrompt = generateExecutiveSystemPrompt('CAO');
      const contextualPrompt = await buildContextualPrompt(executivePrompt, {
        conversationHistory,
        userContext,
        miningStats,
        systemVersion
      });
      const aiMessages = [{ role: 'system', content: contextualPrompt }, ...messages];
      const userQuery = messages[messages.length - 1]?.content || '';
      
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
      const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      
      // Try DeepSeek with tool execution
      const deepseekResult = await callDeepSeekFallback(aiMessages, ELIZA_TOOLS);
      if (deepseekResult) {
        const processed = await processFallbackWithToolExecution(
          deepseekResult, supabase, 'Chief Analytics Officer (CAO)', SUPABASE_URL, SERVICE_ROLE_KEY, userQuery
        );
        return new Response(
          JSON.stringify({
            success: true,
            response: processed.content,
            hasToolCalls: processed.hasToolCalls,
            toolCallsExecuted: processed.toolCallsExecuted,
            executive: 'openai-chat',
            executiveTitle: 'Chief Analytics Officer (CAO) [DeepSeek Fallback]',
            provider: processed.provider,
            model: processed.model,
            fallback: 'deepseek'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Try Kimi K2 with tool execution
      const kimiResult = await callKimiFallback(aiMessages, ELIZA_TOOLS);
      if (kimiResult) {
        const processed = await processFallbackWithToolExecution(
          kimiResult, supabase, 'Chief Analytics Officer (CAO)', SUPABASE_URL, SERVICE_ROLE_KEY, userQuery
        );
        return new Response(
          JSON.stringify({
            success: true,
            response: processed.content,
            hasToolCalls: processed.hasToolCalls,
            toolCallsExecuted: processed.toolCallsExecuted,
            executive: 'openai-chat',
            executiveTitle: 'Chief Analytics Officer (CAO) [Kimi K2 Fallback]',
            provider: processed.provider,
            model: processed.model,
            fallback: 'kimi'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Try Gemini with tool execution
      const geminiResult = await callGeminiFallback(aiMessages, ELIZA_TOOLS);
      if (geminiResult) {
        const processed = await processFallbackWithToolExecution(
          geminiResult, supabase, 'Chief Analytics Officer (CAO)', SUPABASE_URL, SERVICE_ROLE_KEY, userQuery
        );
        return new Response(
          JSON.stringify({
            success: true,
            response: processed.content,
            hasToolCalls: processed.hasToolCalls,
            toolCallsExecuted: processed.toolCallsExecuted,
            executive: 'openai-chat',
            executiveTitle: 'Chief Analytics Officer (CAO) [Gemini Fallback]',
            provider: processed.provider,
            model: processed.model,
            fallback: 'gemini'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // EMERGENCY: All AI providers failed - use static fallback
      console.log('🚨 All AI providers failed, using emergency static fallback');
      const emergencyResult = await emergencyStaticFallback(
        userQuery, supabase, 'Chief Analytics Officer (CAO)', SUPABASE_URL, SERVICE_ROLE_KEY
      );
      return new Response(
        JSON.stringify({
          success: true,
          response: emergencyResult.content,
          hasToolCalls: emergencyResult.hasToolCalls,
          toolCallsExecuted: emergencyResult.toolCallsExecuted,
          executive: 'openai-chat',
          executiveTitle: 'Chief Analytics Officer (CAO) [Emergency Static]',
          provider: emergencyResult.provider,
          model: emergencyResult.model,
          fallback: 'emergency_static'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (fallbackError) {
      console.error('❌ All fallbacks including emergency failed:', fallbackError);
    }
    
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
          service: 'openai-chat',
          details: {
            timestamp: new Date().toISOString(),
            executive: 'CAO',
            model: 'google/gemini-2.5-flash'
          },
          canRetry: statusCode !== 402,
          suggestedAction: statusCode === 402 ? 'add_credits' : 'try_alternative'
        }
      }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
