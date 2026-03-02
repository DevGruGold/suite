-- =============================================================================
-- VSCO Full Sync Setup
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/vawouugtzwmejxqkeqqj/sql/new
-- =============================================================================
-- Step 1: Add missing columns to vsco_jobs (if not already done)
ALTER TABLE public.vsco_jobs
ADD COLUMN IF NOT EXISTS client_first_name TEXT,
    ADD COLUMN IF NOT EXISTS client_last_name TEXT,
    ADD COLUMN IF NOT EXISTS client_email TEXT,
    ADD COLUMN IF NOT EXISTS client_phone TEXT;
CREATE INDEX IF NOT EXISTS idx_vsco_jobs_client_first ON public.vsco_jobs(client_first_name);
CREATE INDEX IF NOT EXISTS idx_vsco_jobs_client_last ON public.vsco_jobs(client_last_name);
CREATE INDEX IF NOT EXISTS idx_vsco_jobs_client_email ON public.vsco_jobs(client_email);
CREATE INDEX IF NOT EXISTS idx_vsco_jobs_name ON public.vsco_jobs(name);
-- Step 2: Create sync state tracking table
CREATE TABLE IF NOT EXISTS public.vsco_sync_state (
    id SERIAL PRIMARY KEY,
    entity TEXT NOT NULL UNIQUE,
    total_pages INT DEFAULT 0,
    total_items INT DEFAULT 0,
    last_synced_page INT DEFAULT 0,
    items_synced INT DEFAULT 0,
    is_complete BOOLEAN DEFAULT false,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_synced_at TIMESTAMPTZ,
    last_error TEXT
);
INSERT INTO public.vsco_sync_state (entity)
VALUES ('jobs'),
    ('contacts'),
    ('events') ON CONFLICT (entity) DO NOTHING;
-- Step 3: Enable pg_cron extension (needed for auto-sync)
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- Step 4: Schedule sync_jobs to run every 55 seconds via pg_cron
-- This calls the edge function repeatedly. Each call syncs 8 pages.
-- 75 pages ÷ 8 pages/call = ~10 calls = ~10 minutes for full sync.
-- The cron stops being useful once is_complete=true (delta mode takes over).
SELECT cron.schedule(
        'vsco-full-sync',
        -- job name
        '55 seconds',
        -- run every 55 seconds
        $$
        SELECT net.http_post(
                url := current_setting('app.supabase_url') || '/functions/v1/vsco-workspace',
                headers := jsonb_build_object(
                    'Content-Type',
                    'application/json',
                    'Authorization',
                    'Bearer ' || current_setting('app.service_role_key')
                ),
                body := '{"action":"sync_jobs","executive":"system"}'::jsonb
            );
$$
);
-- Step 5: Verify the cron job was created
SELECT jobid,
    jobname,
    schedule,
    command,
    active
FROM cron.job
WHERE jobname = 'vsco-full-sync';
-- =============================================================================
-- NOTES:
-- • To check sync progress:  SELECT * FROM vsco_sync_state;
-- • To check job count:       SELECT COUNT(*) FROM vsco_jobs;
-- • To cancel the cron:       SELECT cron.unschedule('vsco-full-sync');
-- • After is_complete=true, calls auto-switch to delta mode (page 1 only).
-- =============================================================================