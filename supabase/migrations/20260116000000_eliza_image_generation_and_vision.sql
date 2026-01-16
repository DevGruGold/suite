-- Migration: Enhanced Image and Attachment Support for Eliza
-- Purpose: Add tables for image generation tracking and enhanced attachment viewing
-- Date: 2026-01-16

-- =================================================================
-- CREATE generated_images table
-- =================================================================
-- Track all AI-generated images for retrieval and analysis

CREATE TABLE IF NOT EXISTS public.generated_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  image_data TEXT, -- base64 encoded image
  image_url TEXT, -- URL to stored image (Google Cloud Storage, etc.)
  model_used TEXT NOT NULL DEFAULT 'imagen-3.0-generate-001',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraints
  CONSTRAINT generated_images_metadata_valid CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT generated_images_has_data_or_url CHECK (
    image_data IS NOT NULL OR image_url IS NOT NULL
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_generated_images_session_id ON public.generated_images(session_id);
CREATE INDEX IF NOT EXISTS idx_generated_images_created_at ON public.generated_images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_images_model_used ON public.generated_images(model_used);
CREATE INDEX IF NOT EXISTS idx_generated_images_metadata ON public.generated_images USING GIN (metadata);

-- Add comments
COMMENT ON TABLE public.generated_images IS 'Tracks all AI-generated images using Vertex AI Imagen and other models';
COMMENT ON COLUMN public.generated_images.session_id IS 'Session identifier linking to conversation';
COMMENT ON COLUMN public.generated_images.prompt IS 'Text prompt used to generate the image';
COMMENT ON COLUMN public.generated_images.image_data IS 'Base64 encoded image data (for small images)';
COMMENT ON COLUMN public.generated_images.image_url IS 'URL to stored image in Cloud Storage (for large images)';
COMMENT ON COLUMN public.generated_images.model_used IS 'AI model used for generation (e.g., imagen-3.0-generate-001)';
COMMENT ON COLUMN public.generated_images.metadata IS 'Additional metadata: aspect_ratio, safety_filters, generation_options, etc.';

-- =================================================================
-- CREATE vision_api_analyses table  
-- =================================================================
-- Track Vision API analysis results for images

CREATE TABLE IF NOT EXISTS public.vision_api_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  image_source TEXT, -- 'generated', 'uploaded', 'url', 'attachment'
  image_reference UUID REFERENCES public.generated_images(id) ON DELETE SET NULL,
  analysis_type TEXT NOT NULL, -- 'label_detection', 'text_detection', 'safe_search', etc.
  analysis_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_scores JSONB DEFAULT '{}'::jsonb,
  detected_labels TEXT[] DEFAULT ARRAY[]::TEXT[],
  detected_text TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraints
  CONSTRAINT vision_api_analyses_results_valid CHECK (jsonb_typeof(analysis_results) = 'object'),
  CONSTRAINT vision_api_analyses_scores_valid CHECK (jsonb_typeof(confidence_scores) = 'object'),
  CONSTRAINT vision_api_analyses_metadata_valid CHECK (jsonb_typeof(metadata) = 'object')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vision_api_analyses_session_id ON public.vision_api_analyses(session_id);
CREATE INDEX IF NOT EXISTS idx_vision_api_analyses_image_ref ON public.vision_api_analyses(image_reference) WHERE image_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vision_api_analyses_created_at ON public.vision_api_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vision_api_analyses_type ON public.vision_api_analyses(analysis_type);
CREATE INDEX IF NOT EXISTS idx_vision_api_analyses_labels ON public.vision_api_analyses USING GIN (detected_labels);
CREATE INDEX IF NOT EXISTS idx_vision_api_analyses_results ON public.vision_api_analyses USING GIN (analysis_results);

-- Add comments
COMMENT ON TABLE public.vision_api_analyses IS 'Stores Google Cloud Vision API analysis results for images';
COMMENT ON COLUMN public.vision_api_analyses.image_source IS 'Source of the image: generated, uploaded, url, or attachment';
COMMENT ON COLUMN public.vision_api_analyses.image_reference IS 'Reference to generated_images table if applicable';
COMMENT ON COLUMN public.vision_api_analyses.analysis_type IS 'Type of Vision API analysis performed';
COMMENT ON COLUMN public.vision_api_analyses.analysis_results IS 'Full JSON response from Vision API';
COMMENT ON COLUMN public.vision_api_analyses.confidence_scores IS 'Confidence scores for detections';
COMMENT ON COLUMN public.vision_api_analyses.detected_labels IS 'Array of detected object/scene labels';
COMMENT ON COLUMN public.vision_api_analyses.detected_text IS 'Extracted text from image (OCR)';

-- =================================================================
-- ENHANCE attachment_analysis table
-- =================================================================
-- Add vision analysis support to existing attachment_analysis table

DO $$
BEGIN
  -- Add vision_analysis_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'attachment_analysis' 
    AND column_name = 'vision_analysis_id'
  ) THEN
    ALTER TABLE public.attachment_analysis 
    ADD COLUMN vision_analysis_id UUID REFERENCES public.vision_api_analyses(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_attachment_analysis_vision_id 
    ON public.attachment_analysis(vision_analysis_id) 
    WHERE vision_analysis_id IS NOT NULL;
    
    COMMENT ON COLUMN public.attachment_analysis.vision_analysis_id IS 'Reference to Vision API analysis if image was analyzed';
    
    RAISE NOTICE '✅ Added vision_analysis_id column to attachment_analysis';
  END IF;
  
  -- Add image_analysis JSONB column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'attachment_analysis' 
    AND column_name = 'image_analysis'
  ) THEN
    ALTER TABLE public.attachment_analysis 
    ADD COLUMN image_analysis JSONB DEFAULT NULL,
    ADD CONSTRAINT attachment_analysis_image_analysis_valid 
      CHECK (image_analysis IS NULL OR jsonb_typeof(image_analysis) = 'object');
    
    CREATE INDEX IF NOT EXISTS idx_attachment_analysis_image_analysis 
    ON public.attachment_analysis USING GIN (image_analysis) 
    WHERE image_analysis IS NOT NULL;
    
    COMMENT ON COLUMN public.attachment_analysis.image_analysis IS 'Cached Vision API analysis results for image attachments';
    
    RAISE NOTICE '✅ Added image_analysis column to attachment_analysis';
  END IF;
END $$;

-- =================================================================
-- ENABLE ROW LEVEL SECURITY
-- =================================================================
ALTER TABLE public.generated_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vision_api_analyses ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- CREATE RLS POLICIES
-- =================================================================

-- generated_images policies
CREATE POLICY "Allow service role full access to generated_images"
  ON public.generated_images
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- vision_api_analyses policies
CREATE POLICY "Allow service role full access to vision_api_analyses"
  ON public.vision_api_analyses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =================================================================
-- GRANT PERMISSIONS
-- =================================================================
GRANT ALL ON public.generated_images TO service_role;
GRANT ALL ON public.vision_api_analyses TO service_role;

-- =================================================================
-- MAINTENANCE FUNCTIONS
-- =================================================================

-- Function to cleanup old generated images
CREATE OR REPLACE FUNCTION cleanup_old_generated_images(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.generated_images
  WHERE created_at < now() - (retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % old generated image records older than % days', deleted_count, retention_days;
  
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_generated_images IS 'Removes generated image records older than specified retention period (default 90 days)';

-- Function to get image generation statistics
CREATE OR REPLACE FUNCTION get_image_generation_stats(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  total_images BIGINT,
  by_model JSONB,
  unique_sessions BIGINT,
  avg_per_session NUMERIC,
  recent_prompts TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*) AS total,
      jsonb_object_agg(model_used, model_count) AS models,
      COUNT(DISTINCT session_id) AS sessions,
      ROUND(COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT session_id), 0), 2) AS avg_per_sess,
      ARRAY_AGG(DISTINCT prompt ORDER BY created_at DESC) FILTER (WHERE prompt IS NOT NULL) AS prompts
    FROM public.generated_images
    CROSS JOIN LATERAL (
      SELECT model_used, COUNT(*) as model_count
      FROM public.generated_images gi2
      WHERE gi2.created_at >= now() - (days_back || ' days')::INTERVAL
      GROUP BY model_used
    ) model_counts
    WHERE created_at >= now() - (days_back || ' days')::INTERVAL
    GROUP BY model_used
  )
  SELECT 
    total,
    models,
    sessions,
    avg_per_sess,
    prompts[1:5] -- Return top 5 recent prompts
  FROM stats
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION get_image_generation_stats IS 'Returns statistics about image generation over specified period';

-- Function to link Vision analysis to attachment
CREATE OR REPLACE FUNCTION link_vision_to_attachment(
  p_attachment_id UUID,
  p_vision_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.attachment_analysis
  SET 
    vision_analysis_id = p_vision_id,
    updated_at = now()
  WHERE id = p_attachment_id;
  
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION link_vision_to_attachment IS 'Links a Vision API analysis to an attachment analysis record';

-- =================================================================
-- CREATE VIEWS FOR EASY QUERYING
-- =================================================================

-- View: recent_image_generations
CREATE OR REPLACE VIEW public.recent_image_generations AS
SELECT 
  gi.id,
  gi.session_id,
  gi.prompt,
  gi.model_used,
  gi.created_at,
  COALESCE(
    jsonb_array_length(va.analysis_results->'labels'),
    0
  ) AS detected_labels_count,
  va.detected_text,
  va.analysis_type AS vision_analysis_type
FROM public.generated_images gi
LEFT JOIN public.vision_api_analyses va 
  ON va.image_reference = gi.id
WHERE gi.created_at >= now() - INTERVAL '7 days'
ORDER BY gi.created_at DESC
LIMIT 100;

COMMENT ON VIEW public.recent_image_generations IS 'Shows recent image generations with optional Vision API analysis';

-- View: attachment_with_vision
CREATE OR REPLACE VIEW public.attachments_with_vision AS
SELECT 
  aa.id,
  aa.session_id,
  aa.filename,
  aa.file_type,
  aa.key_findings,
  aa.created_at,
  va.detected_labels,
  va.detected_text,
  va.confidence_scores,
  va.analysis_type
FROM public.attachment_analysis aa
LEFT JOIN public.vision_api_analyses va 
  ON va.id = aa.vision_analysis_id
WHERE aa.file_type = 'image'
ORDER BY aa.created_at DESC;

COMMENT ON VIEW public.attachments_with_vision IS 'Shows image attachments with their Vision API analysis results';

-- =================================================================
-- TRIGGERS FOR UPDATED_AT
-- =================================================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply trigger to generated_images
DROP TRIGGER IF EXISTS update_generated_images_updated_at ON public.generated_images;
CREATE TRIGGER update_generated_images_updated_at
  BEFORE UPDATE ON public.generated_images
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =================================================================
-- VERIFY TABLES
-- =================================================================

DO $$
DECLARE
  generated_images_exists BOOLEAN;
  vision_api_analyses_exists BOOLEAN;
  attachment_enhanced BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'generated_images'
  ) INTO generated_images_exists;
  
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'vision_api_analyses'
  ) INTO vision_api_analyses_exists;
  
  SELECT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'attachment_analysis'
    AND column_name = 'vision_analysis_id'
  ) INTO attachment_enhanced;
  
  IF generated_images_exists AND vision_api_analyses_exists AND attachment_enhanced THEN
    RAISE NOTICE '✅ Migration completed successfully!';
    RAISE NOTICE '   • generated_images table created';
    RAISE NOTICE '   • vision_api_analyses table created';
    RAISE NOTICE '   • attachment_analysis table enhanced with Vision API support';
    RAISE NOTICE '   • Indexes, views, and functions created';
    RAISE NOTICE '   • RLS policies enabled';
    RAISE NOTICE '';
    RAISE NOTICE '📸 Eliza can now:';
    RAISE NOTICE '   ✓ Generate images using Vertex AI Imagen 3';
    RAISE NOTICE '   ✓ Analyze images using Google Cloud Vision API';
    RAISE NOTICE '   ✓ View and analyze attachments from users';
    RAISE NOTICE '   ✓ Track all generated images and analyses';
  ELSE
    RAISE EXCEPTION '❌ Migration failed - tables not created';
  END IF;
END;
$$;
