import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callLovableAIGateway } from '../_shared/unifiedAIFallback.ts';
import { generateExecutiveSystemPrompt } from '../_shared/elizaSystemPrompt.ts';
import { buildContextualPrompt } from '../_shared/contextBuilder.ts';
import { EdgeFunctionLogger } from "../_shared/logging.ts";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const logger = EdgeFunctionLogger('cso-executive');
const FUNCTION_NAME = 'vercel-ai-chat-stream';
const EXECUTIVE_NAME = 'CSO';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      councilMode = false
    } = await req.json();

    usageTracker['parameters'] = { messagesCount: messages?.length, councilMode };
    
    await logger.info('Streaming request received', 'ai_interaction', { 
      messagesCount: messages?.length,
      hasHistory: conversationHistory?.length > 0,
      userContext,
      executive: EXECUTIVE_NAME,
      councilMode
    });

    if (!messages || !Array.isArray(messages)) {
      console.error('❌ Invalid messages parameter');
      await logger.error('Invalid request format', new Error('Messages must be an array'), 'validation');
      await usageTracker.failure('Invalid request: messages must be an array', 400);
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

    console.log('🎯 CSO Executive - Streaming via Lovable AI Gateway');

    // Build CSO-specific system prompt
    const executivePrompt = generateExecutiveSystemPrompt('CSO');
    const contextualPrompt = buildContextualPrompt(executivePrompt, {
      conversationHistory,
      userContext,
      miningStats,
      systemVersion
    });

    // Prepare messages for Lovable AI Gateway
    const aiMessages = [
      { role: 'system', content: contextualPrompt },
      ...messages
    ];

    console.log('📤 Calling Lovable AI Gateway (CSO streaming mode)...');
    
    const apiStartTime = Date.now();
    const response = await callLovableAIGateway(aiMessages, {
      model: 'google/gemini-2.5-flash',
      temperature: 0.7,
      max_tokens: 4000
    });
    
    const apiDuration = Date.now() - apiStartTime;
    
    console.log(`✅ CSO Executive responded in ${apiDuration}ms`);
    await logger.apiCall('lovable_gateway', 200, apiDuration, { 
      executive: EXECUTIVE_NAME,
      responseLength: response.length,
      streaming: true
    });

    // Log successful completion
    await usageTracker.success({
      provider: 'lovable_gateway',
      model: 'google/gemini-2.5-flash'
    });

    // Simulate streaming for consistency with previous implementation
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        
        // Send metadata
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            type: 'metadata',
            provider: 'lovable_gateway',
            model: 'google/gemini-2.5-flash',
            executive: 'vercel-ai-chat-stream',
            executiveTitle: 'Chief Strategy Officer (CSO)'
          })}\n\n`)
        );

        // Stream response word by word for natural feel
        const words = response.split(' ');
        let i = 0;
        const intervalId = setInterval(() => {
          if (i < words.length) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'text',
                content: words[i] + ' '
              })}\n\n`)
            );
            i++;
          } else {
            clearInterval(intervalId);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'done'
              })}\n\n`)
            );
            controller.close();
          }
        }, 30); // 30ms between words for natural streaming feel
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error: any) {
    console.error('❌ CSO Executive streaming error:', error);
    await logger.error('Function execution failed', error, 'error');
    
    // Log failure
    await usageTracker.failure(error instanceof Error ? error.message : 'Unknown error', 500);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
