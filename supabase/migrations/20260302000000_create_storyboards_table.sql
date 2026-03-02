-- Migration: create_storyboards_table
-- Created: 2026-03-02
CREATE TABLE IF NOT EXISTS public.storyboards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    panel_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    panels JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_storyboards_session_id ON public.storyboards(session_id);
CREATE INDEX IF NOT EXISTS idx_storyboards_created_at ON public.storyboards(created_at DESC);
ALTER TABLE public.storyboards ENABLE ROW LEVEL SECURITY;
-- Service role has full access (used by edge functions)
CREATE POLICY "Service role full access" ON public.storyboards FOR ALL USING (true) WITH CHECK (true);
COMMENT ON TABLE public.storyboards IS 'AI-generated marketing storyboards created by Eliza via storyboard-creation edge function.';