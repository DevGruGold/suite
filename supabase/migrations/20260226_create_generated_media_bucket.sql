-- Create the generated-media storage bucket for AI-generated images and videos
INSERT INTO storage.buckets (
        id,
        name,
        public,
        file_size_limit,
        allowed_mime_types
    )
VALUES (
        'generated-media',
        'generated-media',
        true,
        -- public read (URLs work without auth)
        52428800,
        -- 50 MB per file limit
        ARRAY [
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
    ) ON CONFLICT (id) DO NOTHING;
-- Allow service role (edge functions) to upload
CREATE POLICY "service_role_upload_generated_media" ON storage.objects FOR
INSERT TO service_role WITH CHECK (bucket_id = 'generated-media');
-- Allow public (anon) to read/download
CREATE POLICY "public_read_generated_media" ON storage.objects FOR
SELECT TO anon,
    authenticated USING (bucket_id = 'generated-media');
-- Allow service role to update/overwrite
CREATE POLICY "service_role_update_generated_media" ON storage.objects FOR
UPDATE TO service_role USING (bucket_id = 'generated-media');