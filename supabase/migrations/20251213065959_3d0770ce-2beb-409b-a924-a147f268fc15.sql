-- Remove redundant system-health cron jobs (keeping only config.toml schedule)
SELECT cron.unschedule('hourly-system-health-check_appdb');
SELECT cron.unschedule('system-performance-hourly-snapshot_appdb');
SELECT cron.unschedule('system_health_10m_appdb');

-- Remove redundant system-status cron jobs
SELECT cron.unschedule('system_status_10m_appdb');
SELECT cron.unschedule('oneoff_system_status_test');