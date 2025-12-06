-- ====================================================================
-- SUITE TASK AUTOMATION ENGINE (STAE) - Task Templates Table
-- ====================================================================

-- Create task_templates table for standardized task creation
CREATE TABLE IF NOT EXISTS public.task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  template_name TEXT UNIQUE NOT NULL,
  description_template TEXT NOT NULL,
  default_stage TEXT DEFAULT 'PLAN',
  default_priority INTEGER DEFAULT 5 CHECK (default_priority >= 1 AND default_priority <= 10),
  required_skills JSONB DEFAULT '[]'::jsonb,
  checklist JSONB DEFAULT '[]'::jsonb,
  auto_advance_threshold_hours NUMERIC DEFAULT 4,
  estimated_duration_hours NUMERIC,
  is_active BOOLEAN DEFAULT true,
  times_used INTEGER DEFAULT 0,
  success_rate NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_task_templates_category ON public.task_templates(category);
CREATE INDEX IF NOT EXISTS idx_task_templates_active ON public.task_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_task_templates_name ON public.task_templates(template_name);

-- Add updated_at trigger
CREATE TRIGGER set_task_templates_updated_at
  BEFORE UPDATE ON public.task_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS (public read, authenticated write)
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

-- Allow public read access to templates
CREATE POLICY "Anyone can read task templates"
  ON public.task_templates
  FOR SELECT
  USING (true);

-- Allow service role to manage templates
CREATE POLICY "Service role can manage task templates"
  ON public.task_templates
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert 11 default task templates
INSERT INTO public.task_templates (category, template_name, description_template, required_skills, checklist, default_priority, default_stage, estimated_duration_hours) VALUES
-- Code templates (3)
('code', 'code_review', 'Review code changes for: {{title}}', '["github", "typescript"]', '["Review code quality", "Check tests pass", "Verify documentation updated", "Approve or request changes"]', 6, 'EXECUTE', 2),
('code', 'bug_fix', 'Fix bug: {{title}}', '["github", "typescript", "debugging"]', '["Reproduce issue", "Identify root cause", "Implement fix", "Add regression test", "Verify fix works"]', 7, 'PLAN', 4),
('code', 'feature_implementation', 'Implement feature: {{title}}', '["github", "typescript", "react"]', '["Design architecture", "Write implementation", "Add tests", "Update documentation", "Create PR"]', 6, 'DISCUSS', 8),

-- Infrastructure templates (2)
('infra', 'infrastructure_check', 'Infrastructure health check for: {{title}}', '["docker", "ci"]', '["Verify deployment config", "Run security scan", "Update documentation", "Test rollback procedure"]', 7, 'EXECUTE', 2),
('infra', 'deployment_pipeline', 'Set up deployment for: {{title}}', '["github-actions", "docker", "ci"]', '["Create Dockerfile", "Configure CI/CD", "Test pipeline", "Document deployment steps"]', 6, 'PLAN', 6),

-- Research template
('research', 'research_analysis', 'Research and analyze: {{title}}', '["analytics", "ai"]', '["Gather data sources", "Analyze patterns", "Generate insights", "Document findings", "Create recommendations"]', 5, 'DISCUSS', 4),

-- Governance template  
('governance', 'proposal_evaluation', 'Evaluate governance proposal: {{title}}', '["governance"]', '["Review proposal details", "Assess impact", "Gather executive opinions", "Vote or recommend", "Document decision"]', 8, 'DISCUSS', 3),

-- Operations templates (2)
('ops', 'operations_task', 'Operations task: {{title}}', '["docs", "git"]', '["Identify scope", "Execute task", "Verify completion", "Update logs"]', 5, 'PLAN', 2),
('ops', 'system_health_investigation', 'Investigate system health issue: {{title}}', '["analytics", "debugging"]', '["Check system-status", "Identify degraded components", "Diagnose root cause", "Implement fix", "Verify resolution"]', 9, 'EXECUTE', 3),

-- Mining template
('mining', 'mining_optimization', 'Optimize mining for: {{title}}', '["monero", "performance"]', '["Analyze current hashrate", "Identify bottlenecks", "Implement optimizations", "Monitor results"]', 6, 'PLAN', 4),

-- Device template
('device', 'device_integration', 'Integrate device: {{title}}', '["mobile-development", "pwa"]', '["Test device connection", "Verify battery monitoring", "Configure PoP rewards", "Document integration"]', 5, 'EXECUTE', 3)
ON CONFLICT (template_name) DO NOTHING;