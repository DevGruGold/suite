-- Fix sync function with proper enum casts
CREATE OR REPLACE FUNCTION sync_agent_status_on_task_change()
RETURNS trigger AS $$
DECLARE
  active_task_count INTEGER;
  old_agent_task_count INTEGER;
BEGIN
  -- When a task is assigned or status changes
  IF NEW.assignee_agent_id IS NOT NULL THEN
    -- Count actual active tasks for this agent
    SELECT COUNT(*) INTO active_task_count
    FROM tasks
    WHERE assignee_agent_id = NEW.assignee_agent_id
    AND status IN ('CLAIMED', 'IN_PROGRESS', 'PENDING');
    
    -- Update agent with accurate count (with proper enum cast)
    UPDATE agents 
    SET current_workload = active_task_count,
        status = CASE WHEN active_task_count > 0 THEN 'BUSY'::agent_status ELSE 'IDLE'::agent_status END,
        updated_at = NOW()
    WHERE id = NEW.assignee_agent_id;
  END IF;
  
  -- Handle task reassignment (old agent loses the task)
  IF TG_OP = 'UPDATE' AND OLD.assignee_agent_id IS NOT NULL 
     AND OLD.assignee_agent_id IS DISTINCT FROM NEW.assignee_agent_id THEN
    SELECT COUNT(*) INTO old_agent_task_count
    FROM tasks
    WHERE assignee_agent_id = OLD.assignee_agent_id
    AND status IN ('CLAIMED', 'IN_PROGRESS', 'PENDING');
    
    UPDATE agents 
    SET current_workload = old_agent_task_count,
        status = CASE WHEN old_agent_task_count > 0 THEN 'BUSY'::agent_status ELSE 'IDLE'::agent_status END,
        updated_at = NOW()
    WHERE id = OLD.assignee_agent_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;