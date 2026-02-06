-- Enable the periodic scan for GitHub issues
SELECT cron.schedule(
  'github-issue-scanner-trigger',
  '0 * * * *', -- Run every hour
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/github-issue-scanner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{"action": "trigger_scan"}'::jsonb
  );
  $$
);
