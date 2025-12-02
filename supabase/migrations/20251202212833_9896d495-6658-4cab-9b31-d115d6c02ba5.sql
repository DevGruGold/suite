-- Create eliza_decision_reports table for detailed decision history
CREATE TABLE IF NOT EXISTS public.eliza_decision_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES edge_function_proposals(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decision_method text NOT NULL CHECK (decision_method IN ('executive_consensus', 'executive_rejection', 'community_supermajority', 'weighted_score', 'tie_breaker')),
  reasoning text NOT NULL,
  executive_votes jsonb DEFAULT '{}',
  community_votes jsonb DEFAULT '{}',
  weighted_score_approve numeric DEFAULT 0,
  weighted_score_reject numeric DEFAULT 0,
  total_executive_votes int DEFAULT 0,
  total_community_votes int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.eliza_decision_reports ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Anyone can view decision reports"
  ON public.eliza_decision_reports FOR SELECT
  USING (true);

-- Create index for proposal lookups
CREATE INDEX idx_eliza_decision_reports_proposal ON public.eliza_decision_reports(proposal_id);
CREATE INDEX idx_eliza_decision_reports_created ON public.eliza_decision_reports(created_at DESC);