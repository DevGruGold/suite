-- Fix the system-health-check-10min cron job to use correct function signature
-- The second parameter must be the HTTP method ('POST'), not the payload

SELECT cron.unschedule('system-health-check-10min');

SELECT cron.schedule(
  'system-health-check-10min',
  '*/10 * * * *',
  $$
  SELECT util.invoke_edge('system-status', 'POST', '{"snapshot_type": "scheduled"}'::jsonb);
  $$
);