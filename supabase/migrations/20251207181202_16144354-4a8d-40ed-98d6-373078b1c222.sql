-- =====================================================
-- VSCO WORKSPACE EXTENDED TABLES: Products, Worksheets, Notes
-- =====================================================

-- Products table for quotes/pricing
CREATE TABLE IF NOT EXISTS public.vsco_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT UNIQUE NOT NULL,
  name TEXT,
  description TEXT,
  price NUMERIC(12,2),
  cost NUMERIC(12,2),
  tax_rate NUMERIC(5,4),
  product_type_id TEXT,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Worksheets/Templates table
CREATE TABLE IF NOT EXISTS public.vsco_worksheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_job_id TEXT NOT NULL,
  template_name TEXT,
  events JSONB,
  contacts JSONB,
  products JSONB,
  notes TEXT,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notes table for job/contact documentation
CREATE TABLE IF NOT EXISTS public.vsco_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT UNIQUE NOT NULL,
  vsco_job_id TEXT,
  vsco_contact_id TEXT,
  content_html TEXT,
  content_text TEXT,
  note_date DATE,
  author TEXT,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Files/Galleries tracking
CREATE TABLE IF NOT EXISTS public.vsco_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsco_id TEXT UNIQUE NOT NULL,
  vsco_job_id TEXT,
  vsco_gallery_id TEXT,
  filename TEXT,
  file_type TEXT,
  file_size BIGINT,
  url TEXT,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_vsco_products_category ON public.vsco_products(category);
CREATE INDEX IF NOT EXISTS idx_vsco_products_active ON public.vsco_products(is_active);
CREATE INDEX IF NOT EXISTS idx_vsco_worksheets_job_id ON public.vsco_worksheets(vsco_job_id);
CREATE INDEX IF NOT EXISTS idx_vsco_notes_job_id ON public.vsco_notes(vsco_job_id);
CREATE INDEX IF NOT EXISTS idx_vsco_notes_contact_id ON public.vsco_notes(vsco_contact_id);
CREATE INDEX IF NOT EXISTS idx_vsco_files_job_id ON public.vsco_files(vsco_job_id);
CREATE INDEX IF NOT EXISTS idx_vsco_files_gallery_id ON public.vsco_files(vsco_gallery_id);

-- Enable RLS
ALTER TABLE public.vsco_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsco_worksheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsco_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsco_files ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Allow public read access to vsco_products" ON public.vsco_products FOR SELECT USING (true);
CREATE POLICY "Allow public read access to vsco_worksheets" ON public.vsco_worksheets FOR SELECT USING (true);
CREATE POLICY "Allow public read access to vsco_notes" ON public.vsco_notes FOR SELECT USING (true);
CREATE POLICY "Allow public read access to vsco_files" ON public.vsco_files FOR SELECT USING (true);

-- Service role insert/update policies
CREATE POLICY "Allow service role insert to vsco_products" ON public.vsco_products FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update to vsco_products" ON public.vsco_products FOR UPDATE USING (true);
CREATE POLICY "Allow service role insert to vsco_worksheets" ON public.vsco_worksheets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update to vsco_worksheets" ON public.vsco_worksheets FOR UPDATE USING (true);
CREATE POLICY "Allow service role insert to vsco_notes" ON public.vsco_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update to vsco_notes" ON public.vsco_notes FOR UPDATE USING (true);
CREATE POLICY "Allow service role insert to vsco_files" ON public.vsco_files FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update to vsco_files" ON public.vsco_files FOR UPDATE USING (true);