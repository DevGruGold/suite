-- Complete the Hermes task and reset agent to clean slate

-- Mark task as completed
UPDATE tasks 
SET status = 'COMPLETED', 
    stage = 'INTEGRATE',
    progress_percentage = 100,
    updated_at = now()
WHERE id = 'task-1764632145804-2ajkoc3';

-- Reset Hermes to IDLE
UPDATE agents 
SET status = 'IDLE', 
    current_workload = 0,
    updated_at = now()
WHERE id = '9c8ded9f-3a96-4f22-8e1b-785675ee225e';

-- Log completion activity
INSERT INTO eliza_activity_log (
  activity_type, title, description, status, task_id, agent_id, metadata
) VALUES (
  'task_completed',
  'Task Completed: Create Function Discovery Dashboard',
  'Campaign task completed and moved to INTEGRATE stage. Hermes agent released.',
  'completed',
  'task-1764632145804-2ajkoc3',
  '9c8ded9f-3a96-4f22-8e1b-785675ee225e',
  '{"completed_by": "manual_cleanup", "reason": "user_requested_clean_slate"}'::jsonb
);