-- Phase 1: Fix evaluate-community-ideas cron job (Job 145)
SELECT cron.alter_job(
  145,
  schedule := '*/30 * * * *',
  command := $$ SELECT util.invoke_edge('evaluate-community-idea', 'POST', '{"action": "evaluate_pending"}'::jsonb, false); $$
);

-- Phase 2: Fix util.run_cleanup_zero_traffic_functions() function
CREATE OR REPLACE FUNCTION util.run_cleanup_zero_traffic_functions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Use util.invoke_edge which properly handles secrets lookup
  PERFORM util.invoke_edge(
    'cleanup-zero-traffic-functions',
    'POST',
    jsonb_build_object(
      'slugs', jsonb_build_array(
        'multi-task-orchestrator',
        'python-executer',
        'multi-step-orchestrator',
        'multi-step-task-orchestrator',
        'xmrt-integration',
        'xmrt_integration'
      ),
      'dryRun', false,
      'days', 7
    ),
    false
  );
END;
$function$;

-- Phase 3: Create Agent-Task Sync Trigger
CREATE OR REPLACE FUNCTION public.sync_agent_status_on_task_change()
RETURNS TRIGGER AS $$
BEGIN
  -- When task is assigned/claimed/in_progress, set agent to BUSY
  IF NEW.status IN ('CLAIMED', 'IN_PROGRESS') AND NEW.assignee_agent_id IS NOT NULL THEN
    UPDATE agents 
    SET status = 'BUSY', 
        current_workload = COALESCE(current_workload, 0) + 1,
        updated_at = NOW()
    WHERE id = NEW.assignee_agent_id 
    AND status != 'BUSY';
  END IF;
  
  -- When task is completed/failed, check if agent has other active tasks
  IF NEW.status IN ('COMPLETED', 'FAILED') AND OLD.assignee_agent_id IS NOT NULL THEN
    -- Decrease workload
    UPDATE agents 
    SET current_workload = GREATEST(0, COALESCE(current_workload, 1) - 1),
        updated_at = NOW()
    WHERE id = OLD.assignee_agent_id;
    
    -- If no other active tasks, set to IDLE
    IF NOT EXISTS (
      SELECT 1 FROM tasks 
      WHERE assignee_agent_id = OLD.assignee_agent_id 
      AND status IN ('CLAIMED', 'IN_PROGRESS')
      AND id != NEW.id
    ) THEN
      UPDATE agents 
      SET status = 'IDLE', 
          updated_at = NOW()
      WHERE id = OLD.assignee_agent_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the triggers
DROP TRIGGER IF EXISTS trigger_sync_agent_status ON tasks;
CREATE TRIGGER trigger_sync_agent_status
AFTER UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION sync_agent_status_on_task_change();

DROP TRIGGER IF EXISTS trigger_sync_agent_status_insert ON tasks;
CREATE TRIGGER trigger_sync_agent_status_insert
AFTER INSERT ON tasks
FOR EACH ROW
WHEN (NEW.assignee_agent_id IS NOT NULL AND NEW.status IN ('CLAIMED', 'IN_PROGRESS'))
EXECUTE FUNCTION sync_agent_status_on_task_change();

-- Phase 4: Fix Existing Mismatched Data
-- Set agents with active tasks to BUSY
UPDATE agents a
SET status = 'BUSY', updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM tasks t 
  WHERE t.assignee_agent_id = a.id 
  AND t.status IN ('CLAIMED', 'IN_PROGRESS')
)
AND a.status = 'IDLE';

-- Set agents without active tasks to IDLE
UPDATE agents a
SET status = 'IDLE', updated_at = NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM tasks t 
  WHERE t.assignee_agent_id = a.id 
  AND t.status IN ('CLAIMED', 'IN_PROGRESS')
)
AND a.status = 'BUSY';

-- Phase 5: Add Agent Heartbeat Mechanism
CREATE OR REPLACE FUNCTION util.check_agent_heartbeats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stale_threshold INTERVAL := '5 minutes';
BEGIN
  -- Mark agents as stale if no heartbeat
  UPDATE agents
  SET status = 'IDLE',
      metadata = COALESCE(metadata, '{}'::jsonb) || '{"stale_detected": true}'::jsonb,
      updated_at = NOW()
  WHERE status = 'BUSY'
  AND last_seen < NOW() - stale_threshold
  AND NOT EXISTS (
    SELECT 1 FROM tasks t 
    WHERE t.assignee_agent_id = agents.id 
    AND t.status IN ('CLAIMED', 'IN_PROGRESS')
  );
  
  -- Log recovery action
  INSERT INTO eliza_activity_log (activity_type, description, status)
  SELECT 'heartbeat_check', 'Recovered stale agents', 'completed';
END;
$$;

-- Schedule heartbeat check every 5 minutes
SELECT cron.schedule(
  'agent-heartbeat-check',
  '*/5 * * * *',
  $$ SELECT util.check_agent_heartbeats(); $$
);