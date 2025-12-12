import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateExecutiveSystemPrompt } from '../_shared/elizaSystemPrompt.ts';
import { buildContextualPrompt } from '../_shared/contextBuilder.ts';
import { EdgeFunctionLogger } from "../_shared/logging.ts";
import { ELIZA_TOOLS } from '../_shared/elizaTools.ts';
import { executeToolCall } from '../_shared/toolExecutor.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  TOOL_CALLING_MANDATE,
  parseDeepSeekToolCalls,
  parseToolCodeBlocks,
  needsDataRetrieval,
  retrieveMemoryContexts,
  callKimiFallback,
  callGeminiFallback
} from '../_shared/executiveHelpers.ts';
import { processFallbackWithToolExecution, emergencyStaticFallback } from '../_shared/fallbackToolExecutor.ts';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const logger = EdgeFunctionLogger('cto-executive');
const FUNCTION_NAME = 'deepseek-chat';
const EXECUTIVE_NAME = 'CTO';

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
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('❌ Failed to parse request body:', parseError);
      await logger.error('Body parsing failed', parseError, 'request_parsing');
      await usageTracker.failure('Invalid JSON in request body', 400);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { type: 'validation_error', code: 400, message: 'Invalid JSON in request body' }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { 
      messages, 
      conversationHistory = [], 
      userContext = { ip: 'unknown', isFounder: false }, 
      miningStats = null, 
      systemVersion = null,
      councilMode = false,
      images = []
    } = requestBody;

    usageTracker['parameters'] = { messagesCount: messages?.length, councilMode, hasImages: images?.length > 0 };
    
    await logger.info('Request received', 'ai_interaction', { 
      messagesCount: messages?.length,
      hasHistory: conversationHistory?.length > 0,
      userContext,
      executive: EXECUTIVE_NAME,
      councilMode,
      hasImages: images?.length > 0
    });

    if (!messages || !Array.isArray(messages)) {
      console.error('❌ Invalid messages parameter');
      await logger.error('Invalid request format', new Error('Messages must be an array'), 'validation');
      await usageTracker.failure('Invalid request: messages must be an array', 400);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { type: 'validation_error', code: 400, message: 'Invalid request: messages must be an array' }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('💻 CTO Executive (DeepSeek) - Processing with full capabilities');

    // Initialize Supabase client
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ========== PHASE: MEMORY RETRIEVAL ==========
    let memoryContexts: any[] = [];
    if (userContext?.sessionKey) {
      memoryContexts = await retrieveMemoryContexts(supabase, userContext.sessionKey);
      if (memoryContexts.length > 0) {
        console.log(`📚 Retrieved ${memoryContexts.length} memory contexts for CTO`);
      }
    }

    // Build system prompt with memory injection
    const executivePrompt = generateExecutiveSystemPrompt('CTO');
    let contextualPrompt = await buildContextualPrompt(executivePrompt, {
      conversationHistory,
      userContext,
      miningStats,
      systemVersion
    });
    
    // Inject memory contexts
    if (memoryContexts.length > 0) {
      contextualPrompt += `\n\nRelevant Memories:\n${memoryContexts.slice(0, 5).map(m => `- [${m.type}] ${m.content}`).join('\n')}`;
    }

    if (councilMode) {
      contextualPrompt += `\n\n🏛️ COUNCIL MODE: Provide concise 2-4 paragraph response. Full tool access retained.`;
    }

    const aiMessages = [{ role: 'system', content: contextualPrompt }, ...messages];
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
    
    // ========== PRIORITY VISION ROUTING ==========
    if (images && images.length > 0) {
      console.log(`🖼️ Images detected (${images.length}) - routing to vision-capable model`);
      
      const geminiResult = await callGeminiFallback(aiMessages, images, supabase, SUPABASE_URL, SERVICE_ROLE_KEY, ELIZA_TOOLS);
      if (geminiResult) {
        return new Response(
          JSON.stringify({
            success: true,
            response: geminiResult.content,
            hasToolCalls: false,
            executive: 'deepseek-chat',
            executiveTitle: 'Chief Technology Officer (CTO) [Vision via Gemini]',
            provider: geminiResult.provider,
            model: geminiResult.model,
            vision_analysis: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    if (!DEEPSEEK_API_KEY) {
      console.warn('⚠️ DEEPSEEK_API_KEY not configured, trying fallbacks with tool execution...');
      const userQuery = messages[messages.length - 1]?.content || '';
      
      // Try Kimi K2 fallback with tool execution
      const kimiResult = await callKimiFallback(aiMessages, ELIZA_TOOLS);
      if (kimiResult) {
        const processed = await processFallbackWithToolExecution(
          kimiResult, supabase, 'Chief Technology Officer (CTO)', SUPABASE_URL, SERVICE_ROLE_KEY, userQuery
        );
        return new Response(
          JSON.stringify({
            success: true,
            response: processed.content,
            hasToolCalls: processed.hasToolCalls,
            toolCallsExecuted: processed.toolCallsExecuted,
            executive: 'deepseek-chat',
            executiveTitle: 'Chief Technology Officer (CTO) [Kimi K2 Fallback]',
            provider: processed.provider,
            model: processed.model,
            fallback: 'kimi'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Try Gemini fallback with tool execution
      const geminiResult = await callGeminiFallback(aiMessages, ELIZA_TOOLS);
      if (geminiResult) {
        const processed = await processFallbackWithToolExecution(
          geminiResult, supabase, 'Chief Technology Officer (CTO)', SUPABASE_URL, SERVICE_ROLE_KEY, userQuery
        );
        return new Response(
          JSON.stringify({
            success: true,
            response: processed.content,
            hasToolCalls: processed.hasToolCalls,
            toolCallsExecuted: processed.toolCallsExecuted,
            executive: 'deepseek-chat',
            executiveTitle: 'Chief Technology Officer (CTO) [Gemini Fallback]',
            provider: processed.provider,
            model: processed.model,
            fallback: 'gemini'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // EMERGENCY: All AI providers failed - use static fallback
      console.log('🚨 All AI providers failed, using emergency static fallback');
      const emergencyResult = await emergencyStaticFallback(
        userQuery, supabase, 'Chief Technology Officer (CTO)', SUPABASE_URL, SERVICE_ROLE_KEY
      );
      return new Response(
        JSON.stringify({
          success: true,
          response: emergencyResult.content,
          hasToolCalls: emergencyResult.hasToolCalls,
          toolCallsExecuted: emergencyResult.toolCallsExecuted,
          executive: 'deepseek-chat',
          executiveTitle: 'Chief Technology Officer (CTO) [Emergency Static]',
          provider: emergencyResult.provider,
          model: emergencyResult.model,
          fallback: 'emergency_static'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('📤 Calling DeepSeek API with tools...');
    const apiStartTime = Date.now();
    
    // Call DeepSeek API with tools
    let deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: aiMessages,
        tools: ELIZA_TOOLS,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: councilMode ? 800 : 2000
      })
    });
    
    // ========== HANDLE API ERRORS WITH FALLBACK CASCADE ==========
    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text();
      console.error('❌ DeepSeek API error:', deepseekResponse.status, errorText);
      
      if (deepseekResponse.status === 402 || deepseekResponse.status === 429 || deepseekResponse.status >= 500) {
        console.log(`⚠️ DeepSeek returned ${deepseekResponse.status}, trying fallback cascade...`);
        
        // Try Kimi K2 fallback
        const kimiResult = await callKimiFallback(aiMessages, ELIZA_TOOLS);
        if (kimiResult) {
          // Process tool calls if any
          if (kimiResult.tool_calls && kimiResult.tool_calls.length > 0) {
            console.log(`🔧 Executing ${kimiResult.tool_calls.length} tool(s) from Kimi K2`);
            const toolResults = [];
            for (const toolCall of kimiResult.tool_calls) {
              const result = await executeToolCall(supabase, toolCall, 'CTO', SUPABASE_URL, SERVICE_ROLE_KEY);
              toolResults.push({ tool_call_id: toolCall.id, role: 'tool', content: JSON.stringify(result) });
            }
            
            const secondResult = await callKimiFallback([
              ...aiMessages,
              { role: 'assistant', content: kimiResult.content, tool_calls: kimiResult.tool_calls },
              ...toolResults
            ]);
            
            if (secondResult) {
              return new Response(
                JSON.stringify({
                  success: true,
                  response: secondResult.content,
                  hasToolCalls: true,
                  toolCallsExecuted: kimiResult.tool_calls.length,
                  executive: 'deepseek-chat',
                  executiveTitle: 'Chief Technology Officer (CTO) [Kimi K2 Fallback]',
                  provider: 'openrouter',
                  model: 'moonshotai/kimi-k2',
                  fallback: 'kimi'
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
          
          return new Response(
            JSON.stringify({
              success: true,
              response: kimiResult.content,
              hasToolCalls: false,
              executive: 'deepseek-chat',
              executiveTitle: 'Chief Technology Officer (CTO) [Kimi K2 Fallback]',
              provider: kimiResult.provider,
              model: kimiResult.model,
              fallback: 'kimi'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Try Gemini fallback
        const geminiResult = await callGeminiFallback(aiMessages, [], supabase, SUPABASE_URL, SERVICE_ROLE_KEY, ELIZA_TOOLS);
        if (geminiResult) {
          return new Response(
            JSON.stringify({
              success: true,
              response: geminiResult.content,
              hasToolCalls: false,
              executive: 'deepseek-chat',
              executiveTitle: 'Chief Technology Officer (CTO) [Gemini Fallback]',
              provider: geminiResult.provider,
              model: geminiResult.model,
              fallback: 'gemini'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      throw new Error(`DeepSeek API error: ${deepseekResponse.status} - ${errorText}`);
    }
    
    const deepseekData = await deepseekResponse.json();
    let content = deepseekData.choices?.[0]?.message?.content || '';
    let toolCalls = deepseekData.choices?.[0]?.message?.tool_calls || [];
    
    // Check for text-embedded tool calls
    if (!toolCalls.length && content) {
      const textToolCalls = parseDeepSeekToolCalls(content);
      if (textToolCalls) {
        toolCalls = textToolCalls;
        content = content.replace(/<｜tool▁calls▁begin｜>.*?<｜tool▁calls▁end｜>/s, '').trim();
      }
    }
    
    // ========== EXECUTE TOOL CALLS ==========
    if (toolCalls && toolCalls.length > 0) {
      console.log(`🔧 CTO executing ${toolCalls.length} tool(s)`);
      
      const toolResults = [];
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name;
        
        // Validate tool exists
        const validTools = ELIZA_TOOLS.map(t => t.function?.name);
        if (!validTools.includes(toolName)) {
          console.warn(`⚠️ Unknown tool attempted: ${toolName}`);
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: toolName,
            content: JSON.stringify({ 
              error: `Unknown tool: ${toolName}. Use invoke_edge_function or check tool registry.`
            })
          });
          continue;
        }
        
        const result = await executeToolCall(supabase, toolCall, 'CTO', SUPABASE_URL, SERVICE_ROLE_KEY);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolName,
          content: JSON.stringify(result)
        });
      }
      
      // Get final response after tool execution
      const secondResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            ...aiMessages,
            { role: 'assistant', content: content, tool_calls: toolCalls },
            ...toolResults
          ],
          temperature: 0.7,
          max_tokens: 4096
        })
      });
      
      if (secondResponse.ok) {
        const secondData = await secondResponse.json();
        content = secondData.choices?.[0]?.message?.content || content;
      }
    }
    
    const apiDuration = Date.now() - apiStartTime;
    
    console.log(`✅ CTO Executive responded in ${apiDuration}ms`);
    await logger.apiCall('deepseek_api', 200, apiDuration, { 
      executive: EXECUTIVE_NAME,
      responseLength: content?.length || 0,
      toolCalls: toolCalls?.length || 0,
      usage: deepseekData.usage
    });

    // Log successful completion
    await usageTracker.success({
      provider: 'deepseek',
      model: 'deepseek-chat',
      tool_calls: toolCalls?.length || 0
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        response: content,
        hasToolCalls: toolCalls?.length > 0,
        toolCallsExecuted: toolCalls?.length || 0,
        executive: 'deepseek-chat',
        executiveTitle: 'Chief Technology Officer (CTO)',
        provider: 'deepseek',
        model: 'deepseek-chat',
        confidence: 85,
        usage: deepseekData.usage
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ CTO Executive error:', error);
    await logger.error('Function execution failed', error, 'error');
    
    // Log failure
    const errorMessage = error instanceof Error ? error.message : String(error);
    await usageTracker.failure(errorMessage, 500);
    
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
          service: 'deepseek-chat',
          details: {
            timestamp: new Date().toISOString(),
            executive: 'CTO',
            model: 'deepseek-chat'
          },
          canRetry: statusCode !== 402,
          suggestedAction: statusCode === 402 ? 'add_credits' : 'try_alternative'
        }
      }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
