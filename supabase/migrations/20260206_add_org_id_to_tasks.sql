-- 20260206_add_org_id_to_tasks.sql

-- 1. Add organization_id to tasks table
ALTER TABLE IF EXISTS tasks 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- 2. Create function to set organization_id from creator's profile
CREATE OR REPLACE FUNCTION public.set_task_organization_from_creator()
RETURNS TRIGGER AS $$
DECLARE
    creator_org_id UUID;
BEGIN
    -- Only act if organization_id is not already set and we have a creator
    IF NEW.organization_id IS NULL AND NEW.created_by_user_id IS NOT NULL THEN
        -- Look up the selected_organization_id from the creator's profile
        SELECT selected_organization_id INTO creator_org_id
        FROM public.profiles
        WHERE id = NEW.created_by_user_id;

        -- If found, set it on the task
        IF creator_org_id IS NOT NULL THEN
            NEW.organization_id := creator_org_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create trigger to run before insert
DROP TRIGGER IF EXISTS tr_set_task_organization ON tasks;
CREATE TRIGGER tr_set_task_organization
BEFORE INSERT ON tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_task_organization_from_creator();
