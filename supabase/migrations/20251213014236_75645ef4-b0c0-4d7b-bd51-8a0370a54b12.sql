-- Fix progress_percentage for the two active tasks
UPDATE tasks SET 
  progress_percentage = 20
WHERE id = 'task-81aaf088-4190-4ead-86db-9e60344bd264';

UPDATE tasks SET 
  progress_percentage = 40
WHERE id = 'task-a01dc3ee-9616-471b-8bc1-9fe43383a352';