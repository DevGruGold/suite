import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'opportunity-scanner';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const QUERY_TIMEOUT_MS = 5000; // 5 second timeout per query
const OVERALL_TIMEOUT_MS = 15000; // 15 second overall timeout

// Timeout wrapper for queries
async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T | null> {
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => {
      console.warn(`⚠️ ${operation} timed out after ${ms}ms`);
      resolve(null);
    }, ms)
  );
  return Promise.race([promise, timeout]);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  // Overall timeout guard
  const timeoutPromise = new Promise<Response>((resolve) =>
    setTimeout(() => {
      console.warn('⚠️ Overall scan timeout reached');
      resolve(new Response(JSON.stringify({ 
        success: true, 
        timeout: true,
        message: 'Scan timed out - partial results'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }));
    }, OVERALL_TIMEOUT_MS)
  );

  const mainPromise = (async () => {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      let body: any = {};
      try {
        body = await req.json();
      } catch {
        // Empty body for cron
      }

      const { action } = body;

      if (action === 'generate_report') {
        return await generateDailyReport(supabase);
      }

      console.log('🔍 Starting opportunity scan...');
      const opportunities: any[] = [];

      // 1. Detect slow-running tasks (fast query)
      const slowTasksResult = await withTimeout(
        supabase.from('tasks').select('id, title').eq('status', 'in_progress').gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(5),
        QUERY_TIMEOUT_MS,
        'slowTasks'
      );

      if (slowTasksResult?.data && slowTasksResult.data.length > 0) {
        opportunities.push({
          opportunity_type: 'performance',
          title: `${slowTasksResult.data.length} tasks running over 24 hours`,
          description: `Tasks may be stuck: ${slowTasksResult.data.map((t: any) => t.title).slice(0, 3).join(', ')}`,
          priority: 7,
          actionable: true,
          action_taken: 'pending'
        });
      }

      // 2. Detect error patterns in logs (fast query)
      const errorsResult = await withTimeout(
        supabase.from('eliza_activity_log').select('id, activity_type').eq('status', 'failed').gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()).limit(5),
        QUERY_TIMEOUT_MS,
        'recentErrors'
      );

      if (errorsResult?.data && errorsResult.data.length >= 3) {
        opportunities.push({
          opportunity_type: 'bug_fix',
          title: `${errorsResult.data.length} errors in past hour`,
          description: `Error spike: ${errorsResult.data.map((e: any) => e.activity_type).slice(0, 3).join(', ')}`,
          priority: 9,
          actionable: true,
          action_taken: 'pending'
        });
      }

      // 3. Detect high-potential patterns (fast query)
      const patternsResult = await withTimeout(
        supabase.from('eliza_work_patterns').select('pattern_type, times_applied, lesson_learned').eq('outcome', 'success').gte('confidence_score', 0.8).order('times_applied', { ascending: false }).limit(2),
        QUERY_TIMEOUT_MS,
        'successPatterns'
      );

      if (patternsResult?.data && patternsResult.data.length > 0) {
        for (const pattern of patternsResult.data) {
          opportunities.push({
            opportunity_type: 'optimization',
            title: `Replicate pattern: ${pattern.pattern_type}`,
            description: `Applied ${pattern.times_applied} times. ${pattern.lesson_learned?.substring(0, 80) || ''}`,
            priority: 6,
            actionable: true,
            action_taken: 'pending'
          });
        }
      }

      // Insert opportunities
      if (opportunities.length > 0) {
        await withTimeout(
          supabase.from('opportunity_log').insert(opportunities),
          QUERY_TIMEOUT_MS,
          'insertOpportunities'
        );
        console.log(`✅ Logged ${opportunities.length} opportunities`);
      }

      // Quick metrics update
      const today = new Date().toISOString().split('T')[0];
      await withTimeout(
        supabase.from('eliza_performance_metrics').upsert({ metric_date: today, opportunities_discovered: opportunities.length }, { onConflict: 'metric_date' }),
        QUERY_TIMEOUT_MS,
        'updateMetrics'
      );

      await usageTracker.success({ opportunities_found: opportunities.length });
      return new Response(JSON.stringify({
        success: true,
        opportunities_found: opportunities.length,
        high_priority: opportunities.filter(o => o.priority >= 7).length,
        actionable: opportunities.filter(o => o.actionable).length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('❌ Opportunity scanner error:', error);
      await usageTracker.failure(error.message, 500);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  })();

  return Promise.race([mainPromise, timeoutPromise]);
});

async function generateDailyReport(supabase: any) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const result = await withTimeout(
    supabase.from('opportunity_log').select('*').gte('created_at', yesterday.toISOString()).order('priority', { ascending: false }).limit(50),
    QUERY_TIMEOUT_MS,
    'fetchOpportunities'
  );

  const opportunities = result?.data || [];

  const report = {
    date: new Date().toISOString().split('T')[0],
    total_opportunities: opportunities.length,
    high_priority: opportunities.filter((o: any) => o.priority >= 7).length,
    actioned: opportunities.filter((o: any) => o.action_taken !== 'pending').length
  };

  await withTimeout(
    supabase.from('eliza_activity_log').insert({
      activity_type: 'daily_opportunity_report',
      title: `Daily Opportunity Report - ${report.date}`,
      description: `Found ${report.total_opportunities} opportunities, ${report.high_priority} high priority`,
      metadata: report,
      status: 'completed'
    }),
    QUERY_TIMEOUT_MS,
    'logReport'
  );

  return new Response(JSON.stringify(report), {
    headers: { 'Content-Type': 'application/json' }
  });
}
