-- Create superduper_agents table (single source of truth for SuperDuper specialist agents)
CREATE TABLE IF NOT EXISTS public.superduper_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  edge_function_name TEXT NOT NULL,
  description TEXT,
  combined_capabilities JSONB DEFAULT '[]',
  category TEXT,
  priority INTEGER DEFAULT 5,
  status TEXT DEFAULT 'active',
  is_active BOOLEAN DEFAULT true,
  execution_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.superduper_agents ENABLE ROW LEVEL SECURITY;

-- Create policies for read/write access
CREATE POLICY "Anyone can view superduper agents" ON public.superduper_agents
  FOR SELECT USING (true);

CREATE POLICY "Service role manages superduper agents" ON public.superduper_agents
  FOR ALL USING (auth.role() = 'service_role');

-- Create index for efficient lookups
CREATE INDEX idx_superduper_agents_name ON public.superduper_agents(agent_name);
CREATE INDEX idx_superduper_agents_function ON public.superduper_agents(edge_function_name);
CREATE INDEX idx_superduper_agents_active ON public.superduper_agents(is_active) WHERE is_active = true;

-- Populate with all 10 SuperDuper edge functions
INSERT INTO public.superduper_agents (agent_name, display_name, edge_function_name, description, combined_capabilities, category, priority) VALUES
('code_architect', 'SuperDuper Code Architect', 'superduper-code-architect', 'Reviews code, designs architecture, security scans, and workflow automation', 
 '["code_review", "architecture_design", "security_scan", "workflow_automation", "refactoring", "testing_strategies"]'::jsonb, 'development', 1),

('business_strategist', 'SuperDuper Business Strategist', 'superduper-business-growth', 'Business strategy, market analysis, growth hacking, and competitive intelligence',
 '["market_analysis", "growth_strategy", "competitive_intelligence", "business_planning", "revenue_optimization"]'::jsonb, 'business', 2),

('finance_advisor', 'SuperDuper Finance Advisor', 'superduper-finance-investment', 'Treasury analysis, compound returns, credit analysis, and tokenomics',
 '["treasury_analysis", "compound_returns", "credit_analysis", "tokenomics", "investment_strategy", "financial_modeling"]'::jsonb, 'finance', 3),

('communication_expert', 'SuperDuper Communication Expert', 'superduper-communication-outreach', 'Email drafting, investor outreach, persona creation, and networking',
 '["email_drafting", "investor_outreach", "persona_creation", "networking", "pr_strategy", "stakeholder_communication"]'::jsonb, 'communication', 4),

('content_producer', 'SuperDuper Content Producer', 'superduper-content-media', 'Video analysis, podcast creation, newsletter optimization, and article summaries',
 '["video_analysis", "podcast_creation", "newsletter_optimization", "article_summary", "content_strategy", "multimedia_production"]'::jsonb, 'content', 5),

('design_brand', 'SuperDuper Design & Brand', 'superduper-design-brand', 'Brand identity, UI/UX design, visual assets, and design systems',
 '["brand_identity", "ui_ux_design", "visual_assets", "design_systems", "style_guides", "creative_direction"]'::jsonb, 'design', 6),

('development_coach', 'SuperDuper Development Coach', 'superduper-development-coach', 'Career coaching, skill development, team building, and mentorship',
 '["career_coaching", "skill_development", "team_building", "mentorship", "performance_reviews", "goal_setting"]'::jsonb, 'coaching', 7),

('domain_expert', 'SuperDuper Domain Expert', 'superduper-domain-experts', 'Specialized domain knowledge across legal, medical, scientific, and technical fields',
 '["legal_expertise", "medical_knowledge", "scientific_research", "technical_domains", "regulatory_compliance", "industry_insights"]'::jsonb, 'specialized', 8),

('research_analyst', 'SuperDuper Research Analyst', 'superduper-research-intelligence', 'Market research, data analysis, trend identification, and competitive intelligence',
 '["market_research", "data_analysis", "trend_identification", "competitive_intelligence", "report_generation", "insight_synthesis"]'::jsonb, 'research', 9),

('social_viral', 'SuperDuper Social & Viral', 'superduper-social-viral', 'Trending content discovery, viral post creation, social media analysis, and meme generation',
 '["trending_content", "viral_posts", "social_media_analysis", "meme_generation", "engagement_optimization", "influencer_strategy"]'::jsonb, 'social', 10)

ON CONFLICT (agent_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  edge_function_name = EXCLUDED.edge_function_name,
  description = EXCLUDED.description,
  combined_capabilities = EXCLUDED.combined_capabilities,
  category = EXCLUDED.category,
  priority = EXCLUDED.priority,
  updated_at = now();

-- Add is_superduper column to agents table for cross-referencing
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS is_superduper BOOLEAN DEFAULT false;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS superduper_agent_id UUID REFERENCES public.superduper_agents(id);

-- Create updated_at trigger for superduper_agents
CREATE OR REPLACE FUNCTION update_superduper_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER superduper_agents_updated_at
  BEFORE UPDATE ON public.superduper_agents
  FOR EACH ROW
  EXECUTE FUNCTION update_superduper_agents_updated_at();