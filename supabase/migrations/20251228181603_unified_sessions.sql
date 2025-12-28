-- Create unified_sessions table for cross-repo session management
CREATE TABLE IF NOT EXISTS public.unified_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_key TEXT UNIQUE NOT NULL,
    user_profile_id UUID REFERENCES public.user_profiles(id),
    suite_session_id UUID,
    dao_session_id UUID,
    ecosystem_session_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_unified_sessions_session_key ON public.unified_sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_unified_sessions_user_profile_id ON public.unified_sessions(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_unified_sessions_last_activity ON public.unified_sessions(last_activity DESC);

-- Add RLS policies
ALTER TABLE public.unified_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own unified sessions"
ON public.unified_sessions FOR SELECT
TO authenticated
USING (auth.uid()::text = session_key OR user_profile_id = auth.uid());

CREATE POLICY "Service role can manage unified sessions"
ON public.unified_sessions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create function to sync sessions
CREATE OR REPLACE FUNCTION sync_unified_session()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS sync_unified_session_trigger ON public.unified_sessions;
CREATE TRIGGER sync_unified_session_trigger
BEFORE UPDATE ON public.unified_sessions
FOR EACH ROW
EXECUTE FUNCTION sync_unified_session();

COMMENT ON TABLE public.unified_sessions IS 'Unified session management across all three repositories';
