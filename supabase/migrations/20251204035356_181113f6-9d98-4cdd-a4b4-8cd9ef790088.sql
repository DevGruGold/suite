-- Create trigger for task activity logging (function already exists from previous migration)
DROP TRIGGER IF EXISTS trigger_log_task_activity ON tasks;
CREATE TRIGGER trigger_log_task_activity
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_task_activity();

-- Create trigger for agent activity logging (function already exists from previous migration)  
DROP TRIGGER IF EXISTS trigger_log_agent_activity ON agents;
CREATE TRIGGER trigger_log_agent_activity
  AFTER UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION log_agent_activity();