-- Add voting phase tracking columns to edge_function_proposals
ALTER TABLE edge_function_proposals 
ADD COLUMN IF NOT EXISTS voting_phase text DEFAULT 'executive' CHECK (voting_phase IN ('executive', 'community', 'final_count', 'closed')),
ADD COLUMN IF NOT EXISTS executive_deadline timestamptz,
ADD COLUMN IF NOT EXISTS community_deadline timestamptz,
ADD COLUMN IF NOT EXISTS voting_started_at timestamptz;

-- Create proposal_comments table for discussions and arguments
CREATE TABLE IF NOT EXISTS proposal_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES edge_function_proposals(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_session_key text,
  comment text NOT NULL,
  comment_type text DEFAULT 'argument' CHECK (comment_type IN ('argument', 'question', 'clarification', 'support', 'concern')),
  parent_comment_id uuid REFERENCES proposal_comments(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  upvotes int DEFAULT 0,
  downvotes int DEFAULT 0
);

-- Create indexes for proposal_comments
CREATE INDEX IF NOT EXISTS idx_proposal_comments_proposal ON proposal_comments(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_comments_created ON proposal_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_comments_parent ON proposal_comments(parent_comment_id);

-- Enable RLS on proposal_comments
ALTER TABLE proposal_comments ENABLE ROW LEVEL SECURITY;

-- RLS policies for proposal_comments
CREATE POLICY "Anyone can view proposal comments" ON proposal_comments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert proposal comments" ON proposal_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update comments" ON proposal_comments FOR UPDATE USING (true);
CREATE POLICY "Service role can delete comments" ON proposal_comments FOR DELETE USING (true);

-- Update the 9 stuck proposals to start voting immediately
UPDATE edge_function_proposals
SET 
  voting_phase = 'executive',
  voting_started_at = now(),
  executive_deadline = now() + interval '1 hour',
  community_deadline = now() + interval '25 hours'
WHERE status = 'voting' 
  AND (executive_deadline IS NULL OR voting_phase IS NULL);