import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, data } = await req.json();
    console.log(`🧠 Knowledge Manager - Action: ${action}`);

    let result;

    switch (action) {
      case 'store_knowledge':
        // Store knowledge entity
        const { data: entity, error: entityError } = await supabase
          .from('knowledge_entities')
          .insert({
            entity_name: data.name,
            entity_type: data.type,
            description: data.description,
            metadata: data.metadata || {},
            confidence_score: data.confidence || 0.5
          })
          .select()
          .single();

        if (entityError) throw entityError;
        result = { success: true, entity };
        break;

      case 'create_relationship':
        // Create relationship between entities
        const { data: relationship, error: relError } = await supabase
          .from('entity_relationships')
          .insert({
            source_entity_id: data.source_id,
            target_entity_id: data.target_id,
            relationship_type: data.type,
            strength: data.strength || 0.5,
            metadata: data.metadata || {}
          })
          .select()
          .single();

        if (relError) throw relError;
        result = { success: true, relationship };
        break;

      case 'search_knowledge':
        // Search knowledge entities
        let query = supabase
          .from('knowledge_entities')
          .select('*');

        if (data.entity_type) {
          query = query.eq('entity_type', data.entity_type);
        }
        if (data.min_confidence) {
          query = query.gte('confidence_score', data.min_confidence);
        }
        if (data.search_term) {
          query = query.or(`entity_name.ilike.%${data.search_term}%,description.ilike.%${data.search_term}%`);
        }

        const { data: entities, error: searchError } = await query
          .order('confidence_score', { ascending: false })
          .limit(data.limit || 20);

        if (searchError) throw searchError;
        result = { success: true, entities };
        break;

      case 'get_related_entities':
        // Get entities related to a specific entity
        const { data: relationships, error: relatedError } = await supabase
          .from('entity_relationships')
          .select(`
            *,
            source:source_entity_id(entity_name, entity_type, description),
            target:target_entity_id(entity_name, entity_type, description)
          `)
          .or(`source_entity_id.eq.${data.entity_id},target_entity_id.eq.${data.entity_id}`)
          .order('strength', { ascending: false });

        if (relatedError) throw relatedError;
        result = { success: true, relationships };
        break;

      case 'update_entity_confidence':
        // Update confidence score based on usage
        const { data: updated, error: updateError } = await supabase
          .from('knowledge_entities')
          .update({ 
            confidence_score: data.new_confidence,
            updated_at: new Date().toISOString()
          })
          .eq('id', data.entity_id)
          .select()
          .single();

        if (updateError) throw updateError;
        result = { success: true, entity: updated };
        break;

      case 'store_learning_pattern':
        // Store a learning pattern
        const { data: pattern, error: patternError } = await supabase
          .from('learning_patterns')
          .insert({
            pattern_type: data.type,
            pattern_data: data.data,
            confidence_score: data.confidence || 0.5
          })
          .select()
          .single();

        if (patternError) throw patternError;
        result = { success: true, pattern };
        break;

      case 'get_patterns':
        // Retrieve learning patterns
        const { data: patterns, error: patternsError } = await supabase
          .from('learning_patterns')
          .select('*')
          .eq('pattern_type', data.type)
          .gte('confidence_score', data.min_confidence || 0.3)
          .order('usage_count', { ascending: false })
          .limit(data.limit || 10);

        if (patternsError) throw patternsError;
        result = { success: true, patterns };
        break;

      // NEW: List all knowledge entities
      case 'list_knowledge':
        let listQuery = supabase
          .from('knowledge_entities')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(data?.limit || 50);

        if (data?.entity_type) {
          listQuery = listQuery.eq('entity_type', data.entity_type);
        }

        const { data: listEntities, error: listError } = await listQuery;
        if (listError) throw listError;
        result = { success: true, entities: listEntities, count: listEntities?.length || 0 };
        break;

      // NEW: Check knowledge system status
      case 'check_status':
        const { count: entityCount, error: countError1 } = await supabase
          .from('knowledge_entities')
          .select('*', { count: 'exact', head: true });

        if (countError1) throw countError1;

        const { count: relationCount, error: countError2 } = await supabase
          .from('entity_relationships')
          .select('*', { count: 'exact', head: true });

        if (countError2) throw countError2;

        const { count: patternCount, error: countError3 } = await supabase
          .from('learning_patterns')
          .select('*', { count: 'exact', head: true });

        result = {
          success: true,
          status: 'healthy',
          stats: {
            total_entities: entityCount || 0,
            total_relationships: relationCount || 0,
            total_patterns: patternCount || 0
          }
        };
        break;

      // NEW: Delete knowledge entity
      case 'delete_knowledge':
        if (!data?.entity_id) {
          throw new Error('entity_id is required for delete action');
        }

        const { error: deleteError } = await supabase
          .from('knowledge_entities')
          .delete()
          .eq('id', data.entity_id);

        if (deleteError) throw deleteError;
        result = { success: true, deleted: data.entity_id };
        break;

      default:
        throw new Error(`Unknown action: ${action}. Available actions: store_knowledge, create_relationship, search_knowledge, get_related_entities, update_entity_confidence, store_learning_pattern, get_patterns, list_knowledge, check_status, delete_knowledge`);
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Knowledge Manager Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
