-- Add description column to event_actions if missing, then insert event triggers
ALTER TABLE event_actions ADD COLUMN IF NOT EXISTS description TEXT;

-- Insert event actions for GitHub-triggered workflows
INSERT INTO event_actions (event_pattern, priority, actions, conditions, is_active, description) VALUES
-- Trigger automated testing pipeline on PR creation/update
(
  'github:pull_request:*',
  8,
  '[{"type": "call_function", "target": "workflow-template-manager", "params": {"action": "execute_template", "data": {"template_name": "automated_testing_pipeline", "params": {"pr_number": "{{pull_request.number}}", "repo": "{{repository.name}}", "branch": "{{pull_request.head.ref}}"}}}}]'::jsonb,
  '{"action_matches": ["opened", "synchronize"]}'::jsonb,
  true,
  'Trigger automated testing pipeline on PR events'
),
-- Trigger contributor onboarding for first-time contributors
(
  'github:pull_request:opened',
  7,
  '[{"type": "call_function", "target": "workflow-template-manager", "params": {"action": "execute_template", "data": {"template_name": "contributor_onboarding_workflow", "params": {"github_username": "{{pull_request.user.login}}", "pr_number": "{{pull_request.number}}", "repo": "{{repository.name}}"}}}}]'::jsonb,
  '{"author_association_matches": ["FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER"]}'::jsonb,
  true,
  'Onboard first-time contributors automatically'
),
-- Trigger feature development pipeline for feature-request issues
(
  'github:issues:labeled',
  6,
  '[{"type": "call_function", "target": "workflow-template-manager", "params": {"action": "execute_template", "data": {"template_name": "feature_development_pipeline", "params": {"issue_number": "{{issue.number}}", "title": "{{issue.title}}", "body": "{{issue.body}}"}}}}]'::jsonb,
  '{"label_matches": ["feature-request", "enhancement"]}'::jsonb,
  true,
  'Start feature development pipeline when issue labeled as feature-request'
),
-- Trigger microservice creation for service-request issues
(
  'github:issues:labeled',
  6,
  '[{"type": "call_function", "target": "workflow-template-manager", "params": {"action": "execute_template", "data": {"template_name": "create_new_microservice", "params": {"issue_number": "{{issue.number}}", "title": "{{issue.title}}", "requirements": "{{issue.body}}"}}}}]'::jsonb,
  '{"label_matches": ["new-service", "microservice"]}'::jsonb,
  true,
  'Start microservice creation when issue labeled as new-service'
)
ON CONFLICT DO NOTHING;

-- Log activation activity
INSERT INTO eliza_activity_log (
  activity_type,
  title,
  description,
  status,
  metadata
) VALUES (
  'workflow_activation',
  '🚀 Workflow Templates Activated',
  'Created 6 cron jobs for periodic workflows and 4 event-based triggers. All 10 new workflow templates are now operational.',
  'completed',
  jsonb_build_object(
    'cron_jobs', jsonb_build_array(
      'workflow-performance-optimization (every 6h)',
      'workflow-code-quality-audit (daily 3am)',
      'workflow-database-optimization (weekly Sun 2am)',
      'workflow-documentation-generation (weekly Fri 5pm)',
      'workflow-knowledge-expansion (every 12h)',
      'workflow-dao-governance (every 30min)'
    ),
    'event_triggers', jsonb_build_array(
      'github:pull_request:* → automated_testing_pipeline',
      'github:pull_request:opened (first-time) → contributor_onboarding_workflow',
      'github:issues:labeled (feature-request) → feature_development_pipeline',
      'github:issues:labeled (new-service) → create_new_microservice'
    )
  )
);