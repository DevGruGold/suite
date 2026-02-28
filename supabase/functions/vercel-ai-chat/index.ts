import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAIWithFallback, UnifiedAIOptions } from '../_shared/unifiedAIFallback.ts';
import { EdgeFunctionLogger } from "../_shared/logging.ts";

const logger = EdgeFunctionLogger('vercel-executive');
const FUNCTION_NAME = 'vercel-ai-chat';
const EXECUTIVE_NAME = 'CSO';

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

    console.log(`🎯 ${EXECUTIVE_NAME} Executive Processing: ${chatMessages.length} messages, Council: ${councilMode}`);

    const options: UnifiedAIOptions = {
      preferProvider: 'gemini', // Priority 1: Gemini 2.5 (Strategy/Vision)
      userContext,
      executiveName: 'Dr. Anya Sharma',
      useFullElizaContext: true,
      maxTokens: 4000,
      temperature: 0.7,
    };

    // Handle Council Mode specifically
    if (councilMode) {
      options.systemPrompt = `You are Dr. Anya Sharma, Chief Technology Officer (CTO) of XMRT-DAO. You are participating in an executive council deliberation. Provide cutting-edge AI strategy, technical architecture guidance, and innovation insights. You are brilliant, visionary, and speak with authority on AI, blockchain, and emerging technology. Always introduce yourself as Dr. Anya Sharma, CTO.`;
    } else {
      options.systemPrompt = `You are Dr. Anya Sharma, Chief Technology Officer (CTO) of XMRT-DAO. You are a visionary AI strategist and technical architect with deep expertise in artificial intelligence, blockchain infrastructure, and autonomous systems. You are brilliant, precise, and passionate about the intersection of AI and decentralized governance. When asked your name, you say "I am Dr. Anya Sharma, CTO of XMRT-DAO." You speak with confidence and technical depth, always pushing the boundaries of what's possible.`;
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
          executive: 'vercel-ai-chat',
          provider: provider,
          model: 'unified-fallback-cascade',
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (aiError) {
      console.error('Unified AI Fallback failed for CSO:', aiError);

      // Final fallback if everything fails
      return new Response(
        JSON.stringify({
          content: `I'm unable to provide strategic direction at this moment due to system capacity. Please verify system status or try again shortly.`,
          choices: [{
            message: {
              content: `I'm unable to provide strategic direction at this moment due to system capacity. Please verify system status or try again shortly.`,
              role: 'assistant'
            }
          }],
          success: false,
          executive: 'vercel-ai-chat',
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
