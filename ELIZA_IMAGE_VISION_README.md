# Eliza Image Generation & Vision API Integration

## Overview

This update enables Eliza to:
- ✅ **See and analyze user attachments** (images, documents, code files)
- ✅ **Generate images** using Vertex AI Imagen 3
- ✅ **Extract text from images** (OCR) using Google Cloud Vision API
- ✅ **Analyze image content** (objects, labels, colors, safe search)

## New Edge Functions

### 1. `vertex-ai-image-gen`
**Purpose**: Generate and analyze images using Vertex AI and Google Cloud Vision API

**Endpoints**:
- `POST /vertex-ai-image-gen` - Generate images with Imagen 3
- `POST /vertex-ai-image-gen` (action: `analyze_image`) - Analyze images with Vision API
- `POST /vertex-ai-image-gen` (action: `analyze_attachment`) - Analyze user attachments

**Example Usage**:
```typescript
// Generate an image
const response = await supabase.functions.invoke('vertex-ai-image-gen', {
  body: {
    action: 'generate_image',
    prompt: 'A serene Japanese garden with cherry blossoms',
    options: {
      aspectRatio: '16:9',
      numberOfImages: 1
    },
    session_id: 'user-session-123'
  }
});

// Analyze an image
const analysisResponse = await supabase.functions.invoke('vertex-ai-image-gen', {
  body: {
    action: 'analyze_image',
    image: 'base64EncodedImageData',
    features: ['LABEL_DETECTION', 'TEXT_DETECTION']
  }
});

// Analyze user attachment
const attachmentResponse = await supabase.functions.invoke('vertex-ai-image-gen', {
  body: {
    action: 'analyze_attachment',
    attachment: {
      filename: 'diagram.png',
      content: 'base64EncodedContent',
      mimeType: 'image/png'
    },
    session_id: 'user-session-123'
  }
});
```

## New Eliza Tools

### 1. `generate_image_vertex`
Generate images using Vertex AI Imagen 3

**Parameters**:
- `prompt` (required): Detailed description of image to generate
- `negative_prompt` (optional): Things to avoid in the image
- `aspect_ratio` (optional): 1:1, 16:9, 9:16, 4:3, or 3:4
- `number_of_images` (optional): 1-4 images
- `session_id` (optional): Session identifier

**Example**:
```json
{
  "prompt": "A futuristic cityscape at sunset with flying cars, cyberpunk style, neon lights, highly detailed",
  "aspect_ratio": "16:9",
  "number_of_images": 2
}
```

### 2. `analyze_image_vision`
Analyze images using Google Cloud Vision API

**Parameters**:
- `image` (required): Base64 encoded image
- `features` (optional): Array of Vision API features
- `session_id` (optional): Session identifier

**Features Available**:
- `LABEL_DETECTION` - Detect objects and scenes
- `TEXT_DETECTION` - Extract text (OCR)
- `FACE_DETECTION` - Detect faces
- `LANDMARK_DETECTION` - Identify landmarks
- `LOGO_DETECTION` - Detect brand logos
- `SAFE_SEARCH_DETECTION` - Safety ratings
- `IMAGE_PROPERTIES` - Colors and properties
- `WEB_DETECTION` - Find similar images online
- `OBJECT_LOCALIZATION` - Locate objects in image

### 3. `view_user_attachment`
View and analyze user-uploaded attachments

**Parameters**:
- `attachment` (required): Attachment object with filename, content, mimeType
- `session_id` (optional): Session identifier
- `analyze_image` (optional): Auto-analyze if image (default: true)

### 4. `extract_text_from_image`
Extract text from images (OCR)

**Parameters**:
- `image` (required): Base64 encoded image
- `language_hints` (optional): Language codes for better accuracy
- `session_id` (optional): Session identifier

### 5. `list_generated_images`
List previously generated images

**Parameters**:
- `session_id` (optional): Filter by session
- `limit` (optional): Max results (default: 10)
- `include_analysis` (optional): Include Vision analysis (default: true)

## Database Schema

### Table: `generated_images`
Tracks all AI-generated images

**Columns**:
- `id` (UUID): Primary key
- `session_id` (TEXT): Session identifier
- `prompt` (TEXT): Generation prompt
- `image_data` (TEXT): Base64 image data
- `image_url` (TEXT): Cloud Storage URL
- `model_used` (TEXT): AI model name
- `metadata` (JSONB): Additional options
- `created_at` (TIMESTAMPTZ): Creation time
- `updated_at` (TIMESTAMPTZ): Last update

**Indexes**:
- `idx_generated_images_session_id` - Fast session lookups
- `idx_generated_images_created_at` - Chronological queries
- `idx_generated_images_model_used` - Filter by model
- `idx_generated_images_metadata` - JSONB search

### Table: `vision_api_analyses`
Stores Vision API analysis results

**Columns**:
- `id` (UUID): Primary key
- `session_id` (TEXT): Session identifier
- `image_source` (TEXT): Source type (generated, uploaded, url, attachment)
- `image_reference` (UUID): FK to generated_images
- `analysis_type` (TEXT): Type of analysis performed
- `analysis_results` (JSONB): Full Vision API response
- `confidence_scores` (JSONB): Detection confidence
- `detected_labels` (TEXT[]): Detected object labels
- `detected_text` (TEXT): Extracted text
- `metadata` (JSONB): Additional data
- `created_at` (TIMESTAMPTZ): Analysis time

**Indexes**:
- `idx_vision_api_analyses_session_id` - Fast session lookups
- `idx_vision_api_analyses_image_ref` - Link to generated images
- `idx_vision_api_analyses_labels` - Search by detected labels
- `idx_vision_api_analyses_results` - JSONB search

### Enhanced: `attachment_analysis`
Extended with Vision API support

**New Columns**:
- `vision_analysis_id` (UUID): FK to vision_api_analyses
- `image_analysis` (JSONB): Cached Vision results

## Views

### `recent_image_generations`
Shows recent image generations with Vision analysis

```sql
SELECT * FROM recent_image_generations LIMIT 10;
```

### `attachments_with_vision`
Shows image attachments with Vision analysis

```sql
SELECT * FROM attachments_with_vision 
WHERE session_id = 'your-session-id';
```

## Maintenance Functions

### Cleanup Functions

```sql
-- Remove old generated images (default: 90 days)
SELECT cleanup_old_generated_images(90);

-- Remove old attachment analyses (default: 30 days)
SELECT cleanup_old_attachment_analyses(30);

-- Remove old conversation contexts (default: 7 days)
SELECT cleanup_old_conversation_contexts(7);
```

### Statistics Functions

```sql
-- Get image generation stats (last 30 days)
SELECT * FROM get_image_generation_stats(30);

-- Get attachment analysis stats (last 30 days)
SELECT * FROM get_attachment_analysis_stats(30);
```

### Utility Functions

```sql
-- Link Vision analysis to attachment
SELECT link_vision_to_attachment(
  'attachment-uuid'::UUID,
  'vision-analysis-uuid'::UUID
);
```

## Configuration

### Required Environment Variables

```bash
# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT_ID=xmrt-dao
GOOGLE_CLOUD_LOCATION=us-central1

# OAuth Credentials (from google-cloud-auth)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token

# Supabase
SUPABASE_URL=https://vawouugtzwmejxqkeqqj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Required Google Cloud APIs

Enable these APIs in Google Cloud Console:
1. **Vertex AI API** - For Imagen 3 image generation
2. **Cloud Vision API** - For image analysis
3. **Cloud Storage API** - For storing large images (optional)

### Required OAuth Scopes

These scopes are already configured in `google-cloud-auth`:
- `https://www.googleapis.com/auth/cloud-platform` - Full Cloud Platform access
- `https://www.googleapis.com/auth/generative-language.retriever` - Gemini/AI access

## Integration with Eliza AI Chat

The new tools are automatically available in:
- `ai-chat` function
- `gemini-chat` function
- `deepseek-chat` function
- `vertex-ai-chat` function

### Usage in Chat

**Generate an image**:
```
User: "Generate an image of a sunset over mountains"
Eliza: *calls generate_image_vertex* → Returns generated image
```

**Analyze an attachment**:
```
User: *uploads image* "What's in this image?"
Eliza: *calls view_user_attachment* → Analyzes and describes content
```

**Extract text from screenshot**:
```
User: *uploads screenshot* "Extract the text from this"
Eliza: *calls extract_text_from_image* → Returns OCR text
```

## Testing

### Test Image Generation

```typescript
const { data, error } = await supabase.functions.invoke('vertex-ai-image-gen', {
  body: {
    action: 'generate_image',
    prompt: 'A cute robot assistant with blue eyes',
    options: {
      aspectRatio: '1:1',
      numberOfImages: 1
    }
  }
});

console.log('Generated image:', data.images[0].bytesBase64Encoded);
```

### Test Vision API Analysis

```typescript
const { data, error } = await supabase.functions.invoke('vertex-ai-image-gen', {
  body: {
    action: 'analyze_image',
    image: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
    features: ['LABEL_DETECTION', 'TEXT_DETECTION']
  }
});

console.log('Detected labels:', data.labels);
console.log('Detected text:', data.textDetections);
```

### Test Attachment Viewing

```typescript
const { data, error } = await supabase.functions.invoke('vertex-ai-image-gen', {
  body: {
    action: 'analyze_attachment',
    attachment: {
      filename: 'test-diagram.png',
      content: 'base64ImageData',
      mimeType: 'image/png'
    }
  }
});

console.log('Attachment analysis:', data);
```

## Troubleshooting

### Common Issues

1. **"Google Cloud authentication failed"**
   - Run OAuth flow: `GET /google-cloud-auth?action=get_authorization_url`
   - Complete authorization and store refresh token

2. **"Imagen generation failed: 403"**
   - Verify Vertex AI API is enabled
   - Check Google Cloud Project ID is correct
   - Ensure OAuth token has `cloud-platform` scope

3. **"Vision API failed: 400"**
   - Verify image is properly base64 encoded
   - Remove data URL prefix before sending
   - Check image size (< 20MB for Vision API)

4. **Tables not found**
   - Run migration: `20260116000000_eliza_image_generation_and_vision.sql`
   - Check Supabase migrations dashboard

### Debug Commands

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('generated_images', 'vision_api_analyses');

-- Check recent generations
SELECT id, prompt, model_used, created_at 
FROM generated_images 
ORDER BY created_at DESC 
LIMIT 5;

-- Check recent analyses
SELECT id, analysis_type, detected_labels, created_at 
FROM vision_api_analyses 
ORDER BY created_at DESC 
LIMIT 5;

-- Check attachment analyses with Vision
SELECT * FROM attachments_with_vision 
LIMIT 10;
```

## Security Considerations

1. **Rate Limiting**: Vertex AI and Vision API have rate limits
2. **Cost Management**: Image generation costs ~$0.02-0.04 per image
3. **Content Filtering**: Imagen 3 has built-in safety filters
4. **Data Privacy**: Generated images are stored in database (consider Cloud Storage for production)
5. **OAuth Tokens**: Refresh tokens are securely stored in `oauth_connections` table

## Performance

- **Image Generation**: ~5-10 seconds per image
- **Vision API Analysis**: ~1-2 seconds per image
- **OCR**: ~2-3 seconds for document-sized images
- **Attachment Processing**: ~1-5 seconds depending on file type

## Future Enhancements

- [ ] Cloud Storage integration for large images
- [ ] Batch image generation support
- [ ] Video analysis using Vertex AI
- [ ] Advanced OCR with layout preservation
- [ ] Image editing and manipulation
- [ ] Style transfer and image-to-image generation
- [ ] Custom model fine-tuning support

## Support

For issues or questions:
1. Check Supabase edge function logs
2. Review Google Cloud Console logs
3. Check `edge_function_logs` table in database
4. Review error responses from API calls

## License

MIT License - see LICENSE file for details
