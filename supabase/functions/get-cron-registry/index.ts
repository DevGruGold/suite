import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { startUsageTrackingWithRequest, detectExecutionSource } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'get-cron-registry';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CronRegistryRequest {
  action: 'list_all' | 'list_by_platform' | 'get_job_status' | 'get_next_runs' | 'get_failing_jobs' | 'get_execution_stats';
  platform?: 'supabase_native' | 'pg_cron' | 'github_actions' | 'vercel_cron';
  function_name?: string;
  job_name?: string;
  include_inactive?: boolean;
  time_window_hours?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let body: CronRegistryRequest;
  try {
    body = await req.json();
  } catch {
    body = { action: 'list_all' };
  }

  const tracker = startUsageTrackingWithRequest(FUNCTION_NAME, req, body);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { action, platform, function_name, job_name, include_inactive, time_window_hours } = body;

    let result: any;

    switch (action) {
      case 'list_all': {
        let query = supabase
          .from('cron_registry')
          .select('*')
          .order('platform')
          .order('function_name');

        if (!include_inactive) {
          query = query.eq('is_active', true);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Group by platform for easier reading
        const grouped = (data || []).reduce((acc: any, job: any) => {
          if (!acc[job.platform]) acc[job.platform] = [];
          acc[job.platform].push(job);
          return acc;
        }, {});

        result = {
          total_jobs: data?.length || 0,
          by_platform: grouped,
          platforms: Object.keys(grouped),
          jobs: data
        };
        break;
      }

      case 'list_by_platform': {
        if (!platform) {
          throw new Error('platform parameter required for list_by_platform action');
        }

        let query = supabase
          .from('cron_registry')
          .select('*')
          .eq('platform', platform)
          .order('function_name');

        if (!include_inactive) {
          query = query.eq('is_active', true);
        }

        const { data, error } = await query;
        if (error) throw error;

        result = {
          platform,
          total_jobs: data?.length || 0,
          jobs: data
        };
        break;
      }

      case 'get_job_status': {
        if (!job_name && !function_name) {
          throw new Error('job_name or function_name required for get_job_status action');
        }

        let query = supabase.from('cron_registry').select('*');

        if (job_name) {
          query = query.eq('job_name', job_name);
        } else if (function_name) {
          query = query.eq('function_name', function_name);
        }

        const { data: jobs, error: jobError } = await query;
        if (jobError) throw jobError;

        // Get recent executions from eliza_function_usage
        const targetFunction = function_name || jobs?.[0]?.function_name;
        const { data: executions, error: execError } = await supabase
          .from('eliza_function_usage')
          .select('*')
          .eq('function_name', targetFunction)
          .in('execution_source', ['supabase_native', 'pg_cron', 'github_actions', 'vercel_cron'])
          .order('created_at', { ascending: false })
          .limit(10);

        if (execError) console.warn('Could not fetch executions:', execError.message);

        result = {
          registry_entries: jobs,
          recent_executions: executions || [],
          execution_count: executions?.length || 0
        };
        break;
      }

      case 'get_failing_jobs': {
        const windowHours = time_window_hours || 24;
        const threshold = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

        // Get jobs with failures
        const { data: failingJobs, error } = await supabase
          .from('cron_registry')
          .select('*')
          .gt('failure_count', 0)
          .eq('is_active', true)
          .order('failure_count', { ascending: false });

        if (error) throw error;

        // Get recent failed executions
        const { data: recentFailures, error: execError } = await supabase
          .from('eliza_function_usage')
          .select('function_name, execution_source, error_message, created_at')
          .eq('success', false)
          .in('execution_source', ['supabase_native', 'pg_cron', 'github_actions', 'vercel_cron'])
          .gte('created_at', threshold)
          .order('created_at', { ascending: false })
          .limit(50);

        if (execError) console.warn('Could not fetch recent failures:', execError.message);

        // Aggregate failures by function
        const failuresByFunction = (recentFailures || []).reduce((acc: any, exec: any) => {
          const key = `${exec.function_name}:${exec.execution_source}`;
          if (!acc[key]) {
            acc[key] = {
              function_name: exec.function_name,
              execution_source: exec.execution_source,
              failure_count: 0,
              last_error: null,
              last_failure: null
            };
          }
          acc[key].failure_count++;
          if (!acc[key].last_failure || exec.created_at > acc[key].last_failure) {
            acc[key].last_failure = exec.created_at;
            acc[key].last_error = exec.error_message;
          }
          return acc;
        }, {});

        result = {
          time_window_hours: windowHours,
          jobs_with_lifetime_failures: failingJobs,
          recent_failures: Object.values(failuresByFunction),
          total_recent_failures: recentFailures?.length || 0
        };
        break;
      }

      case 'get_execution_stats': {
        const windowHours = time_window_hours || 24;
        const threshold = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

        // Get execution stats by platform
        const { data: executions, error } = await supabase
          .from('eliza_function_usage')
          .select('function_name, execution_source, success, execution_time_ms, created_at')
          .in('execution_source', ['supabase_native', 'pg_cron', 'github_actions', 'vercel_cron'])
          .gte('created_at', threshold);

        if (error) throw error;

        // Aggregate stats
        const stats: any = {
          by_platform: {},
          by_function: {},
          totals: {
            total_executions: 0,
            successful: 0,
            failed: 0,
            avg_execution_ms: 0
          }
        };

        let totalTime = 0;
        for (const exec of executions || []) {
          stats.totals.total_executions++;
          if (exec.success) stats.totals.successful++;
          else stats.totals.failed++;
          totalTime += exec.execution_time_ms || 0;

          // By platform
          if (!stats.by_platform[exec.execution_source]) {
            stats.by_platform[exec.execution_source] = { total: 0, success: 0, failed: 0 };
          }
          stats.by_platform[exec.execution_source].total++;
          if (exec.success) stats.by_platform[exec.execution_source].success++;
          else stats.by_platform[exec.execution_source].failed++;

          // By function
          if (!stats.by_function[exec.function_name]) {
            stats.by_function[exec.function_name] = { total: 0, success: 0, failed: 0, platforms: [] };
          }
          stats.by_function[exec.function_name].total++;
          if (exec.success) stats.by_function[exec.function_name].success++;
          else stats.by_function[exec.function_name].failed++;
          if (!stats.by_function[exec.function_name].platforms.includes(exec.execution_source)) {
            stats.by_function[exec.function_name].platforms.push(exec.execution_source);
          }
        }

        stats.totals.avg_execution_ms = stats.totals.total_executions > 0 
          ? Math.round(totalTime / stats.totals.total_executions) 
          : 0;
        stats.totals.success_rate = stats.totals.total_executions > 0
          ? ((stats.totals.successful / stats.totals.total_executions) * 100).toFixed(1) + '%'
          : 'N/A';

        result = {
          time_window_hours: windowHours,
          ...stats
        };
        break;
      }

      case 'get_next_runs': {
        // For now, return schedule info - actual next run calculation would need cron parsing
        const { data, error } = await supabase
          .from('cron_registry')
          .select('job_name, function_name, platform, schedule, last_run_at')
          .eq('is_active', true)
          .order('last_run_at', { ascending: true, nullsFirst: true });

        if (error) throw error;

        result = {
          note: 'Schedules shown in cron format. Check platform-specific schedulers for exact next run times.',
          jobs: data?.map(job => ({
            ...job,
            schedule_description: describeCronSchedule(job.schedule)
          }))
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}. Valid actions: list_all, list_by_platform, get_job_status, get_next_runs, get_failing_jobs, get_execution_stats`);
    }

    await tracker.success({ result_summary: `${action} returned ${JSON.stringify(result).length} bytes` });

    return new Response(JSON.stringify({
      success: true,
      action,
      ...result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ ${FUNCTION_NAME} error:`, errorMessage);
    
    await tracker.failure(errorMessage, 500);

    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

/**
 * Simple cron schedule description
 */
function describeCronSchedule(schedule: string): string {
  const parts = schedule.split(' ');
  if (parts.length !== 5) return schedule;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Common patterns
  if (minute.includes('*/') && hour === '*') {
    return `Every ${minute.replace('*/', '')} minutes`;
  }
  if (minute.includes(',') && hour === '*') {
    return `At minutes ${minute} every hour`;
  }
  if (hour.includes('*/') && minute !== '*') {
    return `Every ${hour.replace('*/', '')} hours at :${minute.padStart(2, '0')}`;
  }
  if (hour !== '*' && minute !== '*' && dayOfMonth === '*' && month === '*') {
    if (dayOfWeek === '*') {
      return `Daily at ${hour}:${minute.padStart(2, '0')}`;
    }
    if (dayOfWeek === '1-5') {
      return `Weekdays at ${hour}:${minute.padStart(2, '0')}`;
    }
    if (dayOfWeek === '0') {
      return `Sundays at ${hour}:${minute.padStart(2, '0')}`;
    }
  }

  return schedule;
}
