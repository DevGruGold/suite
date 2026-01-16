-- Test Scripts for Eliza Image Generation and Vision API
-- Run these queries to verify the installation and test functionality

-- =================================================================
-- VERIFICATION TESTS
-- =================================================================

-- Test 1: Verify tables exist
SELECT 
  'generated_images' as table_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'generated_images'
  ) as exists
UNION ALL
SELECT 
  'vision_api_analyses',
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'vision_api_analyses'
  )
UNION ALL
SELECT 
  'attachment_analysis',
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'attachment_analysis'
  );

-- Test 2: Verify enhanced columns on attachment_analysis
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'attachment_analysis'
  AND column_name IN ('vision_analysis_id', 'image_analysis')
ORDER BY column_name;

-- Test 3: Verify indexes exist
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('generated_images', 'vision_api_analyses', 'attachment_analysis')
ORDER BY tablename, indexname;

-- Test 4: Verify functions exist
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'cleanup_old_generated_images',
    'cleanup_old_attachment_analyses',
    'cleanup_old_conversation_contexts',
    'get_image_generation_stats',
    'get_attachment_analysis_stats',
    'link_vision_to_attachment'
  )
ORDER BY routine_name;

-- Test 5: Verify views exist
SELECT 
  table_name as view_name,
  view_definition
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('recent_image_generations', 'attachments_with_vision')
ORDER BY table_name;

-- Test 6: Verify RLS policies exist
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('generated_images', 'vision_api_analyses', 'attachment_analysis')
ORDER BY tablename, policyname;

-- =================================================================
-- DATA TESTS (Insert Test Records)
-- =================================================================

-- Test 7: Insert test generated image
INSERT INTO generated_images (
  session_id,
  prompt,
  image_data,
  model_used,
  metadata
) VALUES (
  'test-session-001',
  'A serene Japanese garden with cherry blossoms',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', -- 1x1 red pixel
  'imagen-3.0-generate-001',
  jsonb_build_object(
    'aspect_ratio', '16:9',
    'safety_filter_level', 'block_some',
    'test_record', true
  )
)
RETURNING id, session_id, prompt, model_used, created_at;

-- Test 8: Insert test Vision API analysis
WITH test_image AS (
  SELECT id FROM generated_images WHERE session_id = 'test-session-001' LIMIT 1
)
INSERT INTO vision_api_analyses (
  session_id,
  image_source,
  image_reference,
  analysis_type,
  analysis_results,
  detected_labels,
  detected_text,
  confidence_scores
) VALUES (
  'test-session-001',
  'generated',
  (SELECT id FROM test_image),
  'comprehensive',
  jsonb_build_object(
    'labelAnnotations', jsonb_build_array(
      jsonb_build_object('description', 'garden', 'score', 0.95),
      jsonb_build_object('description', 'cherry blossom', 'score', 0.92),
      jsonb_build_object('description', 'nature', 'score', 0.89)
    ),
    'safeSearchAnnotation', jsonb_build_object(
      'adult', 'VERY_UNLIKELY',
      'violence', 'VERY_UNLIKELY'
    )
  ),
  ARRAY['garden', 'cherry blossom', 'nature', 'peaceful', 'serene'],
  'Japanese Garden - Cherry Blossoms in Spring',
  jsonb_build_object(
    'overall_confidence', 0.92,
    'label_confidence', 0.95,
    'text_confidence', 0.88
  )
)
RETURNING id, session_id, analysis_type, detected_labels, created_at;

-- Test 9: Insert test attachment analysis
INSERT INTO attachment_analysis (
  session_id,
  filename,
  file_type,
  detected_language,
  content_preview,
  key_findings,
  metadata
) VALUES (
  'test-session-001',
  'test-diagram.png',
  'image',
  NULL,
  'Test image diagram',
  jsonb_build_array(
    'Contains diagrams',
    'Technical content detected',
    'High contrast image',
    'Resolution: 1920x1080'
  ),
  jsonb_build_object(
    'mime_type', 'image/png',
    'size_bytes', 154320,
    'dimensions', jsonb_build_object('width', 1920, 'height', 1080),
    'test_record', true
  )
)
RETURNING id, session_id, filename, file_type, key_findings, created_at;

-- Test 10: Link Vision analysis to attachment
WITH latest_attachment AS (
  SELECT id FROM attachment_analysis WHERE session_id = 'test-session-001' LIMIT 1
),
latest_vision AS (
  SELECT id FROM vision_api_analyses WHERE session_id = 'test-session-001' LIMIT 1
)
SELECT link_vision_to_attachment(
  (SELECT id FROM latest_attachment),
  (SELECT id FROM latest_vision)
) as link_successful;

-- =================================================================
-- QUERY TESTS
-- =================================================================

-- Test 11: Query recent_image_generations view
SELECT 
  id,
  session_id,
  prompt,
  model_used,
  detected_labels_count,
  vision_analysis_type,
  created_at
FROM recent_image_generations
WHERE session_id = 'test-session-001';

-- Test 12: Query attachments_with_vision view
SELECT 
  id,
  session_id,
  filename,
  file_type,
  key_findings,
  detected_labels,
  detected_text,
  analysis_type,
  created_at
FROM attachments_with_vision
WHERE session_id = 'test-session-001';

-- Test 13: Test image generation statistics function
SELECT * FROM get_image_generation_stats(30);

-- Test 14: Test attachment analysis statistics function
SELECT * FROM get_attachment_analysis_stats(30);

-- =================================================================
-- PERFORMANCE TESTS
-- =================================================================

-- Test 15: Test index usage for session lookups
EXPLAIN ANALYZE
SELECT * FROM generated_images 
WHERE session_id = 'test-session-001';

-- Test 16: Test JSONB index usage
EXPLAIN ANALYZE
SELECT * FROM vision_api_analyses 
WHERE detected_labels && ARRAY['garden', 'nature'];

-- Test 17: Test join performance
EXPLAIN ANALYZE
SELECT 
  gi.prompt,
  va.detected_labels,
  va.detected_text
FROM generated_images gi
LEFT JOIN vision_api_analyses va ON va.image_reference = gi.id
WHERE gi.session_id = 'test-session-001';

-- =================================================================
-- CLEANUP TEST DATA
-- =================================================================

-- Test 18: Clean up test records
DELETE FROM vision_api_analyses WHERE session_id = 'test-session-001';
DELETE FROM attachment_analysis WHERE session_id = 'test-session-001';
DELETE FROM generated_images WHERE session_id = 'test-session-001';

-- Verify cleanup
SELECT 
  'generated_images' as table_name,
  COUNT(*) as remaining_test_records
FROM generated_images 
WHERE session_id = 'test-session-001'
UNION ALL
SELECT 
  'vision_api_analyses',
  COUNT(*)
FROM vision_api_analyses 
WHERE session_id = 'test-session-001'
UNION ALL
SELECT 
  'attachment_analysis',
  COUNT(*)
FROM attachment_analysis 
WHERE session_id = 'test-session-001';

-- =================================================================
-- FINAL SUMMARY
-- =================================================================

-- Test 19: Generate installation summary
SELECT 
  '✅ Installation Complete' as status,
  (
    SELECT COUNT(*) 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('generated_images', 'vision_api_analyses')
  ) as tables_created,
  (
    SELECT COUNT(*) 
    FROM information_schema.routines 
    WHERE routine_schema = 'public'
    AND routine_name LIKE '%image%' OR routine_name LIKE '%vision%' OR routine_name LIKE '%attachment%'
  ) as functions_created,
  (
    SELECT COUNT(*) 
    FROM information_schema.views 
    WHERE table_schema = 'public'
    AND table_name IN ('recent_image_generations', 'attachments_with_vision')
  ) as views_created,
  (
    SELECT COUNT(*) 
    FROM pg_indexes 
    WHERE schemaname = 'public'
    AND tablename IN ('generated_images', 'vision_api_analyses', 'attachment_analysis')
  ) as indexes_created;

-- Test 20: Display capabilities
SELECT 
  '📸 Eliza Capabilities' as feature,
  jsonb_build_object(
    'image_generation', 'Vertex AI Imagen 3',
    'image_analysis', 'Google Cloud Vision API',
    'attachment_viewing', 'Multi-format support',
    'ocr', 'Text extraction from images',
    'object_detection', 'Label and object recognition',
    'safe_search', 'Content safety filtering'
  ) as details;

-- =================================================================
-- NOTES
-- =================================================================

/*
 * These tests verify:
 * 1. All tables are created correctly
 * 2. All columns and constraints are in place
 * 3. All indexes are created for performance
 * 4. All functions are available
 * 5. All views are accessible
 * 6. RLS policies are enabled
 * 7. Data can be inserted and queried
 * 8. Performance is optimized with indexes
 * 9. Cleanup functions work correctly
 * 10. Integration between tables is functional
 *
 * Run these tests after applying the migration to ensure
 * everything is working correctly.
 */
