-- Add COO to executive_feedback CHECK constraint
ALTER TABLE public.executive_feedback 
DROP CONSTRAINT IF EXISTS executive_feedback_executive_name_check;

ALTER TABLE public.executive_feedback 
ADD CONSTRAINT executive_feedback_executive_name_check 
CHECK (executive_name IN ('Eliza', 'CSO', 'CTO', 'CIO', 'CAO', 'COO'));

-- Update executive_votes constraint if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'executive_votes_executive_name_check' 
    AND table_name = 'executive_votes'
  ) THEN
    ALTER TABLE public.executive_votes 
    DROP CONSTRAINT executive_votes_executive_name_check;
    
    ALTER TABLE public.executive_votes 
    ADD CONSTRAINT executive_votes_executive_name_check 
    CHECK (executive_name IN ('CSO', 'CTO', 'CIO', 'CAO', 'COO', 'COMMUNITY'));
  END IF;
END $$;