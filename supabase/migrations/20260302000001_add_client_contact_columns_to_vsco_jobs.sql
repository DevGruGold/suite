-- Migration: add_client_contact_columns_to_vsco_jobs
-- Created: 2026-03-02
-- Adds flat contact columns to vsco_jobs for fast text searching without JSONB traversal.
-- Previously sync_jobs tried to upsert these columns but they didn't exist,
-- causing every upsert to fail silently → vsco_jobs table was always empty.
ALTER TABLE public.vsco_jobs
ADD COLUMN IF NOT EXISTS client_first_name TEXT,
    ADD COLUMN IF NOT EXISTS client_last_name TEXT,
    ADD COLUMN IF NOT EXISTS client_email TEXT,
    ADD COLUMN IF NOT EXISTS client_phone TEXT;
-- Index for fast name searches used by find_job Tier 1
CREATE INDEX IF NOT EXISTS idx_vsco_jobs_client_first ON public.vsco_jobs(client_first_name);
CREATE INDEX IF NOT EXISTS idx_vsco_jobs_client_last ON public.vsco_jobs(client_last_name);
CREATE INDEX IF NOT EXISTS idx_vsco_jobs_client_email ON public.vsco_jobs(client_email);
CREATE INDEX IF NOT EXISTS idx_vsco_jobs_name ON public.vsco_jobs(name);