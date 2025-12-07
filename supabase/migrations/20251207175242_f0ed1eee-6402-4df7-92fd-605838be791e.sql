-- VSCO Workspace Integration Tables
-- ================================

-- VSCO Brands table
CREATE TABLE public.vsco_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- VSCO Leads/Jobs sync table
CREATE TABLE public.vsco_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT UNIQUE NOT NULL,
  name TEXT,
  stage TEXT CHECK (stage IN ('lead', 'booked', 'fulfillment', 'completed')),
  lead_status TEXT,
  lead_rating INTEGER CHECK (lead_rating >= 1 AND lead_rating <= 5),
  lead_confidence TEXT CHECK (lead_confidence IN ('low', 'medium', 'high')),
  lead_source TEXT,
  job_type TEXT,
  brand_id TEXT,
  event_date DATE,
  booking_date DATE,
  total_revenue NUMERIC,
  total_cost NUMERIC,
  account_balance NUMERIC,
  closed BOOLEAN DEFAULT false,
  closed_reason TEXT,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- VSCO Contacts sync table
CREATE TABLE public.vsco_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT UNIQUE NOT NULL,
  kind TEXT CHECK (kind IN ('person', 'company', 'location')),
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  cell_phone TEXT,
  company_name TEXT,
  brand_id TEXT,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- VSCO Events sync table
CREATE TABLE public.vsco_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT UNIQUE NOT NULL,
  vsco_job_id TEXT,
  name TEXT,
  event_type TEXT,
  channel TEXT CHECK (channel IN ('InPerson', 'Phone', 'Virtual')),
  start_date DATE,
  start_time TIME,
  end_date DATE,
  end_time TIME,
  location_address TEXT,
  confirmed BOOLEAN DEFAULT false,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- VSCO Orders/Invoices sync table
CREATE TABLE public.vsco_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT UNIQUE NOT NULL,
  vsco_job_id TEXT,
  order_number TEXT,
  order_date DATE,
  status TEXT,
  subtotal NUMERIC,
  tax_total NUMERIC,
  total NUMERIC,
  balance_due NUMERIC,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- VSCO API Call Log for rate limiting & debugging
CREATE TABLE public.vsco_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  endpoint TEXT,
  method TEXT,
  status_code INTEGER,
  response_time_ms INTEGER,
  success BOOLEAN,
  error_message TEXT,
  executive TEXT,
  request_payload JSONB,
  response_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_vsco_jobs_stage ON public.vsco_jobs(stage);
CREATE INDEX idx_vsco_jobs_synced ON public.vsco_jobs(synced_at);
CREATE INDEX idx_vsco_jobs_closed ON public.vsco_jobs(closed);
CREATE INDEX idx_vsco_contacts_email ON public.vsco_contacts(email);
CREATE INDEX idx_vsco_contacts_kind ON public.vsco_contacts(kind);
CREATE INDEX idx_vsco_events_date ON public.vsco_events(start_date);
CREATE INDEX idx_vsco_events_job ON public.vsco_events(vsco_job_id);
CREATE INDEX idx_vsco_orders_job ON public.vsco_orders(vsco_job_id);
CREATE INDEX idx_vsco_orders_status ON public.vsco_orders(status);
CREATE INDEX idx_vsco_api_logs_action ON public.vsco_api_logs(action);
CREATE INDEX idx_vsco_api_logs_created ON public.vsco_api_logs(created_at);

-- Enable RLS on all tables
ALTER TABLE public.vsco_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsco_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsco_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsco_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsco_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsco_api_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow public read access (business data, no PII protection needed for this use case)
CREATE POLICY "vsco_brands_select_all" ON public.vsco_brands FOR SELECT USING (true);
CREATE POLICY "vsco_brands_insert_all" ON public.vsco_brands FOR INSERT WITH CHECK (true);
CREATE POLICY "vsco_brands_update_all" ON public.vsco_brands FOR UPDATE USING (true);
CREATE POLICY "vsco_brands_delete_all" ON public.vsco_brands FOR DELETE USING (true);

CREATE POLICY "vsco_jobs_select_all" ON public.vsco_jobs FOR SELECT USING (true);
CREATE POLICY "vsco_jobs_insert_all" ON public.vsco_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "vsco_jobs_update_all" ON public.vsco_jobs FOR UPDATE USING (true);
CREATE POLICY "vsco_jobs_delete_all" ON public.vsco_jobs FOR DELETE USING (true);

CREATE POLICY "vsco_contacts_select_all" ON public.vsco_contacts FOR SELECT USING (true);
CREATE POLICY "vsco_contacts_insert_all" ON public.vsco_contacts FOR INSERT WITH CHECK (true);
CREATE POLICY "vsco_contacts_update_all" ON public.vsco_contacts FOR UPDATE USING (true);
CREATE POLICY "vsco_contacts_delete_all" ON public.vsco_contacts FOR DELETE USING (true);

CREATE POLICY "vsco_events_select_all" ON public.vsco_events FOR SELECT USING (true);
CREATE POLICY "vsco_events_insert_all" ON public.vsco_events FOR INSERT WITH CHECK (true);
CREATE POLICY "vsco_events_update_all" ON public.vsco_events FOR UPDATE USING (true);
CREATE POLICY "vsco_events_delete_all" ON public.vsco_events FOR DELETE USING (true);

CREATE POLICY "vsco_orders_select_all" ON public.vsco_orders FOR SELECT USING (true);
CREATE POLICY "vsco_orders_insert_all" ON public.vsco_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "vsco_orders_update_all" ON public.vsco_orders FOR UPDATE USING (true);
CREATE POLICY "vsco_orders_delete_all" ON public.vsco_orders FOR DELETE USING (true);

CREATE POLICY "vsco_api_logs_select_all" ON public.vsco_api_logs FOR SELECT USING (true);
CREATE POLICY "vsco_api_logs_insert_all" ON public.vsco_api_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "vsco_api_logs_update_all" ON public.vsco_api_logs FOR UPDATE USING (true);
CREATE POLICY "vsco_api_logs_delete_all" ON public.vsco_api_logs FOR DELETE USING (true);