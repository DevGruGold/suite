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
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const logger = EdgeFunctionLogger('ai-general');
const FUNCTION_NAME = 'ai-chat';
const EXECUTIVE_NAME = 'AI';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TOOL_ITERATIONS = 5;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Start usage tracking at function entry
  const usageTracker = startUsageTracking(FUNCTION_NAME, EXECUTIVE_NAME);

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

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log(`🧠 ${EXECUTIVE_NAME} Chat Processing: ${messages.length} messages, Council: ${councilMode}`);

    // ========== PHASE: MEMORY RETRIEVAL ==========
    const enrichedConversationHistory = conversationHistory;
    
    if (needsDataRetrieval(messages)) {
      console.log('🔍 Retrieving memory contexts for enhanced response generation');
      const memoryContexts = await retrieveMemoryContexts(supabase, messages, userContext);
      
      if (memoryContexts && memoryContexts.length > 0) {
        console.log(`📚 Injected ${memoryContexts.length} memory contexts`);
        
        const memoryContext = memoryContexts.map(ctx => 
          `Memory Context: ${ctx.type} - ${ctx.content.substring(0, 200)}...`
        ).join('\n');
        
        const executivePrompt = generateExecutiveSystemPrompt('AI');
        const enhancedPrompt = `${executivePrompt}\n\n=== RELEVANT MEMORY CONTEXTS ===\n${memoryContext}\n\nUse these contexts to provide informed, detailed responses based on our previous interactions and established knowledge base.`;
        
        enrichedConversationHistory.unshift({
          role: 'system',
          content: enhancedPrompt
        });
      }
    }

    // ========== PHASE: VISION ROUTING ==========
    if (images && images.length > 0) {
      console.log(`🖼️ Images detected (${images.length}) - routing to Gemini Vision`);
      
      const executivePrompt = generateExecutiveSystemPrompt('AI');
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
            const result = await executeToolCall(supabase, toolCall, 'AI', SUPABASE_URL, SERVICE_ROLE_KEY);
            toolResults.push({ tool: toolCall.function.name, result });
          }
          
          const userQuery = messages[messages.length - 1]?.content || '';
          const synthesized = await synthesizeToolResults(toolResults, userQuery, 'AI General Assistant');
          
          return new Response(
            JSON.stringify({
              success: true,
              response: synthesized || geminiResult.content,
              hasToolCalls: true,
              toolCallsExecuted: geminiResult.tool_calls.length,
              executive: 'ai-chat',
              executiveTitle: 'AI Assistant [Vision]',
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
            executive: 'ai-chat',
            executiveTitle: 'AI Assistant [Vision]',
            provider: 'gemini',
            model: 'gemini-2.0-flash-exp',
            vision_analysis: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ========== PHASE: AI PROCESSING WITH FALLBACKS ==========
    // Generate executive system prompt
    const executivePrompt = generateExecutiveSystemPrompt('AI');
    const contextualPrompt = await buildContextualPrompt(executivePrompt, {
      conversationHistory: enrichedConversationHistory,
      userContext,
      miningStats,
      systemVersion
    });

    if (councilMode) {
      contextualPrompt += '\n\n=== COUNCIL MODE ACTIVATED ===\nYou are participating in an executive council deliberation. Provide strategic, analytical input from a general AI perspective. Focus on comprehensive analysis and balanced recommendations.';
    }

    const aiMessages = [{ role: 'system', content: contextualPrompt }, ...messages];

    console.log('🚀 Trying AI providers in sequence...');

    // Try Gemini first (most reliable for general AI)
    const geminiResult = await callGeminiFallback(aiMessages, ELIZA_TOOLS);
    if (geminiResult) {
      // Execute any tool calls from Gemini
      if (geminiResult.tool_calls && geminiResult.tool_calls.length > 0) {
        console.log(`🔧 Executing ${geminiResult.tool_calls.length} tool(s) from Gemini`);
        const toolResults = [];
        for (const toolCall of geminiResult.tool_calls) {
          const result = await executeToolCall(supabase, toolCall, 'AI', SUPABASE_URL, SERVICE_ROLE_KEY);
          toolResults.push({ tool: toolCall.function.name, result });
        }
        
        const userQuery = messages[messages.length - 1]?.content || '';
        const synthesized = await synthesizeToolResults(toolResults, userQuery, 'AI General Assistant');
        
        return new Response(
          JSON.stringify({
            success: true,
            response: synthesized || geminiResult.content,
            hasToolCalls: true,
            toolCallsExecuted: geminiResult.tool_calls.length,
            executive: 'ai-chat',
            executiveTitle: 'AI Assistant',
            provider: 'gemini',
            model: 'gemini-2.0-flash-exp'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          response: geminiResult.content,
          executive: 'ai-chat',
          executiveTitle: 'AI Assistant',
          provider: 'gemini',
          model: 'gemini-2.0-flash-exp'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try DeepSeek fallback
    console.log('🔄 Trying DeepSeek fallback...');
    const deepseekResult = await callDeepSeekFallback(aiMessages, ELIZA_TOOLS);
    if (deepseekResult) {
      return new Response(
        JSON.stringify({
          success: true,
          response: deepseekResult.content,
          executive: 'ai-chat',
          executiveTitle: 'AI Assistant',
          provider: 'deepseek-fallback',
          model: 'deepseek-chat'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Emergency static fallback
    console.log('⚠️ All AI providers failed, using emergency static fallback');
    return new Response(
      JSON.stringify({
        success: true,
        response: emergencyStaticFallback('AI', messages[messages.length - 1]?.content || ''),
        executive: 'ai-chat',
        executiveTitle: 'AI Assistant',
        provider: 'emergency-static'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Function error:', error);
    
    // Final emergency fallback
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal function error',
        executive: 'ai-chat',
        executiveTitle: 'AI Assistant',
        provider: 'error-fallback',
        message: emergencyStaticFallback('AI', 'system error')
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});