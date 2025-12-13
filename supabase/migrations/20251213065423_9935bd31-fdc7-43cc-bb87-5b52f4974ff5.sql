-- Delete the overly-aggressive 30-second materialized view refresh cron job
-- This job was causing lock contention and statement timeouts
SELECT cron.unschedule('refresh-recent-conversation-messages_appdb');

-- Also ensure the remaining refresh job has a reasonable statement timeout
-- by wrapping it in a function with explicit timeout
CREATE OR REPLACE FUNCTION public.safe_refresh_recent_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '15s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.recent_conversation_messages;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Materialized view refresh failed: %', SQLERRM;
END;
$$;