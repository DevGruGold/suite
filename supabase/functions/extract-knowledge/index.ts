import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_TIMEOUT_MS = 12000; // 12 second timeout for AI calls

serve(async (req) => {
  const usageTracker = startUsageTracking('extract-knowledge');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Fast boot: check content-length BEFORE parsing JSON
  const contentLength = parseInt(req.headers.get('content-length') || '0');
  if (contentLength === 0 || contentLength < 5) {
    console.log('🔍 Empty body - cron trigger, returning fast');
    await usageTracker.success({ result_summary: 'cron_trigger' });
    return new Response(JSON.stringify({ 
      success: true, 
      cron: true, 
      message: 'No content provided for extraction',
      entities: [] 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body for cron triggers
    }

    const { message_id, content, session_id } = body;

    // Early return for cron triggers with no content
    if (!content || !message_id) {
      console.log('🔍 Cron trigger - no content to extract, returning early');
      return new Response(JSON.stringify({ 
        success: true, 
        cron: true, 
        message: 'No content provided for extraction',
        entities: [] 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`🔍 Extracting knowledge from message ${message_id}...`);

    let entities: any[] = [];
    let aiProvider = 'static_fallback';

    try {
      console.log('🔄 Extracting entities with AI fallback cascade...');
      
      // Lazy import to avoid boot-time overhead
      const { callAIWithFallback } = await import('../_shared/unifiedAIFallback.ts');
      
      // Wrap AI call with timeout
      const aiPromise = callAIWithFallback(
        [
          {
            role: 'system',
            content: 'Extract key entities from the conversation. Return entities in JSON format with fields: entity_name, entity_type, description, confidence_score (0-1). Return ONLY valid JSON array.'
          },
          { 
            role: 'user', 
            content: `Extract entities from this text and return as JSON array:

${content.slice(0, 2000)}

Return format: [{"entity_name": "...", "entity_type": "...", "description": "...", "confidence_score": 0.8}]` 
          }
        ],
        {
          temperature: 0.3,
          maxTokens: 500,
          useFullElizaContext: false
        }
      );

      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => {
          console.warn('⚠️ AI extraction timed out, using fallback');
          resolve(null);
        }, AI_TIMEOUT_MS)
      );

      const result = await Promise.race([aiPromise, timeoutPromise]);

      if (result) {
        const responseText = result.content || '';
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          entities = JSON.parse(jsonMatch[0]);
          aiProvider = result.provider || 'ai_cascade';
          console.log(`✅ Extracted ${entities.length} entities via ${aiProvider}`);
        }
      }
    } catch (aiError) {
      console.warn('⚠️ AI extraction failed, using basic fallback:', aiError);
    }

    // Basic entity extraction fallback
    if (entities.length === 0) {
      const words = content.split(/\s+/).filter((w: string) => w.length > 5);
      const uniqueWords = [...new Set(words)].slice(0, 5);
      entities = uniqueWords.map((word: string) => ({
        entity_name: word,
        entity_type: 'keyword',
        description: 'Auto-extracted keyword',
        confidence_score: 0.3
      }));
    }

    if (entities.length === 0) {
      console.log('No entities extracted');
      return new Response(JSON.stringify({ success: true, entities: [], ai_provider: aiProvider }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Store entities in database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Insert entities with timeout guard
    const insertPromise = Promise.all(entities.slice(0, 10).map(entity =>
      supabase.from('knowledge_entities').insert({
        entity_name: entity.entity_name,
        entity_type: entity.entity_type,
        description: entity.description || null,
        confidence_score: entity.confidence_score || 0.5,
        metadata: { source_message_id: message_id, session_id, ai_provider: aiProvider }
      })
    ));

    await Promise.race([
      insertPromise,
      new Promise((resolve) => setTimeout(resolve, 5000))
    ]);

    console.log(`✅ Extracted ${entities.length} entities from message ${message_id} using ${aiProvider}`);

    await usageTracker.success({ result_summary: `extracted_${entities.length}_entities`, provider: aiProvider });
    return new Response(
      JSON.stringify({ success: true, entities, ai_provider: aiProvider }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in extract-knowledge function:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
