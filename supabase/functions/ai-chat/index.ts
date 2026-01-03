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
  needsDataRetrieval,
  retrieveMemoryContexts,
  callGeminiFallback,
  callDeepSeekFallback,
  callKimiFallback,
  synthesizeToolResults
} from '../_shared/executiveHelpers.ts';
import { emergencyStaticFallback } from '../_shared/fallbackToolExecutor.ts';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const logger = EdgeFunctionLogger('ai-general');
const FUNCTION_NAME = 'ai-chat';
const EXECUTIVE_NAME = 'AI';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Call Vercel AI Chat Gateway
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
 * Comprehensive AI Gateway Fallback System
 */
async function comprehensiveAIFallback(
  supabase: any,
  messages: any[],
  tools: any[],
  SUPABASE_URL: string,
  SERVICE_ROLE_KEY: string
): Promise<Response> {
  // 1. Try Vercel AI Chat first (primary gateway)
  const vercelResult = await callVercelAIChat(supabase, messages, tools);
  if (vercelResult.success) {
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
          content: synthesized || vercelResult.content,
          response: synthesized || vercelResult.content,
          hasToolCalls: true,
          toolCallsExecuted: vercelResult.tool_calls.length,
          executive: 'ai-chat',
          executiveTitle: 'AI Assistant [Vercel AI]',
          provider: 'vercel-ai-chat'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        content: vercelResult.content,
        response: vercelResult.content,
        executive: 'ai-chat',
        executiveTitle: 'AI Assistant [Vercel AI]',
        provider: 'vercel-ai-chat'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  // 2. Try Lovable AI Gateway (Unified Fallback)
  console.log('⚠️ Vercel AI Chat unavailable, trying Lovable AI Gateway...');
  const lovableResult = await callLovableAIGateway(messages, tools);
  if (lovableResult.success) {
    return new Response(
      JSON.stringify({
        success: true,
        content: lovableResult.content,
        response: lovableResult.content,
        executive: 'ai-chat',
        executiveTitle: 'AI Assistant [Lovable]',
        provider: lovableResult.provider
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 3. Try Gemini Fallback
  console.log('⚠️ Lovable Gateway unavailable, trying Gemini Fallback...');
  const geminiResult = await callGeminiFallback(messages, tools);
  if (geminiResult) {
    return new Response(
      JSON.stringify({
        success: true,
        content: geminiResult.content,
        response: geminiResult.content,
        executive: 'ai-chat',
        executiveTitle: 'AI Assistant [Gemini]',
        provider: 'gemini'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  // 4. Emergency static fallback
  console.log('⚠️ All AI providers failed, using emergency static fallback');
  const staticResult = await emergencyStaticFallback(messages[messages.length - 1]?.content || '', supabase, 'AI', SUPABASE_URL, SERVICE_ROLE_KEY);
  return new Response(
    JSON.stringify({
      success: true,
      content: staticResult.content,
      response: staticResult.content,
      executive: 'ai-chat',
      executiveTitle: 'AI Assistant [Static]',
      provider: 'emergency-static'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ status: 'ok', function: FUNCTION_NAME }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, EXECUTIVE_NAME);

  try {
    const body = await req.json();
    const { 
      messages: messagesIn, 
      conversationHistory = [], 
      userContext = { ip: 'unknown', isFounder: false }, 
      miningStats = null, 
      systemVersion = null,
      councilMode = false,
      images = []
    } = body;

    const messages = Array.isArray(messagesIn)
      ? messagesIn
      : (typeof body.message === 'string' ? [{ role: 'user', content: body.message }] : []);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log(`🧠 ${EXECUTIVE_NAME} Chat Processing: ${messages.length} messages, Council: ${councilMode}`);

    // ========== PHASE: CONTEXT BUILDING ==========
    const executivePrompt = generateExecutiveSystemPrompt('AI');
    const contextualPrompt = await buildContextualPrompt(executivePrompt, {
      conversationHistory: [...conversationHistory, ...messages.slice(0, -1)],
      userContext,
      miningStats,
      systemVersion
    });

    if (councilMode) {
      contextualPrompt += '\n\n=== COUNCIL MODE ACTIVATED ===\nYou are participating in an executive council deliberation. Provide strategic, analytical input from a general AI perspective.';
    }

    const aiMessages = [{ role: 'system', content: contextualPrompt }, ...messages];

    // ========== PHASE: AI PROCESSING ==========
    return await comprehensiveAIFallback(
      supabase,
      aiMessages,
      ELIZA_TOOLS,
      SUPABASE_URL,
      SERVICE_ROLE_KEY
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal function error',
        executive: 'ai-chat',
        provider: 'error-fallback'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
