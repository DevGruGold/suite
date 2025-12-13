-- Backfill existing active tasks with proper checklists and reset to appropriate stages

-- Task 1: NYE Party booking - CLAIMED means early stage, should be in PLAN not INTEGRATE
UPDATE tasks SET 
  stage = 'PLAN',
  progress_percentage = 20,
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{checklist}',
    '["Analyze requirements", "Research venues", "Contact potential clients", "Prepare proposal", "Finalize booking"]'::jsonb
  ),
  completed_checklist_items = '["Analyze requirements"]'::jsonb,
  stage_started_at = NOW(),
  updated_at = NOW()
WHERE id = 'task-81aaf088-4190-4ead-86db-9e60344bd264';

-- Task 2: XMRT Cash integration - CLAIMED for longer, mid-progress in EXECUTE
UPDATE tasks SET 
  stage = 'EXECUTE',
  progress_percentage = 40,
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{checklist}',
    '["Review treasury requirements", "Design integration architecture", "Implement dApp connection", "Test wallet functionality", "Deploy to production"]'::jsonb
  ),
  completed_checklist_items = '["Review treasury requirements", "Design integration architecture"]'::jsonb,
  stage_started_at = NOW(),
  updated_at = NOW()
WHERE id = 'task-a01dc3ee-9616-471b-8bc1-9fe43383a352';

-- Also backfill completed tasks with full checklists (mark all items complete)
UPDATE tasks SET
  completed_checklist_items = COALESCE(metadata->'checklist', '["Requirements analyzed", "Solution planned", "Work executed", "Results verified", "Integration complete"]'::jsonb)
WHERE status IN ('COMPLETED', 'DONE')
  AND (completed_checklist_items IS NULL OR completed_checklist_items = '[]'::jsonb)
  AND created_at > NOW() - INTERVAL '30 days';