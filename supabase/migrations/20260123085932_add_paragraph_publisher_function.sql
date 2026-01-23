-- Migration to register the paragraph-publisher edge function and set up any necessary metadata

-- We can add a comment to the functions table if it exists, or just ensure the activity log supports it
-- The eliza_activity_log already has activity_type and metadata, which is perfect for tracking publications.

-- Example of how Eliza will log this activity:
-- INSERT INTO public.eliza_activity_log (activity_type, title, description, status, metadata)
-- VALUES ('paragraph_publication', 'Published to Paragraph.com', 'Successfully published: [Title]', 'completed', '{"post_id": "...", "url": "..."}');

-- If there's a registry for edge functions, we should add it there.
-- Checking if edge_function_registry exists (based on _shared/edgeFunctionRegistry.ts)

DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'edge_function_registry') THEN
        INSERT INTO public.edge_function_registry (function_name, description, category, is_active)
        VALUES ('paragraph-publisher', 'Publishes content directly to Paragraph.com', 'publishing', true)
        ON CONFLICT (function_name) DO UPDATE 
        SET description = EXCLUDED.description, category = EXCLUDED.category, is_active = EXCLUDED.is_active;
    END IF;
END $$;
