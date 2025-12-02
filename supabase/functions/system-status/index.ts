import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { EDGE_FUNCTIONS_REGISTRY } from '../_shared/edgeFunctionRegistry.ts';
import { calculateUnifiedHealthScore, extractCronMetrics, buildHealthMetrics } from '../_shared/healthScoring.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 System Status Check - Starting comprehensive diagnostics...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const VERCEL_SERVICES = {
      io: 'https://xmrt-io.vercel.app',
      ecosystem: 'https://xmrt-ecosystem.vercel.app',
      dao: 'https://xmrt-dao-ecosystem.vercel.app'
    };
    
    const statusReport: any = {
      timestamp: new Date().toISOString(),
      overall_status: 'healthy',
      components: {}
    };
    
    // 1. Check Database Health
    console.log('📊 Checking database health...');
    try {
      const { data: dbTest, error: dbError } = await supabase
        .from('agents')
        .select('id')
        .limit(1);
      
      statusReport.components.database = {
        status: dbError ? 'unhealthy' : 'healthy',
        error: dbError?.message,
        response_time_ms: 0 // Could add timing if needed
      };
    } catch (error) {
      statusReport.components.database = {
        status: 'error',
        error: error.message
      };
      statusReport.overall_status = 'degraded';
    }
    
    // 2. Check Agents Status
    console.log('🤖 Checking agents status...');
    try {
      const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (agentsError) throw agentsError;
      
      const agentStats = {
        total: agents?.length || 0,
        idle: agents?.filter((a: any) => a.status === 'IDLE').length || 0,
        busy: agents?.filter((a: any) => a.status === 'BUSY').length || 0,
        working: agents?.filter((a: any) => a.status === 'WORKING').length || 0,
        completed: agents?.filter((a: any) => a.status === 'COMPLETED').length || 0,
        error: agents?.filter((a: any) => a.status === 'ERROR').length || 0
      };
      
      statusReport.components.agents = {
        status: 'healthy',
        stats: agentStats,
        recent_agents: agents?.slice(0, 5).map((a: any) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          status: a.status
        }))
      };
      
      // Flag if too many errors
      if (agentStats.error > 3) {
        statusReport.components.agents.status = 'degraded';
        statusReport.overall_status = 'degraded';
      }
    } catch (error) {
      statusReport.components.agents = {
        status: 'error',
        error: error.message
      };
      statusReport.overall_status = 'degraded';
    }
    
    // 3. Check Tasks Status
    console.log('📋 Checking tasks status...');
    try {
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (tasksError) throw tasksError;
      
      const taskStats = {
        total: tasks?.length || 0,
        pending: tasks?.filter((t: any) => t.status === 'PENDING').length || 0,
        in_progress: tasks?.filter((t: any) => t.status === 'IN_PROGRESS').length || 0,
        blocked: tasks?.filter((t: any) => t.status === 'BLOCKED').length || 0,
        completed: tasks?.filter((t: any) => t.status === 'COMPLETED').length || 0,
        failed: tasks?.filter((t: any) => t.status === 'FAILED').length || 0
      };
      
      statusReport.components.tasks = {
        status: 'healthy',
        stats: taskStats,
        recent_tasks: tasks?.slice(0, 5).map((t: any) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          stage: t.stage,
          priority: t.priority
        }))
      };
      
      // Flag if too many blocked or failed
      if (taskStats.blocked > 5 || taskStats.failed > 5) {
        statusReport.components.tasks.status = 'degraded';
        statusReport.overall_status = 'degraded';
      }
    } catch (error) {
      statusReport.components.tasks = {
        status: 'error',
        error: error.message
      };
      statusReport.overall_status = 'degraded';
    }
    
    // 4. Check Mining Proxy
    console.log('⛏️ Checking mining stats...');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const { data: miningData, error: miningError } = await supabase.functions.invoke('mining-proxy', {
        body: {}
      });
      
      clearTimeout(timeoutId);
      
      if (miningError) throw miningError;
      
      statusReport.components.mining = {
        status: 'healthy',
        hash_rate: miningData.hash || 0,
        total_hashes: miningData.totalHashes || 0,
        valid_shares: miningData.validShares || 0,
        amount_due: miningData.amtDue || 0
      };
    } catch (error) {
      statusReport.components.mining = {
        status: 'error',
        error: error.message
      };
    }
    
    // 5. Check Vercel Services Status
    console.log('🚀 Checking Vercel services health...');
    try {
      const vercelHealthChecks = await Promise.all(
        Object.entries(VERCEL_SERVICES).map(async ([name, url]) => {
          const startTime = Date.now();
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${url}/health`, {
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const responseTime = Date.now() - startTime;
            
            return {
              service: name,
              status: response.ok ? 'healthy' : 'degraded',
              url,
              response_time_ms: responseTime,
              status_code: response.status
            };
          } catch (error) {
            return {
              service: name,
              status: 'offline',
              url,
              error: error.message
            };
          }
        })
      );
      
      const allHealthy = vercelHealthChecks.every(s => s.status === 'healthy');
      
      statusReport.components.vercel_services = {
        status: allHealthy ? 'healthy' : 'degraded',
        services: vercelHealthChecks
      };
      
      if (!allHealthy) {
        statusReport.overall_status = 'degraded';
      }
    } catch (error) {
        statusReport.components.vercel_services = {
          status: 'error',
          error: error.message
        };
    }
    
    // 6. Check Edge Functions Health - COMPREHENSIVE SCAN (ALL 93+ DEPLOYED FUNCTIONS)
    console.log('⚡ Checking edge functions health (all deployed functions)...');
    try {
      // Get ALL registered functions from authoritative registry
      const allRegisteredFunctions = EDGE_FUNCTIONS_REGISTRY.map(f => f.name);
      const totalDeployedFunctions = allRegisteredFunctions.length;
      
      console.log(`📊 Total deployed functions in registry: ${totalDeployedFunctions}`);
      
      // Get recent usage data (last 24h) for active functions
      const { data: functionUsage, error: usageError } = await supabase
        .from('eliza_function_usage')
        .select('*')
        .gte('invoked_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('invoked_at', { ascending: false });
      
      if (usageError) throw usageError;
      
      // Build stats for ACTIVE functions (those with recent usage)
      const functionStats: Record<string, any> = {};
      const activeFunctionNames = new Set<string>();
      
      functionUsage?.forEach((usage: any) => {
        const funcName = usage.function_name;
        activeFunctionNames.add(funcName);
        
        if (!functionStats[funcName]) {
          functionStats[funcName] = {
            total_calls: 0,
            successful: 0,
            failed: 0,
            avg_duration_ms: 0,
            last_called: null,
            error_rate: 0,
            status: 'active'
          };
        }
        
        functionStats[funcName].total_calls++;
        if (usage.status === 'success') {
          functionStats[funcName].successful++;
        } else if (usage.status === 'error' || usage.status === 'failed') {
          functionStats[funcName].failed++;
        }
        
        if (usage.duration_ms) {
          functionStats[funcName].avg_duration_ms = 
            (functionStats[funcName].avg_duration_ms * (functionStats[funcName].total_calls - 1) + usage.duration_ms) 
            / functionStats[funcName].total_calls;
        }
        
        if (!functionStats[funcName].last_called || new Date(usage.invoked_at) > new Date(functionStats[funcName].last_called)) {
          functionStats[funcName].last_called = usage.invoked_at;
        }
      });
      
      // Calculate error rates for active functions
      Object.keys(functionStats).forEach(funcName => {
        const stats = functionStats[funcName];
        stats.error_rate = stats.total_calls > 0 ? (stats.failed / stats.total_calls) * 100 : 0;
        stats.avg_duration_ms = Math.round(stats.avg_duration_ms);
      });
      
      // Identify IDLE functions (registered but no recent activity)
      const idleFunctions = allRegisteredFunctions.filter(name => !activeFunctionNames.has(name));
      
      console.log(`✅ Active functions (24h): ${activeFunctionNames.size}`);
      console.log(`💤 Idle functions: ${idleFunctions.length}`);
      
      // Categorize active functions by health
      const healthyFunctions = Object.values(functionStats).filter((s: any) => s.error_rate < 5).length;
      const degradedFunctions = Object.values(functionStats).filter((s: any) => s.error_rate >= 5 && s.error_rate < 20).length;
      const unhealthyFunctions = Object.values(functionStats).filter((s: any) => s.error_rate >= 20).length;
      
      // Get top failing functions
      const topFailingFunctions = Object.entries(functionStats)
        .filter(([_, stats]: [string, any]) => stats.error_rate > 10)
        .sort((a: any, b: any) => b[1].error_rate - a[1].error_rate)
        .slice(0, 5)
        .map(([name, stats]) => ({ name, ...stats }));
      
      // Build comprehensive report
      statusReport.components.edge_functions = {
        status: unhealthyFunctions > 3 ? 'degraded' : (degradedFunctions > 5 ? 'degraded' : 'healthy'),
        message: `Scanned ${totalDeployedFunctions} registered functions: ${activeFunctionNames.size} active in last 24h, ${idleFunctions.length} idle`,
        
        // DEPLOYMENT OVERVIEW
        total_deployed: totalDeployedFunctions,
        total_active_24h: activeFunctionNames.size,
        total_idle: idleFunctions.length,
        
        // ACTIVE FUNCTION HEALTH (those with recent usage)
        active_healthy: healthyFunctions,
        active_degraded: degradedFunctions,
        active_unhealthy: unhealthyFunctions,
        
        // USAGE STATISTICS
        total_calls_24h: functionUsage?.length || 0,
        overall_error_rate: functionUsage?.length > 0 
          ? Math.round((functionUsage.filter((u: any) => u.status === 'error' || u.status === 'failed').length / functionUsage.length) * 100) 
          : 0,
        
        // TOP ISSUES
        top_failing: topFailingFunctions,
        
        // DETAILED LISTS
        idle_functions: idleFunctions.slice(0, 20), // First 20 idle functions
        idle_functions_full_list: idleFunctions, // Complete list
        
        // REGISTRY INFO
        registry_source: 'EDGE_FUNCTIONS_REGISTRY',
        registry_coverage: `${activeFunctionNames.size} of ${totalDeployedFunctions} deployed functions are active`,
        
        // COVERAGE METRICS
        coverage: {
          deployed_vs_active_percent: Math.round((activeFunctionNames.size / totalDeployedFunctions) * 100),
          message: `${activeFunctionNames.size} of ${totalDeployedFunctions} deployed functions active in last 24h (${idleFunctions.length} idle)`
        }
      };
      
      // Update overall status based on health
      if (unhealthyFunctions > 3 || statusReport.components.edge_functions.overall_error_rate > 15) {
        statusReport.overall_status = 'degraded';
      }
      
    } catch (error) {
      statusReport.components.edge_functions = {
        status: 'error',
        error: error.message
      };
      statusReport.overall_status = 'degraded';
    }
    
    // 7. Check Cron Jobs Health
    // 7. Check Cron Jobs Health - REAL-TIME DATA FROM PG_CRON
    console.log('⏰ Checking cron jobs health (querying pg_cron directly)...');
    try {
      const { data: cronJobs, error: cronError } = await supabase.rpc('get_cron_jobs_status');
      
      if (cronError) {
        console.error('❌ Failed to query cron jobs:', cronError);
        throw cronError;
      }
      
      console.log(`✅ Retrieved ${cronJobs?.length || 0} cron jobs from pg_cron`);
      
      // Analyze cron job health
      const totalJobs = cronJobs?.length || 0;
      const activeJobs = cronJobs?.filter((j: any) => j.active).length || 0;
      const inactiveJobs = totalJobs - activeJobs;
      
      // Jobs that have run in last 24h
      const recentlyExecutedJobs = cronJobs?.filter((j: any) => 
        j.total_runs_24h && j.total_runs_24h > 0
      ).length || 0;
      
      // Jobs with high success rate (>80%)
      const healthyJobs = cronJobs?.filter((j: any) => 
        j.success_rate !== null && j.success_rate > 80
      ).length || 0;
      
      // Jobs with poor success rate (<50%)
      const failingJobs = cronJobs?.filter((j: any) => 
        j.success_rate !== null && j.success_rate < 50
      ).length || 0;
      
      // Jobs that should have run but didn't (active but no runs in 24h)
      const stalledJobs = cronJobs?.filter((j: any) => 
        j.active && (!j.total_runs_24h || j.total_runs_24h === 0)
      ).length || 0;
      
      // Determine overall cron health status
      let cronStatus = 'healthy';
      if (failingJobs > 3 || stalledJobs > 5) {
        cronStatus = 'degraded';
      } else if (failingJobs > 0 || stalledJobs > 2) {
        cronStatus = 'warning';
      }
      
      // Top 5 failing jobs for visibility
      const topFailingJobs = cronJobs
        ?.filter((j: any) => j.failed_runs_24h && j.failed_runs_24h > 0)
        ?.sort((a: any, b: any) => (b.failed_runs_24h || 0) - (a.failed_runs_24h || 0))
        ?.slice(0, 5)
        ?.map((j: any) => ({
          name: j.jobname,
          schedule: j.schedule,
          active: j.active,
          last_run: j.last_run_time,
          success_rate: j.success_rate,
          failed_runs_24h: j.failed_runs_24h,
          total_runs_24h: j.total_runs_24h
        })) || [];
      
      statusReport.components.cron_jobs = {
        status: cronStatus,
        total_jobs: totalJobs,
        active_jobs: activeJobs,
        inactive_jobs: inactiveJobs,
        recently_executed_24h: recentlyExecutedJobs,
        healthy_jobs: healthyJobs,
        failing_jobs: failingJobs,
        stalled_jobs: stalledJobs,
        top_failing_jobs: topFailingJobs,
        all_jobs: cronJobs?.map((j: any) => ({
          name: j.jobname,
          schedule: j.schedule,
          active: j.active,
          last_run: j.last_run_time,
          last_status: j.last_run_status,
          success_rate: j.success_rate,
          runs_24h: j.total_runs_24h
        })) || []
      };
      
      if (cronStatus === 'degraded') {
        statusReport.overall_status = 'degraded';
      }
      
      console.log(`✅ Cron jobs analyzed: ${healthyJobs} healthy, ${failingJobs} failing, ${stalledJobs} stalled`);
    } catch (error) {
      statusReport.components.cron_jobs = {
        status: 'error',
        error: error.message
      };
    }
    
    // 8. Check Activity Log for Recent Errors
    console.log('📜 Checking recent activity logs...');
    try {
      const { data: recentActivity, error: activityError } = await supabase
        .from('eliza_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (activityError) throw activityError;
      
      const pendingCount = recentActivity?.filter((a: any) => a.status === 'pending').length || 0;
      const failedCount = recentActivity?.filter((a: any) => a.status === 'failed').length || 0;
      
      statusReport.components.activity_log = {
        status: failedCount > 10 ? 'degraded' : 'healthy',
        recent_activities: recentActivity?.slice(0, 5).map((a: any) => ({
          type: a.activity_type,
          title: a.title,
          status: a.status,
          created_at: a.created_at
        })),
        stats: {
          pending: pendingCount,
          failed: failedCount
        }
      };
      
      if (failedCount > 10) {
        statusReport.overall_status = 'degraded';
      }
    } catch (error) {
      statusReport.components.activity_log = {
        status: 'error',
        error: error.message
      };
    }
    
    // 9. Generate Health Summary - UNIFIED SCORING SYSTEM
    const cronMetrics = extractCronMetrics(statusReport.components.cron_jobs?.all_jobs || []);
    
    const healthMetrics = buildHealthMetrics({
      apiKeyHealth: { unhealthy: 0 }, // API key health checked separately
      pythonExecStats: { failed: 0 }, // Would need separate query
      taskStats: { blocked: statusReport.components.tasks?.stats?.blocked || 0 },
      cronStats: { 
        failing: statusReport.components.cron_jobs?.failing_jobs || cronMetrics.failing,
        stalled: statusReport.components.cron_jobs?.stalled_jobs || cronMetrics.stalled
      },
      agentStats: { error: statusReport.components.agents?.stats?.error || 0 },
      edgeFunctionStats: { overall_error_rate: statusReport.components.edge_functions?.overall_error_rate || 0 },
      deviceStats: { total: 0, active: 0 },
      chargingStats: { avg_efficiency: 100, total: 0 },
      commandStats: { failed: 0 }
    });
    
    const healthResult = calculateUnifiedHealthScore(healthMetrics);
    
    statusReport.health_score = healthResult.score;
    statusReport.overall_status = healthResult.status;
    statusReport.health_issues = healthResult.issues;
    statusReport.scoring_method = 'unified_v1';
    
    console.log(`✅ System Status Check Complete - Overall: ${statusReport.overall_status} (${statusReport.health_score}/100)`);
    
    return new Response(
      JSON.stringify({
        success: true,
        status: statusReport
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("System status check error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        status: {
          overall_status: 'error',
          timestamp: new Date().toISOString()
        }
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
