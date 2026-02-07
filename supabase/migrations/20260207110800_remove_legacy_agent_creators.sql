
-- 20260206_remove_legacy_agent_creators.sql (Robust Version)

DO $$
DECLARE
    job_name text;
    jobs_to_remove text[] := ARRAY[
        'gemini-agent-deployment',
        'cyclical-workflow-creation',
        'gemini-agent-creator',
        'n8n-workflow-generator',
        'gemini-agent-deployment-job',
        'cyclical-workflow-creation-job'
    ];
BEGIN
    FOREACH job_name IN ARRAY jobs_to_remove
    LOOP
        BEGIN
            PERFORM cron.unschedule(job_name);
        EXCEPTION WHEN OTHERS THEN
            -- Ignore errors if job doesn't exist
            NULL;
        END;
    END LOOP;

    -- Cleanup registry
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cron_registry') THEN
        DELETE FROM public.cron_registry 
        WHERE job_name = ANY(jobs_to_remove);
    END IF;
END $$;
