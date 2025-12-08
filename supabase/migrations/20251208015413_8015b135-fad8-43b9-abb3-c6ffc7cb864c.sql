-- Add event actions for GitHub contribution ingestion
INSERT INTO event_actions (event_pattern, actions, priority, is_active, description)
VALUES 
  ('github:push:*', 
   '[{"type":"call_function","target":"ingest-github-contribution","params":{"contribution_type":"commit"}}]'::jsonb, 
   5, true, 
   'Ingest commits from push events'),
  ('github:pull_request:closed', 
   '[{"type":"call_function","target":"ingest-github-contribution","params":{"contribution_type":"pr"}}]'::jsonb, 
   6, true, 
   'Ingest merged/closed pull requests'),
  ('github:issues:closed', 
   '[{"type":"call_function","target":"ingest-github-contribution","params":{"contribution_type":"issue"}}]'::jsonb, 
   5, true, 
   'Ingest closed issues'),
  ('github:discussion:created', 
   '[{"type":"call_function","target":"ingest-github-contribution","params":{"contribution_type":"discussion"}}]'::jsonb, 
   4, true, 
   'Ingest new discussions')
ON CONFLICT DO NOTHING;

-- Ensure github_contributors has last_contribution_at column
ALTER TABLE github_contributors 
ADD COLUMN IF NOT EXISTS last_contribution_at TIMESTAMPTZ;

-- Add index for faster contribution lookups
CREATE INDEX IF NOT EXISTS idx_github_contributions_username_validated 
ON github_contributions(github_username, is_validated);