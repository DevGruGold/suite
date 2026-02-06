-- Migration: Schedule Opportunity Scanner
-- Description: Runs the opportunity-scanner edge function every hour to detect slow tasks and system anomalies.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove valid job if exists to update schedule
select cron.unschedule('opportunity-scanner-hourly');

-- Schedule the job
select cron.schedule(
  'opportunity-scanner-hourly',
  '0 * * * *', -- Every hour
  $$
  select
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/opportunity-scanner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := '{"action": "scan"}'::jsonb
    ) as request_id;
  $$
);
