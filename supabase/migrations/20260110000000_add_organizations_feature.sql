-- Create organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    website TEXT,
    email TEXT,
    whatsapp_number TEXT,
    github_repo TEXT,
    mcp_server_address TEXT,
    connections JSONB DEFAULT '{}'::jsonB, -- For QuickBooks, Square, Salesforce, etc.
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add selected_organization_id to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS selected_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Policies for organizations
CREATE POLICY "Users can view their own organizations" 
ON public.organizations FOR SELECT 
USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own organizations" 
ON public.organizations FOR INSERT 
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own organizations" 
ON public.organizations FOR UPDATE 
USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own organizations" 
ON public.organizations FOR DELETE 
USING (auth.uid() = owner_id);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for organizations
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
