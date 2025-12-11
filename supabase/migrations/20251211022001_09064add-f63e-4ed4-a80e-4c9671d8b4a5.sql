-- Add unique constraints for executive votes to prevent duplicates
-- Executive votes (where session_key IS NULL) should be unique per proposal+executive
CREATE UNIQUE INDEX IF NOT EXISTS executive_votes_unique_exec 
ON executive_votes (proposal_id, executive_name) 
WHERE session_key IS NULL;

-- Community votes (where executive_name = 'COMMUNITY') should be unique per proposal+session_key
CREATE UNIQUE INDEX IF NOT EXISTS executive_votes_unique_community 
ON executive_votes (proposal_id, session_key) 
WHERE executive_name = 'COMMUNITY' AND session_key IS NOT NULL;

-- Register missing STAE cron jobs for task automation using DO block
DO $$
BEGIN
  -- Delete existing jobs if they exist and recreate
  PERFORM cron.unschedule('stae-smart-assign');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'stae-smart-assign',
  '7,17,27,37,47,57 * * * *',
  $$SELECT net.http_post(
    url := (SELECT value FROM util.secrets WHERE key = 'functions_url') || '/suite-task-automation-engine',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT value FROM util.secrets WHERE key = 'service_role_key'), 'Content-Type', 'application/json'),
    body := '{"action":"smart_assign","data":{"auto_batch":true}}'::jsonb
  );$$
);

DO $$
BEGIN
  PERFORM cron.unschedule('stae-checklist-advance');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'stae-checklist-advance',
  '12,27,42,57 * * * *',
  $$SELECT net.http_post(
    url := (SELECT value FROM util.secrets WHERE key = 'functions_url') || '/suite-task-automation-engine',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT value FROM util.secrets WHERE key = 'service_role_key'), 'Content-Type', 'application/json'),
    body := '{"action":"checklist_based_advance"}'::jsonb
  );$$
);

DO $$
BEGIN
  PERFORM cron.unschedule('stae-auto-resolve');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'stae-auto-resolve',
  '18,48 * * * *',
  $$SELECT net.http_post(
    url := (SELECT value FROM util.secrets WHERE key = 'functions_url') || '/suite-task-automation-engine',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT value FROM util.secrets WHERE key = 'service_role_key'), 'Content-Type', 'application/json'),
    body := '{"action":"auto_resolve_blockers"}'::jsonb
  );$$
);

DO $$
BEGIN
  PERFORM cron.unschedule('task-progress-update');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'task-progress-update',
  '*/10 * * * *',
  $$SELECT net.http_post(
    url := (SELECT value FROM util.secrets WHERE key = 'functions_url') || '/task-auto-advance',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT value FROM util.secrets WHERE key = 'service_role_key'), 'Content-Type', 'application/json'),
    body := '{"action":"update_progress"}'::jsonb
  );$$
);

DO $$
BEGIN
  PERFORM cron.unschedule('task-auto-advance');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'task-auto-advance',
  '5,20,35,50 * * * *',
  $$SELECT net.http_post(
    url := (SELECT value FROM util.secrets WHERE key = 'functions_url') || '/task-auto-advance',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT value FROM util.secrets WHERE key = 'service_role_key'), 'Content-Type', 'application/json'),
    body := '{"action":"auto_advance"}'::jsonb
  );$$
);