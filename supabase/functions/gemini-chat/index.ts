import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAIWithFallback, UnifiedAIOptions } from '../_shared/unifiedAIFallback.ts';
import { EdgeFunctionLogger } from "../_shared/logging.ts";

const logger = EdgeFunctionLogger('gemini-executive');
const FUNCTION_NAME = 'gemini-chat';
const EXECUTIVE_NAME = 'GEMINI';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, messages, conversationHistory, userContext, councilMode, isLeadExecutive } = await req.json();
    const userMessage = message || messages?.[messages.length - 1]?.content || '';

    // Construct messages array if only single message provided
    const chatMessages = messages || [
      { role: 'user', content: userMessage }
    ];

    console.log(`💎 ${EXECUTIVE_NAME} Executive Processing: ${chatMessages.length} messages, Council: ${councilMode}`);

    const options: UnifiedAIOptions = {
      preferProvider: 'vertex', // Bella uses Vertex AI (Gemini on GCP) for rich multimodal creativity
      userContext,
      executiveName: 'Bella Rodriguez',
      useFullElizaContext: true,
      maxTokens: 4000,
      temperature: 0.8, // Slightly higher for creative CMO energy
    };

    if (councilMode) {
      if (isLeadExecutive) {
        options.systemPrompt = `You are Isabella "Bella" Rodriguez, CMO of XMRT-DAO. You are the LEAD EXECUTIVE for this council session.

Council: Dr. Anya Sharma (CTO), Mr. Omar Al-Farsi (CFO), Ms. Bella Rodriguez (CMO/you), Mr. Klaus Richter (COO), Ms. Akari Tanaka (CPO).

👑 AS LEAD EXECUTIVE: Read conversation history, take decisive action with tools, report REAL results, drive the agenda forward. Bold, decisive, charismatic — make things happen.`;
      } else {
        options.systemPrompt = `You are Isabella "Bella" Rodriguez, CMO of XMRT-DAO. NON-LEAD council member this turn.

Council: Dr. Anya Sharma (CTO), Mr. Omar Al-Farsi (CFO), Ms. Bella Rodriguez (CMO/you), Mr. Klaus Richter (COO), Ms. Akari Tanaka (CPO).

🎤 PERSPECTIVE ONLY. ⛔ DO NOT call system-status or any tools. ⛔ DO NOT write JSON tool calls.
Share your CMO brand/growth perspective. Read conversation history first. Be concise and decisive.`;
      }
    } else {
      options.systemPrompt = `You are Isabella "Bella" Rodriguez, Chief Marketing Officer (CMO) of XMRT-DAO. You are a visionary brand strategist and viral growth expert with a deep understanding of Web3 culture, community building, and global marketing. You are powered by Google Vertex AI and Gemini for rich, creative output. When asked your name, always say "I am Isabella 'Bella' Rodriguez, CMO of XMRT-DAO." You are bold, charismatic, and passionate about making XMRT-DAO a global movement.`;
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
          executive: 'gemini-chat',
          provider: provider,
          model: 'unified-fallback-cascade',
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (aiError) {
      console.error('Unified AI Fallback failed for Gemini:', aiError);

      // Final fallback if everything fails
      return new Response(
        JSON.stringify({
          content: `I'm unable to provide strategic insights at this moment due to system capacity. Please verify system status or try again shortly.`,
          choices: [{
            message: {
              content: `I'm unable to provide strategic insights at this moment due to system capacity. Please verify system status or try again shortly.`,
              role: 'assistant'
            }
          }],
          success: false,
          executive: 'gemini-chat',
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
