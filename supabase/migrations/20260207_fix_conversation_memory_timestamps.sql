-- Migration: Fix conversation_memory timestamps
-- Purpose: Automate updated_at management to prevent "undefined" errors from Edge Functions
-- Date: 2026-02-07
-- 1. Create the update_modified_column function if it doesn't exist
CREATE OR REPLACE FUNCTION update_modified_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now();
RETURN NEW;
END;
$$ language 'plpgsql';
-- 2. conversation_memory
-- Ensure updated_at has a default
ALTER TABLE IF EXISTS public.conversation_memory
ALTER COLUMN updated_at
SET DEFAULT now();
-- Create trigger for auto-update
DROP TRIGGER IF EXISTS update_conversation_memory_modtime ON public.conversation_memory;
CREATE TRIGGER update_conversation_memory_modtime BEFORE
UPDATE ON public.conversation_memory FOR EACH ROW EXECUTE FUNCTION update_modified_column();
-- 3. ip_conversation_sessions
-- Ensure last_active defaults to now() (using last_active instead of updated_at for this table based on usage)
ALTER TABLE IF EXISTS public.ip_conversation_sessions
ALTER COLUMN last_active
SET DEFAULT now();
-- 4. conversation_summaries
-- Ensure created_at defaults to now() - usually these are immutable logs, but if updated:
ALTER TABLE IF EXISTS public.conversation_summaries
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
DROP TRIGGER IF EXISTS update_conversation_summaries_modtime ON public.conversation_summaries;
CREATE TRIGGER update_conversation_summaries_modtime BEFORE
UPDATE ON public.conversation_summaries FOR EACH ROW EXECUTE FUNCTION update_modified_column();
-- 5. Verify
DO $$ BEGIN RAISE NOTICE '✅ Migration applied: conversation_memory triggers and defaults configured.';
END;
$$;