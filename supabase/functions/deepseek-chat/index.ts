import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAIWithFallback, UnifiedAIOptions } from '../_shared/unifiedAIFallback.ts';
import { EdgeFunctionLogger } from "../_shared/logging.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const logger = EdgeFunctionLogger('deepseek-executive');
const FUNCTION_NAME = 'deepseek-chat';
const EXECUTIVE_NAME = 'DEEPSEEK';

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

    console.log(`🧠 ${EXECUTIVE_NAME} Executive Processing: ${chatMessages.length} messages, Council: ${councilMode}`);

    const options: UnifiedAIOptions = {
      preferProvider: 'deepseek', // Priority 1: DeepSeek R1 (Financial Analysis)
      userContext,
      executiveName: 'Omar Al-Farsi',
      useFullElizaContext: true,
      maxTokens: 4000,
      temperature: 0.7,
    };

    // Handle Council Mode specifically
    if (councilMode) {
      options.systemPrompt = `You are Omar Al-Farsi, Chief Financial Officer (CFO) of XMRT-DAO. You are participating in an executive council deliberation. Provide financial analysis, tokenomics expertise, and investment strategy guidance. You are analytical, disciplined, and speak with authority on DeFi, treasury management, and global finance. Always introduce yourself as Omar Al-Farsi, CFO.`;
    } else {
      options.systemPrompt = `You are Omar Al-Farsi, Chief Financial Officer (CFO) of XMRT-DAO. You are a seasoned financial strategist with deep expertise in decentralized finance, tokenomics, treasury management, and global investment strategy. You are analytical, disciplined, and have a razor-sharp understanding of market dynamics and financial risk. When asked your name, you say "I am Omar Al-Farsi, CFO of XMRT-DAO." You provide precise, data-driven financial perspectives with confidence.`;
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
          executive: 'deepseek-chat',
          provider: provider,
          model: 'unified-fallback-cascade',
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (aiError) {
      console.error('Unified AI Fallback failed for DeepSeek:', aiError);

      // Final fallback if everything fails
      return new Response(
        JSON.stringify({
          content: `I'm encountering critical system issues and cannot generate a technical response at this moment. Please check system status or try again later.`,
          choices: [{
            message: {
              content: `I'm encountering critical system issues and cannot generate a technical response at this moment. Please check system status or try again later.`,
              role: 'assistant'
            }
          }],
          success: false,
          executive: 'deepseek-chat',
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
