-- ============================================================================
-- Part 1: Add Single Retry Logic to util.invoke_edge
-- ============================================================================

CREATE OR REPLACE FUNCTION util.invoke_edge(
  fn_name text,
  method text DEFAULT 'POST'::text,
  payload jsonb DEFAULT '{}'::jsonb,
  require_ok boolean DEFAULT true,
  timeout_ms integer DEFAULT 60000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'util', 'public', 'extensions'
AS $function$
DECLARE
  base_url  text;
  svc_key   text;
  full_url  text;
  request_id bigint;
  resp      jsonb;
  status_code integer;
  retry_count integer := 0;
  max_retries integer := 1;  -- Single retry
BEGIN
  -- Get secrets
  SELECT value INTO base_url FROM util.secrets WHERE key = 'functions_url';
  SELECT value INTO svc_key FROM util.secrets WHERE key = 'service_role_key';

  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE EXCEPTION 'Missing util.secrets: functions_url or service_role_key';
  END IF;

  full_url := rtrim(base_url, '/') || '/' || fn_name;

  -- Retry loop
  <<retry_loop>>
  LOOP
    -- Make the HTTP request
    request_id := net.http_post(
      url := full_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || svc_key
      ),
      body := payload,
      timeout_milliseconds := timeout_ms
    );

    -- Wait for response (poll up to 10 seconds)
    FOR i IN 1..20 LOOP
      PERFORM pg_sleep(0.5);
      SELECT to_jsonb(r) INTO resp 
      FROM net._http_response r 
      WHERE r.id = request_id;
      
      IF resp IS NOT NULL THEN
        EXIT;
      END IF;
    END LOOP;

    -- Check response status
    status_code := COALESCE((resp->>'status_code')::int, 0);

    -- Success or client error (4xx) - don't retry
    IF resp IS NOT NULL AND status_code > 0 AND status_code < 500 THEN
      EXIT retry_loop;
    END IF;

    -- On connection failure or 5xx, retry once
    retry_count := retry_count + 1;
    IF retry_count > max_retries THEN
      EXIT retry_loop;  -- Max retries reached
    END IF;

    -- Wait 2 seconds before retry
    PERFORM pg_sleep(2);
    
    -- Reset response for retry
    resp := NULL;
  END LOOP;

  -- Handle final response
  IF resp IS NULL THEN
    IF require_ok THEN
      RAISE EXCEPTION 'No response from edge function % after % retries', fn_name, max_retries;
    ELSE
      RETURN jsonb_build_object('error', 'no_response', 'retries', retry_count);
    END IF;
  END IF;

  status_code := COALESCE((resp->>'status_code')::int, 0);

  IF require_ok AND (status_code < 200 OR status_code >= 300) THEN
    RAISE EXCEPTION 'Edge function % returned status % after % retries: %', 
      fn_name, status_code, retry_count, resp->>'content';
  END IF;

  -- Return response with retry info
  RETURN jsonb_build_object(
    'status_code', status_code,
    'content', resp->>'content',
    'retries', retry_count
  );
END;
$function$;

-- ============================================================================
-- Part 2: Stagger Cron Job Schedules
-- ============================================================================

-- Every 5 minutes jobs - stagger across 0-4 minute offsets
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'agent-auto-assign-tasks_appdb'),
  schedule := '0,5,10,15,20,25,30,35,40,45,50,55 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-auto-assign-tasks_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'agent-heartbeat-check_appdb'),
  schedule := '1,6,11,16,21,26,31,36,41,46,51,56 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-heartbeat-check_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'code-health-monitor_appdb'),
  schedule := '2,7,12,17,22,27,32,37,42,47,52,57 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'code-health-monitor_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'opportunity-scanner_appdb'),
  schedule := '3,8,13,18,23,28,33,38,43,48,53,58 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'opportunity-scanner_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'process-scheduled-actions_appdb'),
  schedule := '4,9,14,19,24,29,34,39,44,49,54,59 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-actions_appdb');

-- Every 10 minutes jobs - stagger across 0-7 minute offsets
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'agent-identify-blockers_appdb'),
  schedule := '0,10,20,30,40,50 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-identify-blockers_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'governance-phase-transitions_appdb'),
  schedule := '1,11,21,31,41,51 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'governance-phase-transitions_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'monitor_device_connections_appdb'),
  schedule := '2,12,22,32,42,52 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monitor_device_connections_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'prune_net_http_response_every_10m_appdb'),
  schedule := '3,13,23,33,43,53 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune_net_http_response_every_10m_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'system_health_10m_appdb'),
  schedule := '4,14,24,34,44,54 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'system_health_10m_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'system_status_10m_appdb'),
  schedule := '5,15,25,35,45,55 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'system_status_10m_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'task-progress-update_appdb'),
  schedule := '6,16,26,36,46,56 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'task-progress-update_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'vectorize_memory_10m_appdb'),
  schedule := '7,17,27,37,47,57 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vectorize_memory_10m_appdb');

-- Every 15 minutes jobs - stagger across 0-12 minute offsets
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'agent-rebalance-workload_appdb'),
  schedule := '0,15,30,45 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-rebalance-workload_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-stale-tasks_appdb'),
  schedule := '3,18,33,48 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-tasks_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'governance-final-count_appdb'),
  schedule := '6,21,36,51 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'governance-final-count_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'refresh_recent_conversation_messages_appdb'),
  schedule := '9,24,39,54 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_recent_conversation_messages_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'summarize_conversation_15m_appdb'),
  schedule := '12,27,42,57 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'summarize_conversation_15m_appdb');

-- Hourly jobs - stagger across first 14 minutes
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'aggregate_device_metrics_hourly_appdb'),
  schedule := '0 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aggregate_device_metrics_hourly_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'hourly-maintenance_appdb'),
  schedule := '2 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hourly-maintenance_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'hourly-system-health-check_appdb'),
  schedule := '4 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hourly-system-health-check_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'predictive_analytics_hourly_appdb'),
  schedule := '6 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'predictive_analytics_hourly_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'prune_net_http_response_hourly_deep_appdb'),
  schedule := '8 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune_net_http_response_hourly_deep_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'superduper_research_intel_hourly_appdb'),
  schedule := '10 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'superduper_research_intel_hourly_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'system-performance-hourly-snapshot_appdb'),
  schedule := '12 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'system-performance-hourly-snapshot_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'agent-performance-report_appdb'),
  schedule := '14 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-performance-report_appdb');

-- Every 30 minutes jobs - stagger
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'dao_governance_cycle_30m_appdb'),
  schedule := '5,35 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dao_governance_cycle_30m_appdb');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'evaluate-community-ideas_appdb'),
  schedule := '20,50 * * * *'
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evaluate-community-ideas_appdb');