-- ============================================
-- VERTEX AI & GOOGLE CLOUD OAUTH SETUP
-- ============================================
-- Migration: Add support for Google Cloud OAuth connections and Vertex AI integration
-- Created: 2024-12-28
-- Purpose: Enable Vertex AI chat with Google Cloud OAuth authentication

-- ============================================
-- 1. OAUTH CONNECTIONS TABLE
-- ============================================
-- Store OAuth refresh tokens and connection metadata for external services

CREATE TABLE IF NOT EXISTS public.oauth_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Provider identification
    provider TEXT NOT NULL CHECK (provider IN ('google_cloud', 'github', 'microsoft', 'aws', 'other')),
    provider_user_id TEXT, -- External user ID from the provider (e.g., Google user ID)
    provider_email TEXT, -- Email associated with the OAuth account
    
    -- OAuth tokens
    access_token TEXT, -- Current access token (short-lived, optional storage)
    refresh_token TEXT NOT NULL, -- Long-lived refresh token (encrypted in production)
    token_type TEXT DEFAULT 'Bearer',
    expires_at TIMESTAMPTZ, -- When the access token expires
    
    -- Scopes and permissions
    scopes TEXT[], -- Array of granted OAuth scopes
    
    -- Connection status
    is_active BOOLEAN DEFAULT TRUE,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_refreshed_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}', -- Additional provider-specific data
    error_count INTEGER DEFAULT 0, -- Track consecutive refresh failures
    last_error TEXT, -- Last error message if refresh failed
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for oauth_connections
CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider_active 
    ON public.oauth_connections(provider, is_active) 
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider_email 
    ON public.oauth_connections(provider, provider_email);

CREATE INDEX IF NOT EXISTS idx_oauth_connections_last_used 
    ON public.oauth_connections(last_used_at DESC) 
    WHERE is_active = TRUE;

-- Comments
COMMENT ON TABLE public.oauth_connections IS 'Stores OAuth connection credentials for external services like Google Cloud, GitHub, etc.';
COMMENT ON COLUMN public.oauth_connections.refresh_token IS 'Long-lived refresh token - ENCRYPT IN PRODUCTION using Supabase Vault or similar';
COMMENT ON COLUMN public.oauth_connections.scopes IS 'OAuth scopes granted to this connection (e.g., gmail.send, drive.file)';
COMMENT ON COLUMN public.oauth_connections.error_count IS 'Consecutive refresh failures - auto-disable connection after threshold';

-- ============================================
-- 2. AI PROVIDER USAGE TRACKING
-- ============================================
-- Track which AI provider (Vertex AI, Gemini, DeepSeek) handled each request

CREATE TABLE IF NOT EXISTS public.ai_provider_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Request identification
    request_id TEXT, -- Unique identifier for the chat request
    session_key TEXT, -- Conversation session identifier
    
    -- Provider information
    provider TEXT NOT NULL, -- 'vertex-ai', 'gemini-api', 'deepseek', 'emergency-static'
    model TEXT, -- Model used (e.g., 'gemini-1.5-pro', 'deepseek-chat')
    executive_function TEXT, -- Which edge function was called (e.g., 'ai-chat', 'coo-chat')
    
    -- Request details
    message_count INTEGER, -- Number of messages in the request
    has_images BOOLEAN DEFAULT FALSE, -- Whether images were included
    has_tool_calls BOOLEAN DEFAULT FALSE, -- Whether tool calls were executed
    tool_calls_count INTEGER DEFAULT 0, -- Number of tools invoked
    
    -- Performance metrics
    execution_time_ms INTEGER, -- Time taken to process request
    token_count_input INTEGER, -- Approximate input tokens
    token_count_output INTEGER, -- Approximate output tokens
    
    -- OAuth authentication
    oauth_authenticated BOOLEAN DEFAULT FALSE, -- Whether OAuth was used
    oauth_connection_id UUID REFERENCES public.oauth_connections(id), -- Link to OAuth connection used
    
    -- Success tracking
    success BOOLEAN NOT NULL,
    fallback_level INTEGER DEFAULT 0, -- 0=primary, 1=first fallback, 2=second fallback, etc.
    error_message TEXT, -- Error if failed
    
    -- Timestamps
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for ai_provider_usage_log
CREATE INDEX IF NOT EXISTS idx_ai_provider_usage_provider 
    ON public.ai_provider_usage_log(provider, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_ai_provider_usage_session 
    ON public.ai_provider_usage_log(session_key, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_ai_provider_usage_success 
    ON public.ai_provider_usage_log(success, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_ai_provider_usage_oauth 
    ON public.ai_provider_usage_log(oauth_authenticated, timestamp DESC) 
    WHERE oauth_authenticated = TRUE;

CREATE INDEX IF NOT EXISTS idx_ai_provider_usage_timestamp 
    ON public.ai_provider_usage_log(timestamp DESC);

-- Comments
COMMENT ON TABLE public.ai_provider_usage_log IS 'Tracks AI provider usage for analytics, billing, and performance monitoring';
COMMENT ON COLUMN public.ai_provider_usage_log.fallback_level IS '0=primary provider, 1=first fallback, 2=second fallback, etc.';
COMMENT ON COLUMN public.ai_provider_usage_log.oauth_authenticated IS 'TRUE if request used Google Cloud OAuth (Vertex AI)';

-- ============================================
-- 3. GOOGLE CLOUD SERVICE USAGE LOG
-- ============================================
-- Track usage of Google Cloud services (Gmail, Drive, Sheets, Calendar)

CREATE TABLE IF NOT EXISTS public.google_cloud_service_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Service identification
    service TEXT NOT NULL CHECK (service IN ('gmail', 'drive', 'sheets', 'calendar', 'vertex_ai', 'other')),
    operation TEXT NOT NULL, -- 'send_email', 'list_files', 'create_spreadsheet', 'create_event', etc.
    
    -- Request details
    oauth_connection_id UUID REFERENCES public.oauth_connections(id),
    request_parameters JSONB DEFAULT '{}', -- Operation-specific parameters
    
    -- Response details
    success BOOLEAN NOT NULL,
    response_data JSONB DEFAULT '{}', -- Operation result (sanitized, no sensitive data)
    error_message TEXT,
    
    -- Performance
    execution_time_ms INTEGER,
    
    -- Associated with AI chat request
    ai_request_id UUID REFERENCES public.ai_provider_usage_log(id),
    
    -- Timestamps
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for google_cloud_service_log
CREATE INDEX IF NOT EXISTS idx_google_service_log_service 
    ON public.google_cloud_service_log(service, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_google_service_log_oauth_connection 
    ON public.google_cloud_service_log(oauth_connection_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_google_service_log_success 
    ON public.google_cloud_service_log(success, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_google_service_log_timestamp 
    ON public.google_cloud_service_log(timestamp DESC);

-- Comments
COMMENT ON TABLE public.google_cloud_service_log IS 'Tracks Google Cloud service operations for billing and monitoring';
COMMENT ON COLUMN public.google_cloud_service_log.response_data IS 'Sanitized response data - DO NOT store sensitive information';

-- ============================================
-- 4. VIEWS FOR MONITORING
-- ============================================

-- View: OAuth Connection Health
CREATE OR REPLACE VIEW public.oauth_connection_health AS
SELECT 
    provider,
    COUNT(*) as total_connections,
    COUNT(*) FILTER (WHERE is_active = TRUE) as active_connections,
    COUNT(*) FILTER (WHERE error_count > 0) as connections_with_errors,
    MAX(last_used_at) as most_recent_use,
    MAX(last_refreshed_at) as most_recent_refresh,
    AVG(error_count) as avg_error_count
FROM public.oauth_connections
GROUP BY provider;

COMMENT ON VIEW public.oauth_connection_health IS 'Summary of OAuth connection status by provider';

-- View: AI Provider Performance
CREATE OR REPLACE VIEW public.ai_provider_performance AS
SELECT 
    provider,
    DATE_TRUNC('hour', timestamp) as hour,
    COUNT(*) as request_count,
    COUNT(*) FILTER (WHERE success = TRUE) as successful_requests,
    AVG(execution_time_ms) as avg_execution_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_execution_time_ms,
    AVG(fallback_level) as avg_fallback_level,
    COUNT(*) FILTER (WHERE oauth_authenticated = TRUE) as oauth_requests
FROM public.ai_provider_usage_log
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY provider, DATE_TRUNC('hour', timestamp)
ORDER BY hour DESC, request_count DESC;

COMMENT ON VIEW public.ai_provider_performance IS '24-hour AI provider performance metrics with OAuth tracking';

-- View: Google Cloud Service Usage Summary
CREATE OR REPLACE VIEW public.google_cloud_service_summary AS
SELECT 
    service,
    operation,
    DATE_TRUNC('day', timestamp) as day,
    COUNT(*) as operation_count,
    COUNT(*) FILTER (WHERE success = TRUE) as successful_operations,
    AVG(execution_time_ms) as avg_execution_time_ms
FROM public.google_cloud_service_log
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY service, operation, DATE_TRUNC('day', timestamp)
ORDER BY day DESC, operation_count DESC;

COMMENT ON VIEW public.google_cloud_service_summary IS '7-day Google Cloud service usage summary';

-- ============================================
-- 5. FUNCTIONS FOR AUTOMATION
-- ============================================

-- Function: Update last_used_at on OAuth connections
CREATE OR REPLACE FUNCTION public.update_oauth_connection_last_used()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.oauth_connections
    SET last_used_at = NOW()
    WHERE id = NEW.oauth_connection_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update OAuth connection last_used_at
DROP TRIGGER IF EXISTS trigger_update_oauth_last_used ON public.ai_provider_usage_log;
CREATE TRIGGER trigger_update_oauth_last_used
    AFTER INSERT ON public.ai_provider_usage_log
    FOR EACH ROW
    WHEN (NEW.oauth_connection_id IS NOT NULL)
    EXECUTE FUNCTION public.update_oauth_connection_last_used();

-- Function: Auto-disable OAuth connections with too many errors
CREATE OR REPLACE FUNCTION public.check_oauth_connection_errors()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.error_count >= 5 THEN
        NEW.is_active = FALSE;
        RAISE NOTICE 'OAuth connection % disabled due to % consecutive errors', NEW.id, NEW.error_count;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-disable failing OAuth connections
DROP TRIGGER IF EXISTS trigger_check_oauth_errors ON public.oauth_connections;
CREATE TRIGGER trigger_check_oauth_errors
    BEFORE UPDATE ON public.oauth_connections
    FOR EACH ROW
    WHEN (NEW.error_count <> OLD.error_count)
    EXECUTE FUNCTION public.check_oauth_connection_errors();

-- ============================================
-- 6. UTILITY QUERIES (for monitoring)
-- ============================================

-- These are example queries - not executed during migration

/*
-- Check OAuth connection status
SELECT * FROM public.oauth_connection_health;

-- Get most recent Vertex AI requests
SELECT 
    provider,
    model,
    oauth_authenticated,
    execution_time_ms,
    success,
    timestamp
FROM public.ai_provider_usage_log
WHERE provider = 'vertex-ai'
ORDER BY timestamp DESC
LIMIT 10;

-- Count AI provider usage by provider (last 24 hours)
SELECT 
    provider,
    COUNT(*) as request_count,
    COUNT(*) FILTER (WHERE success = TRUE) as successful,
    AVG(execution_time_ms) as avg_time_ms,
    COUNT(*) FILTER (WHERE oauth_authenticated = TRUE) as oauth_requests
FROM public.ai_provider_usage_log
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY provider
ORDER BY request_count DESC;

-- Check Google Cloud service usage
SELECT * FROM public.google_cloud_service_summary
ORDER BY day DESC, operation_count DESC
LIMIT 20;

-- Find OAuth connections that need refresh
SELECT 
    provider,
    provider_email,
    last_refreshed_at,
    error_count,
    last_error
FROM public.oauth_connections
WHERE is_active = TRUE
  AND (last_refreshed_at < NOW() - INTERVAL '1 hour' OR error_count > 0)
ORDER BY last_refreshed_at ASC;
*/

-- ============================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================
-- Enable RLS for security (adjust policies based on your auth model)

ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_cloud_service_log ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can access everything
CREATE POLICY "Service role has full access to oauth_connections" 
    ON public.oauth_connections
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to ai_provider_usage_log" 
    ON public.ai_provider_usage_log
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to google_cloud_service_log" 
    ON public.google_cloud_service_log
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- Verify tables were created
SELECT 
    tablename,
    schemaname
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('oauth_connections', 'ai_provider_usage_log', 'google_cloud_service_log')
ORDER BY tablename;
