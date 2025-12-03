-- Drop existing function first (return type is changing)
DROP FUNCTION IF EXISTS public.get_cron_jobs_status();

-- Recreate with new columns for schedule-aware stalled detection
CREATE OR REPLACE FUNCTION public.get_cron_jobs_status()
RETURNS TABLE(
  jobid bigint, 
  jobname text, 
  schedule text, 
  active boolean, 
  last_run_time timestamp with time zone, 
  last_run_status text, 
  last_run_duration interval, 
  total_runs_24h bigint, 
  failed_runs_24h bigint, 
  success_rate numeric,
  expected_frequency_hours integer,
  is_overdue boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    MAX(r.start_time) as last_run_time,
    (SELECT rd.status 
     FROM cron.job_run_details rd 
     WHERE rd.jobid = j.jobid 
     ORDER BY rd.start_time DESC 
     LIMIT 1) as last_run_status,
    (SELECT (rd.end_time - rd.start_time) 
     FROM cron.job_run_details rd 
     WHERE rd.jobid = j.jobid 
     ORDER BY rd.start_time DESC 
     LIMIT 1) as last_run_duration,
    COUNT(r.runid) FILTER (WHERE r.start_time >= NOW() - INTERVAL '24 hours') as total_runs_24h,
    COUNT(r.runid) FILTER (WHERE r.start_time >= NOW() - INTERVAL '24 hours' AND r.status = 'failed') as failed_runs_24h,
    CASE 
      WHEN COUNT(r.runid) FILTER (WHERE r.start_time >= NOW() - INTERVAL '24 hours') > 0 
      THEN ROUND(
        (COUNT(r.runid) FILTER (WHERE r.start_time >= NOW() - INTERVAL '24 hours' AND r.status = 'succeeded')::numeric / 
         COUNT(r.runid) FILTER (WHERE r.start_time >= NOW() - INTERVAL '24 hours')::numeric) * 100, 
        2
      )
      ELSE NULL
    END as success_rate,
    -- Parse schedule to determine expected frequency in hours
    CASE 
      -- Monthly: specific day of month (e.g., "0 0 1 * *" = 1st of month)
      WHEN j.schedule ~ '^[0-9*/, -]+ [0-9*/, -]+ [0-9]+ \* [*0-6, -]+$' 
           AND j.schedule !~ '^\* \* \* \* \*'
      THEN 744 -- ~31 days
      
      -- Weekly: specific day of week (e.g., "0 14 * * 3" = Wednesday at 2pm)
      WHEN j.schedule ~ '^[0-9*/, -]+ [0-9*/, -]+ \* \* [0-6]+$'
           AND j.schedule !~ '\* \* \* \* \*'
      THEN 168 -- 7 days
      
      -- Daily: specific hour(s) (e.g., "0 14 * * *" = 2pm daily)
      WHEN j.schedule ~ '^[0-9*/, -]+ [0-9]+ \* \* \*$'
      THEN 24
      
      -- Hourly intervals (e.g., "0 */6 * * *" = every 6 hours)
      WHEN j.schedule ~ '^[0-9*/, -]+ \*/([0-9]+) \* \* \*$'
      THEN COALESCE(
        (regexp_match(j.schedule, '\*/([0-9]+)'))[1]::integer,
        24
      )
      
      -- Every N minutes (runs frequently, use 1 hour buffer)
      WHEN j.schedule ~ '^\*/([0-9]+) \* \* \* \*$'
      THEN 1
      
      -- Default to daily
      ELSE 24
    END::integer as expected_frequency_hours,
    -- Calculate is_overdue based on expected frequency
    CASE
      -- Skip inactive jobs
      WHEN NOT j.active THEN false
      -- Skip one-time jobs (specific month AND day)
      WHEN j.schedule ~ '^[0-9*/, -]+ [0-9*/, -]+ [0-9]+ [0-9]+ [*0-6, -]+$' THEN false
      -- Check if last run is beyond expected window + 50% buffer
      WHEN MAX(r.start_time) IS NULL THEN true -- Never ran but active = stalled
      ELSE (
        EXTRACT(EPOCH FROM (NOW() - MAX(r.start_time))) / 3600 > 
        (CASE 
          WHEN j.schedule ~ '^[0-9*/, -]+ [0-9*/, -]+ [0-9]+ \* [*0-6, -]+$' THEN 744 * 1.5
          WHEN j.schedule ~ '^[0-9*/, -]+ [0-9*/, -]+ \* \* [0-6]+$' THEN 168 * 1.5
          WHEN j.schedule ~ '^[0-9*/, -]+ [0-9]+ \* \* \*$' THEN 24 * 1.5
          WHEN j.schedule ~ '^\*/([0-9]+) \* \* \* \*$' THEN 1.5
          ELSE 36 -- 24 * 1.5 default
        END)
      )
    END as is_overdue
  FROM cron.job j
  LEFT JOIN cron.job_run_details r ON j.jobid = r.jobid
  GROUP BY j.jobid, j.jobname, j.schedule, j.active
  ORDER BY j.jobname;
END;
$function$;