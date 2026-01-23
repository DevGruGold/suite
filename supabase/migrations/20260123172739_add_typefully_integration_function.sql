-- Migration to register the typefully-integration edge function

DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'edge_function_registry') THEN
        INSERT INTO public.edge_function_registry (function_name, description, category, is_active)
        VALUES ('typefully-integration', 'Integrates with Typefully API for X/Twitter posting and interactions', 'social', true)
        ON CONFLICT (function_name) DO UPDATE 
        SET description = EXCLUDED.description, category = EXCLUDED.category, is_active = EXCLUDED.is_active;
    END IF;
END $$;
