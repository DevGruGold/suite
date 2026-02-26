-- Add metadata column to device_events for bridge result reporting
ALTER TABLE public.device_events
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
-- Index for polling unprocessed events efficiently
CREATE INDEX IF NOT EXISTS idx_device_events_metadata_null ON public.device_events (device_id, created_at)
WHERE metadata IS NULL;