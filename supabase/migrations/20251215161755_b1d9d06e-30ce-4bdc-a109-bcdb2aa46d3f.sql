-- Fix util.invoke_edge to poll for full timeout duration instead of hardcoded 10 seconds
CREATE OR REPLACE FUNCTION util.invoke_edge(
  fn_name text,
  method text DEFAULT 'POST',
  payload jsonb DEFAULT '{}',
  require_ok boolean DEFAULT true,
  timeout_ms integer DEFAULT 60000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'util'
AS $$
DECLARE
  base_url  text;
  svc_key   text;
  full_url  text;
  request_id bigint;
  resp      jsonb;
  status_code integer;
  retry_count integer := 0;
  max_retries integer := 1;
  -- FIXED: Calculate poll iterations dynamically based on timeout (poll every 0.5s)
  -- Minimum 20 iterations (10s), maximum based on timeout_ms
  max_poll_iterations integer := GREATEST(20, (timeout_ms / 500));
BEGIN
  -- Get secrets
  SELECT value INTO base_url FROM util.secrets WHERE key = 'functions_url';
  SELECT value INTO svc_key FROM util.secrets WHERE key = 'service_role_key';

  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE EXCEPTION 'Missing util.secrets: functions_url or service_role_key';
  END IF;

  full_url := rtrim(base_url, '/') || '/' || fn_name;

  <<retry_loop>>
  LOOP
    request_id := net.http_post(
      url := full_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || svc_key
      ),
      body := payload,
      timeout_milliseconds := timeout_ms
    );

    -- FIXED: Poll for up to full timeout duration instead of hardcoded 20 iterations (10s)
    FOR i IN 1..max_poll_iterations LOOP
      PERFORM pg_sleep(0.5);
      SELECT to_jsonb(r) INTO resp 
      FROM net._http_response r 
      WHERE r.id = request_id;
      
      IF resp IS NOT NULL THEN
        EXIT;
      END IF;
    END LOOP;

    status_code := COALESCE((resp->>'status_code')::int, 0);

    -- Exit if we got a response (even error responses)
    IF resp IS NOT NULL AND status_code > 0 AND status_code < 500 THEN
      EXIT retry_loop;
    END IF;

    retry_count := retry_count + 1;
    IF retry_count > max_retries THEN
      EXIT retry_loop;
    END IF;

    -- Wait before retry
    PERFORM pg_sleep(2);
    resp := NULL;
  END LOOP;

  IF resp IS NULL THEN
    IF require_ok THEN
      RAISE EXCEPTION 'No response from edge function % after % retries (polled for %ms)', 
        fn_name, max_retries, max_poll_iterations * 500;
    ELSE
      RETURN jsonb_build_object('error', 'no_response', 'retries', retry_count, 'poll_ms', max_poll_iterations * 500);
    END IF;
  END IF;

  status_code := COALESCE((resp->>'status_code')::int, 0);

  IF require_ok AND (status_code < 200 OR status_code >= 300) THEN
    RAISE EXCEPTION 'Edge function % returned status % after % retries: %', 
      fn_name, status_code, retry_count, resp->>'content';
  END IF;

  RETURN jsonb_build_object(
    'status_code', status_code,
    'content', resp->>'content',
    'retries', retry_count
  );
END;
$$;