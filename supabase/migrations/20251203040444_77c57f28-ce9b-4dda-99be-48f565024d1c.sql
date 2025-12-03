-- Create supporting tables for workflow templates
CREATE TABLE IF NOT EXISTS public.competitor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  website_url TEXT,
  github_org TEXT,
  category TEXT,
  description TEXT,
  key_features JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.anomaly_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_type TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  root_cause_analysis TEXT,
  resolution_status TEXT DEFAULT 'detected',
  auto_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.developer_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_username TEXT NOT NULL,
  skills_detected JSONB DEFAULT '[]',
  experience_level TEXT,
  onboarding_status TEXT DEFAULT 'initiated',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_period_start TIMESTAMPTZ,
  review_period_end TIMESTAMPTZ,
  fleet_health_score INTEGER,
  recommendations JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_sentiment_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE DEFAULT CURRENT_DATE,
  sentiment_breakdown JSONB DEFAULT '{}',
  top_topics JSONB DEFAULT '[]',
  overall_sentiment_score NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS and create policies
ALTER TABLE public.competitor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomaly_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_sentiment_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitor_profiles_all" ON public.competitor_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anomaly_resolutions_all" ON public.anomaly_resolutions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "developer_onboarding_all" ON public.developer_onboarding FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "agent_performance_reviews_all" ON public.agent_performance_reviews FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "community_sentiment_reports_all" ON public.community_sentiment_reports FOR ALL USING (true) WITH CHECK (true);

-- Seed competitor profiles
INSERT INTO public.competitor_profiles (name, website_url, github_org, category, description, key_features)
VALUES 
('Fetch.ai', 'https://fetch.ai', 'fetchai', 'AI Agents', 'Decentralized AI agents', '["autonomous agents", "DeFi"]'::jsonb),
('SingularityNET', 'https://singularitynet.io', 'singnet', 'AI Marketplace', 'AI marketplace', '["AI services", "AGI research"]'::jsonb),
('Autonolas', 'https://autonolas.network', 'valory-xyz', 'Autonomous Services', 'Autonomous services network', '["agents", "DAO governance"]'::jsonb)
ON CONFLICT DO NOTHING;