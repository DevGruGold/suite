-- Phase 5: Add cron job for more frequent task generation (every 4 hours)
-- First drop if exists to avoid conflicts
SELECT cron.unschedule('generate-tasks-from-sources') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-tasks-from-sources');

SELECT cron.schedule(
  'generate-tasks-from-sources',
  '0 */4 * * *',
  $$SELECT util.invoke_edge('ecosystem-monitor', '{"generate_tasks": true}'::jsonb);$$
);