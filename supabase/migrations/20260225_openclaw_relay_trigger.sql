-- 20260225_openclaw_relay_trigger.sql
-- Creates the infrastructure for the Eliza ↔ OpenClaw two-way relay.
-- When Eliza-Dev (local) posts a relay request to inbox_messages,
-- this trigger auto-calls the openclaw-relay edge function to process it.
-- 1. Ensure pg_net extension is available (needed to call edge functions from DB)
CREATE EXTENSION IF NOT EXISTS pg_net;
-- 2. Helper function that fires when a new openclaw relay request arrives
CREATE OR REPLACE FUNCTION notify_openclaw_relay() RETURNS trigger AS $$
DECLARE payload jsonb;
supabase_url text;
service_role_key text;
BEGIN -- Only trigger for openclaw channel messages awaiting a reply (not replies themselves)
IF NEW.channel = 'openclaw'
AND (NEW.metadata->>'awaiting_reply')::boolean = true
AND (NEW.metadata->>'is_reply') IS NULL
AND (NEW.metadata->>'replied') IS NULL THEN supabase_url := current_setting('app.supabase_url', true);
service_role_key := current_setting('app.service_role_key', true);
-- If app settings aren't configured, skip (function can still be called via cron)
IF supabase_url IS NOT NULL
AND service_role_key IS NOT NULL THEN payload := jsonb_build_object(
    'action',
    'process_pending',
    'triggered_by_message_id',
    NEW.id,
    'relay_tag',
    NEW.metadata->>'relay_tag'
);
PERFORM net.http_post(
    url := supabase_url || '/functions/v1/openclaw-relay',
    headers := jsonb_build_object(
        'Content-Type',
        'application/json',
        'Authorization',
        'Bearer ' || service_role_key
    ),
    body := payload
);
END IF;
END IF;
RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- 3. Attach trigger to inbox_messages
DROP TRIGGER IF EXISTS trg_openclaw_relay ON inbox_messages;
CREATE TRIGGER trg_openclaw_relay
AFTER
INSERT ON inbox_messages FOR EACH ROW EXECUTE FUNCTION notify_openclaw_relay();
-- 4. Add a composite index to make relay polling fast
CREATE INDEX IF NOT EXISTS idx_inbox_relay_pending ON inbox_messages (channel, is_read, created_at)
WHERE channel = 'openclaw'
    AND is_read = false;
-- 5. Add comment for clarity
COMMENT ON FUNCTION notify_openclaw_relay() IS 'Fires when an openclaw relay request lands in inbox_messages. ' 'Calls the openclaw-relay edge function to process and reply. ' 'If app settings are not configured, the function is still available via cron.';
-- 6. Register openclaw-relay in the cron registry for fallback polling
-- (Supabase pg_cron — calls process_pending every 30 seconds as fallback)
-- Note: This requires pg_cron extension. If not available, set up manually.
-- SELECT cron.schedule(
--   'openclaw-relay-poll',
--   '*/1 * * * *',  -- every minute
--   $$SELECT net.http_post(
--     url := current_setting('app.supabase_url') || '/functions/v1/openclaw-relay',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.service_role_key')),
--     body := '{"action":"process_pending"}'::jsonb
--   )$$
-- );