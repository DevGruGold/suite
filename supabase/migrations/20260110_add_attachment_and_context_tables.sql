-- Migration: Add attachment_analysis and conversation_context tables
-- Purpose: Support multimodal attachment analysis and conversation context tracking
-- Date: 2026-01-10

-- =================================================================
-- CREATE attachment_analysis table
-- =================================================================
-- This table stores analysis results for file attachments across all modes (TTS, audio, multimedia)

CREATE TABLE IF NOT EXISTS public.attachment_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('text', 'code', 'smart_contract', 'document', 'image', 'audio', 'video', 'unknown')),
  detected_language TEXT,
  content_preview TEXT,
  key_findings JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure metadata is valid JSON
  CONSTRAINT attachment_analysis_metadata_valid CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT attachment_analysis_key_findings_valid CHECK (jsonb_typeof(key_findings) = 'array')
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_attachment_analysis_session_id ON public.attachment_analysis(session_id);
CREATE INDEX IF NOT EXISTS idx_attachment_analysis_created_at ON public.attachment_analysis(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachment_analysis_file_type ON public.attachment_analysis(file_type);
CREATE INDEX IF NOT EXISTS idx_attachment_analysis_filename ON public.attachment_analysis(filename);

-- Add GIN index for JSONB columns
CREATE INDEX IF NOT EXISTS idx_attachment_analysis_metadata ON public.attachment_analysis USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_attachment_analysis_key_findings ON public.attachment_analysis USING GIN (key_findings);

-- Add comment
COMMENT ON TABLE public.attachment_analysis IS 'Stores analysis results for file attachments across all modes (TTS, audio, multimedia)';
COMMENT ON COLUMN public.attachment_analysis.session_id IS 'Session identifier linking to conversation_memory';
COMMENT ON COLUMN public.attachment_analysis.file_type IS 'Type of file: text, code, smart_contract, document, image, audio, video, or unknown';
COMMENT ON COLUMN public.attachment_analysis.detected_language IS 'Programming language or natural language detected in the file';
COMMENT ON COLUMN public.attachment_analysis.content_preview IS 'Preview of file content (first ~5000 characters for text files)';
COMMENT ON COLUMN public.attachment_analysis.key_findings IS 'Array of key findings from analysis (e.g., ["Smart contract detected", "Found 3 functions"])';
COMMENT ON COLUMN public.attachment_analysis.metadata IS 'Additional metadata: estimated_lines, estimated_words, has_code, analyzed_at, executive_name, etc.';

-- =================================================================
-- CREATE conversation_context table
-- =================================================================
-- This table tracks conversation context for understanding ambiguous responses and follow-up questions

CREATE TABLE IF NOT EXISTS public.conversation_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id TEXT,
  current_question TEXT NOT NULL,
  assistant_response TEXT NOT NULL,
  user_response TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Ensure metadata is valid JSON
  CONSTRAINT conversation_context_metadata_valid CHECK (jsonb_typeof(metadata) = 'object')
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversation_context_session_id ON public.conversation_context(session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_context_timestamp ON public.conversation_context(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_context_user_id ON public.conversation_context(user_id) WHERE user_id IS NOT NULL;

-- Add GIN index for JSONB column
CREATE INDEX IF NOT EXISTS idx_conversation_context_metadata ON public.conversation_context USING GIN (metadata);

-- Add comment
COMMENT ON TABLE public.conversation_context IS 'Tracks conversation context for understanding ambiguous responses (e.g., "yes", "ok") and follow-up questions';
COMMENT ON COLUMN public.conversation_context.session_id IS 'Session identifier linking to conversation_memory';
COMMENT ON COLUMN public.conversation_context.user_id IS 'Optional user identifier for cross-session context';
COMMENT ON COLUMN public.conversation_context.current_question IS 'The question or context that the assistant provided';
COMMENT ON COLUMN public.conversation_context.assistant_response IS 'The assistant''s response or question to the user';
COMMENT ON COLUMN public.conversation_context.user_response IS 'The user''s response (e.g., "yes", "no", ambiguous responses)';
COMMENT ON COLUMN public.conversation_context.metadata IS 'Additional context: executive_name, context_type, request_id, ambiguous_response flag, etc.';

-- =================================================================
-- ENABLE ROW LEVEL SECURITY
-- =================================================================
ALTER TABLE public.attachment_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_context ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- CREATE RLS POLICIES
-- =================================================================

-- attachment_analysis policies
CREATE POLICY "Allow service role full access to attachment_analysis"
  ON public.attachment_analysis
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- conversation_context policies
CREATE POLICY "Allow service role full access to conversation_context"
  ON public.conversation_context
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =================================================================
-- GRANT PERMISSIONS
-- =================================================================
GRANT ALL ON public.attachment_analysis TO service_role;
GRANT ALL ON public.conversation_context TO service_role;

-- Grant authenticated users SELECT access if needed (adjust based on requirements)
-- GRANT SELECT ON public.attachment_analysis TO authenticated;
-- GRANT SELECT ON public.conversation_context TO authenticated;

-- =================================================================
-- MAINTENANCE FUNCTIONS
-- =================================================================

-- Function to cleanup old attachment analyses
CREATE OR REPLACE FUNCTION cleanup_old_attachment_analyses(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.attachment_analysis
  WHERE created_at < now() - (retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % old attachment analysis records older than % days', deleted_count, retention_days;
  
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_attachment_analyses IS 'Removes attachment analysis records older than specified retention period (default 30 days)';

-- Function to cleanup old conversation contexts
CREATE OR REPLACE FUNCTION cleanup_old_conversation_contexts(retention_days INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.conversation_context
  WHERE timestamp < now() - (retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % old conversation context records older than % days', deleted_count, retention_days;
  
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_conversation_contexts IS 'Removes conversation context records older than specified retention period (default 7 days)';

-- =================================================================
-- STATISTICS AND ANALYSIS FUNCTIONS
-- =================================================================

-- Function to get attachment analysis statistics
CREATE OR REPLACE FUNCTION get_attachment_analysis_stats(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  total_attachments BIGINT,
  by_file_type JSONB,
  by_language JSONB,
  avg_per_session NUMERIC,
  recent_sessions_with_attachments BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) AS total_attachments,
    jsonb_object_agg(file_type, count) AS by_file_type,
    jsonb_object_agg(detected_language, count) FILTER (WHERE detected_language IS NOT NULL) AS by_language,
    ROUND(COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT session_id), 0), 2) AS avg_per_session,
    COUNT(DISTINCT session_id) AS recent_sessions_with_attachments
  FROM public.attachment_analysis
  WHERE created_at >= now() - (days_back || ' days')::INTERVAL
  GROUP BY file_type, detected_language;
END;
$$;

COMMENT ON FUNCTION get_attachment_analysis_stats IS 'Returns statistics about attachment analysis over specified period';

-- =================================================================
-- VERIFY TABLES
-- =================================================================

DO $$
DECLARE
  attachment_exists BOOLEAN;
  context_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'attachment_analysis'
  ) INTO attachment_exists;
  
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'conversation_context'
  ) INTO context_exists;
  
  IF attachment_exists AND context_exists THEN
    RAISE NOTICE '✅ Migration completed successfully!';
    RAISE NOTICE '   • attachment_analysis table created';
    RAISE NOTICE '   • conversation_context table created';
    RAISE NOTICE '   • Indexes created';
    RAISE NOTICE '   • RLS policies enabled';
    RAISE NOTICE '   • Maintenance functions added';
  ELSE
    RAISE EXCEPTION '❌ Migration failed - tables not created';
  END IF;
END;
$$;
