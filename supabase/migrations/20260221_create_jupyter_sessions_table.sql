-- Migration: create_jupyter_sessions_table
-- Issue #2176: Jupyter MCP Pivot
-- Track persistent Jupyter notebook sessions for stateful Python execution
CREATE TABLE IF NOT EXISTS public.jupyter_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_name TEXT UNIQUE NOT NULL,
    -- human-readable name (e.g. "analysis-xyz")
    jupyter_session_id TEXT NOT NULL,
    -- Jupyter server session ID
    kernel_id TEXT NOT NULL,
    -- Jupyter kernel ID
    notebook_path TEXT NOT NULL,
    -- path to .ipynb file on Jupyter server
    status TEXT NOT NULL DEFAULT 'active' -- active | closed | error
    CHECK (status IN ('active', 'closed', 'error')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);
-- Index for fast lookups by session name + status
CREATE INDEX IF NOT EXISTS idx_jupyter_sessions_name_status ON public.jupyter_sessions (session_name, status);
-- Auto-cleanup index for stale sessions
CREATE INDEX IF NOT EXISTS idx_jupyter_sessions_last_used ON public.jupyter_sessions (last_used_at);
ALTER TABLE public.jupyter_sessions ENABLE ROW LEVEL SECURITY;
-- Service role has full access (Edge Functions use service role key)
CREATE POLICY "service_role_all" ON public.jupyter_sessions FOR ALL USING (true) WITH CHECK (true);
COMMENT ON TABLE public.jupyter_sessions IS 'Persistent Jupyter kernel sessions for stateful Python execution via jupyter-executor Edge Function. Issue #2176.';