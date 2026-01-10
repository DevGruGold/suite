-- 1. Create organizations table (if not already created by migration)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    website TEXT,
    email TEXT,
    whatsapp_number TEXT,
    github_repo TEXT,
    mcp_server_address TEXT,
    connections JSONB DEFAULT '{}'::jsonB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add selected_organization_id to profiles
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='selected_organization_id') THEN
        ALTER TABLE public.profiles ADD COLUMN selected_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 4. Policies
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organizations' AND policyname='Users can view their own organizations') THEN
        CREATE POLICY "Users can view their own organizations" ON public.organizations FOR SELECT USING (auth.uid() = owner_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organizations' AND policyname='Users can insert their own organizations') THEN
        CREATE POLICY "Users can insert their own organizations" ON public.organizations FOR INSERT WITH CHECK (auth.uid() = owner_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organizations' AND policyname='Users can update their own organizations') THEN
        CREATE POLICY "Users can update their own organizations" ON public.organizations FOR UPDATE USING (auth.uid() = owner_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organizations' AND policyname='Users can delete their own organizations') THEN
        CREATE POLICY "Users can delete their own organizations" ON public.organizations FOR DELETE USING (auth.uid() = owner_id);
    END IF;
END $$;

-- 5. Backfill/Sample Data for 3 Organizations
-- Note: This assumes a superadmin or a specific user ID. Replace '00000000-0000-0000-0000-000000000000' with a real user ID if needed.
-- For now, we'll create a function that users can call to seed their own sample data.

CREATE OR REPLACE FUNCTION seed_sample_organizations(user_id UUID)
RETURNS void AS $$
BEGIN
    INSERT INTO public.organizations (owner_id, name, website, email, whatsapp_number, github_repo, mcp_server_address, connections)
    VALUES 
    (user_id, 'XMRT Global Operations', 'https://xmr-suite.com', 'ops@xmr-suite.com', '+15550123456', 'DevGruGold/suite', 'https://mcp.xmr-suite.com', '{"slack": "xmr-ops-workspace", "notion": "xmr-ops-db"}'),
    (user_id, 'Starlight Tech Solutions', 'https://starlight-tech.io', 'contact@starlight-tech.io', '+15550987654', 'starlight/core-engine', 'https://mcp.starlight-tech.io', '{"quickbooks": "starlight-acc", "salesforce": "starlight-crm"}'),
    (user_id, 'Nexus Digital Agency', 'https://nexus-digital.com', 'hello@nexus-digital.com', '+15550554433', 'nexus/web-portal', 'https://mcp.nexus-digital.com', '{"google": "nexus-workspace", "slack": "nexus-internal"}');
END;
$$ LANGUAGE plpgsql;

-- To seed for a specific user: SELECT seed_sample_organizations('USER_UUID_HERE');
