-- Migration: create_vsco_sync_state_table
-- Created: 2026-03-02
-- Tracks resumable sync progress for VSCO entities (jobs, contacts, events).
-- sync_jobs reads last_synced_page and picks up from there each call.
-- Once is_complete=true, switches to delta mode (only checks page 1).
CREATE TABLE IF NOT EXISTS public.vsco_sync_state (
    id SERIAL PRIMARY KEY,
    entity TEXT NOT NULL UNIQUE,
    -- 'jobs' | 'contacts' | 'events'
    total_pages INT DEFAULT 0,
    total_items INT DEFAULT 0,
    last_synced_page INT DEFAULT 0,
    items_synced INT DEFAULT 0,
    is_complete BOOLEAN DEFAULT false,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_synced_at TIMESTAMPTZ,
    last_error TEXT
);
-- Seed initial rows so upsert logic can update them
INSERT INTO public.vsco_sync_state (entity)
VALUES ('jobs'),
    ('contacts'),
    ('events') ON CONFLICT (entity) DO NOTHING;
COMMENT ON TABLE public.vsco_sync_state IS 'Tracks VSCO full-sync progress. Enables resumable chunked syncing across multiple edge function calls.';