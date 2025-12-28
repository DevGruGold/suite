-- Enhanced rate limiting and security

-- Update rate_limits table if exists, or create it
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(api_key, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_key_endpoint ON public.api_rate_limits(api_key, endpoint);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window_start ON public.api_rate_limits(window_start);

-- Enhanced rate limit check function
CREATE OR REPLACE FUNCTION check_rate_limit_enhanced(
    p_api_key TEXT,
    p_endpoint TEXT,
    p_limit INTEGER DEFAULT 100,
    p_window_seconds INTEGER DEFAULT 60
) RETURNS JSONB AS $$
DECLARE
    v_current_count INTEGER;
    v_window_start TIMESTAMPTZ;
    v_reset_at TIMESTAMPTZ;
BEGIN
    SELECT request_count, window_start
    INTO v_current_count, v_window_start
    FROM public.api_rate_limits
    WHERE api_key = p_api_key AND endpoint = p_endpoint;
    
    IF v_window_start IS NULL OR (NOW() - v_window_start) > INTERVAL '1 second' * p_window_seconds THEN
        -- Reset window
        INSERT INTO public.api_rate_limits (api_key, endpoint, request_count, window_start)
        VALUES (p_api_key, p_endpoint, 1, NOW())
        ON CONFLICT (api_key, endpoint) DO UPDATE
        SET request_count = 1, window_start = NOW();
        
        RETURN jsonb_build_object(
            'allowed', true,
            'remaining', p_limit - 1,
            'reset_at', NOW() + INTERVAL '1 second' * p_window_seconds
        );
    ELSIF v_current_count < p_limit THEN
        -- Increment counter
        UPDATE public.api_rate_limits
        SET request_count = request_count + 1
        WHERE api_key = p_api_key AND endpoint = p_endpoint;
        
        RETURN jsonb_build_object(
            'allowed', true,
            'remaining', p_limit - v_current_count - 1,
            'reset_at', v_window_start + INTERVAL '1 second' * p_window_seconds
        );
    ELSE
        -- Rate limit exceeded
        RETURN jsonb_build_object(
            'allowed', false,
            'remaining', 0,
            'reset_at', v_window_start + INTERVAL '1 second' * p_window_seconds,
            'retry_after', EXTRACT(EPOCH FROM (v_window_start + INTERVAL '1 second' * p_window_seconds - NOW()))
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- RLS policies
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rate limits managed by service role"
ON public.api_rate_limits FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.api_rate_limits IS 'API rate limiting with sliding window';
COMMENT ON FUNCTION check_rate_limit_enhanced IS 'Enhanced rate limit check with detailed response';
