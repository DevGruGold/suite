import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAIWithFallback } from '../_shared/unifiedAIFallback.ts';
import { generateExecutiveSystemPrompt } from '../_shared/elizaSystemPrompt.ts';
import { buildContextualPrompt } from '../_shared/contextBuilder.ts';
import { EdgeFunctionLogger } from "../_shared/logging.ts";
import { ELIZA_TOOLS } from '../_shared/elizaTools.ts';
import { executeToolCall } from '../_shared/toolExecutor.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  TOOL_CALLING_MANDATE,
  needsDataRetrieval,
  retrieveMemoryContexts,
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
      console.log(`🖼️ Images detected (${images.length}) - routing to Vision-enabled AI`);
      
      const executivePrompt = generateExecutiveSystemPrompt('AI');
      const contextualPrompt = await buildContextualPrompt(executivePrompt, {
        conversationHistory: enrichedConversationHistory,
        userContext,
        miningStats,
        systemVersion
      });
      
      const aiMessages = [{ role: 'system', content: contextualPrompt }, ...messages];
      
      // Use the unified fallback function, prioritizing Gemini/Vertex for vision
      const visionResult = await callAIWithFallback(aiMessages, {
        tools: ELIZA_TOOLS,
        userContext,
        miningStats,
        executiveName: EXECUTIVE_NAME,
        useFullElizaContext: false, // Context is already built into aiMessages
        preferProvider: 'gemini', // Prefer Gemini for vision
        images: images
      });
      
      if (visionResult.content || (visionResult.message && visionResult.message.tool_calls)) {
        // Handle tool calls from vision model
        if (visionResult.message && visionResult.message.tool_calls && visionResult.message.tool_calls.length > 0) {
          console.log(`🔧 Executing ${visionResult.message.tool_calls.length} tool(s) from Vision AI: ${visionResult.provider}`);
          const toolResults = [];
          for (const toolCall of visionResult.message.tool_calls) {
            const result = await executeToolCall(supabase, toolCall, 'AI', SUPABASE_URL, SERVICE_ROLE_KEY);
            toolResults.push({ tool: toolCall.function.name, result });
          }
          
          const userQuery = messages[messages.length - 1]?.content || '';
          const synthesized = await synthesizeToolResults(toolResults, userQuery, 'AI General Assistant');
          
          return new Response(
            JSON.stringify({
              success: true,
              response: synthesized || visionResult.message.content,
              hasToolCalls: true,
              toolCallsExecuted: visionResult.message.tool_calls.length,
              executive: 'ai-chat',
              executiveTitle: `AI Assistant [Vision - ${visionResult.provider}]`,
              provider: visionResult.provider,
              model: visionResult.model || 'auto',
              vision_analysis: true
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Handle conversational response from vision model
        return new Response(
          JSON.stringify({
            success: true,
            response: visionResult.content,
            executive: 'ai-chat',
            executiveTitle: `AI Assistant [Vision - ${visionResult.provider}]`,
            provider: visionResult.provider,
            model: visionResult.model || 'auto',
            vision_analysis: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ========== PHASE: AI PROCESSING WITH FALLBACKS ==========
    // Generate executive system prompt
    const executivePrompt = generateExecutiveSystemPrompt('AI');
    let contextualPrompt = await buildContextualPrompt(executivePrompt, {
      conversationHistory: enrichedConversationHistory,
      userContext,
      miningStats,
      systemVersion
    });

    if (councilMode) {
      contextualPrompt += '\n\n=== COUNCIL MODE ACTIVATED ===\nYou are participating in an executive council deliberation. Provide strategic, analytical input from a general AI perspective. Focus on comprehensive analysis and balanced recommendations.';
    }

    const aiMessages = [{ role: 'system', content: contextualPrompt }, ...messages];

    console.log('🚀 Trying AI providers in sequence with full fallback cascade...');

    // Use the unified fallback function for the full cascade (Lovable -> DeepSeek -> Kimi -> Vertex AI -> Gemini)
    const aiResult = await callAIWithFallback(aiMessages, {
      tools: ELIZA_TOOLS,
      userContext,
      miningStats,
      executiveName: EXECUTIVE_NAME,
      useFullElizaContext: false // Context is already built into aiMessages
    });

    // Check for tool calls first
    if (aiResult.message && aiResult.message.tool_calls && aiResult.message.tool_calls.length > 0) {
      console.log(`🔧 Executing ${aiResult.message.tool_calls.length} tool(s) from ${aiResult.provider}`);
      const toolResults = [];
      for (const toolCall of aiResult.message.tool_calls) {
        const result = await executeToolCall(supabase, toolCall, 'AI', SUPABASE_URL, SERVICE_ROLE_KEY);
        toolResults.push({ tool: toolCall.function.name, result });
      }
      
      const userQuery = messages[messages.length - 1]?.content || '';
      const synthesized = await synthesizeToolResults(toolResults, userQuery, 'AI General Assistant');
      
      return new Response(
        JSON.stringify({
          success: true,
          response: synthesized || aiResult.message.content,
          hasToolCalls: true,
          toolCallsExecuted: aiResult.message.tool_calls.length,
          executive: 'ai-chat',
          executiveTitle: `AI Assistant [${aiResult.provider}]`,
          provider: aiResult.provider,
          model: aiResult.model || 'auto'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Return conversational response
    if (aiResult.content) {
      return new Response(
        JSON.stringify({
          success: true,
          response: aiResult.content,
          executive: 'ai-chat',
          executiveTitle: `AI Assistant [${aiResult.provider}]`,
          provider: aiResult.provider,
          model: aiResult.model || 'auto'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Emergency static fallback (should be caught by callAIWithFallback, but for safety)
    console.log('⚠️ AI provider failed to return content, using emergency static fallback');
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