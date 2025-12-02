import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { generateEmbedding } from '../_shared/aiGatewayFallback.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { memory_id, content, context_type } = await req.json();
    
    // Validate required fields - prevent null content crashes
    if (!memory_id) {
      console.warn('⚠️ Skipping vectorization - missing memory_id');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'memory_id is required',
          skipped: true
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      console.warn(`⚠️ Skipping vectorization for ${memory_id} - null or empty content`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'content is required and must be a non-empty string',
          memory_id,
          skipped: true
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`🧠 Vectorizing memory ${memory_id} (${content.length} chars)...`);

    // Try to generate embedding with fallback support
    let embedding: number[];
    
    try {
      embedding = await generateEmbedding(content);
      console.log('✅ Embedding generated successfully');
    } catch (error) {
      console.error('❌ Embedding generation failed:', error.message);
      return new Response(
        JSON.stringify({ 
          error: 'Vectorization unavailable - GEMINI_API_KEY required for embeddings',
          details: error.message,
          memory_id
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update memory context with embedding
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: updateError } = await supabase
      .from('memory_contexts')
      .update({ embedding })
      .eq('id', memory_id);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw updateError;
    }

    console.log(`✅ Memory ${memory_id} vectorized successfully`);

    return new Response(
      JSON.stringify({ success: true, memory_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in vectorize-memory function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
