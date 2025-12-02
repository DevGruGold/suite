-- Phase 3: Create test tasks
INSERT INTO tasks (id, title, description, category, stage, status, priority, repo)
VALUES 
  ('test-task-code-1733168200', 'Test: Code Review Verification', 'Automated test task to verify agent assignment pipeline for code tasks.', 'code', 'PLAN', 'PENDING', 5, 'XMRT-Ecosystem'),
  ('test-task-infra-1733168200', 'Test: Infrastructure Health Check', 'Automated test task to verify agent assignment pipeline for infra tasks.', 'infra', 'PLAN', 'PENDING', 6, 'XMRT-Ecosystem'),
  ('test-task-research-1733168200', 'Test: Ecosystem Research Analysis', 'Automated test task to verify agent assignment pipeline for research tasks.', 'research', 'PLAN', 'PENDING', 4, 'XMRT-Ecosystem');