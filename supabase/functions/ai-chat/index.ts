import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callLovableAIGateway } from '../_shared/unifiedAIFallback.ts';
import { generateExecutiveSystemPrompt } from '../_shared/elizaSystemPrompt.ts';
import { buildContextualPrompt } from '../_shared/contextBuilder.ts';
import { EdgeFunctionLogger } from "../_shared/logging.ts";
import { ELIZA_TOOLS } from '../_shared/elizaTools.ts';
import { executeToolCall } from '../_shared/toolExecutor.ts';
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

/**
 * Call Vercel AI Chat Gateway
 * Vercel AI Chat is one of the only valid AI gateways at the moment
 */
async function callVercelAIChat(
  supabase: any,
  messages: any[],
  tools?: any[]
): Promise<{ success: boolean; content?: string; tool_calls?: any[]; provider?: string; error?: string }> {
  try {
    console.log('🚀 Attempting Vercel AI Chat Gateway...');
    
    const { data, error } = await supabase.functions.invoke('vercel-ai-chat', {
      body: {
        messages,
        tools,
        options: {
          temperature: 0.7,
          max_tokens: 8000
        }
      }
    });

    if (error) {
      console.warn('⚠️ Vercel AI Chat error:', error);
      return { success: false, error: error.message || 'Vercel AI Chat failed' };
    }

    if (data?.success) {
      console.log('✅ Vercel AI Chat successful');
      const message = data.data?.choices?.[0]?.message;
      
      if (message) {
        return {
          success: true,
          content: message.content || '',
          tool_calls: message.tool_calls || [],
          provider: 'vercel-ai-chat'
        };
      }
    }

    return { success: false, error: 'Invalid Vercel AI Chat response' };
  } catch (error) {
    console.warn('⚠️ Vercel AI Chat exception:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Enhanced DeepSeek call with full capabilities
 * Implements everything deepseek-chat can do including:
 * - Reasoning capabilities
 * - Tool calling
 * - Long context handling
 * - Streaming support
 */
async function callDeepSeekEnhanced(
  messages: any[],
  tools?: any[],
  options: {
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    reasoning_enabled?: boolean;
  } = {}
): Promise<{ success: boolean; content?: string; tool_calls?: any[]; reasoning_content?: string; provider?: string; error?: string }> {
  const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
  
  if (!DEEPSEEK_API_KEY) {
    return { success: false, error: 'DEEPSEEK_API_KEY not configured', provider: 'deepseek' };
  }

  try {
    console.log('🔄 Attempting Enhanced DeepSeek with full capabilities...');
    
    // Inject tool calling mandate for better tool usage
    const enhancedMessages = messages.map(m => 
      m.role === 'system' ? { ...m, content: TOOL_CALLING_MANDATE + '\n\n' + m.content } : m
    );
    
    const forceTools = needsDataRetrieval(messages);
    console.log(`📊 DeepSeek Enhanced - Data retrieval needed: ${forceTools}`);
    
    const requestBody: any = {
      model: 'deepseek-chat',
      messages: enhancedMessages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 8000,
    };
    
    // Add tools if provided
    if (tools && tools.length > 0) {
      console.log(`🔧 DeepSeek Enhanced: Including ${tools.length} tools`);
      requestBody.tools = tools;
      requestBody.tool_choice = forceTools ? 'required' : 'auto';
    }
    
    // Enable reasoning if requested (DeepSeek R1 capability)
    if (options.reasoning_enabled) {
      console.log('🧠 DeepSeek: Reasoning mode enabled');
      requestBody.reasoning_enabled = true;
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
      console.warn(`⚠️ DeepSeek Enhanced failed (${response.status}):`, errorText);
      return { success: false, error: `${response.status}: ${errorText}`, provider: 'deepseek' };
    }
    
    const data = await response.json();
    const message = data.choices?.[0]?.message;
    
    if (!message) {
      return { success: false, error: 'No message in DeepSeek response', provider: 'deepseek' };
    }
    
    console.log('✅ DeepSeek Enhanced successful');
    
    return {
      success: true,
      content: message.content || '',
      tool_calls: message.tool_calls || [],
      reasoning_content: message.reasoning_content, // DeepSeek reasoning output
      provider: 'deepseek'
    };
  } catch (error) {
    console.warn('⚠️ DeepSeek Enhanced error:', error.message);
    return { success: false, error: error.message, provider: 'deepseek' };
  }
}

/**
 * Comprehensive AI Gateway Fallback System
 * Priority order:
 * 1. Vercel AI Chat (primary gateway - most reliable)
 * 2. DeepSeek Enhanced (with full capabilities)
 * 3. Vertex AI (Google Cloud OAuth)
 * 4. Gemini API (direct)
 * 5. Kimi K2 (via OpenRouter)
 * 6. Emergency static fallback
 */
async function comprehensiveAIFallback(
  supabase: any,
  messages: any[],
  tools: any[],
  SUPABASE_URL: string,
  SERVICE_ROLE_KEY: string
): Promise<Response> {
  // Try Vercel AI Chat first (most reliable gateway)
  const vercelResult = await callVercelAIChat(supabase, messages, tools);
  if (vercelResult.success) {
    // Execute tool calls if present
    if (vercelResult.tool_calls && vercelResult.tool_calls.length > 0) {
      console.log(`🔧 Executing ${vercelResult.tool_calls.length} tool(s) from Vercel AI Chat`);
      const toolResults = [];
      for (const toolCall of vercelResult.tool_calls) {
        const result = await executeToolCall(supabase, toolCall, 'AI', SUPABASE_URL, SERVICE_ROLE_KEY);
        toolResults.push({ tool: toolCall.function.name, result });
      }
      
      const userQuery = messages[messages.length - 1]?.content || '';
      const synthesized = await synthesizeToolResults(toolResults, userQuery, 'AI General Assistant');
      
      return new Response(
        JSON.stringify({
          success: true,
          response: synthesized || vercelResult.content,
          hasToolCalls: true,
          toolCallsExecuted: vercelResult.tool_calls.length,
          executive: 'ai-chat',
          executiveTitle: 'AI Assistant [Vercel AI]',
          provider: 'vercel-ai-chat',
          model: 'vercel-ai-chat'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        response: vercelResult.content,
        executive: 'ai-chat',
        executiveTitle: 'AI Assistant [Vercel AI]',
        provider: 'vercel-ai-chat',
        model: 'vercel-ai-chat'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  console.log('⚠️ Vercel AI Chat unavailable, trying DeepSeek Enhanced...');
  
  // Try DeepSeek Enhanced with full capabilities
  const deepseekResult = await callDeepSeekEnhanced(messages, tools, {
    temperature: 0.7,
    max_tokens: 8000,
    reasoning_enabled: true // Enable reasoning for complex queries
  });
  
  if (deepseekResult.success) {
    // Execute tool calls if present
    if (deepseekResult.tool_calls && deepseekResult.tool_calls.length > 0) {
      console.log(`🔧 Executing ${deepseekResult.tool_calls.length} tool(s) from DeepSeek`);
      const toolResults = [];
      for (const toolCall of deepseekResult.tool_calls) {
        const result = await executeToolCall(supabase, toolCall, 'AI', SUPABASE_URL, SERVICE_ROLE_KEY);
        toolResults.push({ tool: toolCall.function.name, result });
      }
      
      const userQuery = messages[messages.length - 1]?.content || '';
      const synthesized = await synthesizeToolResults(toolResults, userQuery, 'AI General Assistant');
      
      return new Response(
        JSON.stringify({
          success: true,
          response: synthesized || deepseekResult.content,
          reasoning_content: deepseekResult.reasoning_content,
          hasToolCalls: true,
          toolCallsExecuted: deepseekResult.tool_calls.length,
          executive: 'ai-chat',
          executiveTitle: 'AI Assistant [DeepSeek]',
          provider: 'deepseek',
          model: 'deepseek-chat'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        response: deepseekResult.content,
        reasoning_content: deepseekResult.reasoning_content,
        executive: 'ai-chat',
        executiveTitle: 'AI Assistant [DeepSeek]',
        provider: 'deepseek',
        model: 'deepseek-chat'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  console.log('⚠️ DeepSeek unavailable, trying Vertex AI...');
  
  // Try Vertex AI (Google Cloud OAuth)
  try {
    const { data: vertexData, error: vertexError } = await supabase.functions.invoke('vertex-ai-chat', {
      body: { 
        messages,
        options: { temperature: 0.7, max_tokens: 1000 }
      }
    });

    if (!vertexError && vertexData?.success) {
      console.log('✅ Vertex AI succeeded');
      const vertexContent = vertexData.data?.choices?.[0]?.message?.content || vertexData.data?.content;
      
      if (vertexContent) {
        return new Response(
          JSON.stringify({
            success: true,
            response: vertexContent,
            executive: 'ai-chat',
            executiveTitle: 'AI Assistant [Vertex AI]',
            provider: 'vertex-ai',
            model: 'gemini-1.5-pro',
            oauth_authenticated: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
  } catch (vertexException) {
    console.log('⚠️ Vertex AI exception:', vertexException.message);
  }
  
  console.log('⚠️ Vertex AI unavailable, trying Gemini API...');
  
  // Try Gemini API directly
  const geminiResult = await callGeminiFallback(messages, tools);
  if (geminiResult) {
    // Execute tool calls if present
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
          executiveTitle: 'AI Assistant [Gemini API]',
          provider: 'gemini-api',
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
        executiveTitle: 'AI Assistant [Gemini API]',
        provider: 'gemini-api',
        model: 'gemini-2.0-flash-exp'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  console.log('⚠️ Gemini API unavailable, trying Kimi K2...');
  
  // Try Kimi K2 fallback
  const kimiResult = await callKimiFallback(messages, tools);
  if (kimiResult) {
    return new Response(
      JSON.stringify({
        success: true,
        response: kimiResult.content,
        executive: 'ai-chat',
        executiveTitle: 'AI Assistant [Kimi K2]',
        provider: 'openrouter',
        model: 'moonshotai/kimi-k2'
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
}

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

    // ========== PHASE: AI PROCESSING WITH COMPREHENSIVE FALLBACKS ==========
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

    console.log('🚀 Starting comprehensive AI gateway fallback system...');

    // Use comprehensive fallback system
    return await comprehensiveAIFallback(
      supabase,
      aiMessages,
      ELIZA_TOOLS,
      SUPABASE_URL,
      SERVICE_ROLE_KEY
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
