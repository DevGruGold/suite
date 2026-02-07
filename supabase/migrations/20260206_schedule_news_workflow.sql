
-- 20260206_schedule_news_workflow.sql

-- 1. Schedule daily-news-finder at 10:00 AM UTC
SELECT cron.schedule(
    'daily-news-finder-job',
    '0 10 * * *',
    $$
    SELECT
      net.http_post(
          url:='https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/daily-news-finder',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.jwt.claim.role_service') || '"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
    $$
);

-- 2. Schedule share-latest-news at 10:05 AM UTC
SELECT cron.schedule(
    'share-latest-news-job',
    '5 10 * * *',
    $$
    SELECT
      net.http_post(
          url:='https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/share-latest-news',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.jwt.claim.role_service') || '"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
    $$
);
