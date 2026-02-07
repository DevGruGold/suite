import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const usageTracker = startUsageTracking('system-knowledge-builder');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔍 Starting system architecture knowledge scan...');

    // 1. Discover all tables
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');

    if (!tablesError && tables) {
      for (const table of tables) {
        const tableName = table.table_name;
        
        // Get column information
        const { data: columns } = await supabase
          .from('information_schema.columns')
          .select('column_name, data_type')
          .eq('table_name', tableName);

        // Get relationships (foreign keys)
        const { data: fkeys } = await supabase.rpc('get_foreign_keys', { p_table: tableName }).catch(() => ({ data: [] }));

        await supabase.from('system_architecture_knowledge').upsert({
          component_type: 'table',
          component_name: tableName,
          purpose: `Database table: ${tableName}`,
          relationships: { columns, foreign_keys: fkeys || [] },
          usage_patterns: {},
          last_analyzed_at: new Date().toISOString()
        }, { onConflict: 'component_type,component_name' });
      }
      console.log(`✅ Scanned ${tables.length} tables`);
    }

    // 2. Discover edge functions by checking edge function registry
    const knownFunctions = [
      'lovable-chat', 'python-executor', 'github-integration', 'agent-manager', 'task-orchestrator',
      'gemini-chat', 'openai-chat', 'deepseek-chat', 'kimi-chat',
      'ecosystem-monitor', 'system-health', 'code-monitor-daemon',
      'evaluate-community-idea', 'opportunity-scanner', 'autonomous-decision-maker', 'eliza-self-evaluation',
      'superduper-router', 'superduper-business-growth', 'superduper-code-architect',
      'mining-proxy', 'process-contributor-reward', 'validate-github-contribution'
    ];

    for (const funcName of knownFunctions) {
      await supabase.from('system_architecture_knowledge').upsert({
        component_type: 'function',
        component_name: funcName,
        purpose: `Edge function: ${funcName}`,
        relationships: {},
        usage_patterns: {},
        last_analyzed_at: new Date().toISOString()
      }, { onConflict: 'component_type,component_name' });
    }
    console.log(`✅ Registered ${knownFunctions.length} edge functions`);

    // 3. Discover cron jobs
    const { data: cronJobs } = await supabase
      .from('cron.job')
      .select('jobname, schedule, command');

    if (cronJobs) {
      for (const job of cronJobs) {
        await supabase.from('system_architecture_knowledge').upsert({
          component_type: 'cron',
          component_name: job.jobname,
          purpose: `Cron job: ${job.jobname} (${job.schedule})`,
          relationships: { schedule: job.schedule, command: job.command },
          usage_patterns: {},
          last_analyzed_at: new Date().toISOString()
        }, { onConflict: 'component_type,component_name' });
      }
      console.log(`✅ Scanned ${cronJobs.length} cron jobs`);
    }

    // 4. Register key deployments
    const deployments = [
      { name: 'frontend-vercel', purpose: 'Main user interface deployed on Vercel' },
      { name: 'supabase-backend', purpose: 'Database and edge functions backend' },
      { name: 'lovable-ai-gateway', purpose: 'AI API gateway for all models' }
    ];

    for (const deployment of deployments) {
      await supabase.from('system_architecture_knowledge').upsert({
        component_type: 'deployment',
        component_name: deployment.name,
        purpose: deployment.purpose,
        relationships: {},
        usage_patterns: {},
        last_analyzed_at: new Date().toISOString()
      }, { onConflict: 'component_type,component_name' });
    }
    console.log(`✅ Registered ${deployments.length} deployments`);

    // 5. Get component count summary
    const { data: summary } = await supabase
      .from('system_architecture_knowledge')
      .select('component_type')
      .then(({ data }) => {
        const counts = data?.reduce((acc: any, item: any) => {
          acc[item.component_type] = (acc[item.component_type] || 0) + 1;
          return acc;
        }, {});
        return { data: counts };
      });

    console.log('📊 System Knowledge Summary:', summary);

    await usageTracker.success({ result_summary: 'knowledge_updated' });
    return new Response(JSON.stringify({
      success: true,
      message: 'System architecture knowledge updated',
      summary
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ System knowledge builder error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
