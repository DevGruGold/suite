import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'eliza-intelligence-coordinator';

/**
 * Eliza Intelligence Coordinator
 * Centralizes intelligence processing: memory retrieval, context building, learning patterns
 * This lightens the frontend by moving heavy intelligence work to backend
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const { action, payload } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`🧠 Intelligence Coordinator - Action: ${action}`);

    switch (action) {
      case 'build_context': {
        // Build comprehensive context for AI response
        const { userMessage, conversationHistory, userContext } = payload;
        
        // Get relevant memory contexts
        const { data: memoryContexts } = await supabase
          .from('memory_contexts')
          .select('*')
          .limit(5);
        
        // Get learning patterns
        const { data: patterns } = await supabase
          .from('interaction_patterns')
          .select('*')
          .gte('confidence_score', 0.7)
          .order('usage_count', { ascending: false })
          .limit(10);
        
        // Get user preferences
        const { data: preferences } = await supabase
          .from('user_preferences')
          .select('*')
          .limit(20);
        
        return new Response(
          JSON.stringify({
            success: true,
            context: {
              memoryContexts: memoryContexts || [],
              learningPatterns: patterns || [],
              userPreferences: preferences || [],
              enrichedHistory: conversationHistory || []
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'store_learning': {
        // Store learning patterns from conversation
        const { pattern, confidence, usageCount } = payload;
        
        const { data, error } = await supabase
          .from('interaction_patterns')
          .upsert({
            pattern_type: pattern.type,
            pattern_data: pattern.data,
            confidence_score: confidence,
            usage_count: usageCount || 1,
            last_used_at: new Date().toISOString()
          });
        
        if (error) {
          console.error('Failed to store learning pattern:', error);
        }
        
        return new Response(
          JSON.stringify({ success: !error, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_memory_context': {
        // Retrieve memory context for specific topic
        const { topic, limit = 5 } = payload;
        
        const { data, error } = await supabase
          .from('memory_contexts')
          .select('*')
          .ilike('context_data', `%${topic}%`)
          .limit(limit);
        
        return new Response(
          JSON.stringify({ success: !error, contexts: data || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_knowledge_entities': {
        // Update knowledge graph entities
        const { entities } = payload;
        
        const results = await Promise.all(
          entities.map((entity: any) =>
            supabase
              .from('knowledge_entities')
              .upsert({
                entity_type: entity.type,
                entity_name: entity.name,
                attributes: entity.attributes,
                relationships: entity.relationships,
                confidence_score: entity.confidence || 0.8
              })
          )
        );
        
        return new Response(
          JSON.stringify({ success: true, updated: results.length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        await usageTracker.failure('Unknown action', 400);
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error: any) {
    console.error('❌ Intelligence coordinator error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
