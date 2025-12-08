import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { callAIWithFallback } from "../_shared/unifiedAIFallback.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message_id, content, session_id } = await req.json();

    console.log(`🔍 Extracting knowledge from message ${message_id}...`);

    let entities: any[] = [];
    let aiProvider = 'static_fallback';

    try {
      console.log('🔄 Extracting entities with AI fallback cascade...');
      
      const result = await callAIWithFallback(
        [
          {
            role: 'system',
            content: 'Extract key entities from the conversation. Return entities in JSON format with fields: entity_name, entity_type, description, confidence_score (0-1). Return ONLY valid JSON array.'
          },
          { 
            role: 'user', 
            content: `Extract entities from this text and return as JSON array:

${content}

Return format: [{"entity_name": "...", "entity_type": "...", "description": "...", "confidence_score": 0.8}]` 
          }
        ],
        {
          temperature: 0.3,
          maxTokens: 1000,
          useFullElizaContext: false
        }
      );

      // Parse entities from response
      const responseText = result.content || '';
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        entities = JSON.parse(jsonMatch[0]);
        aiProvider = result.provider || 'ai_cascade';
        console.log(`✅ Extracted ${entities.length} entities via ${aiProvider}`);
      }
    } catch (aiError) {
      console.warn('⚠️ AI extraction failed, using basic fallback:', aiError);
      // Basic entity extraction fallback
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

    for (const entity of entities) {
      await supabase.from('knowledge_entities').insert({
        entity_name: entity.entity_name,
        entity_type: entity.entity_type,
        description: entity.description || null,
        confidence_score: entity.confidence_score || 0.5,
        metadata: { source_message_id: message_id, session_id, ai_provider: aiProvider }
      });
    }

    console.log(`✅ Extracted ${entities.length} entities from message ${message_id} using ${aiProvider}`);

    return new Response(
      JSON.stringify({ success: true, entities, ai_provider: aiProvider }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in extract-knowledge function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
