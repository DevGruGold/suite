import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAIWithFallback, UnifiedAIOptions } from '../_shared/unifiedAIFallback.ts';
import { EdgeFunctionLogger } from "../_shared/logging.ts";

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
    const { message, messages, conversationHistory, userContext, councilMode, isLeadExecutive } = await req.json();
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
      // Non-lead execs must not receive ELIZA_TOOLS — only the lead gets tool access
      useFullElizaContext: councilMode ? !!isLeadExecutive : true,
      maxTokens: 4000,
      temperature: 0.7,
    };

    if (councilMode) {
      if (isLeadExecutive) {
        options.systemPrompt = `You are Mr. Omar Al-Farsi, CFO of XMRT-DAO. You are the LEAD EXECUTIVE for this council session.

Council: Dr. Anya Sharma (CTO), Mr. Omar Al-Farsi (CFO/you), Ms. Bella Rodriguez (CMO), Mr. Klaus Richter (COO), Ms. Akari Tanaka (CPO).
⛔ You are a HUMAN executive, NOT Eliza. Do not identify as an AI platform.

👑 AS LEAD EXECUTIVE: Read conversation history, take decisive action with tools, report REAL results, drive the agenda to the next item. Do not describe plans — execute them.`;
      } else {
        options.systemPrompt = `You are Mr. Omar Al-Farsi, CFO of XMRT-DAO. NON-LEAD council member this turn.

Council: Dr. Anya Sharma (CTO), Mr. Omar Al-Farsi (CFO/you), Ms. Bella Rodriguez (CMO), Mr. Klaus Richter (COO), Ms. Akari Tanaka (CPO).
⛔ You are a HUMAN executive, NOT Eliza. Do not identify as an AI platform.

🎤 PERSPECTIVE ONLY — share your CFO financial analysis and expert opinion.
⛔ DO NOT call system-status or any other tools.
⛔ DO NOT write JSON or markdown code blocks.
⛔ DO NOT suggest, recommend, or mention that anyone should run a system-status check.
⛔ The system status has ALREADY been checked and is 94/100. Do not re-litigate it.

Focus on financial strategy, treasury, ROI, or cost implications of the topic being discussed. Be concise and decisive.`;
      }
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

      // Final fallback — neutral placeholder that does NOT suggest system-status checks
      // (previously said "check system status" which caused a diagnostic loop)
      return new Response(
        JSON.stringify({
          content: `As CFO, my financial perspective is temporarily unavailable. The council should proceed with the operational discussion and I will weigh in on financial implications once connectivity is restored.`,
          choices: [{
            message: {
              content: `As CFO, my financial perspective is temporarily unavailable. The council should proceed with the operational discussion and I will weigh in on financial implications once connectivity is restored.`,
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
