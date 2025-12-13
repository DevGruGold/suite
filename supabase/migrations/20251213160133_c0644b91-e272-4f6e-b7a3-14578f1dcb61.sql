-- Update stalled CLAIMED tasks to IN_PROGRESS with correct progress
UPDATE tasks 
SET 
  progress_percentage = 100, 
  status = 'IN_PROGRESS',
  updated_at = NOW()
WHERE status = 'CLAIMED' 
  AND stage_started_at IS NOT NULL 
  AND EXTRACT(EPOCH FROM (NOW() - stage_started_at)) / 3600 >= COALESCE(auto_advance_threshold_hours, 4);

-- Log activity for fixed tasks
INSERT INTO eliza_activity_log (activity_type, title, description, status, metadata)
SELECT 
  'task_unstalled',
  'Task Unstalled: ' || title,
  'Updated stalled CLAIMED task to IN_PROGRESS with 100% progress',
  'completed',
  jsonb_build_object('task_id', id, 'stage', stage, 'fix_type', 'claimed_status_fix')
FROM tasks 
WHERE status = 'IN_PROGRESS' 
  AND progress_percentage = 100 
  AND updated_at > NOW() - INTERVAL '1 minute';