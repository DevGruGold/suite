-- Disable redundant pg_cron jobs that are now handled by native Supabase schedulers
-- These jobs use util.invoke_edge() which times out, but native schedulers work correctly

-- SuperDuper Agent Jobs (replaced by native schedulers in config.toml)
SELECT cron.unschedule(107); -- superduper_router_daily
SELECT cron.unschedule(108); -- superduper_business_growth_q4h
SELECT cron.unschedule(109); -- superduper_research_intel_hourly
SELECT cron.unschedule(110); -- superduper_content_media_morning
SELECT cron.unschedule(111); -- superduper_content_media_evening
SELECT cron.unschedule(112); -- superduper_outreach_q6h
SELECT cron.unschedule(113); -- superduper_design_brand_daily
SELECT cron.unschedule(114); -- superduper_finance_daily
SELECT cron.unschedule(115); -- superduper_domain_experts_weekdays
SELECT cron.unschedule(116); -- superduper_dev_coach_workhours
SELECT cron.unschedule(117); -- superduper_integration_q2h

-- Memory & Knowledge Jobs (replaced by native schedulers)
SELECT cron.unschedule(121); -- summarize_conversation_15m
SELECT cron.unschedule(122); -- vectorize_memory_10m
SELECT cron.unschedule(123); -- extract_knowledge_20m
SELECT cron.unschedule(124); -- predictive_analytics_hourly
SELECT cron.unschedule(125); -- aggregate_device_metrics_hourly
SELECT cron.unschedule(126); -- monitor_device_connections_10m

-- System Jobs (replaced by native schedulers)
SELECT cron.unschedule(146); -- system-knowledge-builder
SELECT cron.unschedule(147); -- eliza-self-evaluation
SELECT cron.unschedule(148); -- daily-opportunity-report
SELECT cron.unschedule(155); -- generate-tasks-from-sources
SELECT cron.unschedule(156); -- evaluate-community-ideas
SELECT cron.unschedule(157); -- trigger-executive-voting
SELECT cron.unschedule(158); -- governance-phase-transitions
SELECT cron.unschedule(159); -- governance-final-count

-- Update cron_registry to reflect these jobs are now disabled on pg_cron platform
UPDATE cron_registry 
SET is_active = false, 
    updated_at = NOW()
WHERE platform = 'pg_cron' 
AND pg_cron_jobid IN (107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 121, 122, 123, 124, 125, 126, 146, 147, 148, 155, 156, 157, 158, 159);