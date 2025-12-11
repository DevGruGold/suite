-- IP Correlation Events table
CREATE TABLE IF NOT EXISTS public.ip_correlation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  user_profile_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  
  -- Source info
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL DEFAULT gen_random_uuid(),
  source_session_key TEXT,
  
  -- Device fingerprinting
  user_agent TEXT,
  device_fingerprint TEXT,
  
  -- Correlation metadata
  correlation_confidence NUMERIC DEFAULT 0.5,
  correlation_factors JSONB DEFAULT '{}',
  
  -- Privacy & consent
  consent_given BOOLEAN DEFAULT false,
  consent_timestamp TIMESTAMPTZ,
  
  -- Timestamps
  observed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- IP Correlation Matches table
CREATE TABLE IF NOT EXISTS public.ip_correlation_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  
  -- Matched sources
  chat_session_id TEXT,
  device_session_id TEXT,
  
  -- Match quality
  ip_address INET,
  match_confidence NUMERIC,
  match_factors JSONB DEFAULT '{}',
  
  -- Privacy
  user_acknowledged BOOLEAN DEFAULT false,
  
  -- Timestamps
  matched_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  
  UNIQUE(user_profile_id, chat_session_id, device_session_id)
);

-- Add IP tracking columns to conversation_sessions if not exists
ALTER TABLE public.conversation_sessions 
ADD COLUMN IF NOT EXISTS ip_address INET,
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

-- Indexes for efficient correlation queries
CREATE INDEX IF NOT EXISTS idx_ip_correlation_events_ip ON public.ip_correlation_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_correlation_events_session ON public.ip_correlation_events(source_session_key);
CREATE INDEX IF NOT EXISTS idx_ip_correlation_events_user ON public.ip_correlation_events(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_ip_correlation_events_observed ON public.ip_correlation_events(observed_at);
CREATE INDEX IF NOT EXISTS idx_ip_correlation_matches_user ON public.ip_correlation_matches(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_ip_correlation_matches_sessions ON public.ip_correlation_matches(chat_session_id, device_session_id);

-- Enable RLS
ALTER TABLE public.ip_correlation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_correlation_matches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ip_correlation_events
CREATE POLICY "ip_correlation_events_select_all" ON public.ip_correlation_events
  FOR SELECT USING (true);

CREATE POLICY "ip_correlation_events_insert_all" ON public.ip_correlation_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "ip_correlation_events_update_all" ON public.ip_correlation_events
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "ip_correlation_events_delete_all" ON public.ip_correlation_events
  FOR DELETE USING (true);

-- RLS Policies for ip_correlation_matches
CREATE POLICY "ip_correlation_matches_select_all" ON public.ip_correlation_matches
  FOR SELECT USING (true);

CREATE POLICY "ip_correlation_matches_insert_all" ON public.ip_correlation_matches
  FOR INSERT WITH CHECK (true);

CREATE POLICY "ip_correlation_matches_update_all" ON public.ip_correlation_matches
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "ip_correlation_matches_delete_all" ON public.ip_correlation_matches
  FOR DELETE USING (true);