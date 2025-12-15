-- Auto-cleanup function for stale device sessions
-- Mark sessions as inactive if no heartbeat for 30 minutes
CREATE OR REPLACE FUNCTION cleanup_stale_device_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE device_connection_sessions
  SET 
    is_active = false, 
    disconnected_at = NOW(),
    total_duration_seconds = EXTRACT(EPOCH FROM (NOW() - connected_at))::INTEGER
  WHERE is_active = true 
    AND last_heartbeat < NOW() - INTERVAL '30 minutes';
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  -- Log if any sessions were cleaned up
  IF updated_count > 0 THEN
    INSERT INTO eliza_activity_log (
      activity_type,
      title,
      description,
      status,
      metadata
    ) VALUES (
      'device_cleanup',
      'Stale Device Sessions Cleanup',
      format('Marked %s stale sessions as inactive (no heartbeat for 30+ minutes)', updated_count),
      'completed',
      jsonb_build_object('cleaned_sessions', updated_count, 'timestamp', NOW())
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'cleaned_sessions', updated_count,
    'timestamp', NOW()
  );
END;
$$;

-- Create cron job to run cleanup every 15 minutes
SELECT cron.schedule(
  'cleanup-stale-device-sessions',
  '*/15 * * * *',
  $$SELECT cleanup_stale_device_sessions();$$
);