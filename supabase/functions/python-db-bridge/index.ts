import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Comprehensive whitelist of tables Python can access
const ALLOWED_TABLES = [
  // Core device/session tables
  'devices',
  'device_activity_log',
  'device_connection_sessions',
  'dao_members',
  
  // Eliza activity & execution
  'eliza_activity_log',
  'eliza_python_executions',
  'eliza_function_usage',
  
  // Chat & conversations
  'chat_messages',
  'chat_sessions',
  'conversation_sessions',
  'conversation_messages',
  'conversation_history',
  'conversation_summaries',
  
  // Knowledge & memory
  'knowledge_entities',
  'entity_relationships',
  'memory_contexts',
  
  // GitHub integration
  'github_contributions',
  'github_contributors',
  'github_api_usage',
  
  // Battery & charging
  'battery_sessions',
  'battery_readings',
  'charging_sessions',
  'battery_health_snapshots',
  
  // Activity & logs
  'activity_feed',
  'frontend_events',
  'api_call_logs',
  'webhook_logs',
  
  // Agent & task pipeline
  'agents',
  'tasks',
  'task_templates',
  'agent_activities',
  'agent_performance_metrics',
  'agent_specializations',
  'superduper_agents',
  
  // Workflow system
  'workflow_templates',
  'workflow_executions',
  'workflow_diagnostic_reports',
  
  // Governance
  'edge_function_proposals',
  'edge_function_votes',
  'proposal_comments',
  
  // Cron & scheduling
  'cron_registry',
  
  // System flags & config
  'system_flags',
  'app_config',
  'api_key_health',
  
  // User & acquisition
  'user_profiles',
  'user_identities',
  'lead_qualification_signals',
  'service_api_keys',
  'service_usage_logs',
  
  // Autonomous actions
  'autonomous_actions_log',
  'autonomous_deploy_runs',
  'autonomy_metrics',
  
  // Community
  'community_ideas',
  'community_messages',
  'community_responses',
  
  // XMRT & mining
  'xmrt_rewards',
  'pop_events',
  
  // Licensing
  'corporate_license_applications'
];

// Extended operations including system access
const ALLOWED_OPERATIONS = [
  'select', 
  'insert', 
  'update', 
  'upsert',
  'count',
  'delete',       // Delete with mandatory filters
  'call_rpc',     // Call PostgreSQL functions
  'get_schema',   // Introspect table schema
  'system_info',  // Get comprehensive system status
  'list_cron_jobs', // List all cron jobs
  'get_cron_status', // Get cron job execution status
  'list_edge_functions', // List available edge functions
  'get_function_logs'    // Get recent function logs
];

interface DBOperation {
  table?: string;
  operation: string;
  filters?: Record<string, any>;
  data?: any;
  limit?: number;
  order?: { column: string; ascending?: boolean };
  columns?: string;
  function_name?: string;
  args?: Record<string, any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body: DBOperation = await req.json();
    const { table, operation, filters, data, limit, order, columns, function_name, args } = body;

    console.log(`🗄️ Python DB Bridge: ${operation}${table ? ` on ${table}` : ''}`);

    // System operations that don't need table validation
    if (['system_info', 'list_cron_jobs', 'get_cron_status', 'list_edge_functions', 'get_function_logs', 'call_rpc', 'get_schema'].includes(operation)) {
      return await handleSystemOperation(supabase, operation, body);
    }

    // Validate table for data operations
    if (!table) {
      throw new Error('Table name required for data operations');
    }
    
    if (!ALLOWED_TABLES.includes(table)) {
      throw new Error(`Table '${table}' not allowed. Allowed tables: ${ALLOWED_TABLES.slice(0, 10).join(', ')}... (${ALLOWED_TABLES.length} total)`);
    }

    // Validate operation
    if (!ALLOWED_OPERATIONS.includes(operation)) {
      throw new Error(`Operation '${operation}' not allowed. Allowed: ${ALLOWED_OPERATIONS.join(', ')}`);
    }

    // Build query
    let query: any = supabase.from(table);

    switch(operation) {
      case 'select': {
        query = query.select(columns || '*');
        
        // Apply filters
        if (filters) {
          query = applyFilters(query, filters);
        }
        
        if (limit) query = query.limit(limit);
        if (order) {
          query = query.order(order.column, { ascending: order.ascending ?? true });
        }
        break;
      }
      
      case 'insert': {
        if (!data || !data.rows) {
          throw new Error('Insert operation requires data.rows');
        }
        query = query.insert(data.rows).select();
        break;
      }
      
      case 'update': {
        if (!data || !data.values) {
          throw new Error('Update operation requires data.values');
        }
        if (!filters || Object.keys(filters).length === 0) {
          throw new Error('Update operation requires filters to prevent accidental mass updates');
        }
        
        query = query.update(data.values);
        query = applyFilters(query, filters);
        query = query.select();
        break;
      }

      case 'upsert': {
        if (!data || !data.rows) {
          throw new Error('Upsert operation requires data.rows');
        }
        const upsertOptions = data.onConflict ? { onConflict: data.onConflict } : {};
        query = query.upsert(data.rows, upsertOptions).select();
        break;
      }
      
      case 'delete': {
        if (!filters || Object.keys(filters).length === 0) {
          throw new Error('Delete operation requires filters to prevent mass deletion');
        }
        query = query.delete();
        query = applyFilters(query, filters);
        query = query.select();
        break;
      }
      
      case 'count': {
        query = query.select('*', { count: 'exact', head: true });
        if (filters) {
          query = applyFilters(query, filters);
        }
        break;
      }
    }

    // Execute query
    const result = await query;

    if (result.error) {
      console.error('❌ Database error:', result.error);
      throw result.error;
    }

    console.log(`✅ DB operation successful: ${operation} ${table}`);

    return new Response(JSON.stringify({
      success: true,
      data: result.data,
      count: result.count,
      operation,
      table
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ DB Bridge error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      hint: error.hint || null,
      details: error.details || null
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Apply filter operators to query
function applyFilters(query: any, filters: Record<string, any>) {
  Object.entries(filters).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Handle operators like {gt: 10}, {gte: 5}, etc.
      Object.entries(value).forEach(([op, opValue]) => {
        switch(op) {
          case 'gt': query = query.gt(key, opValue); break;
          case 'gte': query = query.gte(key, opValue); break;
          case 'lt': query = query.lt(key, opValue); break;
          case 'lte': query = query.lte(key, opValue); break;
          case 'neq': query = query.neq(key, opValue); break;
          case 'in': query = query.in(key, opValue); break;
          case 'like': query = query.like(key, opValue); break;
          case 'ilike': query = query.ilike(key, opValue); break;
          case 'is': query = query.is(key, opValue); break;
          case 'contains': query = query.contains(key, opValue); break;
          case 'containedBy': query = query.containedBy(key, opValue); break;
          case 'overlaps': query = query.overlaps(key, opValue); break;
          case 'textSearch': query = query.textSearch(key, opValue); break;
        }
      });
    } else {
      query = query.eq(key, value);
    }
  });
  return query;
}

// Handle system-level operations
async function handleSystemOperation(supabase: any, operation: string, body: DBOperation) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  switch(operation) {
    case 'system_info': {
      // Get comprehensive system information
      const [
        cronJobs,
        recentFunctionUsage,
        systemFlags,
        activeAgents,
        pendingTasks,
        recentActivity
      ] = await Promise.all([
        supabase.rpc('get_cron_jobs_status'),
        supabase.from('eliza_function_usage')
          .select('function_name, success, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('system_flags').select('*'),
        supabase.from('agents')
          .select('id, name, role, status, current_workload')
          .in('status', ['IDLE', 'BUSY']),
        supabase.from('tasks')
          .select('id, title, status, stage, priority')
          .in('status', ['PENDING', 'IN_PROGRESS'])
          .limit(20),
        supabase.from('eliza_activity_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20)
      ]);

      // Calculate function health
      const functionStats: Record<string, { total: number; success: number }> = {};
      (recentFunctionUsage.data || []).forEach((row: any) => {
        if (!functionStats[row.function_name]) {
          functionStats[row.function_name] = { total: 0, success: 0 };
        }
        functionStats[row.function_name].total++;
        if (row.success) functionStats[row.function_name].success++;
      });

      return new Response(JSON.stringify({
        success: true,
        operation: 'system_info',
        data: {
          cron_jobs: {
            data: cronJobs.data,
            count: cronJobs.data?.length || 0
          },
          function_health: Object.entries(functionStats).map(([name, stats]) => ({
            function_name: name,
            calls: stats.total,
            success_rate: stats.total > 0 ? (stats.success / stats.total * 100).toFixed(1) + '%' : 'N/A'
          })),
          system_flags: systemFlags.data,
          agents: {
            active: activeAgents.data,
            count: activeAgents.data?.length || 0
          },
          tasks: {
            pending: pendingTasks.data,
            count: pendingTasks.data?.length || 0
          },
          recent_activity: recentActivity.data,
          allowed_tables: ALLOWED_TABLES,
          allowed_operations: ALLOWED_OPERATIONS
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    case 'list_cron_jobs': {
      const { data, error } = await supabase.rpc('get_cron_jobs_status');
      
      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        operation: 'list_cron_jobs',
        data: data,
        count: data?.length || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    case 'get_cron_status': {
      // Get detailed cron execution status
      const { data, error } = await supabase.rpc('get_cron_jobs_status');
      
      if (error) throw error;

      // Analyze health
      const healthy = data?.filter((j: any) => !j.is_overdue && j.success_rate >= 95) || [];
      const warning = data?.filter((j: any) => !j.is_overdue && j.success_rate < 95 && j.success_rate >= 80) || [];
      const failing = data?.filter((j: any) => j.is_overdue || j.success_rate < 80) || [];

      return new Response(JSON.stringify({
        success: true,
        operation: 'get_cron_status',
        data: {
          all_jobs: data,
          summary: {
            total: data?.length || 0,
            healthy: healthy.length,
            warning: warning.length,
            failing: failing.length
          },
          failing_jobs: failing,
          health_score: data?.length > 0 
            ? ((healthy.length / data.length) * 100).toFixed(1) + '%'
            : 'N/A'
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    case 'list_edge_functions': {
      // Get unique function names from usage logs
      const { data, error } = await supabase
        .from('eliza_function_usage')
        .select('function_name')
        .order('function_name');

      if (error) throw error;

      // Deduplicate
      const uniqueFunctions = [...new Set(data?.map((r: any) => r.function_name))];

      // Get stats for each function
      const { data: statsData } = await supabase
        .from('eliza_function_usage')
        .select('function_name, success, execution_time_ms, created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const stats: Record<string, any> = {};
      (statsData || []).forEach((row: any) => {
        if (!stats[row.function_name]) {
          stats[row.function_name] = { calls: 0, success: 0, total_time: 0 };
        }
        stats[row.function_name].calls++;
        if (row.success) stats[row.function_name].success++;
        stats[row.function_name].total_time += row.execution_time_ms || 0;
      });

      return new Response(JSON.stringify({
        success: true,
        operation: 'list_edge_functions',
        data: uniqueFunctions.map(fn => ({
          function_name: fn,
          calls_24h: stats[fn]?.calls || 0,
          success_rate: stats[fn]?.calls > 0 
            ? ((stats[fn].success / stats[fn].calls) * 100).toFixed(1) + '%' 
            : 'N/A',
          avg_time_ms: stats[fn]?.calls > 0 
            ? Math.round(stats[fn].total_time / stats[fn].calls)
            : null
        })),
        count: uniqueFunctions.length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    case 'get_function_logs': {
      const { function_name, limit: logLimit = 50 } = body;
      
      let query = supabase
        .from('eliza_function_usage')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(logLimit);

      if (function_name) {
        query = query.eq('function_name', function_name);
      }

      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        operation: 'get_function_logs',
        data: data,
        count: data?.length || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    case 'call_rpc': {
      const { function_name: rpcName, args: rpcArgs } = body;
      
      if (!rpcName) {
        throw new Error('call_rpc requires function_name');
      }

      // Whitelist of allowed RPC functions
      const ALLOWED_RPC = [
        'get_cron_jobs_status',
        'calculate_agent_performance',
        'get_agent_by_name',
        'find_agents_with_skills',
        'batch_spawn_agents',
        'calculate_lead_score',
        'match_memories',
        'get_xmrt_charger_leaderboard',
        'refresh_function_version_performance',
        'refresh_tool_usage_dashboard',
        'check_rate_limit',
        'increment_rate_limit',
        'ensure_device',
        'ensure_connection_session',
        'record_connection_event',
        'get_miner_status',
        'batch_vectorize_memories',
        'repo_scan_preflight'
      ];

      if (!ALLOWED_RPC.includes(rpcName)) {
        throw new Error(`RPC function '${rpcName}' not allowed. Allowed: ${ALLOWED_RPC.join(', ')}`);
      }

      const { data, error } = await supabase.rpc(rpcName, rpcArgs || {});
      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        operation: 'call_rpc',
        function_name: rpcName,
        data: data
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    case 'get_schema': {
      const { table } = body;
      
      if (!table) {
        throw new Error('get_schema requires table name');
      }

      // Query information schema for table columns
      const { data, error } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable, column_default')
        .eq('table_schema', 'public')
        .eq('table_name', table);

      if (error) {
        // If information_schema isn't accessible, return allowed tables list
        return new Response(JSON.stringify({
          success: true,
          operation: 'get_schema',
          table: table,
          note: 'Schema introspection limited - returning table metadata',
          data: {
            table_name: table,
            is_allowed: ALLOWED_TABLES.includes(table),
            allowed_tables: ALLOWED_TABLES
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        operation: 'get_schema',
        table: table,
        columns: data
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    default:
      throw new Error(`Unknown system operation: ${operation}`);
  }
}
