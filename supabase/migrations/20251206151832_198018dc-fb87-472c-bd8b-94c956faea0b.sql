-- ====================================================================
-- STAE Phase 2 & 3: Enhanced Task Automation Tables
-- ====================================================================

-- Add new columns to tasks table for checklist tracking and quality
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS 
  completed_checklist_items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS 
  quality_score INTEGER;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS 
  resolution_notes TEXT;

-- Create task_blocker_resolutions table (task_id as TEXT to match tasks.id)
CREATE TABLE IF NOT EXISTS public.task_blocker_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  blocker_type TEXT NOT NULL,
  original_reason TEXT,
  resolution_action TEXT,
  resolved_automatically BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ DEFAULT now(),
  resolver_agent_id TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_task_blocker_resolutions_task 
  ON public.task_blocker_resolutions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_blocker_resolutions_type 
  ON public.task_blocker_resolutions(blocker_type);
CREATE INDEX IF NOT EXISTS idx_tasks_quality_score 
  ON public.tasks(quality_score) WHERE quality_score IS NOT NULL;

-- Enable RLS
ALTER TABLE public.task_blocker_resolutions ENABLE ROW LEVEL SECURITY;

-- RLS policies for task_blocker_resolutions
CREATE POLICY "Anyone can read blocker resolutions"
  ON public.task_blocker_resolutions FOR SELECT USING (true);

CREATE POLICY "Service role can manage blocker resolutions"
  ON public.task_blocker_resolutions FOR ALL USING (true) WITH CHECK (true);