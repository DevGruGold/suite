-- Create system-health-check cron job (every 10 minutes at offset :3 to avoid cluster)
SELECT cron.schedule(
  'system-health-check-10min',
  '3,13,23,33,43,53 * * * *',
  $$SELECT util.invoke_edge('system-status', '{"snapshot_type": "scheduled"}'::jsonb);$$
);