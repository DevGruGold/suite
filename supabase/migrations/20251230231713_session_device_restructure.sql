-- ============================================================================
-- Session & Device Restructure Migration
-- Date: 2025-12-30
-- Purpose: Reorganize device tracking to focus on sessions with device context
-- ============================================================================

-- Add device type detection to devices table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'devices' 
        AND column_name = 'detected_device_category'
    ) THEN
        ALTER TABLE devices 
        ADD COLUMN detected_device_category TEXT CHECK (
            detected_device_category IN ('mobile', 'tablet', 'laptop', 'desktop', 'unknown')
        ) DEFAULT 'unknown';
    END IF;
END $$;

-- Add screen size info for better device categorization
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'devices' 
        AND column_name = 'screen_info'
    ) THEN
        ALTER TABLE devices 
        ADD COLUMN screen_info JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Add more detailed session tracking
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'device_connection_sessions' 
        AND column_name = 'pop_points_earned'
    ) THEN
        ALTER TABLE device_connection_sessions 
        ADD COLUMN pop_points_earned NUMERIC DEFAULT 0;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'device_connection_sessions' 
        AND column_name = 'activities_count'
    ) THEN
        ALTER TABLE device_connection_sessions 
        ADD COLUMN activities_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Function to detect device category from user agent
CREATE OR REPLACE FUNCTION detect_device_category(user_agent TEXT)
RETURNS TEXT AS $$
BEGIN
    IF user_agent IS NULL THEN
        RETURN 'unknown';
    END IF;
    
    -- Mobile detection
    IF user_agent ~* '(iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini)' THEN
        RETURN 'mobile';
    END IF;
    
    -- Tablet detection
    IF user_agent ~* '(iPad|Android(?!.*Mobile)|Tablet|PlayBook|Silk)' THEN
        RETURN 'tablet';
    END IF;
    
    -- Laptop detection (harder to distinguish from desktop, using screen size would help)
    IF user_agent ~* '(Macintosh|Windows NT|Linux)' THEN
        -- Default to laptop for now, can be refined with screen_info
        RETURN 'laptop';
    END IF;
    
    RETURN 'unknown';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update existing devices with detected categories
UPDATE devices 
SET detected_device_category = detect_device_category(
    COALESCE(metadata->>'userAgent', browser || ' ' || os)
)
WHERE detected_device_category = 'unknown' OR detected_device_category IS NULL;

-- Trigger to auto-detect device category on insert/update
CREATE OR REPLACE FUNCTION auto_detect_device_category()
RETURNS TRIGGER AS $$
BEGIN
    NEW.detected_device_category := detect_device_category(
        COALESCE(NEW.metadata->>'userAgent', NEW.browser || ' ' || NEW.os)
    );
    
    -- Also update screen_info if provided in metadata
    IF NEW.metadata ? 'screenWidth' AND NEW.metadata ? 'screenHeight' THEN
        NEW.screen_info := jsonb_build_object(
            'width', NEW.metadata->'screenWidth',
            'height', NEW.metadata->'screenHeight',
            'pixel_ratio', COALESCE(NEW.metadata->'pixelRatio', 1),
            'orientation', COALESCE(NEW.metadata->>'orientation', 'unknown')
        );
        
        -- Refine category based on screen size
        IF (NEW.metadata->>'screenWidth')::int < 768 THEN
            NEW.detected_device_category := 'mobile';
        ELSIF (NEW.metadata->>'screenWidth')::int < 1024 THEN
            NEW.detected_device_category := 'tablet';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_detect_device_category ON devices;
CREATE TRIGGER trigger_auto_detect_device_category
    BEFORE INSERT OR UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION auto_detect_device_category();

-- Create view for user's claimed devices with session summaries
CREATE OR REPLACE VIEW user_claimed_devices_with_sessions AS
SELECT 
    d.id as device_id,
    d.device_fingerprint,
    d.detected_device_category,
    d.device_type,
    d.browser,
    d.os,
    d.screen_info,
    d.claimed_by as user_id,
    d.claimed_at,
    d.first_seen_at,
    d.last_seen_at,
    d.is_active,
    
    -- Session statistics
    COUNT(DISTINCT dcs.id) as total_sessions,
    COUNT(DISTINCT dcs.id) FILTER (WHERE dcs.is_active = true) as active_sessions,
    SUM(COALESCE(dcs.total_duration_seconds, 0)) as total_duration_seconds,
    
    -- PoP statistics
    COALESCE(SUM(dcs.pop_points_earned), 0) as total_pop_points_from_sessions,
    COALESCE(
        (SELECT SUM(pop_points) 
         FROM pop_events_ledger 
         WHERE device_id = d.id),
        0
    ) as total_pop_points_validated,
    
    -- Activity statistics
    SUM(COALESCE(dcs.activities_count, 0)) as total_activities,
    SUM(COALESCE(dcs.charging_sessions_count, 0)) as total_charging_sessions,
    
    -- IP addresses seen
    jsonb_agg(DISTINCT dcs.ip_address ORDER BY dcs.ip_address) 
        FILTER (WHERE dcs.ip_address IS NOT NULL) as ip_addresses_used,
    
    -- Recent sessions
    jsonb_agg(
        jsonb_build_object(
            'session_id', dcs.id,
            'connected_at', dcs.connected_at,
            'disconnected_at', dcs.disconnected_at,
            'duration_seconds', dcs.total_duration_seconds,
            'pop_points', dcs.pop_points_earned,
            'ip_address', dcs.ip_address,
            'is_active', dcs.is_active
        )
        ORDER BY dcs.connected_at DESC
    ) FILTER (WHERE dcs.id IS NOT NULL) as recent_sessions

FROM devices d
LEFT JOIN device_connection_sessions dcs ON d.id = dcs.device_id
WHERE d.claimed_by IS NOT NULL
GROUP BY d.id;

-- Create view for session details with device context
CREATE OR REPLACE VIEW session_details_with_device AS
SELECT 
    dcs.id as session_id,
    dcs.session_key,
    dcs.connected_at,
    dcs.disconnected_at,
    dcs.last_heartbeat,
    dcs.is_active,
    dcs.total_duration_seconds,
    dcs.pop_points_earned,
    dcs.activities_count,
    dcs.charging_sessions_count,
    dcs.ip_address,
    dcs.user_agent,
    dcs.app_version,
    dcs.metadata as session_metadata,
    
    -- Device context
    d.id as device_id,
    d.device_fingerprint,
    d.detected_device_category,
    d.device_type,
    d.browser,
    d.os,
    d.screen_info,
    d.claimed_by as user_id,
    
    -- PoP events for this session
    COALESCE(
        (SELECT COUNT(*) 
         FROM pop_events_ledger 
         WHERE session_id = dcs.id),
        0
    ) as pop_events_count,
    
    COALESCE(
        (SELECT SUM(pop_points) 
         FROM pop_events_ledger 
         WHERE session_id = dcs.id),
        0
    ) as pop_points_validated

FROM device_connection_sessions dcs
LEFT JOIN devices d ON dcs.device_id = d.id;

-- Function to aggregate session PoP points
CREATE OR REPLACE FUNCTION update_session_pop_points()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the session's pop_points_earned when a pop event is created
    IF TG_OP = 'INSERT' THEN
        UPDATE device_connection_sessions
        SET pop_points_earned = COALESCE(pop_points_earned, 0) + NEW.pop_points
        WHERE id = NEW.session_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_session_pop_points ON pop_events_ledger;
CREATE TRIGGER trigger_update_session_pop_points
    AFTER INSERT ON pop_events_ledger
    FOR EACH ROW
    WHEN (NEW.session_id IS NOT NULL)
    EXECUTE FUNCTION update_session_pop_points();

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_devices_claimed_by ON devices(claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devices_category ON devices(detected_device_category);
CREATE INDEX IF NOT EXISTS idx_device_sessions_device_id ON device_connection_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_is_active ON device_connection_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pop_events_session_id ON pop_events_ledger(session_id) WHERE session_id IS NOT NULL;

-- Create function to get user's device and session summary
CREATE OR REPLACE FUNCTION get_user_devices_and_sessions(p_user_id UUID)
RETURNS TABLE (
    -- Device info
    device_id UUID,
    device_category TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    
    -- Session stats
    total_sessions BIGINT,
    active_sessions BIGINT,
    total_duration_hours NUMERIC,
    
    -- PoP stats
    total_pop_points NUMERIC,
    
    -- Recent sessions
    recent_sessions JSONB,
    
    -- IP addresses
    ip_addresses JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.device_id,
        d.detected_device_category,
        d.device_type,
        d.browser,
        d.os,
        d.first_seen_at,
        d.last_seen_at,
        d.total_sessions,
        d.active_sessions,
        ROUND(d.total_duration_seconds::numeric / 3600, 2) as total_duration_hours,
        d.total_pop_points_validated,
        d.recent_sessions,
        d.ip_addresses_used
    FROM user_claimed_devices_with_sessions d
    WHERE d.user_id = p_user_id
    ORDER BY d.last_seen_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON user_claimed_devices_with_sessions TO authenticated, anon;
GRANT SELECT ON session_details_with_device TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_user_devices_and_sessions TO authenticated, anon;

-- Add comments
COMMENT ON VIEW user_claimed_devices_with_sessions IS 'User-claimed devices with aggregated session and PoP statistics';
COMMENT ON VIEW session_details_with_device IS 'Individual sessions with full device context';
COMMENT ON FUNCTION detect_device_category IS 'Automatically categorize device from user agent string';
COMMENT ON FUNCTION get_user_devices_and_sessions IS 'Get comprehensive device and session summary for a user';
COMMENT ON COLUMN devices.detected_device_category IS 'Auto-detected category: mobile, tablet, laptop, desktop, unknown';
COMMENT ON COLUMN devices.screen_info IS 'Screen dimensions and orientation for device classification';
COMMENT ON COLUMN device_connection_sessions.pop_points_earned IS 'Total PoP points earned during this session';
COMMENT ON COLUMN device_connection_sessions.activities_count IS 'Number of activities performed in this session';

-- Migration complete
SELECT 'Session & Device restructure migration completed successfully' as status;
