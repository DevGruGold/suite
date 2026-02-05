import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAIWithFallback, UnifiedAIOptions } from '../_shared/unifiedAIFallback.ts'; // USE ROBUST FALLBACK
import { EdgeFunctionLogger } from "../_shared/logging.ts";
import { ELIZA_TOOLS } from '../_shared/elizaTools.ts';
import { executeToolCall } from '../_shared/toolExecutor.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { synthesizeToolResults } from '../_shared/executiveHelpers.ts';
import { emergencyStaticFallback } from '../_shared/fallbackToolExecutor.ts';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const logger = EdgeFunctionLogger('lovable-executive');
const FUNCTION_NAME = 'lovable-chat';
const EXECUTIVE_NAME = 'LOVABLE';

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
  startUsageTracking(FUNCTION_NAME, EXECUTIVE_NAME);

  try {
    const {
      messages,
      conversationHistory = [],
      userContext = { ip: 'unknown', isFounder: false },
      miningStats = null,
      systemVersion = null,
      councilMode = false,
      images = [] // Support vision
    } = await req.json();

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log(`🧠 ${EXECUTIVE_NAME} Executive Processing: ${messages.length} messages, Council: ${councilMode}`);

    // Prepare Unified AI Options
    const options: UnifiedAIOptions = {
      preferProvider: 'gemini', // Priority 1: Gemini 2.5 Flash (Fastest/Smartest)
      userContext,
      miningStats,
      executiveName: 'Lovable Development Executive', // Specialized identity
      useFullElizaContext: true, // Inject full Eliza intelligence
      maxTokens: 4000,
      temperature: 0.7,
      tools: ELIZA_TOOLS // Enable full toolset
    };

    // Handle Council Mode specifically
    if (councilMode) {
      options.systemPrompt = "=== COUNCIL MODE ACTIVATED ===\nYou are participating in an executive council deliberation. Provide strategic, analytical input from the Lovable Development perspective. Focus on rapid prototyping, user experience, and development velocity.";
    }

    // Call Unified AI Fallback (Gemini -> Vertex -> Lovable -> DeepSeek -> Kimi)
    try {
      console.log('🚀 Calling Unified AI Fallback System...');
      const result = await callAIWithFallback(messages, options);

      // Handle response
      let responseContent = '';
      let toolCalls = [];
      let provider = 'unknown';

      if (typeof result === 'string') {
        responseContent = result;
      } else {
        responseContent = result.content || '';
        toolCalls = result.tool_calls || [];
        provider = result.provider || 'unknown';
      }

      // Execute Tool Calls if any
      if (toolCalls.length > 0) {
        console.log(`🔧 Executing ${toolCalls.length} tool(s) via ${provider}`);
        const toolResults = [];

        for (const toolCall of toolCalls) {
          const result = await executeToolCall(supabase, toolCall, 'LOVABLE', SUPABASE_URL, SERVICE_ROLE_KEY);
          toolResults.push({ tool: toolCall.function.name, result });
        }

        // Synthesize results
        const userQuery = messages[messages.length - 1]?.content || '';
        const synthesized = await synthesizeToolResults(toolResults, userQuery, 'Lovable Development Executive');

        return new Response(
          JSON.stringify({
            success: true,
            response: synthesized || responseContent,
            hasToolCalls: true,
            toolCallsExecuted: toolCalls.length,
            executive: 'lovable-chat',
            executiveTitle: 'Lovable Development Executive',
            provider: provider,
            model: 'unified-fallback-cascade' // Generic
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // No tools, just return response
      return new Response(
        JSON.stringify({
          success: true,
          response: responseContent,
          executive: 'lovable-chat',
          executiveTitle: 'Lovable Development Executive',
          provider: provider,
          model: 'unified-fallback-cascade'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (aiError) {
      console.warn('⚠️ Unified AI Fallback failed, trying emergency static fallback:', aiError);

      // Use existing static fallback as last resort (Office Clerk style)
      // But only if ALL 5 AI providers failed
      const fallbackResult = await emergencyStaticFallback(
        messages[messages.length - 1]?.content || '',
        supabase,
        'LOVABLE',
        SUPABASE_URL,
        SERVICE_ROLE_KEY
      );

      return new Response(
        JSON.stringify({
          success: true,
          response: fallbackResult.content,
          executive: 'lovable-chat',
          executiveTitle: 'Lovable Development Executive',
          provider: 'emergency-static',
          model: 'static-fallback'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Function error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal function error',
        executive: 'lovable-chat',
        executiveTitle: 'Lovable Development Executive',
        provider: 'error-fallback',
        message: 'System error occurred.'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});