-- Migration: Postgres trigger to auto-generate Drive deliverables on task completion
-- Generated 2026-03-01
-- Requires: pg_net extension (enabled by default in Supabase)
-- Setup: In Supabase Dashboard → Database → Settings → Config, add:
--   app.supabase_url = https://<your-project>.supabase.co
--   app.service_role_key = <your-service-role-key>
-- Enable pg_net if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;
-- ─── Function ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_drive_deliverable_on_completion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_supabase_url text;
v_service_key text;
v_payload jsonb;
v_content text;
BEGIN -- Only fire when status transitions TO 'COMPLETED'
IF NEW.status <> 'COMPLETED'
OR OLD.status = 'COMPLETED' THEN RETURN NEW;
END IF;
-- Build content string: prefer last_work_result, fall back to resolution_notes, then description
v_content := COALESCE(
    NULLIF(trim(NEW.last_work_result), ''),
    NULLIF(trim(NEW.resolution_notes), ''),
    NULLIF(trim(NEW.description), ''),
    'No content provided for this task.'
);
-- Read Supabase connection settings (set in DB config)
BEGIN v_supabase_url := current_setting('app.supabase_url', true);
v_service_key := current_setting('app.service_role_key', true);
EXCEPTION
WHEN OTHERS THEN -- Settings not configured — skip silently rather than failing the task update
RAISE WARNING 'google-drive-deliverables trigger: app.supabase_url or app.service_role_key not configured, skipping.';
RETURN NEW;
END;
IF v_supabase_url IS NULL
OR v_service_key IS NULL THEN RAISE WARNING 'google-drive-deliverables trigger: missing config, skipping.';
RETURN NEW;
END IF;
v_payload := jsonb_build_object(
    'task_id',
    NEW.id,
    'agent_name',
    COALESCE(NEW.assigned_agent, 'XMRT-Agent'),
    'deliverable_type',
    COALESCE(NEW.category, 'report'),
    'title',
    COALESCE(NEW.title, 'Task ' || NEW.id::text),
    'content_markdown',
    v_content
);
-- Fire-and-forget HTTP call to the edge function via pg_net
PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/google-drive-deliverables',
    headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || v_service_key,
        'Content-Type',
        'application/json'
    ),
    body := v_payload::text
);
RETURN NEW;
EXCEPTION
WHEN OTHERS THEN -- Never fail the UPDATE because drive delivery failed
RAISE WARNING 'google-drive-deliverables trigger error: %',
SQLERRM;
RETURN NEW;
END;
$$;
-- ─── Trigger ─────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS task_completion_drive_deliverable ON public.tasks;
CREATE TRIGGER task_completion_drive_deliverable
AFTER
UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.trigger_drive_deliverable_on_completion();