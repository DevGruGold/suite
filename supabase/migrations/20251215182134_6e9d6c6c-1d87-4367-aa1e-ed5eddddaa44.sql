-- Repair tasks that lost their checklists by adding default checklists
UPDATE tasks 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}')::jsonb,
  '{checklist}',
  '["Analyze requirements", "Plan approach", "Execute implementation", "Verify results", "Document completion"]'::jsonb
)
WHERE (metadata->>'checklist' IS NULL OR metadata->'checklist' = 'null'::jsonb OR jsonb_array_length(COALESCE(metadata->'checklist', '[]'::jsonb)) = 0)
AND status IN ('PENDING', 'CLAIMED', 'IN_PROGRESS');

-- Reset progress to 0 for tasks with empty completed_checklist_items
UPDATE tasks
SET progress_percentage = 0
WHERE (metadata->>'completed_checklist_items' IS NULL OR jsonb_array_length(COALESCE(metadata->'completed_checklist_items', '[]'::jsonb)) = 0)
AND progress_percentage > 0
AND status IN ('PENDING', 'CLAIMED', 'IN_PROGRESS');