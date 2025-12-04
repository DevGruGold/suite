-- Add direct linking columns to eliza_activity_log
ALTER TABLE eliza_activity_log 
  ADD COLUMN IF NOT EXISTS task_id TEXT,
  ADD COLUMN IF NOT EXISTS agent_id TEXT;

-- Add indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_eliza_activity_task_id 
  ON eliza_activity_log(task_id) WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eliza_activity_agent_id 
  ON eliza_activity_log(agent_id) WHERE agent_id IS NOT NULL;

-- GIN index on metadata for health_score queries
CREATE INDEX IF NOT EXISTS idx_eliza_activity_metadata_gin 
  ON eliza_activity_log USING gin(metadata jsonb_path_ops);

-- Create Task Activity Logging Function
CREATE OR REPLACE FUNCTION log_task_activity()
RETURNS TRIGGER AS $$
DECLARE
  agent_name TEXT;
  activity_title TEXT;
  activity_desc TEXT;
  should_log BOOLEAN := FALSE;
BEGIN
  -- Get agent name if assigned
  IF NEW.assignee_agent_id IS NOT NULL THEN
    SELECT name INTO agent_name FROM agents WHERE id = NEW.assignee_agent_id;
  END IF;

  -- Determine activity based on operation
  IF TG_OP = 'INSERT' THEN
    activity_title := '📋 New Task: ' || LEFT(NEW.title, 50);
    activity_desc := 'Category: ' || COALESCE(NEW.category, 'general') || ', Stage: ' || COALESCE(NEW.stage, 'DISCUSS');
    IF NEW.assignee_agent_id IS NOT NULL THEN
      activity_desc := activity_desc || ', Assigned to: ' || COALESCE(agent_name, 'Unknown');
    END IF;
    should_log := TRUE;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Log assignment changes
    IF OLD.assignee_agent_id IS DISTINCT FROM NEW.assignee_agent_id AND NEW.assignee_agent_id IS NOT NULL THEN
      activity_title := '🤖 Task Assigned: ' || LEFT(NEW.title, 50);
      activity_desc := 'Assigned to ' || COALESCE(agent_name, 'Unknown');
      should_log := TRUE;
    -- Log status changes
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      activity_title := '📊 Task ' || NEW.status || ': ' || LEFT(NEW.title, 50);
      activity_desc := 'Changed from ' || OLD.status || ' to ' || NEW.status;
      should_log := TRUE;
    -- Log stage changes
    ELSIF OLD.stage IS DISTINCT FROM NEW.stage THEN
      activity_title := '⏩ Task Stage: ' || LEFT(NEW.title, 50);
      activity_desc := 'Moved from ' || COALESCE(OLD.stage, 'N/A') || ' to ' || NEW.stage;
      should_log := TRUE;
    END IF;
  END IF;

  -- Insert activity log entry if significant change
  IF should_log THEN
    INSERT INTO eliza_activity_log (
      activity_type, title, description, status, 
      task_id, agent_id, metadata
    ) VALUES (
      'task_update',
      activity_title,
      activity_desc,
      'completed',
      NEW.id,
      NEW.assignee_agent_id,
      jsonb_build_object(
        'task_status', NEW.status,
        'task_stage', NEW.stage,
        'task_category', NEW.category,
        'task_priority', NEW.priority,
        'operation', TG_OP
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach task trigger
DROP TRIGGER IF EXISTS trigger_log_task_activity ON tasks;
CREATE TRIGGER trigger_log_task_activity
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_task_activity();

-- Create Agent Activity Logging Function
CREATE OR REPLACE FUNCTION log_agent_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO eliza_activity_log (
      activity_type, title, description, status, 
      agent_id, metadata
    ) VALUES (
      'agent_status_change',
      CASE NEW.status::text
        WHEN 'BUSY' THEN '🔵 Agent Active: ' || NEW.name
        WHEN 'IDLE' THEN '🟢 Agent Available: ' || NEW.name
        WHEN 'ERROR' THEN '🔴 Agent Error: ' || NEW.name
        WHEN 'OFFLINE' THEN '⚫ Agent Offline: ' || NEW.name
        ELSE '📍 Agent Status: ' || NEW.name
      END,
      'Status changed from ' || OLD.status || ' to ' || NEW.status || 
      '. Workload: ' || COALESCE(NEW.current_workload, 0) || ' tasks',
      'completed',
      NEW.id,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'workload', COALESCE(NEW.current_workload, 0),
        'max_tasks', COALESCE(NEW.max_concurrent_tasks, 5)
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach agent trigger
DROP TRIGGER IF EXISTS trigger_log_agent_activity ON agents;
CREATE TRIGGER trigger_log_agent_activity
  AFTER UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION log_agent_activity();

-- Create unified activity view with task/agent context
CREATE OR REPLACE VIEW activity_with_context AS
SELECT 
  a.id,
  a.activity_type,
  a.title,
  a.description,
  a.status,
  a.task_id,
  a.agent_id,
  a.metadata,
  a.created_at,
  t.title as task_title,
  t.status as task_status,
  t.stage as task_stage,
  t.category as task_category,
  ag.name as agent_name,
  ag.status as agent_status,
  ag.current_workload as agent_workload
FROM eliza_activity_log a
LEFT JOIN tasks t ON a.task_id = t.id
LEFT JOIN agents ag ON a.agent_id = ag.id
ORDER BY a.created_at DESC;