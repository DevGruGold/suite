-- Create workflow_diagnostic_reports table for storing diagnostic results
CREATE TABLE IF NOT EXISTS public.workflow_diagnostic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL,
  diagnosis_id TEXT UNIQUE NOT NULL,
  executions_analyzed INTEGER DEFAULT 0,
  failure_rate NUMERIC(5,2) DEFAULT 0,
  primary_failure_point TEXT,
  root_cause_analysis JSONB DEFAULT '{}',
  recommended_actions JSONB DEFAULT '[]',
  affected_functions TEXT[] DEFAULT '{}',
  full_report TEXT,
  severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workflow_diagnostic_reports ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "workflow_diagnostic_reports_select_all" ON public.workflow_diagnostic_reports FOR SELECT USING (true);
CREATE POLICY "workflow_diagnostic_reports_insert_all" ON public.workflow_diagnostic_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "workflow_diagnostic_reports_update_all" ON public.workflow_diagnostic_reports FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "workflow_diagnostic_reports_delete_all" ON public.workflow_diagnostic_reports FOR DELETE USING (true);

-- Create indexes for efficient querying
CREATE INDEX idx_workflow_diagnostic_template ON public.workflow_diagnostic_reports(template_name);
CREATE INDEX idx_workflow_diagnostic_severity ON public.workflow_diagnostic_reports(severity);
CREATE INDEX idx_workflow_diagnostic_created ON public.workflow_diagnostic_reports(created_at DESC);

-- Insert the diagnose_workflow_failure template
INSERT INTO public.workflow_templates (template_name, category, description, estimated_duration_seconds, tags, steps)
VALUES (
  'diagnose_workflow_failure',
  'optimization',
  'Meta-workflow that diagnoses why another workflow is failing by analyzing execution history, error patterns, and edge function logs to generate actionable remediation recommendations',
  120,
  ARRAY['diagnostic', 'self-healing', 'meta-workflow', 'optimization', 'troubleshooting'],
  '[
    {
      "name": "Fetch Execution History",
      "type": "database",
      "table": "workflow_template_executions",
      "operation": "select",
      "filter": { "time_range": "7_days" },
      "filter_key": "template_name",
      "description": "Retrieve recent execution records for the target workflow"
    },
    {
      "name": "Calculate Failure Metrics",
      "type": "failure_calculation",
      "description": "Calculate failure rate, identify most common error messages, and determine the failing step"
    },
    {
      "name": "Extract Failing Functions",
      "type": "failure_calculation",
      "extraction_mode": "functions",
      "description": "Parse error messages to identify which edge functions are failing within the workflow"
    },
    {
      "name": "Fetch Edge Function Logs",
      "type": "log_retrieval",
      "time_window_hours": 168,
      "status_filter": "error",
      "include_stack_traces": true,
      "limit": 50,
      "description": "Get detailed logs for the failing edge function(s)"
    },
    {
      "name": "Fetch Template Definition",
      "type": "database",
      "table": "workflow_templates",
      "operation": "select",
      "filter_key": "template_name",
      "description": "Get the workflow template definition to understand step sequence"
    },
    {
      "name": "AI Root Cause Analysis",
      "type": "ai_analysis",
      "model": "deepseek-chat",
      "analysis_type": "root_cause",
      "description": "Analyze all collected data to identify the most probable root cause of failures. Consider: error patterns, function logs, step dependencies, data flow issues, configuration problems"
    },
    {
      "name": "Generate Remediation Recommendations",
      "type": "ai_generation",
      "model": "deepseek-chat",
      "generation_type": "remediation",
      "description": "Generate specific, actionable recommendations including: which function to fix, parameter adjustments needed, fallback strategies, and whether to trigger modify_edge_function or learn_from_failures templates"
    },
    {
      "name": "Assess Severity",
      "type": "severity_scoring",
      "description": "Calculate severity score based on failure rate, business impact, and error criticality",
      "criteria": [
        { "field": "failure_rate", "weight": 0.4, "threshold": 50 },
        { "field": "executions_affected", "weight": 0.3, "threshold": 10 },
        { "field": "is_revenue_workflow", "weight": 0.3, "boost": 20 }
      ]
    },
    {
      "name": "Generate Diagnostic Report",
      "type": "diagnostic_reporting",
      "output_table": "workflow_diagnostic_reports",
      "description": "Compile comprehensive diagnostic report with findings, root cause, and recommendations"
    },
    {
      "name": "Trigger Follow-up Decision",
      "type": "decision",
      "conditions": {
        "auto_fixable": "trigger_auto_fix_codebase",
        "requires_modification": "suggest_modify_edge_function",
        "learning_opportunity": "trigger_learn_from_failures",
        "manual_intervention_needed": "escalate_to_council"
      },
      "description": "Decide on the appropriate follow-up action based on diagnosis"
    },
    {
      "name": "Log Diagnostic Activity",
      "type": "database",
      "table": "eliza_activity_log",
      "operation": "insert",
      "description": "Record the diagnostic run for audit trail"
    },
    {
      "name": "Notify Stakeholders",
      "type": "notification",
      "channels": ["council", "system"],
      "conditional": "high_severity",
      "description": "Send diagnostic summary to relevant parties if severity is high or critical"
    }
  ]'::jsonb
)
ON CONFLICT (template_name) DO UPDATE SET
  steps = EXCLUDED.steps,
  description = EXCLUDED.description,
  tags = EXCLUDED.tags;