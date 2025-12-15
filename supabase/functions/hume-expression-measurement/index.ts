import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { startUsageTrackingWithRequest } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'hume-expression-measurement';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExpressionRequest {
  image: string; // base64 encoded image
  models?: string[]; // e.g., ['face', 'prosody']
}

interface HumeEmotion {
  name: string;
  score: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let body: ExpressionRequest = { image: '' };
  try {
    body = await req.json();
  } catch { body = { image: '' }; }

  const usageTracker = startUsageTrackingWithRequest(FUNCTION_NAME, req, { models: body.models });

  const startTime = Date.now();
  console.log('🎭 Hume Expression Measurement request received');

  try {
    const HUME_API_KEY = Deno.env.get('HUME_API_KEY');
    if (!HUME_API_KEY) {
      await usageTracker.failure('HUME_API_KEY not configured', 500);
      throw new Error('HUME_API_KEY not configured');
    }
    
    if (!body.image) {
      await usageTracker.failure('Missing image data', 400);
      return new Response(
        JSON.stringify({ error: 'Missing image data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const models = body.models || ['face'];
    
    console.log(`📸 Processing image for models: ${models.join(', ')}`);

    // Use Hume's streaming inference API for real-time analysis
    // This is the correct endpoint for single image analysis
    const humeResponse = await fetch('https://api.hume.ai/v0/batch/jobs', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': HUME_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        models: {
          face: models.includes('face') ? {} : undefined,
        },
        urls: [],
        text: [],
        // Note: batch API requires file uploads, not inline base64
        // We'll use the streaming endpoint instead
      }),
    });

    // For immediate results, use the streaming WebSocket approach via HTTP
    // Hume's /v0/stream endpoint accepts POST with base64 data
    const streamResponse = await fetch('https://api.hume.ai/v0/models/infer', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': HUME_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        models: {
          face: {}
        },
        raw_data: [{
          file: body.image, // base64 image data
          content_type: 'image/jpeg'
        }]
      }),
    });

    if (streamResponse.ok) {
      const result = await streamResponse.json();
      console.log('✅ Hume API responded successfully');
      
      // Extract emotions from Hume response
      const emotions: HumeEmotion[] = [];
      
      if (result.face?.predictions?.[0]?.emotions) {
        const rawEmotions = result.face.predictions[0].emotions;
        rawEmotions
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 10)
          .forEach((e: any) => {
            emotions.push({
              name: e.name,
              score: e.score
            });
          });
      }

      // Also check alternative response format
      if (result[0]?.results?.predictions?.[0]?.models?.face?.grouped_predictions?.[0]?.predictions?.[0]?.emotions) {
        const rawEmotions = result[0].results.predictions[0].models.face.grouped_predictions[0].predictions[0].emotions;
        rawEmotions
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 10)
          .forEach((e: any) => {
            if (!emotions.find(em => em.name === e.name)) {
              emotions.push({
                name: e.name,
                score: e.score
              });
            }
          });
      }

      const executionTime = Date.now() - startTime;
      console.log(`✅ Expression analysis complete in ${executionTime}ms`);
      if (emotions.length > 0) {
        console.log(`   Top emotion: ${emotions[0].name} (${(emotions[0].score * 100).toFixed(1)}%)`);
      }

      await usageTracker.success({ result_summary: `Emotions detected: ${emotions.length}` });
      return new Response(
        JSON.stringify({
          success: true,
          emotions: emotions.length > 0 ? emotions : [],
          faceDetected: emotions.length > 0,
          executionTimeMs: executionTime,
          model: 'face',
          source: 'hume-api',
          note: 'Real Hume AI Expression Measurement API'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // If streaming endpoint fails, try the multipart form approach
    console.log('⚠️ Streaming endpoint unavailable, trying multipart approach...');
    
    // Convert base64 to blob for multipart upload
    const binaryData = Uint8Array.from(atob(body.image), c => c.charCodeAt(0));
    const blob = new Blob([binaryData], { type: 'image/jpeg' });
    
    const formData = new FormData();
    formData.append('file', blob, 'frame.jpg');
    formData.append('json', JSON.stringify({
      models: { face: {} }
    }));

    const formResponse = await fetch('https://api.hume.ai/v0/batch/jobs', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': HUME_API_KEY,
      },
      body: formData,
    });

    if (formResponse.ok) {
      const jobResult = await formResponse.json();
      console.log('📋 Batch job created:', jobResult);
      
      // For batch jobs, we'd need to poll for results
      // This is not ideal for real-time, so return placeholder
      return new Response(
        JSON.stringify({
          success: true,
          emotions: [],
          faceDetected: false,
          executionTimeMs: Date.now() - startTime,
          model: 'face',
          source: 'hume-batch',
          jobId: jobResult.job_id,
          note: 'Batch job created - results pending. Use WebSocket streaming for real-time analysis.'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Log error details
    const errorText = await streamResponse.text();
    console.error('❌ Hume API error:', streamResponse.status, errorText);

    // Return empty result instead of error for graceful degradation
    return new Response(
      JSON.stringify({
        success: false,
        emotions: [],
        faceDetected: false,
        executionTimeMs: Date.now() - startTime,
        model: 'face',
        source: 'error',
        error: `Hume API returned ${streamResponse.status}`,
        note: 'API call failed. Ensure HUME_API_KEY is valid and has Expression Measurement access.'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Expression measurement error:', error);
    await usageTracker.failure(error instanceof Error ? error.message : 'Expression analysis failed', 500);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Expression analysis failed',
        emotions: [],
        faceDetected: false,
        source: 'error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
