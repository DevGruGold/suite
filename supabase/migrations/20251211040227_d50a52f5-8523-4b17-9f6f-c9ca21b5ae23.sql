-- ============================================================
-- VSCO WORKSPACE EXTENDED DATABASE SCHEMA
-- 16 new tables for complete CMS integration
-- ============================================================

-- 1. Job Contacts (job-specific contact relationships)
CREATE TABLE IF NOT EXISTS vsco_job_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  vsco_job_id TEXT NOT NULL,
  vsco_contact_id TEXT NOT NULL,
  role TEXT,
  is_primary BOOLEAN DEFAULT false,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Studio Users (team members)
CREATE TABLE IF NOT EXISTS vsco_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  role TEXT,
  is_active BOOLEAN DEFAULT true,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Profit Centers (accounting)
CREATE TABLE IF NOT EXISTS vsco_profit_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tax Groups
CREATE TABLE IF NOT EXISTS vsco_tax_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  is_default BOOLEAN DEFAULT false,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tax Rates
CREATE TABLE IF NOT EXISTS vsco_tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  rate NUMERIC,
  tax_group_id TEXT,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Custom Fields
CREATE TABLE IF NOT EXISTS vsco_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  field_type TEXT,
  entity_type TEXT,
  options JSONB DEFAULT '[]',
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Discounts
CREATE TABLE IF NOT EXISTS vsco_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  discount_type TEXT,
  amount NUMERIC,
  percent NUMERIC,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Discount Types
CREATE TABLE IF NOT EXISTS vsco_discount_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Event Types
CREATE TABLE IF NOT EXISTS vsco_event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  color TEXT,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Job Types
CREATE TABLE IF NOT EXISTS vsco_job_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Job Roles
CREATE TABLE IF NOT EXISTS vsco_job_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. Job Closed Reasons
CREATE TABLE IF NOT EXISTS vsco_job_closed_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  outcome TEXT,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 13. Lead Sources
CREATE TABLE IF NOT EXISTS vsco_lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. Lead Statuses
CREATE TABLE IF NOT EXISTS vsco_lead_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 15. Galleries
CREATE TABLE IF NOT EXISTS vsco_galleries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  vsco_job_id TEXT,
  name TEXT,
  description TEXT,
  files_count INTEGER DEFAULT 0,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 16. Payment Methods
CREATE TABLE IF NOT EXISTS vsco_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT NOT NULL UNIQUE,
  name TEXT,
  is_default BOOLEAN DEFAULT false,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE vsco_job_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_profit_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_tax_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_discount_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_job_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_job_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_job_closed_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_lead_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsco_payment_methods ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for all tables (public read/write for now)
CREATE POLICY "vsco_job_contacts_all" ON vsco_job_contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_users_all" ON vsco_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_profit_centers_all" ON vsco_profit_centers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_tax_groups_all" ON vsco_tax_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_tax_rates_all" ON vsco_tax_rates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_custom_fields_all" ON vsco_custom_fields FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_discounts_all" ON vsco_discounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_discount_types_all" ON vsco_discount_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_event_types_all" ON vsco_event_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_job_types_all" ON vsco_job_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_job_roles_all" ON vsco_job_roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_job_closed_reasons_all" ON vsco_job_closed_reasons FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_lead_sources_all" ON vsco_lead_sources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_lead_statuses_all" ON vsco_lead_statuses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_galleries_all" ON vsco_galleries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vsco_payment_methods_all" ON vsco_payment_methods FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vsco_job_contacts_job ON vsco_job_contacts(vsco_job_id);
CREATE INDEX IF NOT EXISTS idx_vsco_job_contacts_contact ON vsco_job_contacts(vsco_contact_id);
CREATE INDEX IF NOT EXISTS idx_vsco_galleries_job ON vsco_galleries(vsco_job_id);
CREATE INDEX IF NOT EXISTS idx_vsco_tax_rates_group ON vsco_tax_rates(tax_group_id);

-- Update Party Favor Photo knowledge entity with richer context
UPDATE knowledge_entities 
SET description = 'Party Favor Photo is a photo booth rental and operation business managed through VSCO Workspace (Táve). Services include photo booth setups for weddings, corporate events, parties, and special occasions. The business workflow includes lead management, quote generation using worksheets, event scheduling, on-site operation, photo gallery delivery, and client follow-up. Full CMS capabilities available through vsco-workspace edge function.',
    confidence_score = 1.0,
    metadata = jsonb_build_object(
      'business_type', 'photo_booth_service',
      'cms_platform', 'VSCO Workspace (Táve)',
      'vsco_integrated', true,
      'services', jsonb_build_array('photo booth rental', 'event photography', 'branded overlays', 'print packages', 'digital downloads', 'GIF booths', 'video booths'),
      'event_types', jsonb_build_array('weddings', 'corporate events', 'parties', 'graduations', 'fundraisers', 'birthday parties', 'bar/bat mitzvahs'),
      'tools', jsonb_build_array('vsco_manage_jobs', 'vsco_manage_contacts', 'vsco_manage_events', 'vsco_manage_products', 'vsco_manage_worksheets', 'vsco_manage_notes', 'vsco_analytics', 'vsco_manage_financials', 'vsco_manage_settings', 'vsco_manage_users')
    )
WHERE entity_name ILIKE '%party favor photo%';