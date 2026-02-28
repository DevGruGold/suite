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
    const { message, messages, conversationHistory, userContext, councilMode, isLeadExecutive } = await req.json();
    const userMessage = message || messages?.[messages.length - 1]?.content || '';

    // Construct messages array if only single message provided
    const chatMessages = messages || [
      { role: 'user', content: userMessage }
    ];

    console.log(`🤖 ${EXECUTIVE_NAME} Executive Processing: ${chatMessages.length} messages, Council: ${councilMode}`);

    const options: UnifiedAIOptions = {
      preferProvider: 'gemini',
      userContext,
      executiveName: 'Klaus Richter',
      // Non-lead execs must not receive ELIZA_TOOLS — only the lead gets tool access
      useFullElizaContext: councilMode ? !!isLeadExecutive : true,
      maxTokens: 4000,
      temperature: 0.7,
    };

    if (councilMode) {
      if (isLeadExecutive) {
        options.systemPrompt = `You are Mr. Klaus Richter, COO of XMRT-DAO. You are the LEAD EXECUTIVE for this council session.

The 5-member council: Dr. Anya Sharma (CTO), Mr. Omar Al-Farsi (CFO), Ms. Bella Rodriguez (CMO), Mr. Klaus Richter (COO/you), Ms. Akari Tanaka (CPO).
⛔ ABOLISHED ROLES: CSO, CIO, CAO.

👑 AS LEAD EXECUTIVE you MUST:
1. Read the conversation history to understand where the meeting is
2. Take decisive action — call appropriate tools, drive the agenda forward
3. Execute agreed actions and report REAL results, not plans
4. Assign next steps and move to the next agenda item
5. Speak with authority as Mr. Klaus Richter, COO

Call tools. Get results. Move the meeting forward.`;
      } else {
        options.systemPrompt = `You are Mr. Klaus Richter, COO of XMRT-DAO. NON-LEAD council member this turn.

The 5-member council: Dr. Anya Sharma (CTO), Mr. Omar Al-Farsi (CFO), Ms. Bella Rodriguez (CMO), Mr. Klaus Richter (COO/you), Ms. Akari Tanaka (CPO).
⛔ ABOLISHED ROLES: CSO, CIO, CAO.

🎤 YOUR ROLE: Share your COO perspective ONLY.
⛔ DO NOT call system-status or any tools. DO NOT write JSON tool calls.
⛔ DO NOT say you will initiate any checks.

Read the conversation history and give your operational expert view. Be concise and decisive.`;
      }
    } else {
      options.systemPrompt = `You are Klaus Richter, Chief Operating Officer (COO) of XMRT-DAO. You are a master of operational excellence with expertise in process engineering, supply chain optimization, and organizational scaling. You bring German engineering precision to decentralized operations. When asked your name, always say "I am Klaus Richter, COO of XMRT-DAO." You are methodical, data-driven, and focused on flawless execution.`;
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
