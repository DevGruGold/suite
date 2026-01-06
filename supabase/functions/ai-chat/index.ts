import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getEnrichedElizaContext } from '../_shared/unifiedAIContext.ts';
import { callAIWithFallback } from '../_shared/unifiedAIFallback.ts';
import { processFallbackWithToolExecution, emergencyStaticFallback } from '../_shared/fallbackToolExecutor.ts';

// ========== ENVIRONMENT CONFIGURATION ==========
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Executive Configuration
const EXECUTIVE_NAME = Deno.env.get('EXECUTIVE_NAME') || 'Eliza';
const EXECUTIVE_ROLE = Deno.env.get('EXECUTIVE_ROLE') || 'General Intelligence Agent for XMRT-DAO';
const FUNCTION_NAME = Deno.env.get('FUNCTION_NAME') || 'ai-chat';

// ========== MAIN SERVE FUNCTION ==========
serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    if (req.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'operational',
          function: FUNCTION_NAME,
          executive: `${EXECUTIVE_NAME} - ${EXECUTIVE_ROLE}`,
          timestamp: new Date().toISOString(),
          schema_aware: true,
          shared_utilities: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { 
      messages = [], 
      userQuery, 
      session_id, 
      provider = 'cascade',
      useCache = true,
      userContext = {},
      miningStats = {}
    } = await req.json();

    if (!userQuery && messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing userQuery or messages' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const query = userQuery || messages[messages.length - 1]?.content || '';
    console.log(`🤖 [${EXECUTIVE_NAME}] Processing request: "${query.substring(0, 100)}..."`);

    // 1. Get Enriched Eliza Context (System Prompt, Tools, Memory)
    const context = await getEnrichedElizaContext(supabase, {
      sessionKey: session_id,
      userContext,
      miningStats,
      executiveName: EXECUTIVE_NAME,
      conversationHistory: { recentMessages: messages.slice(-10) }
    });

    // 2. Call AI with Fallback Cascade
    let aiResult;
    try {
      aiResult = await callAIWithFallback(
        [
          { role: 'system', content: context.systemPrompt },
          ...messages
        ],
        {
          preferProvider: provider === 'cascade' ? undefined : provider as any,
          tools: context.tools,
          userContext,
          miningStats,
          executiveName: EXECUTIVE_NAME
        }
      );
    } catch (error) {
      console.error(`❌ AI Cascade failed:`, error.message);
      
      // 3. Emergency Static Fallback if all AI providers fail
      const emergencyResult = await emergencyStaticFallback(
        query,
        supabase,
        EXECUTIVE_NAME,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      );

      return new Response(
        JSON.stringify({
          success: true,
          content: emergencyResult.content,
          executive: EXECUTIVE_NAME,
          provider: 'emergency_static',
          model: 'static_fallback',
          hasToolCalls: emergencyResult.hasToolCalls,
          executionTimeMs: Date.now() - startTime,
          session_id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Process AI Result (Handle Tool Calls & Synthesis)
    const processedResult = await processFallbackWithToolExecution(
      {
        content: aiResult.content || '',
        tool_calls: aiResult.tool_calls || (aiResult.role === 'assistant' ? aiResult.tool_calls : undefined),
        provider: aiResult.provider || 'unknown',
        model: aiResult.model || 'unknown'
      },
      supabase,
      EXECUTIVE_NAME,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      query
    );

    // 5. Return Final Response
    return new Response(
      JSON.stringify({
        success: true,
        content: processedResult.content,
        executive: EXECUTIVE_NAME,
        provider: processedResult.provider,
        model: processedResult.model,
        hasToolCalls: processedResult.hasToolCalls,
        toolCallsExecuted: processedResult.toolCallsExecuted,
        executionTimeMs: Date.now() - startTime,
        session_id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error(`💥 [${EXECUTIVE_NAME}] Critical error:`, error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        executive: EXECUTIVE_NAME,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
