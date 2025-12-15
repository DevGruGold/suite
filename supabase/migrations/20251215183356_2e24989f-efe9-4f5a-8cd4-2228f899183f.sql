-- Add index for eliza_activity_log queries used by opportunity-scanner
CREATE INDEX IF NOT EXISTS idx_eliza_activity_status_created
ON eliza_activity_log (status, created_at DESC);

-- Add index for eliza_function_usage invoked_at queries (status column doesn't exist)
CREATE INDEX IF NOT EXISTS idx_eliza_function_usage_invoked
ON eliza_function_usage (invoked_at DESC);