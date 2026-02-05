/**
 * Vertex AI Image Generation Function
 * Handles image generation, analysis using Google Cloud Vertex AI and Vision API
 * 
 * Features:
 * - Image generation using Imagen 3
 * - Image analysis using Vision API
 * - Attachment viewing and analysis
 * - Support for multimodal inputs
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Google Cloud Project Configuration
const GOOGLE_CLOUD_PROJECT_ID = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID') || 'xmrt-dao';
const GOOGLE_CLOUD_LOCATION = Deno.env.get('GOOGLE_CLOUD_LOCATION') || 'us-central1';

// Vertex AI endpoints
const VERTEX_AI_BASE_URL = `https://${GOOGLE_CLOUD_LOCATION}-aiplatform.googleapis.com/v1`;
const IMAGEN_ENDPOINT = `${VERTEX_AI_BASE_URL}/projects/${GOOGLE_CLOUD_PROJECT_ID}/locations/${GOOGLE_CLOUD_LOCATION}/publishers/google/models/imagen-3.0-generate-001:predict`;
const VISION_ENDPOINT = `https://vision.googleapis.com/v1/images:annotate`;

/**
 * Get Google Cloud access token from google-cloud-auth function
 */
async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('google-cloud-auth', {
    body: { action: 'get_access_token', auth_type: 'service_account' }
  });

  if (error || !data?.access_token) {
    console.error('Failed to get Google OAuth token:', error);
    throw new Error('Google Cloud authentication failed');
  }

  return data.access_token;
}

/**
 * Generate image using Vertex AI Imagen 3
 */
async function generateImage(
  accessToken: string,
  prompt: string,
  options: {
    negativePrompt?: string;
    numberOfImages?: number;
    aspectRatio?: string;
    safetyFilterLevel?: string;
    personGeneration?: string;
  } = {}
): Promise<any> {
  const requestBody = {
    instances: [
      {
        prompt: prompt,
      }
    ],
    parameters: {
      sampleCount: options.numberOfImages || 1,
      aspectRatio: options.aspectRatio || "1:1", // Options: 1:1, 9:16, 16:9, 4:3, 3:4
      negativePrompt: options.negativePrompt || "",
      safetyFilterLevel: options.safetyFilterLevel || "block_some",
      personGeneration: options.personGeneration || "dont_allow"
    }
  };

  console.log('🎨 Generating image with Vertex AI Imagen 3:', { prompt, options });

  const response = await fetch(IMAGEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Vertex AI Imagen generation failed:', response.status, errorText);
    throw new Error(`Imagen generation failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();

  // Extract generated images from response
  const predictions = result.predictions || [];
  const images = predictions.map((pred: any) => ({
    bytesBase64Encoded: pred.bytesBase64Encoded,
    mimeType: pred.mimeType || 'image/png',
    imageSize: pred.imageSize,
  }));

  return {
    success: true,
    images: images,
    prompt: prompt,
    modelUsed: 'imagen-3.0-generate-001',
    timestamp: new Date().toISOString()
  };
}

/**
 * Analyze image using Google Cloud Vision API
 */
async function analyzeImageWithVision(
  accessToken: string,
  imageContent: string, // base64 encoded image
  features: string[] = ['LABEL_DETECTION', 'TEXT_DETECTION', 'SAFE_SEARCH_DETECTION', 'IMAGE_PROPERTIES']
): Promise<any> {
  const requestBody = {
    requests: [
      {
        image: {
          content: imageContent // base64 encoded image without data:image prefix
        },
        features: features.map(feature => ({
          type: feature,
          maxResults: 10
        }))
      }
    ]
  };

  console.log('🔍 Analyzing image with Google Cloud Vision API');

  const response = await fetch(VISION_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Vision API analysis failed:', response.status, errorText);
    throw new Error(`Vision API failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  const analysis = result.responses?.[0] || {};

  // Parse analysis results
  return {
    success: true,
    labels: (analysis.labelAnnotations || []).map((label: any) => ({
      description: label.description,
      score: label.score,
      topicality: label.topicality
    })),
    textDetections: (analysis.textAnnotations || []).map((text: any) => ({
      description: text.description,
      locale: text.locale
    })),
    safeSearch: analysis.safeSearchAnnotation || {},
    imageProperties: {
      dominantColors: analysis.imagePropertiesAnnotation?.dominantColors?.colors?.map((color: any) => ({
        color: color.color,
        score: color.score,
        pixelFraction: color.pixelFraction
      })) || []
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Analyze attachment (image, document, etc.)
 */
async function analyzeAttachment(
  accessToken: string,
  attachment: {
    filename: string;
    content?: string; // base64 content
    mimeType?: string;
    url?: string;
  }
): Promise<any> {
  console.log('📎 Analyzing attachment:', attachment.filename);

  // If it's an image, use Vision API
  if (attachment.mimeType?.startsWith('image/')) {
    // Remove data URL prefix if present
    let imageContent = attachment.content || '';
    if (imageContent.includes('base64,')) {
      imageContent = imageContent.split('base64,')[1];
    }

    const analysis = await analyzeImageWithVision(accessToken, imageContent);

    return {
      success: true,
      filename: attachment.filename,
      fileType: 'image',
      mimeType: attachment.mimeType,
      analysis: analysis,
      timestamp: new Date().toISOString()
    };
  }

  // For other file types, provide basic analysis
  return {
    success: true,
    filename: attachment.filename,
    fileType: 'document',
    mimeType: attachment.mimeType || 'application/octet-stream',
    note: 'Full document analysis requires additional processing',
    timestamp: new Date().toISOString()
  };
}

/**
 * Save generated image metadata to database
 */
async function saveGeneratedImage(
  sessionId: string,
  prompt: string,
  imageData: string,
  metadata: any = {}
): Promise<void> {
  try {
    await supabase
      .from('generated_images')
      .insert({
        session_id: sessionId,
        prompt: prompt,
        image_data: imageData,
        model_used: 'imagen-3.0-generate-001',
        metadata: metadata,
        created_at: new Date().toISOString()
      });

    console.log('💾 Saved generated image to database');
  } catch (error) {
    console.warn('⚠️ Failed to save generated image:', error);
  }
}

/**
 * Main request handler
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // GET request - return function status
    if (req.method === 'GET') {
      return new Response(JSON.stringify({
        success: true,
        function: 'vertex-ai-image-gen',
        status: 'operational',
        capabilities: [
          'image_generation',
          'image_analysis',
          'attachment_viewing',
          'vision_api'
        ],
        models: {
          generation: 'imagen-3.0-generate-001',
          analysis: 'google-cloud-vision-api'
        },
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // POST request - handle action
    if (req.method === 'POST') {
      const body = await req.json();
      const action = body.action || 'generate_image';
      const sessionId = body.session_id || body.sessionId || 'default';

      console.log(`🎯 vertex-ai-image-gen: action=${action}, session=${sessionId}`);

      // Get Google Cloud access token
      const accessToken = await getAccessToken();

      switch (action) {
        case 'generate_image': {
          const { prompt, options = {} } = body;

          if (!prompt) {
            return new Response(JSON.stringify({
              success: false,
              error: 'Missing prompt parameter'
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const result = await generateImage(accessToken, prompt, options);

          // Save first generated image to database
          if (result.images && result.images.length > 0) {
            await saveGeneratedImage(
              sessionId,
              prompt,
              result.images[0].bytesBase64Encoded,
              {
                options,
                modelUsed: result.modelUsed
              }
            );
          }

          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        case 'analyze_image': {
          const { image, features } = body;

          if (!image) {
            return new Response(JSON.stringify({
              success: false,
              error: 'Missing image parameter (base64 encoded image required)'
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Remove data URL prefix if present
          let imageContent = image;
          if (imageContent.includes('base64,')) {
            imageContent = imageContent.split('base64,')[1];
          }

          const result = await analyzeImageWithVision(accessToken, imageContent, features);

          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        case 'analyze_attachment': {
          const { attachment } = body;

          if (!attachment || !attachment.filename) {
            return new Response(JSON.stringify({
              success: false,
              error: 'Missing attachment parameter with filename'
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const result = await analyzeAttachment(accessToken, attachment);

          // Save analysis to database
          try {
            await supabase
              .from('attachment_analysis')
              .insert({
                session_id: sessionId,
                filename: attachment.filename,
                file_type: result.fileType,
                detected_language: null,
                content_preview: null,
                key_findings: result.analysis?.labels?.slice(0, 5).map((l: any) => l.description) || [],
                metadata: {
                  mime_type: attachment.mimeType,
                  analysis_result: result.analysis,
                  analyzed_at: new Date().toISOString()
                },
                created_at: new Date().toISOString()
              });
          } catch (dbError) {
            console.warn('⚠️ Failed to save attachment analysis:', dbError);
          }

          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        default:
          return new Response(JSON.stringify({
            success: false,
            error: `Unknown action: ${action}`,
            available_actions: ['generate_image', 'analyze_image', 'analyze_attachment']
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: `Method ${req.method} not supported`
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('vertex-ai-image-gen error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
