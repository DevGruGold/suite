-- Delete stale decision reports that don't match current proposal status
DELETE FROM eliza_decision_reports d
WHERE EXISTS (
  SELECT 1 FROM edge_function_proposals p 
  WHERE p.id = d.proposal_id 
  AND p.status != d.decision
);