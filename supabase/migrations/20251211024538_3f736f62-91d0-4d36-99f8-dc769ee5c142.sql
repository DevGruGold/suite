-- Unschedule the failing cron job by name
SELECT cron.unschedule('cleanup_zero_traffic_functions_daily');

-- Drop the orphaned database function that calls non-existent edge function
DROP FUNCTION IF EXISTS util.run_cleanup_zero_traffic_functions();