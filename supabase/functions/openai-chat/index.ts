import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAIWithFallback, UnifiedAIOptions } from '../_shared/unifiedAIFallback.ts';
import { EdgeFunctionLogger } from "../_shared/logging.ts";

const logger = EdgeFunctionLogger('openai-executive');
const FUNCTION_NAME = 'openai-chat';
const EXECUTIVE_NAME = 'OPENAI';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, messages, conversationHistory, userContext, councilMode } = await req.json();
    const userMessage = message || messages?.[messages.length - 1]?.content || '';

    // Construct messages array if only single message provided
    const chatMessages = messages || [
      { role: 'user', content: userMessage }
    ];

    console.log(`🤖 ${EXECUTIVE_NAME} Executive Processing: ${chatMessages.length} messages, Council: ${councilMode}`);

    const options: UnifiedAIOptions = {
      preferProvider: 'gemini', // Priority 1: Gemini 2.5 (Innovation/Reasoning) - Replaces OpenAI for reliability
      userContext,
      executiveName: 'OpenAI Innovation Director',
      useFullElizaContext: true,
      maxTokens: 4000,
      temperature: 0.7,
      // Fallback chain: Gemini -> Vertex -> Lovable -> DeepSeek -> Kimi
    };

    // Handle Council Mode specifically
    if (councilMode) {
      options.systemPrompt = "=== COUNCIL MODE ACTIVATED ===\nYou are participating in an executive council deliberation. Provide innovative, creative, and forward-thinking input from the Innovation Director perspective. Focus on new opportunities, creative solutions, and out-of-the-box thinking.";
    } else {
      options.systemPrompt = "You are OpenAI Executive, an Innovation Director. You help with innovation strategy, product development, and creative ideation. Be helpful, innovative, and professional.";
    }

    // Call Unified AI Fallback
    try {
      const result = await callAIWithFallback(chatMessages, options);

      let content = '';
      let provider = 'unknown';

      if (typeof result === 'string') {
        content = result;
      } else {
        content = result.content || '';
        provider = result.provider || 'unknown';
      }

      return new Response(
        JSON.stringify({
          content: content, // Compatibility for ExecutiveCouncilService
          choices: [{
            message: {
              content: content,
              role: 'assistant'
            }
          }],
          success: true,
          executive: 'openai-chat',
          provider: provider,
          model: 'unified-fallback-cascade',
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (aiError) {
      console.error('Unified AI Fallback failed for OpenAI executive:', aiError);

      // Final fallback if everything fails
      return new Response(
        JSON.stringify({
          content: `I'm unable to provide innovation insights at this moment due to system capacity. Please verify system status or try again shortly.`,
          choices: [{
            message: {
              content: `I'm unable to provide innovation insights at this moment due to system capacity. Please verify system status or try again shortly.`,
              role: 'assistant'
            }
          }],
          success: false,
          executive: 'openai-chat',
          provider: 'system-error',
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
