-- Create actual pg_cron jobs for governance automation
-- These replace the config.toml entries which weren't creating real cron jobs

-- First, remove any existing governance cron jobs to avoid duplicates
SELECT cron.unschedule(jobname) 
FROM cron.job 
WHERE jobname IN ('trigger-executive-voting', 'governance-phase-transitions', 'governance-final-count');

-- Trigger executive votes for new proposals every 5 minutes
SELECT cron.schedule(
  'trigger-executive-voting',
  '*/5 * * * *',
  $$
  SELECT util.invoke_edge('governance-phase-manager', 'POST', '{"action": "trigger_executive_votes"}'::jsonb, false, 60000);
  $$
);

-- Check phase transitions every 10 minutes
SELECT cron.schedule(
  'governance-phase-transitions',
  '*/10 * * * *',
  $$
  SELECT util.invoke_edge('governance-phase-manager', 'POST', '{"action": "check_phase_transitions"}'::jsonb, false, 60000);
  $$
);

-- Finalize voting every 15 minutes
SELECT cron.schedule(
  'governance-final-count',
  '*/15 * * * *',
  $$
  SELECT util.invoke_edge('governance-phase-manager', 'POST', '{"action": "finalize_voting"}'::jsonb, false, 120000);
  $$
);

-- Immediately expire executive deadlines for stuck proposals to trigger Eliza's determination
-- These 9 proposals have been stuck with no executive votes - let Eliza decide using community votes
UPDATE edge_function_proposals
SET executive_deadline = now() - interval '1 minute'
WHERE status = 'voting' 
AND voting_phase = 'executive';