-- Grant SELECT permission on tasks table to anon and authenticated
GRANT SELECT ON public.tasks TO anon;
GRANT SELECT ON public.tasks TO authenticated;

-- Grant SELECT permission on agents table to anon and authenticated  
GRANT SELECT ON public.agents TO anon;
GRANT SELECT ON public.agents TO authenticated;

-- Grant INSERT/UPDATE/DELETE for authenticated users
GRANT INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.agents TO authenticated;

-- Enable realtime on agents table
ALTER TABLE public.agents REPLICA IDENTITY FULL;

-- Add agents to realtime publication (ignore if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'agents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agents;
  END IF;
END $$;