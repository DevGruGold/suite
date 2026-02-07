import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { startUsageTracking } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'knowledge-manager';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// HELPER FUNCTIONS (Agent-Manager Pattern)
// ============================================================================

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function okResponse(data: any, message?: string) {
  return new Response(
    JSON.stringify({ ok: true, data, message }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function errorResponse(error: string, status: number = 400) {
  return new Response(
    JSON.stringify({ ok: false, error }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function logAction(action: string, data: any, result: any) {
  console.log(`🧠 [KnowledgeManager] ${action}`, { 
    input: data ? Object.keys(data) : 'none',
    success: result?.ok ?? true 
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });
  const startTime = Date.now();
  
  try {
    // Initialize Supabase client with service role for RLS bypass
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // ========================================================================
    // DEFENSIVE REQUEST PARSING (Agent-Manager Pattern)
    // ========================================================================
    let requestBody: any;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('❌ [KnowledgeManager] Failed to parse request body:', parseError);
      return errorResponse('Invalid JSON in request body', 400);
    }

    console.log('📥 [KnowledgeManager] Request body:', JSON.stringify(requestBody).substring(0, 500));

    // Extract action and data with auto-restructure support
    let action = requestBody.action;
    let data = requestBody.data;

    // Auto-restructure: if no action but has knowledge-specific fields at root
    if (!action && (requestBody.name || requestBody.entity_name || requestBody.search_term || requestBody.entity_id)) {
      console.log('🔄 [KnowledgeManager] Auto-restructuring flat request...');
      
      // Detect action from fields
      if (requestBody.search_term || requestBody.entity_type && !requestBody.name) {
        action = 'search_knowledge';
      } else if (requestBody.source_id && requestBody.target_id) {
        action = 'create_relationship';
      } else if (requestBody.entity_id && requestBody.new_confidence) {
        action = 'update_entity_confidence';
      } else if (requestBody.entity_id && Object.keys(requestBody).length <= 2) {
        action = 'delete_knowledge';
      } else if (requestBody.name || requestBody.entity_name) {
        action = 'store_knowledge';
      }
      
      data = requestBody;
    }

    // Validate action exists
    if (!action) {
      console.error('❌ [KnowledgeManager] Missing action in request');
      return errorResponse(
        'Missing "action" field. Available actions: store_knowledge, search_knowledge, create_relationship, ' +
        'get_related_entities, update_entity_confidence, store_learning_pattern, get_patterns, ' +
        'list_knowledge, check_status, delete_knowledge, upsert_knowledge',
        400
      );
    }

    // Ensure data is at least an empty object
    data = data || {};

    console.log(`🧠 [KnowledgeManager] Action: ${action}, Data keys: ${Object.keys(data).join(', ') || 'none'}`);

    // ========================================================================
    // ACTION ROUTING
    // ========================================================================
    let result: any;

    switch (action) {
      // ----------------------------------------------------------------------
      // STORE KNOWLEDGE
      // ----------------------------------------------------------------------
      case 'store_knowledge': {
        const entityName = data.name || data.entity_name;
        const entityType = data.type || data.entity_type || 'general';
        
        if (!entityName) {
          throw new ValidationError('store_knowledge requires "name" or "entity_name"');
        }

        const { data: entity, error } = await supabase
          .from('knowledge_entities')
          .insert({
            entity_name: entityName,
            entity_type: entityType,
            description: data.description || null,
            metadata: data.metadata || {},
            confidence_score: data.confidence ?? data.confidence_score ?? 0.5
          })
          .select()
          .single();

        if (error) throw error;
        
        logAction('store_knowledge', data, { ok: true });
        result = { entity, message: `Stored knowledge entity: ${entityName}` };
        break;
      }

      // ----------------------------------------------------------------------
      // UPSERT KNOWLEDGE (NEW)
      // ----------------------------------------------------------------------
      case 'upsert_knowledge': {
        const entityName = data.name || data.entity_name;
        const entityType = data.type || data.entity_type || 'general';
        
        if (!entityName) {
          throw new ValidationError('upsert_knowledge requires "name" or "entity_name"');
        }

        const { data: entity, error } = await supabase
          .from('knowledge_entities')
          .upsert({
            entity_name: entityName,
            entity_type: entityType,
            description: data.description || null,
            metadata: data.metadata || {},
            confidence_score: data.confidence ?? data.confidence_score ?? 0.5,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'entity_name'
          })
          .select()
          .single();

        if (error) throw error;
        
        logAction('upsert_knowledge', data, { ok: true });
        result = { entity, message: `Upserted knowledge entity: ${entityName}` };
        break;
      }

      // ----------------------------------------------------------------------
      // CREATE RELATIONSHIP
      // ----------------------------------------------------------------------
      case 'create_relationship': {
        const sourceId = data.source_id || data.source_entity_id;
        const targetId = data.target_id || data.target_entity_id;
        const relType = data.type || data.relationship_type || 'related_to';
        
        if (!sourceId || !targetId) {
          throw new ValidationError('create_relationship requires "source_id" and "target_id"');
        }

        const { data: relationship, error } = await supabase
          .from('entity_relationships')
          .insert({
            source_entity_id: sourceId,
            target_entity_id: targetId,
            relationship_type: relType,
            strength: data.strength ?? 0.5,
            metadata: data.metadata || {}
          })
          .select()
          .single();

        if (error) throw error;
        
        logAction('create_relationship', data, { ok: true });
        result = { relationship, message: `Created relationship: ${relType}` };
        break;
      }

      // ----------------------------------------------------------------------
      // SEARCH KNOWLEDGE
      // ----------------------------------------------------------------------
      case 'search_knowledge': {
        let query = supabase
          .from('knowledge_entities')
          .select('*');

        if (data.entity_type || data.type) {
          query = query.eq('entity_type', data.entity_type || data.type);
        }
        if (data.min_confidence) {
          query = query.gte('confidence_score', data.min_confidence);
        }
        if (data.search_term) {
          query = query.or(`entity_name.ilike.%${data.search_term}%,description.ilike.%${data.search_term}%`);
        }

        const { data: entities, error } = await query
          .order('confidence_score', { ascending: false })
          .limit(data.limit || 20);

        if (error) throw error;
        
        logAction('search_knowledge', data, { ok: true });
        result = { entities, count: entities?.length || 0 };
        break;
      }

      // ----------------------------------------------------------------------
      // GET RELATED ENTITIES
      // ----------------------------------------------------------------------
      case 'get_related_entities': {
        const entityId = data.entity_id;
        
        if (!entityId) {
          throw new ValidationError('get_related_entities requires "entity_id"');
        }

        const { data: relationships, error } = await supabase
          .from('entity_relationships')
          .select(`
            *,
            source:source_entity_id(id, entity_name, entity_type, description),
            target:target_entity_id(id, entity_name, entity_type, description)
          `)
          .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`)
          .order('strength', { ascending: false });

        if (error) throw error;
        
        logAction('get_related_entities', data, { ok: true });
        result = { relationships, count: relationships?.length || 0 };
        break;
      }

      // ----------------------------------------------------------------------
      // UPDATE ENTITY CONFIDENCE
      // ----------------------------------------------------------------------
      case 'update_entity_confidence': {
        const entityId = data.entity_id || data.id;
        const newConfidence = data.new_confidence ?? data.confidence_score ?? data.confidence;
        
        if (!entityId) {
          throw new ValidationError('update_entity_confidence requires "entity_id"');
        }
        if (newConfidence === undefined || newConfidence === null) {
          throw new ValidationError('update_entity_confidence requires "new_confidence"');
        }

        const { data: entity, error } = await supabase
          .from('knowledge_entities')
          .update({ 
            confidence_score: newConfidence,
            updated_at: new Date().toISOString()
          })
          .eq('id', entityId)
          .select()
          .single();

        if (error) throw error;
        
        logAction('update_entity_confidence', data, { ok: true });
        result = { entity, message: `Updated confidence to ${newConfidence}` };
        break;
      }

      // ----------------------------------------------------------------------
      // STORE LEARNING PATTERN
      // ----------------------------------------------------------------------
      case 'store_learning_pattern': {
        const patternType = data.type || data.pattern_type;
        const patternData = data.data || data.pattern_data;
        
        if (!patternType) {
          throw new ValidationError('store_learning_pattern requires "type" or "pattern_type"');
        }

        const { data: pattern, error } = await supabase
          .from('learning_patterns')
          .insert({
            pattern_type: patternType,
            pattern_data: patternData || {},
            confidence_score: data.confidence ?? data.confidence_score ?? 0.5
          })
          .select()
          .single();

        if (error) throw error;
        
        logAction('store_learning_pattern', data, { ok: true });
        result = { pattern, message: `Stored learning pattern: ${patternType}` };
        break;
      }

      // ----------------------------------------------------------------------
      // GET PATTERNS
      // ----------------------------------------------------------------------
      case 'get_patterns': {
        const patternType = data.type || data.pattern_type;
        
        let query = supabase
          .from('learning_patterns')
          .select('*');
        
        if (patternType) {
          query = query.eq('pattern_type', patternType);
        }
        
        const { data: patterns, error } = await query
          .gte('confidence_score', data.min_confidence || 0.3)
          .order('usage_count', { ascending: false })
          .limit(data.limit || 10);

        if (error) throw error;
        
        logAction('get_patterns', data, { ok: true });
        result = { patterns, count: patterns?.length || 0 };
        break;
      }

      // ----------------------------------------------------------------------
      // LIST KNOWLEDGE
      // ----------------------------------------------------------------------
      case 'list_knowledge': {
        let query = supabase
          .from('knowledge_entities')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(data.limit || 50);

        if (data.entity_type || data.type) {
          query = query.eq('entity_type', data.entity_type || data.type);
        }

        const { data: entities, error } = await query;
        
        if (error) throw error;
        
        logAction('list_knowledge', data, { ok: true });
        result = { entities, count: entities?.length || 0 };
        break;
      }

      // ----------------------------------------------------------------------
      // CHECK STATUS
      // ----------------------------------------------------------------------
      case 'check_status': {
        const [entityResult, relationResult, patternResult] = await Promise.all([
          supabase.from('knowledge_entities').select('*', { count: 'exact', head: true }),
          supabase.from('entity_relationships').select('*', { count: 'exact', head: true }),
          supabase.from('learning_patterns').select('*', { count: 'exact', head: true })
        ]);

        if (entityResult.error) throw entityResult.error;
        if (relationResult.error) throw relationResult.error;
        if (patternResult.error) throw patternResult.error;

        const executionTime = Date.now() - startTime;
        
        logAction('check_status', data, { ok: true });
        result = {
          status: 'healthy',
          stats: {
            total_entities: entityResult.count || 0,
            total_relationships: relationResult.count || 0,
            total_patterns: patternResult.count || 0
          },
          execution_time_ms: executionTime
        };
        break;
      }

      // ----------------------------------------------------------------------
      // DELETE KNOWLEDGE
      // ----------------------------------------------------------------------
      case 'delete_knowledge': {
        const entityId = data.entity_id || data.id;
        
        if (!entityId) {
          throw new ValidationError('delete_knowledge requires "entity_id"');
        }

        // First delete related relationships
        await supabase
          .from('entity_relationships')
          .delete()
          .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`);

        // Then delete the entity
        const { error } = await supabase
          .from('knowledge_entities')
          .delete()
          .eq('id', entityId);

        if (error) throw error;
        
        logAction('delete_knowledge', data, { ok: true });
        result = { deleted: entityId, message: 'Knowledge entity deleted' };
        break;
      }

      // ----------------------------------------------------------------------
      // DEFAULT
      // ----------------------------------------------------------------------
      default:
        return errorResponse(
          `Unknown action: ${action}. Available actions: store_knowledge, upsert_knowledge, search_knowledge, ` +
          'create_relationship, get_related_entities, update_entity_confidence, store_learning_pattern, ' +
          'get_patterns, list_knowledge, check_status, delete_knowledge',
          400
        );
    }

    // Log activity
    try {
      await supabase.from('eliza_activity_log').insert({
        activity_type: 'knowledge_operation',
        title: `Knowledge: ${action}`,
        description: `Executed ${action} in knowledge-manager`,
        status: 'completed',
        metadata: {
          action,
          execution_time_ms: Date.now() - startTime,
          data_keys: Object.keys(data)
        }
      });
    } catch (logError) {
      console.warn('⚠️ [KnowledgeManager] Failed to log activity:', logError);
    }

    await usageTracker.success({ result_summary: `${action} completed` });
    return okResponse(result, `${action} completed successfully`);

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    console.error('❌ [KnowledgeManager] Error:', error);

    // Handle validation errors differently
    if (error instanceof ValidationError) {
      return errorResponse(error.message, 400);
    }

    // Log error to activity log
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase.from('eliza_activity_log').insert({
        activity_type: 'knowledge_operation',
        title: 'Knowledge Manager Error',
        description: error.message || 'Unknown error',
        status: 'failed',
        metadata: { 
          error: error.message,
          execution_time_ms: executionTime
        }
      });
    } catch (logError) {
      console.warn('⚠️ [KnowledgeManager] Failed to log error:', logError);
    }

    return errorResponse(error.message || 'Internal server error', 500);
  }
});
