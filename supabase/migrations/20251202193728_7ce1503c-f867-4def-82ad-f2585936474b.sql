-- Phase 1: Reconcile - Reset workload for agents with no active tasks (with proper enum cast)
UPDATE agents 
SET current_workload = 0, 
    status = 'IDLE'::agent_status,
    updated_at = NOW()
WHERE id IN (
  SELECT a.id
  FROM agents a
  LEFT JOIN tasks t ON t.assignee_agent_id = a.id 
    AND t.status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED')
  GROUP BY a.id
  HAVING COUNT(t.id) = 0
);

-- Phase 1b: Set correct workload for agents WITH active tasks
UPDATE agents a
SET current_workload = task_counts.active_count,
    status = CASE WHEN task_counts.active_count > 0 THEN 'BUSY'::agent_status ELSE 'IDLE'::agent_status END,
    updated_at = NOW()
FROM (
  SELECT assignee_agent_id, 
         COUNT(*) as active_count
  FROM tasks 
  WHERE status IN ('PENDING', 'IN_PROGRESS', 'CLAIMED')
  AND assignee_agent_id IS NOT NULL
  GROUP BY assignee_agent_id
) task_counts
WHERE a.id = task_counts.assignee_agent_id;