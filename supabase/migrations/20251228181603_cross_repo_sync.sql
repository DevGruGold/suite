-- Create tables for cross-repo synchronization tracking

-- Sync status table
CREATE TABLE IF NOT EXISTS public.sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_name TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_duration_ms INTEGER,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'in_progress')),
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_status_repo_name ON public.sync_status(repo_name);
CREATE INDEX IF NOT EXISTS idx_sync_status_last_sync_at ON public.sync_status(last_sync_at DESC);

-- Data inconsistency tracking
CREATE TABLE IF NOT EXISTS public.data_inconsistencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    affected_repos TEXT[] NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_data_inconsistencies_detected_at ON public.data_inconsistencies(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_inconsistencies_severity ON public.data_inconsistencies(severity);
CREATE INDEX IF NOT EXISTS idx_data_inconsistencies_unresolved ON public.data_inconsistencies(resolved_at) WHERE resolved_at IS NULL;

-- Performance metrics
CREATE TABLE IF NOT EXISTS public.cross_repo_latency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_name TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    status_code INTEGER,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cross_repo_latency_measured_at ON public.cross_repo_latency(measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_cross_repo_latency_repo_endpoint ON public.cross_repo_latency(repo_name, endpoint);

-- RLS policies
ALTER TABLE public.sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_inconsistencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cross_repo_latency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sync status readable by authenticated users"
ON public.sync_status FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sync status writable by service role"
ON public.sync_status FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Data inconsistencies readable by authenticated users"
ON public.data_inconsistencies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Data inconsistencies writable by service role"
ON public.data_inconsistencies FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Latency metrics readable by authenticated users"
ON public.cross_repo_latency FOR SELECT TO authenticated USING (true);

CREATE POLICY "Latency metrics writable by service role"
ON public.cross_repo_latency FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Comments
COMMENT ON TABLE public.sync_status IS 'Tracks synchronization status across repositories';
COMMENT ON TABLE public.data_inconsistencies IS 'Logs data inconsistencies detected across repositories';
COMMENT ON TABLE public.cross_repo_latency IS 'Performance metrics for cross-repository API calls';
