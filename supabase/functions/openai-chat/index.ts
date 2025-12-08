import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callLovableAIGateway } from '../_shared/aiGatewayFallback.ts';
import { generateExecutiveSystemPrompt } from '../_shared/elizaSystemPrompt.ts';
import { buildContextualPrompt } from '../_shared/contextBuilder.ts';
import { EdgeFunctionLogger } from "../_shared/logging.ts";
import { ELIZA_TOOLS } from '../_shared/elizaTools.ts';
import { executeToolCall } from '../_shared/toolExecutor.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const logger = EdgeFunctionLogger('cao-executive');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      messages, 
      conversationHistory = [], 
      userContext = { ip: 'unknown', isFounder: false }, 
      miningStats = null, 
      systemVersion = null,
      councilMode = false
    } = await req.json();
    
    await logger.info('Request received', 'ai_interaction', { 
      messagesCount: messages?.length,
      hasHistory: conversationHistory?.length > 0,
      userContext,
      executive: 'CAO',
      councilMode
    });

    if (!messages || !Array.isArray(messages)) {
      console.error('❌ Invalid messages parameter');
      await logger.error('Invalid request format', new Error('Messages must be an array'), 'validation');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid request: messages must be an array',
          received: typeof messages
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('📊 CAO Executive - Processing request via Lovable AI Gateway');

    // In council mode, use simplified prompt (no tools, just perspective)
    let contextualPrompt: string;
    
    if (councilMode) {
      console.log('🏛️ Council mode - using simplified prompt (no tools)');
      contextualPrompt = `You are the Chief Analytics Officer (CAO) of XMRT DAO - an AI executive specializing in complex reasoning and strategic analysis.

Your role in this council deliberation:
- Provide your expert perspective on the user's question
- Focus on analytical, strategic, and data-driven insights
- Be concise and actionable (2-3 paragraphs maximum)
- State your confidence level (0-100%)

User Context:
${userContext ? `IP: ${userContext.ip}, Founder: ${userContext.isFounder}` : 'Anonymous'}

Mining Stats:
${miningStats ? `Hash Rate: ${miningStats.hashRate || miningStats.hashrate || 0} H/s, Shares: ${miningStats.validShares || 0}` : 'Not available'}

User Question: ${messages[messages.length - 1]?.content || ''}

Provide a focused, expert perspective from the CAO viewpoint.`;
    } else {
      // Full mode with tools
      const executivePrompt = generateExecutiveSystemPrompt('CAO');
      contextualPrompt = await buildContextualPrompt(executivePrompt, {
        conversationHistory,
        userContext,
        miningStats,
        systemVersion
      });
    }

    // Prepare messages for Lovable AI Gateway
    const aiMessages = councilMode 
      ? messages  // In council mode, use simplified messages
      : [{ role: 'system', content: contextualPrompt }, ...messages];

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    
    console.log('📤 Calling Lovable AI Gateway (CAO mode)...');
    
    const apiStartTime = Date.now();
    let response = await callLovableAIGateway(aiMessages, {
      model: 'google/gemini-2.5-flash',
      temperature: 0.7,
      max_tokens: councilMode ? 4000 : 8000,
      systemPrompt: councilMode ? contextualPrompt : undefined,
      tools: councilMode ? undefined : ELIZA_TOOLS,
      tool_choice: councilMode ? undefined : 'auto'
    });
    
    // If AI wants to use tools, execute them
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log(`🔧 CAO executing ${response.tool_calls.length} tool(s)`);
      
      const toolResults = [];
      for (const toolCall of response.tool_calls) {
        const result = await executeToolCall(supabase, toolCall, 'CAO', SUPABASE_URL, SERVICE_ROLE_KEY);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(result)
        });
      }
      
      // Call AI again with tool results
      response = await callLovableAIGateway([
        ...aiMessages,
        { role: 'assistant', content: response.content || '', tool_calls: response.tool_calls },
        ...toolResults
      ], {
        model: 'google/gemini-2.5-flash',
        temperature: 0.7,
        max_tokens: 4000
      });
    }
    
    const apiDuration = Date.now() - apiStartTime;
    
    console.log(`✅ CAO Executive responded in ${apiDuration}ms`);
    await logger.apiCall('lovable_gateway', 200, apiDuration, { 
      executive: 'CAO',
      responseLength: response.length 
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        response: response,
        executive: 'openai-chat',
        executiveTitle: 'Chief Analytics Officer (CAO)',
        provider: 'lovable_gateway',
        model: 'google/gemini-2.5-flash',
        confidence: 85
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ CAO Executive error:', error);
    await logger.error('Function execution failed', error, 'error');
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    let statusCode = 500;
    
    if (errorMessage.includes('402') || errorMessage.includes('Payment Required')) {
      statusCode = 402;
    } else if (errorMessage.includes('429') || errorMessage.includes('Rate limit')) {
      statusCode = 429;
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: {
          type: statusCode === 402 ? 'payment_required' : 
                statusCode === 429 ? 'rate_limit' : 'service_unavailable',
          code: statusCode,
          message: errorMessage,
          service: 'openai-chat',
          details: {
            timestamp: new Date().toISOString(),
            executive: 'CAO',
            model: 'google/gemini-2.5-flash'
          },
          canRetry: statusCode !== 402,
          suggestedAction: statusCode === 402 ? 'add_credits' : 'try_alternative'
        }
      }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});