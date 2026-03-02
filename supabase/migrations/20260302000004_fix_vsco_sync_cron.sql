-- Fix cron job 193: vsco-workspace sync_jobs
-- ============================================================
-- PROBLEM: cron job uses current_setting('app.supabase_url') and
--          current_setting('app.service_role_key') which are not
--          configured PostgreSQL app settings — causes:
--          "unrecognized configuration parameter app.supabase_url"
--
-- FIX: Match the working pattern used by cron jobs 180, 181, 182:
--      - Hardcode the Supabase project URL
--      - Use (SELECT value FROM util.secrets WHERE key = 'service_role_key')
-- ============================================================
SELECT cron.alter_job(
        193,
        command := $$
        SELECT net.http_post(
                url := 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/vsco-workspace',
                headers := jsonb_build_object(
                    'Content-Type',
                    'application/json',
                    'Authorization',
                    'Bearer ' || (
                        SELECT value
                        FROM util.secrets
                        WHERE key = 'service_role_key'
                    )
                ),
                body := '{"action":"sync_jobs","executive":"system"}'::jsonb
            );
$$
);
-- Verify the fix
SELECT jobid,
    jobname,
    schedule,
    command
FROM cron.job
WHERE jobid = 193;