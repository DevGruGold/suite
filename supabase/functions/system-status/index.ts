import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { EDGE_FUNCTIONS_REGISTRY } from '../_shared/edgeFunctionRegistry.ts';
import { calculateUnifiedHealthScore, extractCronMetrics, buildHealthMetrics } from '../_shared/healthScoring.ts';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'system-status';
const QUERY_TIMEOUT_MS = 8000; // 8 second timeout per query

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Timeout wrapper for database queries
async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${operation} timeout after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// In-memory cache for health metrics (TTL varies by caller)
let statusCache: { data: any; timestamp: number } | null = null;
const API_CACHE_TTL_MS = 60000;     // 1 minute for API calls
const CRON_CACHE_TTL_MS = 300000;   // 5 minutes for cron-triggered snapshots

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    // Parse request body to check if this is a cron snapshot
    let body: any = {};
    try {
      body = await req.json();
    } catch { /* empty body is fine */ }

    const isCronSnapshot = body?.snapshot_type === 'scheduled';
    const cacheTTL = isCronSnapshot ? CRON_CACHE_TTL_MS : API_CACHE_TTL_MS;

    // Check cache for recent results (use appropriate TTL)
    if (statusCache && Date.now() - statusCache.timestamp < cacheTTL) {
      console.log(`📦 Returning cached system status (< ${cacheTTL / 1000}s old)`);
      await usageTracker.success({ cached: true });
      return new Response(JSON.stringify(statusCache.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' }
      });
    }

    console.log('🔍 System Status Check - Starting comprehensive diagnostics...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      db: { schema: 'public' },
      global: { headers: { 'x-statement-timeout': '10000' } } // 10s statement timeout
    });

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

    // ========== PARALLEL GROUP 1: Core health checks ==========
    console.log('📊 Running parallel core health checks (db, agents, tasks)...');
    const coreChecksStart = Date.now();

    const [dbResult, agentsResult, tasksResult] = await Promise.all([
      // 1. Database Health & Volume
      withTimeout(
        Promise.all([
          supabase.from('agents').select('id', { count: 'exact', head: true }),
          supabase.from('tasks').select('id', { count: 'exact', head: true }),
          supabase.from('memories').select('id', { count: 'exact', head: true }),
          supabase.from('documents').select('id', { count: 'exact', head: true }),
        ]),
        QUERY_TIMEOUT_MS,
        'database_health_check'
      ).then(([agents, tasks, memories, docs]) => ({
        data: {
          agents: agents.count,
          tasks: tasks.count,
          memories: memories.count,
          documents: docs.count
        },
        error: agents.error || tasks.error || memories.error || docs.error,
        responseTime: Date.now() - coreChecksStart
      }))
        .catch(error => ({ data: null, error, responseTime: Date.now() - coreChecksStart })),

      // 2. Agents Status
      withTimeout(
        supabase.from('agents').select('id, name, role, status').order('created_at', { ascending: false }).limit(50),
        QUERY_TIMEOUT_MS,
        'agents_status_check'
      ).catch(error => ({ data: null, error })),

      // 3. Tasks Status
      withTimeout(
        supabase.from('tasks').select('id, title, status, stage, priority').order('updated_at', { ascending: false }).limit(100),
        QUERY_TIMEOUT_MS,
        'tasks_status_check'
      ).catch(error => ({ data: null, error }))
    ]);

    console.log(`✅ Core checks completed in ${Date.now() - coreChecksStart}ms`);

    // Process database result
    statusReport.components.database = {
      status: dbResult.error ? 'unhealthy' : 'healthy',
      error: dbResult.error?.message,
      error: dbResult.error?.message,
      response_time_ms: dbResult.responseTime,
      stats: dbResult.data ? {
        total_agents: dbResult.data.agents,
        total_tasks: dbResult.data.tasks,
        total_memories: dbResult.data.memories,
        total_documents: dbResult.data.documents
      } : null
    };
    if (dbResult.error) statusReport.overall_status = 'degraded';

    // Process agents result
    const agents = agentsResult?.data;
    if (agentsResult?.error) {
      statusReport.components.agents = { status: 'error', error: agentsResult.error.message };
      statusReport.overall_status = 'degraded';
    } else {
      const agentStats = {
        total: agents?.length || 0,
        idle: agents?.filter((a: any) => a.status === 'IDLE').length || 0,
        busy: agents?.filter((a: any) => a.status === 'BUSY').length || 0,
        working: agents?.filter((a: any) => a.status === 'BUSY').length || 0, // Map BUSY to working
        blocked: agents?.filter((a: any) => a.status === 'BLOCKED').length || 0,
        paused: agents?.filter((a: any) => a.status === 'PAUSED').length || 0,
        completed: agents?.filter((a: any) => a.status === 'COMPLETED').length || 0,
        error: agents?.filter((a: any) => a.status === 'ERROR').length || 0
      };
      statusReport.components.agents = {
        status: (agentStats.error > 3 || agentStats.blocked > 3) ? 'degraded' : 'healthy',
        stats: agentStats,
        recent_agents: agents?.slice(0, 5).map((a: any) => ({ id: a.id, name: a.name, role: a.role, status: a.status }))
      };
      if (agentStats.error > 3 || agentStats.blocked > 3) statusReport.overall_status = 'degraded';
    }

    // Process tasks result
    const tasks = tasksResult?.data;
    if (tasksResult?.error) {
      statusReport.components.tasks = { status: 'error', error: tasksResult.error.message };
      statusReport.overall_status = 'degraded';
    } else {
      const taskStats = {
        total: dbResult.data ? dbResult.data.tasks : (tasks?.length || 0), // Use true DB count if available
        pending: tasks?.filter((t: any) => t.status === 'PENDING').length || 0,
        claimed: tasks?.filter((t: any) => t.status === 'CLAIMED').length || 0,
        in_progress: tasks?.filter((t: any) => t.status === 'IN_PROGRESS').length || 0,
        blocked: tasks?.filter((t: any) => t.status === 'BLOCKED').length || 0,
        completed: tasks?.filter((t: any) => t.status === 'COMPLETED').length || 0,
        failed: tasks?.filter((t: any) => t.status === 'FAILED').length || 0,
        active: tasks?.filter((t: any) => ['PENDING', 'CLAIMED', 'IN_PROGRESS', 'BLOCKED'].includes(t.status)).length || 0
      };
      statusReport.components.tasks = {
        status: (taskStats.blocked > 5 || taskStats.failed > 5) ? 'degraded' : 'healthy',
        stats: taskStats,
        recent_tasks: tasks?.slice(0, 5).map((t: any) => ({ id: t.id, title: t.title, status: t.status, stage: t.stage, priority: t.priority }))
      };
      if (taskStats.blocked > 5 || taskStats.failed > 5) statusReport.overall_status = 'degraded';
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
        amount_due: miningData.amtDue || 0,
        amount_paid: miningData.amtPaid || 0,
        active_workers: miningData.workers ? miningData.workers.length : 0,
        workers: miningData.workers || []
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

      // Get recent usage data (last 24h) for active functions - LIMITED to prevent timeout
      const { data: functionUsage, error: usageError } = await withTimeout(
        supabase
          .from('eliza_function_usage')
          .select('function_name, status, duration_ms, invoked_at')  // Only needed columns
          .gte('invoked_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('invoked_at', { ascending: false })
          .limit(2000),  // Cap at 2000 most recent entries
        QUERY_TIMEOUT_MS,
        'function_usage_check'
      );

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

      // Use schedule-aware stalled detection from shared module
      const cronMetrics = extractCronMetrics(cronJobs || []);
      const stalledJobs = cronMetrics.stalled;

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
          last_run_time: j.last_run_time,  // Keep original name for healthScoring.ts
          last_run: j.last_run_time,       // Alias for UI compatibility
          last_status: j.last_run_status,
          success_rate: j.success_rate,
          runs_24h: j.total_runs_24h,
          is_overdue: j.is_overdue         // Pass through DB-calculated value
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
          failed: failedCount,
          total_24h: recentActivity?.length || 0
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

    // ====================================================================
    // 9. ECOSYSTEM DEEP DIVE SECTIONS (NEW)
    // ====================================================================
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 9A. GOVERNANCE & COUNCIL HEALTH
    console.log('🏛️ Checking governance status...');
    try {
      // Query proposals without non-existent council_votes column
      const { data: proposals, error: govError } = await supabase
        .from('edge_function_proposals')
        .select('id, status, created_at, voting_phase, executive_deadline, community_deadline')
        .order('created_at', { ascending: false })
        .limit(50);

      if (govError) throw govError;

      // Separately query executive votes to get vote counts
      const { data: votes } = await supabase
        .from('executive_votes')
        .select('proposal_id, vote');

      // Group votes by proposal_id
      const votesByProposal: Record<string, { approve: number; reject: number; abstain: number }> = {};
      (votes || []).forEach((v: any) => {
        if (!votesByProposal[v.proposal_id]) {
          votesByProposal[v.proposal_id] = { approve: 0, reject: 0, abstain: 0 };
        }
        if (v.vote === 'approve') votesByProposal[v.proposal_id].approve++;
        else if (v.vote === 'reject') votesByProposal[v.proposal_id].reject++;
        else votesByProposal[v.proposal_id].abstain++;
      });

      const pendingProposals = proposals?.filter((p: any) => p.status === 'pending' || p.status === 'voting').length || 0;
      const approvedLast7d = proposals?.filter((p: any) => p.status === 'approved' && new Date(p.created_at) > new Date(last7d)).length || 0;
      const rejectedLast7d = proposals?.filter((p: any) => p.status === 'rejected' && new Date(p.created_at) > new Date(last7d)).length || 0;
      const inVotingPhase = proposals?.filter((p: any) => p.voting_phase && p.voting_phase !== 'completed').length || 0;

      statusReport.components.governance = {
        status: pendingProposals > 10 ? 'backlog' : 'healthy',
        pending_proposals: pendingProposals,
        in_voting_phase: inVotingPhase,
        approved_last_7d: approvedLast7d,
        rejected_last_7d: rejectedLast7d,
        total_proposals: proposals?.length || 0,
        council_active: inVotingPhase > 0,
        total_executive_votes: votes?.length || 0,
        recent_proposals: proposals?.slice(0, 5).map((p: any) => ({
          id: p.id,
          status: p.status,
          voting_phase: p.voting_phase,
          votes: votesByProposal[p.id] || { approve: 0, reject: 0, abstain: 0 },
          created_at: p.created_at
        }))
      };
    } catch (error) {
      statusReport.components.governance = {
        status: 'unavailable',
        error: error.message,
        pending_proposals: 0
      };
    }

    // 9B. KNOWLEDGE BASE HEALTH
    console.log('🧠 Checking knowledge base...');
    try {
      const { data: knowledge, error: kbError } = await withTimeout(
        supabase
          .from('knowledge_entities')
          .select('id, entity_type, confidence_score')  // Only needed columns
          .limit(500),  // Cap at 500 entities for status check
        QUERY_TIMEOUT_MS,
        'knowledge_base_check'
      );

      if (kbError) throw kbError;

      const entityTypeBreakdown: Record<string, number> = {};
      knowledge?.forEach((k: any) => {
        entityTypeBreakdown[k.entity_type] = (entityTypeBreakdown[k.entity_type] || 0) + 1;
      });

      const avgConfidence = knowledge?.length > 0
        ? knowledge.reduce((sum: number, k: any) => sum + (k.confidence_score || 0), 0) / knowledge.length
        : 0;

      statusReport.components.knowledge_base = {
        status: knowledge && knowledge.length > 50 ? 'healthy' : 'sparse',
        total_entities: knowledge?.length || 0,
        entity_types: Object.keys(entityTypeBreakdown).length,
        by_type: entityTypeBreakdown,
        average_confidence: Math.round(avgConfidence * 100) / 100,
        coverage: knowledge && knowledge.length > 100 ? 'comprehensive' : (knowledge && knowledge.length > 25 ? 'moderate' : 'sparse')
      };
    } catch (error) {
      statusReport.components.knowledge_base = {
        status: 'unavailable',
        error: error.message,
        total_entities: 0
      };
    }

    // 9C. GITHUB ECOSYSTEM ACTIVITY (24h)
    console.log('🐙 Checking GitHub activity...');
    try {
      const { data: githubActivity, error: ghError } = await supabase
        .from('github_api_usage')
        .select('action, success, repo, response_time_ms, rate_limit_remaining, created_at')
        .gte('created_at', last24h);

      if (ghError) throw ghError;

      const totalCalls = githubActivity?.length || 0;
      const successfulCalls = githubActivity?.filter((g: any) => g.success).length || 0;
      const uniqueRepos = [...new Set(githubActivity?.map((g: any) => g.repo).filter(Boolean))];
      const avgResponseTime = totalCalls > 0
        ? Math.round(githubActivity!.reduce((sum: number, g: any) => sum + (g.response_time_ms || 0), 0) / totalCalls)
        : 0;
      const latestRateLimit = githubActivity?.[0]?.rate_limit_remaining;

      statusReport.components.github_ecosystem = {
        status: latestRateLimit && latestRateLimit < 100 ? 'throttled' : (totalCalls > 0 ? 'healthy' : 'idle'),
        api_calls_24h: totalCalls,
        success_rate: totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 100,
        repos_accessed: uniqueRepos.length,
        active_repos: uniqueRepos.slice(0, 5),
        avg_response_time_ms: avgResponseTime,
        rate_limit_remaining: latestRateLimit || 'unknown'
      };
    } catch (error) {
      statusReport.components.github_ecosystem = {
        status: 'unavailable',
        error: error.message,
        api_calls_24h: 0
      };
    }

    // 9D. WORKFLOW ECOSYSTEM
    console.log('🔄 Checking workflows...');
    try {
      const { data: workflows, error: wfError } = await supabase
        .from('workflow_executions')
        .select('id, template_name, status, start_time, end_time')
        .gte('start_time', last24h);

      if (wfError) throw wfError;

      const { data: templates, error: tplError } = await supabase
        .from('workflow_templates')
        .select('id, name, is_active')
        .eq('is_active', true);

      const running = workflows?.filter((w: any) => w.status === 'running').length || 0;
      const completed = workflows?.filter((w: any) => w.status === 'completed').length || 0;
      const failed = workflows?.filter((w: any) => w.status === 'failed').length || 0;

      statusReport.components.workflows = {
        status: failed > 3 ? 'degraded' : 'healthy',
        active_templates: templates?.length || 0,
        running: running,
        completed_24h: completed,
        failed_24h: failed,
        total_executions_24h: workflows?.length || 0,
        success_rate: workflows && workflows.length > 0
          ? Math.round((completed / workflows.length) * 100)
          : 100
      };
    } catch (error) {
      statusReport.components.workflows = {
        status: 'unavailable',
        error: error.message,
        active_templates: 0
      };
    }

    // 9E. LEARNING & SKILLS PROGRESS
    console.log('📚 Checking learning status...');
    try {
      const { data: learning, error: learnError } = await supabase
        .from('learning_sessions')
        .select('id, status, progress_percentage, skill_area, created_at')
        .gte('created_at', last7d);

      const { data: feedback, error: fbError } = await supabase
        .from('executive_feedback')
        .select('id, acknowledged, created_at')
        .gte('created_at', last7d);

      const inProgress = learning?.filter((l: any) => l.status === 'in_progress').length || 0;
      const completed = learning?.filter((l: any) => l.status === 'completed').length || 0;
      const unacknowledgedFeedback = feedback?.filter((f: any) => !f.acknowledged).length || 0;

      statusReport.components.learning = {
        status: 'healthy',
        sessions_in_progress: inProgress,
        sessions_completed_7d: completed,
        total_sessions_7d: learning?.length || 0,
        unacknowledged_feedback: unacknowledgedFeedback,
        feedback_backlog: unacknowledgedFeedback > 10 ? 'high' : 'normal'
      };
    } catch (error) {
      statusReport.components.learning = {
        status: 'unavailable',
        error: error.message
      };
    }

    // 9F. PYTHON EXECUTION ANALYTICS
    console.log('🐍 Checking Python executions...');
    try {
      const { data: pythonExecs, error: pyError } = await supabase
        .from('eliza_python_executions')
        .select('id, exit_code, source, execution_time_ms, created_at')
        .gte('created_at', last24h);

      if (pyError) throw pyError;

      const total = pythonExecs?.length || 0;
      const successful = pythonExecs?.filter((p: any) => p.exit_code === 0).length || 0;
      const bySource: Record<string, number> = {};
      pythonExecs?.forEach((p: any) => {
        const source = p.source || 'unknown';
        bySource[source] = (bySource[source] || 0) + 1;
      });
      const avgExecTime = total > 0
        ? Math.round(pythonExecs!.reduce((sum: number, p: any) => sum + (p.execution_time_ms || 0), 0) / total)
        : 0;

      statusReport.components.python_executions = {
        status: total > 0 && (successful / total) < 0.8 ? 'degraded' : 'healthy',
        total_24h: total,
        successful_24h: successful,
        success_rate: total > 0 ? Math.round((successful / total) * 100) : 100,
        by_source: bySource,
        avg_execution_time_ms: avgExecTime
      };
    } catch (error) {
      statusReport.components.python_executions = {
        status: 'unavailable',
        error: error.message,
        total_24h: 0
      };
    }

    // 9G. AI PROVIDER STATUS
    console.log('🤖 Checking AI provider status...');
    const aiProviders = {
      lovable_ai: !!Deno.env.get('LOVABLE_API_KEY'),
      deepseek: !!Deno.env.get('DEEPSEEK_API_KEY'),
      kimi_k2: !!Deno.env.get('OPENROUTER_API_KEY'),
      gemini: !!Deno.env.get('GEMINI_API_KEY'),
      openai: !!Deno.env.get('OPENAI_API_KEY')
    };

    const configuredProviders = Object.entries(aiProviders).filter(([_, v]) => v).map(([k]) => k);
    const cascadeOrder = ['lovable_ai', 'deepseek', 'kimi_k2', 'gemini', 'openai'];
    const primaryProvider = cascadeOrder.find(p => aiProviders[p as keyof typeof aiProviders]) || 'none';

    statusReport.components.ai_providers = {
      status: configuredProviders.length > 0 ? 'healthy' : 'degraded',
      configured: configuredProviders,
      cascade_order: cascadeOrder.filter(p => aiProviders[p as keyof typeof aiProviders]),
      primary_provider: primaryProvider,
      fallbacks_available: configuredProviders.length - 1,
      message: configuredProviders.length === 0
        ? 'No AI providers configured!'
        : `Using ${primaryProvider} with ${configuredProviders.length - 1} fallback(s)`
    };

    // 9H. XMRT CHARGER DEVICES - Enhanced detection with multiple metrics
    console.log('🔋 Checking XMRT Charger devices...');
    try {
      const now = Date.now();
      const fifteenMinAgo = new Date(now - 15 * 60 * 1000).toISOString();
      const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
      const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();

      // Get registered devices
      const { data: devices, error: devError } = await supabase
        .from('devices')
        .select('id, device_type, is_active, last_seen_at')
        .eq('is_active', true);

      // Get PoP events for 24h
      const { data: popEvents, error: popError } = await supabase
        .from('pop_events')
        .select('id, pop_points, event_type')
        .gte('created_at', last24h);

      // ENHANCED: Get device connection sessions with multiple metrics
      // 1. Sessions with recent heartbeats (original method)
      const { data: heartbeatActiveSessions } = await supabase
        .from('device_connection_sessions')
        .select('id, device_id, connected_at, last_heartbeat')
        .eq('is_active', true)
        .gte('last_heartbeat', fifteenMinAgo);

      // 2. Sessions connected in last 5 minutes (regardless of heartbeat)
      const { data: recentlyConnectedSessions } = await supabase
        .from('device_connection_sessions')
        .select('id, device_id, connected_at, last_heartbeat')
        .eq('is_active', true)
        .gte('connected_at', fiveMinAgo);

      // 3. Sessions connected in last hour (shows activity)
      const { data: hourlyConnectionSessions } = await supabase
        .from('device_connection_sessions')
        .select('id, device_id, connected_at')
        .gte('connected_at', oneHourAgo);

      // Calculate metrics
      const heartbeatActiveCount = heartbeatActiveSessions?.length || 0;
      const recentlyConnectedCount = recentlyConnectedSessions?.length || 0;
      const connectionsLastHour = hourlyConnectionSessions?.length || 0;

      // Combined active = devices with heartbeat OR recently connected
      const combinedActiveDeviceIds = new Set([
        ...(heartbeatActiveSessions || []).map((s: any) => s.device_id),
        ...(recentlyConnectedSessions || []).map((s: any) => s.device_id)
      ]);
      const combinedActiveCount = combinedActiveDeviceIds.size;

      const activeDevices = devices?.filter((d: any) =>
        d.last_seen_at && new Date(d.last_seen_at) > new Date(now - 15 * 60 * 1000)
      ).length || 0;

      const deviceTypeBreakdown: Record<string, number> = {};
      devices?.forEach((d: any) => {
        deviceTypeBreakdown[d.device_type || 'unknown'] = (deviceTypeBreakdown[d.device_type || 'unknown'] || 0) + 1;
      });

      const totalPopPoints = popEvents?.reduce((sum: number, p: any) => sum + (p.pop_points || 0), 0) || 0;

      // Determine status based on combined metrics
      const hasActivity = combinedActiveCount > 0 || connectionsLastHour > 0;
      const xmrtChargerStatus = hasActivity ? 'healthy' : (connectionsLastHour === 0 ? 'warning' : 'healthy');

      statusReport.components.xmrt_charger = {
        status: xmrtChargerStatus,
        total_registered_devices: devices?.length || 0,
        // Original metric (heartbeat-based)
        active_devices_15min: heartbeatActiveCount,
        // NEW: Recently connected devices (catches devices without heartbeat)
        recently_connected_5min: recentlyConnectedCount,
        // NEW: Combined active (heartbeat OR recently connected)
        combined_active_devices: combinedActiveCount,
        // NEW: Connections in last hour (shows overall activity)
        connections_last_hour: connectionsLastHour,
        // NEW: Diagnostic info
        detection_breakdown: {
          heartbeat_active: heartbeatActiveCount,
          recently_connected: recentlyConnectedCount,
          unique_active_devices: combinedActiveCount,
          hourly_connections: connectionsLastHour,
          message: heartbeatActiveCount === 0 && recentlyConnectedCount > 0
            ? 'Devices connected but not sending heartbeats - client may need to implement heartbeat calls'
            : (heartbeatActiveCount > 0
              ? `${heartbeatActiveCount} device(s) actively sending heartbeats`
              : 'No active device connections detected')
        },
        by_type: deviceTypeBreakdown,
        pop_events_24h: popEvents?.length || 0,
        pop_points_earned_24h: Math.round(totalPopPoints * 100) / 100
      };
    } catch (error) {
      statusReport.components.xmrt_charger = {
        status: 'unavailable',
        error: error.message,
        total_registered_devices: 0
      };
    }

    // 9I. USER ACQUISITION METRICS
    console.log('📈 Checking user acquisition...');
    try {
      const { data: sessions, error: sessError } = await supabase
        .from('conversation_sessions')
        .select('id, lead_score, acquisition_stage, is_active, created_at')
        .gte('created_at', last24h);

      const activeSessions = sessions?.filter((s: any) => s.is_active).length || 0;
      const qualifiedLeads = sessions?.filter((s: any) => s.lead_score && s.lead_score > 50).length || 0;
      const stageBreakdown: Record<string, number> = {};
      sessions?.forEach((s: any) => {
        const stage = s.acquisition_stage || 'new';
        stageBreakdown[stage] = (stageBreakdown[stage] || 0) + 1;
      });

      statusReport.components.user_acquisition = {
        status: 'healthy',
        sessions_24h: sessions?.length || 0,
        active_sessions: activeSessions,
        qualified_leads: qualifiedLeads,
        by_stage: stageBreakdown,
        conversion_funnel: {
          new: stageBreakdown['new'] || 0,
          engaged: stageBreakdown['engaged'] || 0,
          qualified: stageBreakdown['qualified'] || 0,
          converted: stageBreakdown['converted'] || 0
        }
      };
    } catch (error) {
      statusReport.components.user_acquisition = {
        status: 'unavailable',
        error: error.message
      };
    }

    // 10. Generate Health Summary - UNIFIED SCORING SYSTEM
    const cronMetrics = extractCronMetrics(statusReport.components.cron_jobs?.all_jobs || []);

    // Use real Python execution stats from the new section
    const pythonFailed = statusReport.components.python_executions?.total_24h
      ? statusReport.components.python_executions.total_24h - statusReport.components.python_executions.successful_24h
      : 0;

    const healthMetrics = buildHealthMetrics({
      apiKeyHealth: { unhealthy: 0 }, // API key health checked separately
      pythonExecStats: { failed: pythonFailed },
      taskStats: { blocked: statusReport.components.tasks?.stats?.blocked || 0 },
      cronStats: {
        failing: statusReport.components.cron_jobs?.failing_jobs || cronMetrics.failing,
        stalled: statusReport.components.cron_jobs?.stalled_jobs || cronMetrics.stalled
      },
      agentStats: { error: statusReport.components.agents?.stats?.error || 0 },
      edgeFunctionStats: { overall_error_rate: statusReport.components.edge_functions?.overall_error_rate || 0 },
      deviceStats: {
        total: statusReport.components.xmrt_charger?.total_registered_devices || 0,
        active: statusReport.components.xmrt_charger?.active_devices_15min || 0
      },
      chargingStats: { avg_efficiency: 100, total: statusReport.components.xmrt_charger?.pop_events_24h || 0 },
      commandStats: { failed: 0 }
    });

    const healthResult = calculateUnifiedHealthScore(healthMetrics);

    statusReport.health_score = healthResult.score;
    statusReport.overall_status = healthResult.status;
    statusReport.health_issues = healthResult.issues;
    statusReport.scoring_method = 'unified_v2';

    // Add ecosystem summary for quick reference
    statusReport.ecosystem_summary = {
      agents: `${statusReport.components.agents?.stats?.total || 0} total (${statusReport.components.agents?.stats?.busy || 0} busy)`,
      tasks: `${statusReport.components.tasks?.stats?.total || 0} total (${statusReport.components.tasks?.stats?.pending || 0} pending, ${statusReport.components.tasks?.stats?.blocked || 0} blocked)`,
      edge_functions: `${statusReport.components.edge_functions?.total_deployed || 0} deployed (${statusReport.components.edge_functions?.total_active_24h || 0} active)`,
      governance: `${statusReport.components.governance?.pending_proposals || 0} pending proposals`,
      knowledge: `${statusReport.components.knowledge_base?.total_entities || 0} entities`,
      github: `${statusReport.components.github_ecosystem?.api_calls_24h || 0} API calls (${statusReport.components.github_ecosystem?.success_rate || 100}% success)`,
      workflows: `${statusReport.components.workflows?.active_templates || 0} templates (${statusReport.components.workflows?.running || 0} running)`,
      python: `${statusReport.components.python_executions?.total_24h || 0} executions (${statusReport.components.python_executions?.success_rate || 100}% success)`,
      ai_provider: statusReport.components.ai_providers?.message || 'Unknown',
      xmrt_charger: `${statusReport.components.xmrt_charger?.total_registered_devices || 0} devices (${statusReport.components.xmrt_charger?.active_devices_15min || 0} active)`,
      user_acquisition: `${statusReport.components.user_acquisition?.sessions_24h || 0} sessions (${statusReport.components.user_acquisition?.qualified_leads || 0} qualified leads)`
    };

    console.log(`✅ System Status Check Complete - Overall: ${statusReport.overall_status} (${statusReport.health_score}/100)`);

    // Log health check to activity log for HeroSection consistency
    try {
      await supabase.from('eliza_activity_log').insert({
        activity_type: 'system_health_check',
        title: `System Health: ${statusReport.overall_status.toUpperCase()}`,
        description: `Health Score: ${statusReport.health_score}/100, ${statusReport.health_issues?.length || 0} issue(s) detected`,
        status: 'completed',
        metadata: {
          health_score: statusReport.health_score,
          status: statusReport.overall_status,
          issues_count: statusReport.health_issues?.length || 0,
          issues: statusReport.health_issues?.slice(0, 5) // Store up to 5 issues
        }
      });
      console.log('📝 Health check logged to activity log');
    } catch (logError) {
      console.warn('Failed to log health check to activity log:', logError);
    }

    // Cache the result
    const responseData = { success: true, status: statusReport };
    statusCache = { data: responseData, timestamp: Date.now() };

    await usageTracker.success({ health_score: statusReport.health_score });

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, "Content-Type": "application/json", 'X-Cache': 'MISS' } }
    );

  } catch (error) {
    console.error("System status check error:", error);
    await usageTracker.error(error instanceof Error ? error.message : 'Unknown error');
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
