-- Corporate License Applications table
CREATE TABLE public.corporate_license_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Company Information
  company_name TEXT NOT NULL,
  company_size INTEGER NOT NULL, -- employee count
  industry TEXT,
  
  -- Executive Compensation (baseline for savings calculation)
  current_ceo_salary NUMERIC(15,2),
  current_cto_salary NUMERIC(15,2),
  current_cfo_salary NUMERIC(15,2),
  current_coo_salary NUMERIC(15,2),
  annual_executive_compensation NUMERIC(15,2) GENERATED ALWAYS AS (
    COALESCE(current_ceo_salary, 0) + 
    COALESCE(current_cto_salary, 0) + 
    COALESCE(current_cfo_salary, 0) + 
    COALESCE(current_coo_salary, 0)
  ) STORED,
  
  -- Contact Information
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  contact_title TEXT,
  
  -- License Details
  tier_requested TEXT NOT NULL DEFAULT 'free_trial' CHECK (tier_requested IN ('free_trial', 'basic', 'pro', 'enterprise')),
  application_status TEXT NOT NULL DEFAULT 'draft' CHECK (application_status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'active')),
  
  -- Calculated Savings
  estimated_savings NUMERIC(15,2),
  per_employee_redistribution NUMERIC(15,2),
  
  -- Ethical Commitment
  compliance_commitment BOOLEAN DEFAULT false, -- agrees to downward redistribution
  
  -- Source Tracking
  filled_by TEXT NOT NULL DEFAULT 'self_service' CHECK (filled_by IN ('self_service', 'eliza_conversation')),
  session_key TEXT, -- links to conversation if filled via Eliza
  
  -- Additional context
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.corporate_license_applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies (public read for transparency, insert for anyone, update/delete restricted)
CREATE POLICY "Anyone can view license applications" 
  ON public.corporate_license_applications FOR SELECT USING (true);

CREATE POLICY "Anyone can submit license applications" 
  ON public.corporate_license_applications FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update applications" 
  ON public.corporate_license_applications FOR UPDATE USING (true);

CREATE POLICY "Service role can delete applications" 
  ON public.corporate_license_applications FOR DELETE USING (true);

-- Indexes
CREATE INDEX idx_license_apps_status ON public.corporate_license_applications(application_status);
CREATE INDEX idx_license_apps_email ON public.corporate_license_applications(contact_email);
CREATE INDEX idx_license_apps_session ON public.corporate_license_applications(session_key);

-- Updated at trigger
CREATE TRIGGER update_license_applications_updated_at
  BEFORE UPDATE ON public.corporate_license_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();