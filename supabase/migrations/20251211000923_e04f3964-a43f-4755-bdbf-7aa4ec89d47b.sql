-- Insert 4 sample tasks across different pipeline stages
INSERT INTO tasks (id, title, description, stage, status, category, priority, assignee_agent_id, repo, created_at)
VALUES 
  ('task-sample-' || gen_random_uuid(), 'Review agent-manager auto-assign fix', 'Verify the ecosystem-monitor fix that routes auto_assign_tasks to task-orchestrator', 'VERIFY', 'IN_PROGRESS', 'code', 1, '966f387a-7c01-4555-9048-995a0311b283', 'xmrt-ecosystem', now()),
  ('task-sample-' || gen_random_uuid(), 'Implement XMRT token analytics dashboard', 'Create visual dashboard showing token metrics and distribution', 'PLAN', 'PENDING', 'code', 2, 'a22da441-f9f2-4b46-87c9-916c76ff0d4a', 'xmrt-ecosystem', now()),
  ('task-sample-' || gen_random_uuid(), 'Deploy ecosystem-monitor v2', 'Deploy the updated ecosystem-monitor with corrected function routing', 'EXECUTE', 'IN_PROGRESS', 'infra', 1, '9c8ded9f-3a96-4f22-8e1b-785675ee225e', 'xmrt-ecosystem', now()),
  ('task-sample-' || gen_random_uuid(), 'Document governance voting API', 'Write comprehensive API documentation for the governance voting system', 'DISCUSS', 'PENDING', 'governance', 3, 'agent-1764563951423', 'xmrt-ecosystem', now());

-- Update agent workloads to reflect assigned tasks
UPDATE agents SET current_workload = current_workload + 1, status = 'BUSY' 
WHERE id IN ('966f387a-7c01-4555-9048-995a0311b283', 'a22da441-f9f2-4b46-87c9-916c76ff0d4a', '9c8ded9f-3a96-4f22-8e1b-785675ee225e', 'agent-1764563951423');