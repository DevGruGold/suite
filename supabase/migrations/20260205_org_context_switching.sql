-- Add organization_id to user_api_connections
ALTER TABLE public.user_api_connections 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Drop old unique constraint if it exists (handling potentially auto-generated names)
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_api_connections_user_id_provider_key') THEN
        ALTER TABLE public.user_api_connections DROP CONSTRAINT user_api_connections_user_id_provider_key;
    END IF;
END $$;

-- Add new unique constraint including organization_id (allow NULLs in organization_id for personal keys)
-- Note: Postgres treats NULLs as distinct for UNIQUE constraints, so user can have multiple NULL org_id rows? 
-- Actually, we want ONE personal key (NULL org) and ONE key per Org.
-- A simple UNIQUE index with COALESCE or using NULLS NOT DISTINCT (PG 15+) would work.
-- Assuming standard PG, we might need a partial index for the NULL case or just rely on application logic + unique index.
-- Let's try to just add the column and use a standard unique index.
-- Standard UNIQUE (user_id, provider, organization_id) allows multiple (user, provider, NULL) rows in standard SQL/PG < 15.
-- To enforce only one personal key:
CREATE UNIQUE INDEX IF NOT EXISTS user_api_connections_personal_idx ON public.user_api_connections (user_id, provider) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_api_connections_org_idx ON public.user_api_connections (user_id, provider, organization_id) WHERE organization_id IS NOT NULL;

-- Add settings to organizations for things like Typefully
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS typefully_set TEXT;
