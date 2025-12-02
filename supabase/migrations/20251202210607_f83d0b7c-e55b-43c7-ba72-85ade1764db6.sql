-- Fix failing cron jobs with correct util.invoke_edge signature

-- Fix job 154: ecosystem-monitor (wrong signature)
SELECT cron.unschedule(154);

SELECT cron.schedule(
  'generate-tasks-from-sources',
  '0 */4 * * *',
  $$SELECT util.invoke_edge('ecosystem-monitor', 'POST', '{"generate_tasks": true}'::jsonb, false, 90000);$$
);

-- Fix job 145: evaluate-community-idea (using current_setting which doesn't exist)
SELECT cron.unschedule(145);

SELECT cron.schedule(
  'evaluate-community-ideas',
  '*/30 * * * *',
  $$SELECT util.invoke_edge('evaluate-community-idea', 'POST', '{"action": "evaluate_pending"}'::jsonb, false, 60000);$$
);