-- Consolidation of Cron Jobs for Suite Task Automation
-- This migration removes the fragmented, frequent checks and replaces them with 3 consolidated, high-level jobs.
-- It also ensures the Opportunity Scanner is correctly scheduled.

BEGIN;

-- 1. Remove old fragmented cron jobs if they exist
SELECT cron.unschedule('task-auto-advance-check');
SELECT cron.unschedule('auto-assign-tasks'); -- Old Orchestrator job
SELECT cron.unschedule('stae-smart-assign'); -- Old STAE specific job
SELECT cron.unschedule('stae-checklist-advance'); -- Old STAE specific job
SELECT cron.unschedule('stae-resolve-blockers'); -- Old STAE specific job
SELECT cron.unschedule('task-orchestrator-blocker-check'); -- Old Orchestrator job

-- 2. Schedule "Active Agent Work Cycle" (Every 5 minutes)
-- Invokes `task-auto-advance` with `run_all` action
-- Covers: Update Progress percentage based on checklists + Auto-advance time-based tasks
SELECT cron.schedule(
    'suite-active-work-cycle',
    '*/5 * * * *',
    $$
    select
      net.http_post(
          url:='https://dthjjnnpzbxqoeusyqsy.supabase.co/functions/v1/task-auto-advance',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.jwt.clam', true) || '"}',
          body:='{"action": "run_all"}'
      ) as request_id;
    $$
);

-- 3. Schedule "Task Orchestration Cycle" (Every 10 minutes)
-- Invokes `task-orchestrator` with `run_orchestration_cycle` action
-- Covers: Assign pending tasks to idle agents + Identify blocked tasks
SELECT cron.schedule(
    'suite-orchestration-cycle',
    '*/10 * * * *',
    $$
    select
      net.http_post(
          url:='https://dthjjnnpzbxqoeusyqsy.supabase.co/functions/v1/task-orchestrator',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.jwt.clam', true) || '"}',
          body:='{"action": "run_orchestration_cycle"}'
      ) as request_id;
    $$
);

-- 4. Schedule "Strategic Automation Engine Cycle" (Every 15 minutes)
-- Invokes `suite-task-automation-engine` with `run_all` action
-- Covers: Smart Assign (Batch) + Checklist Advance + Auto-Resolve Blockers
SELECT cron.schedule(
    'suite-strategic-cycle',
    '*/15 * * * *',
    $$
    select
      net.http_post(
          url:='https://dthjjnnpzbxqoeusyqsy.supabase.co/functions/v1/suite-task-automation-engine',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.jwt.clam', true) || '"}',
          body:='{"action": "run_all"}'
      ) as request_id;
    $$
);

-- 5. ENSURE Opportunity Scanner is scheduled (Hourly)
-- This was requested in Phase 3 as pending
SELECT cron.unschedule('opportunity-scanner-job'); -- Ensure no duplicate/old versions
SELECT cron.schedule(
    'opportunity-scanner-job',
    '0 * * * *',
    $$
    select
      net.http_post(
          url:='https://dthjjnnpzbxqoeusyqsy.supabase.co/functions/v1/opportunity-scanner',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.jwt.clam', true) || '"}',
          body:='{}'
      ) as request_id;
    $$
);

COMMIT;
