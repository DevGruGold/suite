-- Create event_log table for cross-repo synchronization
CREATE TABLE IF NOT EXISTS public.event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_repo TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_by TEXT[] DEFAULT ARRAY[]::TEXT[],
    acknowledgments JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_log_event_type ON public.event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_timestamp ON public.event_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_source_repo ON public.event_log(source_repo);

-- Add RLS policies
ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event log readable by authenticated users"
ON public.event_log FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Event log writable by service role"
ON public.event_log FOR INSERT
TO service_role
WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.event_log IS 'Event bus log for cross-repository synchronization';
