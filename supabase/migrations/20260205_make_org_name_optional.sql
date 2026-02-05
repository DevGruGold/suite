-- Make name optional for organizations
ALTER TABLE public.organizations ALTER COLUMN name DROP NOT NULL;
