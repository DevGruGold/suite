-- Add progress tracking columns to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage_started_at timestamptz DEFAULT now();
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_advance_threshold_hours numeric DEFAULT 4;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_percentage integer DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_agent_notified_at timestamptz;

-- Create function to update stage_started_at when stage changes
CREATE OR REPLACE FUNCTION update_task_stage_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- If stage changed, reset stage timer
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    NEW.stage_started_at := now();
    NEW.progress_percentage := 0;
    NEW.last_agent_notified_at := NULL;
  END IF;
  
  -- Calculate progress based on time in stage
  IF NEW.stage_started_at IS NOT NULL AND NEW.auto_advance_threshold_hours > 0 THEN
    NEW.progress_percentage := LEAST(100, FLOOR(
      EXTRACT(EPOCH FROM (now() - NEW.stage_started_at)) / 3600 / NEW.auto_advance_threshold_hours * 100
    )::integer);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for stage progress tracking
DROP TRIGGER IF EXISTS task_stage_progress_trigger ON tasks;
CREATE TRIGGER task_stage_progress_trigger
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_task_stage_progress();

-- Set default thresholds per stage type
COMMENT ON COLUMN tasks.auto_advance_threshold_hours IS 'Default thresholds: DISCUSS=2h, PLAN=4h, EXECUTE=8h, VERIFY=2h, INTEGRATE=4h';

-- Initialize existing tasks with stage_started_at
UPDATE tasks SET stage_started_at = updated_at WHERE stage_started_at IS NULL;