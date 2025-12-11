-- Fix the trigger function that has an invalid default category
CREATE OR REPLACE FUNCTION log_task_activity()
RETURNS TRIGGER AS $$
DECLARE
  activity_desc TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    activity_desc := 'Category: ' || COALESCE(NEW.category::text, 'other') || ', Stage: ' || COALESCE(NEW.stage, 'DISCUSS');
    
    INSERT INTO eliza_activity_log (activity_type, description, agent_id, task_id, metadata)
    VALUES ('task_created', 'New task: ' || NEW.title || '. ' || activity_desc, NEW.assignee_agent_id, NEW.id, 
            jsonb_build_object('stage', NEW.stage, 'status', NEW.status, 'category', NEW.category));
  
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO eliza_activity_log (activity_type, description, agent_id, task_id, metadata)
      VALUES ('task_status_changed', 'Task "' || NEW.title || '" status: ' || OLD.status || ' → ' || NEW.status, 
              NEW.assignee_agent_id, NEW.id, 
              jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status, 'stage', NEW.stage));
    END IF;
    
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
      INSERT INTO eliza_activity_log (activity_type, description, agent_id, task_id, metadata)
      VALUES ('task_stage_changed', 'Task "' || NEW.title || '" moved: ' || OLD.stage || ' → ' || NEW.stage, 
              NEW.assignee_agent_id, NEW.id,
              jsonb_build_object('old_stage', OLD.stage, 'new_stage', NEW.stage, 'status', NEW.status));
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;