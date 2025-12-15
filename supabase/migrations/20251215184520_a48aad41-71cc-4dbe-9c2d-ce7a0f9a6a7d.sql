
-- Update opportunity-scanner cron job to fire-and-forget pattern
SELECT cron.alter_job(
  152,
  command := $$
SELECT net.http_post(
  url := (SELECT value FROM util.secrets WHERE key = 'functions_url') || '/opportunity-scanner',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (SELECT value FROM util.secrets WHERE key = 'service_role_key'),
    'Content-Type', 'application/json'
  ),
  body := '{}'::jsonb
);
$$
);

-- Update system-health-check-10min cron job to fire-and-forget pattern
SELECT cron.alter_job(
  172,
  command := $$
SELECT net.http_post(
  url := (SELECT value FROM util.secrets WHERE key = 'functions_url') || '/system-status',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (SELECT value FROM util.secrets WHERE key = 'service_role_key'),
    'Content-Type', 'application/json'
  ),
  body := '{"snapshot_type": "scheduled"}'::jsonb
);
$$
);
