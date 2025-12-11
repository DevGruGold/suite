-- Add missing battery_level_current column to device_connection_sessions
ALTER TABLE device_connection_sessions 
ADD COLUMN IF NOT EXISTS battery_level_current INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN device_connection_sessions.battery_level_current 
IS 'Current battery level during active session, updated on each heartbeat';

-- Clean up stale sessions (heartbeat older than 1 hour)
UPDATE device_connection_sessions 
SET is_active = false, 
    disconnected_at = last_heartbeat
WHERE is_active = true 
  AND last_heartbeat < NOW() - INTERVAL '1 hour';