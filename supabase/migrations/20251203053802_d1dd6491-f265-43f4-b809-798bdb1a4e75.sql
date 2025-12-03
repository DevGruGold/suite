-- Enable REPLICA IDENTITY FULL for complete row data in realtime
ALTER TABLE tasks REPLICA IDENTITY FULL;

-- Add tasks table to realtime publication if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
  END IF;
END $$;