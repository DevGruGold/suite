-- Fix cron job statement timeouts by wrapping commands with SET LOCAL statement_timeout = 0

-- 1. Update system-health-check-10min (job 172) to wrap in DO block with timeout disabled
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'system-health-check-10min'),
  command := 'DO $$ BEGIN SET LOCAL statement_timeout = 0; PERFORM util.invoke_edge(''system-status'', ''POST'', ''{"snapshot_type": "scheduled"}''::jsonb); END $$;'
);

-- 2. Update run_opportunity_scanner function to disable timeout before calling edge function
CREATE OR REPLACE FUNCTION public.run_opportunity_scanner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Disable statement timeout for this function to prevent cron job timeouts
  SET LOCAL statement_timeout = 0;
  
  PERFORM util.invoke_edge('opportunity-scanner', 'POST', '{}'::jsonb, false, 60000);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.api_call_logs(function_name, status, error_message)
  VALUES('opportunity-scanner', 'error', SQLERRM);
  RAISE;
END;
$$;