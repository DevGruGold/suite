-- ====================================================================
-- EXECUTION CONTEXT AWARENESS SYSTEM
-- Unified tracking of cron jobs across Supabase, pg_cron, GitHub Actions, Vercel
-- ====================================================================

-- Phase 1: Add execution_source column to eliza_function_usage
ALTER TABLE eliza_function_usage 
ADD COLUMN IF NOT EXISTS execution_source TEXT DEFAULT 'api';

COMMENT ON COLUMN eliza_function_usage.execution_source IS 
  'Platform that initiated this execution: supabase_native, pg_cron, github_actions, vercel_cron, api, tool_call';

-- Create index for querying by execution source
CREATE INDEX IF NOT EXISTS idx_eliza_function_usage_execution_source 
ON eliza_function_usage(execution_source);

-- Phase 2: Create unified cron_registry table
CREATE TABLE IF NOT EXISTS cron_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL UNIQUE,
  function_name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('supabase_native', 'pg_cron', 'github_actions', 'vercel_cron')),
  schedule TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_status TEXT CHECK (last_status IN ('success', 'failed', 'timeout', 'pending')),
  run_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_execution_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Platform-specific identifiers
  pg_cron_jobid INTEGER,
  github_workflow_file TEXT,
  vercel_config_path TEXT,
  
  -- Metadata
  description TEXT,
  owner_agent TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cron_registry_platform ON cron_registry(platform);
CREATE INDEX IF NOT EXISTS idx_cron_registry_function ON cron_registry(function_name);
CREATE INDEX IF NOT EXISTS idx_cron_registry_active ON cron_registry(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cron_registry_last_run ON cron_registry(last_run_at DESC);

-- Enable RLS
ALTER TABLE cron_registry ENABLE ROW LEVEL SECURITY;

-- Public read access for agents
CREATE POLICY "Allow public read access to cron_registry"
ON cron_registry FOR SELECT
USING (true);

-- Service role can manage
CREATE POLICY "Service role can manage cron_registry"
ON cron_registry FOR ALL
USING (true)
WITH CHECK (true);

-- Phase 3: Seed with existing Supabase Native schedulers
INSERT INTO cron_registry (job_name, function_name, platform, schedule, payload, description) VALUES
-- Core system functions
('vectorize-memory-native', 'vectorize-memory', 'supabase_native', '3,13,23,33,43,53 * * * *', '{}', 'Batch pending memory vectorizations'),
('predictive-analytics-native', 'predictive-analytics', 'supabase_native', '9 * * * *', '{"action":"analyze_current","data_source":"tasks"}', 'Hourly predictive analytics'),
('summarize-conversation-native', 'summarize-conversation', 'supabase_native', '8,23,38,53 * * * *', '{}', 'Summarize active conversations'),
('extract-knowledge-native', 'extract-knowledge', 'supabase_native', '4,24,44 * * * *', '{}', 'Extract knowledge entities'),
('monitor-device-connections-native', 'monitor-device-connections', 'supabase_native', '6,16,26,36,46,56 * * * *', '{}', 'Monitor XMRT charger devices'),
('aggregate-device-metrics-native', 'aggregate-device-metrics', 'supabase_native', '12 * * * *', '{}', 'Aggregate device metrics hourly'),

-- SuperDuper agents
('superduper-router-native', 'superduper-router', 'supabase_native', '0 2 * * *', '{"action":"route"}', 'Daily SuperDuper routing'),
('superduper-business-growth-native', 'superduper-business-growth', 'supabase_native', '15 */4 * * *', '{"action":"analyze"}', 'Business growth analysis'),
('superduper-research-intelligence-native', 'superduper-research-intelligence', 'supabase_native', '18 * * * *', '{"action":"research"}', 'Research intelligence hourly'),
('superduper-content-media-native', 'superduper-content-media', 'supabase_native', '0 7,19 * * *', '{"action":"produce"}', 'Content production morning/evening'),
('superduper-communication-outreach-native', 'superduper-communication-outreach', 'supabase_native', '22 */6 * * *', '{"action":"outreach"}', 'Communication outreach every 6h'),
('superduper-design-brand-native', 'superduper-design-brand', 'supabase_native', '0 5 * * *', '{"action":"design"}', 'Daily design/brand work'),
('superduper-finance-investment-native', 'superduper-finance-investment', 'supabase_native', '0 6 * * *', '{"action":"analyze"}', 'Daily finance analysis'),
('superduper-domain-experts-native', 'superduper-domain-experts', 'supabase_native', '30 8 * * 1-5', '{"action":"consult"}', 'Weekday domain expert consultation'),
('superduper-development-coach-native', 'superduper-development-coach', 'supabase_native', '0 9 * * 1-5', '{"action":"coach"}', 'Weekday development coaching'),
('superduper-integration-native', 'superduper-integration', 'supabase_native', '25 */2 * * *', '{"action":"integrate"}', 'Integration checks every 2h')
ON CONFLICT (job_name) DO NOTHING;

-- Phase 4: Seed GitHub Actions workflows
INSERT INTO cron_registry (job_name, function_name, platform, schedule, payload, github_workflow_file, description) VALUES
('cyclical-workflow-creation', 'n8n-workflow-generator', 'github_actions', '0 */8 * * *', '{}', '.github/workflows/cyclical-workflow-creation.yml', 'Generate N8N workflows'),
('gemini-agent-deployment', 'gemini-agent-creator', 'github_actions', '30 */12 * * *', '{}', '.github/workflows/gemini-agent-deployment.yml', 'Deploy Gemini agents'),
('miner-tracking', 'mining-proxy', 'github_actions', '0 */6 * * *', '{}', '.github/workflows/miner-tracking.yml', 'Track mining activity'),
('performance-monitor', 'system-health', 'github_actions', '*/15 * * * *', '{}', '.github/workflows/performance-monitor.yml', 'Monitor system performance'),
('dependency-update', 'system-status', 'github_actions', '0 3 * * 0', '{}', '.github/workflows/dependency-update.yml', 'Weekly dependency updates'),
('code-quality', 'autonomous-code-fixer', 'github_actions', '0 4 * * *', '{}', '.github/workflows/code-quality.yml', 'Daily code quality checks')
ON CONFLICT (job_name) DO NOTHING;

-- Phase 5: Create function to update cron registry on execution
CREATE OR REPLACE FUNCTION update_cron_registry_on_execution()
RETURNS TRIGGER AS $$
BEGIN
  -- Update matching cron registry entry
  UPDATE cron_registry
  SET 
    last_run_at = NOW(),
    last_status = CASE WHEN NEW.success THEN 'success' ELSE 'failed' END,
    run_count = run_count + 1,
    failure_count = failure_count + CASE WHEN NEW.success THEN 0 ELSE 1 END,
    avg_execution_ms = COALESCE(
      (avg_execution_ms * run_count + NEW.execution_time_ms) / (run_count + 1),
      NEW.execution_time_ms
    ),
    updated_at = NOW()
  WHERE function_name = NEW.function_name
    AND platform = NEW.execution_source
    AND is_active = true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update cron_registry
DROP TRIGGER IF EXISTS trg_update_cron_registry ON eliza_function_usage;
CREATE TRIGGER trg_update_cron_registry
AFTER INSERT ON eliza_function_usage
FOR EACH ROW
WHEN (NEW.execution_source IN ('supabase_native', 'pg_cron', 'github_actions', 'vercel_cron'))
EXECUTE FUNCTION update_cron_registry_on_execution();