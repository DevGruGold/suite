-- Create a scheduled trigger for agent-work-executor
-- This runs the executor every 5 minutes to process pending agent tasks

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove existing job if it exists (to start fresh)
SELECT cron.unschedule('agent-work-executor-trigger');

-- Create new scheduled job that runs every 5 minutes
SELECT cron.schedule(
  'agent-work-executor-trigger',  -- Job name
  '*/5 * * * *',                  -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/agent-work-executor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{"action": "execute_pending_work", "max_tasks": 5}'::jsonb
  );
  $$
);

-- Verify the job was created
SELECT * FROM cron.job WHERE jobname = 'agent-work-executor-trigger';
