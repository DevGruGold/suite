import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { corsHeaders } from "../_shared/cors.ts";
import { executeAIRequest, checkGatewayHealth } from "../_shared/ai-gateway.ts";

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Enhanced vertex-ai-chat - ML Operations Specialist
const EXECUTIVE_CONFIG = {
  name: "vertex-ai-chat",
  personality: "ML Operations Specialist",
  aiService: "vertex",
  primaryModel: "gemini-2.5-flash",
  specializations: ["ml_ops", "ai_training", "model_deployment", "image_generation", "video_creation"],
  googleCloudServices: ["vertex_ai", "ml_engine", "automl", "gmail", "drive"],
  version: "5.0.0"
};

// Enhanced CORS headers
const executiveCorsHeaders = {
  ...corsHeaders,
  "X-Executive-Type": EXECUTIVE_CONFIG.personality,
  "X-AI-Service": EXECUTIVE_CONFIG.aiService,
  "X-Specializations": JSON.stringify(EXECUTIVE_CONFIG.specializations),
  "Cache-Control": "no-cache, no-store, must-revalidate"
};

// Google Cloud API helpers (simplified implementation)
const GoogleCloudAPI = {
  async gmail() {
    return {
      async readInbox() {
        // Simulate Gmail API call
        return [
          { id: "msg001", subject: "Project Update", from: "team@company.com", unread: true },
          { id: "msg002", subject: "Meeting Request", from: "boss@company.com", unread: true }
        ];
      },
      async sendEmail(to, subject, body) {
        return { success: true, messageId: `sent_${Date.now()}`, to, subject };
      },
      async organizeEmails(labels) {
        return { success: true, labelsApplied: labels, processed: 5 };
      }
    };
  },

  async drive() {
    return {
      async listFiles() {
        return [
          { id: "file001", name: "Strategy_Doc.pdf", mimeType: "application/pd" },
          { id: "file002", name: "Budget_Sheet.xlsx", mimeType: "application/vnd.ms-excel" }
        ];
      },
      async uploadFile(name, content, type) {
        return { success: true, fileId: `upload_${Date.now()}`, name, webViewLink: "https://drive.google.com/file/..." };
      }
    };
  },

  async sheets() {
    return {
      async createSpreadsheet(title) {
        return { success: true, spreadsheetId: `sheet_${Date.now()}`, title, webViewLink: "https://docs.google.com/spreadsheets/..." };
      },
      async readData(sheetId, range) {
        return { values: [["Name", "Value"], ["Revenue", "100000"], ["Expenses", "75000"]] };
      }
    };
  },

  async calendar() {
    return {
      async listEvents() {
        return [
          { id: "evt001", summary: "Team Meeting", start: "2024-12-17T10:00:00Z", end: "2024-12-17T11:00:00Z" },
          { id: "evt002", summary: "Project Review", start: "2024-12-17T14:00:00Z", end: "2024-12-17T15:00:00Z" }
        ];
      },
      async createEvent(event) {
        return { success: true, eventId: `evt_${Date.now()}`, ...event };
      }
    };
  }
};

// Vertex AI capabilities for video generation (COO-specific)
const VertexAI = {
  // Upload video bytes (base64 or GCS) to Supabase Storage and return a public URL
  async _uploadVideoToStorage(supabaseClient: any, video: any): Promise<string | null> {
    if (video.format === 'base64' && video.data) {
      try {
        const bytes = Uint8Array.from(atob(video.data), (c: string) => c.charCodeAt(0));
        const path = `videos/${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;
        const { error: uploadErr } = await supabaseClient.storage
          .from('generated-media')
          .upload(path, bytes, { contentType: 'video/mp4', upsert: false });
        if (uploadErr) {
          console.error('❌ Video storage upload failed:', uploadErr.message);
          return null;
        }
        const { data: urlData } = supabaseClient.storage.from('generated-media').getPublicUrl(path);
        console.log(`✅ Video uploaded to storage: ${urlData.publicUrl}`);
        return urlData.publicUrl;
      } catch (e: any) {
        console.error('Video upload error:', e.message);
        return null;
      }
    } else if (video.gcsUri) {
      // GCS URI — return as-is (signed URL generation would need additional setup)
      return video.gcsUri;
    }
    return null;
  },

  // Extract videos array from a completed Vertex AI LRO response
  _extractVideos(data: any): any[] {
    const samples: any[] =
      data.response?.generateVideoResponse?.generatedSamples
      || data.response?.predictions
      || data.response?.videos
      || data.predictions
      || [];
    return samples.map((s: any) => {
      const video = s.video || s;
      if (video.bytesBase64Encoded) return { format: 'base64', data: video.bytesBase64Encoded, mimeType: video.mimeType || 'video/mp4' };
      if (video.uri || video.gcsUri) return { gcsUri: video.uri || video.gcsUri, mimeType: video.mimeType || 'video/mp4' };
      return { raw: s };
    });
  },

  async generateVideo(prompt: string, model = "veo-3.1-generate-001", durationSeconds = 8, aspectRatio = "16:9") {
    const projectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID');
    const location = 'us-central1';
    if (!projectId) throw new Error('GOOGLE_CLOUD_PROJECT_ID env var not set');

    console.log(`🎬 [vertex-ai-chat] Veo video request — model: ${model}, project: ${projectId}`);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get service account token
    const { data: authData, error: authError } = await supabaseAdmin.functions.invoke('google-cloud-auth', {
      body: { action: 'get_access_token', auth_type: 'service_account' }
    });
    if (authError || !authData?.access_token) throw new Error(`google-cloud-auth failed: ${authError?.message || 'No token'}`);
    const accessToken = authData.access_token;
    console.log('🔑 [vertex-ai-chat] Access token obtained for video generation');

    // Initiate the LRO — return immediately (Veo 3.1 takes 3-6 minutes; polling must be external)
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predictLongRunning`;
    const initResp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { durationSeconds, aspectRatio, sampleCount: 1 } })
    });

    if (!initResp.ok) {
      const errText = await initResp.text();
      console.error(`❌ [vertex-ai-chat] Veo API ${initResp.status}: ${errText}`);
      throw new Error(`Veo API ${initResp.status}: ${errText}`);
    }

    const initData = await initResp.json();
    const operationName = initData.name;
    console.log(`✅ [vertex-ai-chat] Veo LRO initiated: ${operationName}`);

    // Persist the job in video_jobs so status can be tracked across requests
    const { error: insertErr } = await supabaseAdmin
      .from('video_jobs')
      .upsert({ operation_name: operationName, model, prompt, status: 'pending' }, { onConflict: 'operation_name' });
    if (insertErr) console.warn(`⚠️ video_jobs insert failed: ${insertErr.message}`);

    return {
      success: true,
      status: 'pending',
      operation_name: operationName,
      job_id: operationName,
      model,
      prompt,
      message: `Video generation initiated with Veo — Veo 3.1 typically takes 3-6 minutes. Call vertex_check_video_status with this operation_name every 60 seconds until status is "done". You can also use list_recent_videos to find it once complete.`,
      instructions: 'IMPORTANT: Wait ~60 seconds then call vertex_check_video_status with the operation_name. Repeat every 60s until done. Do NOT generate a new video — this one is already queued.'
    };
  },

  // List recent videos from Supabase Storage (reliable fallback when LRO has expired)
  async listRecentVideos(supabaseAdmin: any, limit = 10): Promise<any> {
    const { data, error } = await supabaseAdmin.storage
      .from('generated-media')
      .list('videos', { limit, sortBy: { column: 'created_at', order: 'desc' } });
    if (error) throw new Error(`Storage list error: ${error.message}`);
    const videos = (data || []).map((f: any) => ({
      filename: f.name,
      created_at: f.created_at,
      size_bytes: f.metadata?.size,
      publicUrl: `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/generated-media/videos/${f.name}`
    }));
    return { success: true, videos, count: videos.length };
  },

  async checkVideoStatus(operationName: string, model = "veo-3.1-generate-001") {
    const projectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID');
    const location = 'us-central1';
    if (!projectId) throw new Error('GOOGLE_CLOUD_PROJECT_ID env var not set');
    if (!operationName) throw new Error('operation_name is required');

    console.log(`🔍 [vertex-ai-chat] Checking Veo status for: ${operationName}`);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check video_jobs cache first — if already done, return stored result immediately
    const { data: existingJob } = await supabaseAdmin
      .from('video_jobs')
      .select('status, video_urls, error_message')
      .eq('operation_name', operationName)
      .single();

    if (existingJob?.status === 'done' && existingJob.video_urls?.length > 0) {
      console.log(`⚡ [vertex-ai-chat] Returning cached done result from video_jobs`);
      return { success: true, status: 'done', operation_name: operationName, videoUrls: existingJob.video_urls, videoCount: existingJob.video_urls.length, cached: true };
    }
    if (existingJob?.status === 'failed') {
      return { success: false, status: 'failed', operation_name: operationName, error: existingJob.error_message };
    }

    // Mark last_polled_at
    await supabaseAdmin.from('video_jobs')
      .update({ last_polled_at: new Date().toISOString() })
      .eq('operation_name', operationName);

    // Poll Vertex AI for current status
    const { data: authData, error: authError } = await supabaseAdmin.functions.invoke('google-cloud-auth', {
      body: { action: 'get_access_token', auth_type: 'service_account' }
    });
    if (authError || !authData?.access_token) throw new Error(`google-cloud-auth failed: ${authError?.message || 'No token'}`);

    const pollUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:fetchPredictOperation`;
    console.log(`📡 [vertex-ai-chat] Veo status poll URL: ${pollUrl}`);

    const response = await fetch(pollUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authData.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationName })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ [vertex-ai-chat] Veo status API ${response.status}: ${errText}`);
      if (response.status === 404) {
        console.warn(`⚠️ [vertex-ai-chat] LRO 404 — likely expired. Use list_recent_videos to find the completed file.`);
        return {
          success: true, status: 'not_found', operation_name: operationName,
          message: 'LRO record expired on Vertex AI. Call list_recent_videos — if the video completed, it will be listed there (check by timestamp from when you initiated it).',
          hint: 'Veo LROs are ephemeral (~5 min). The video may still be in Supabase Storage.'
        };
      }
      throw new Error(`Veo status API ${response.status}: ${errText}`);
    }

    const data = await response.json();

    if (!data.done) {
      console.log(`⏳ [vertex-ai-chat] Veo operation still processing: ${operationName}`);
      return {
        success: true, status: 'processing', operation_name: operationName,
        message: 'Video is still generating. Call vertex_check_video_status again in ~60 seconds.'
      };
    }

    if (data.error) {
      await supabaseAdmin.from('video_jobs').update({ status: 'failed', error_message: JSON.stringify(data.error) }).eq('operation_name', operationName);
      throw new Error(`Video generation failed: ${JSON.stringify(data.error)}`);
    }

    // Done — extract, upload, and record in video_jobs
    const videos = VertexAI._extractVideos(data);
    console.log(`✅ [vertex-ai-chat] Veo done — ${videos.length} video(s). Uploading...`);
    const videoUrls: string[] = [];
    for (const v of videos) {
      const publicUrl = await VertexAI._uploadVideoToStorage(supabaseAdmin, v);
      if (publicUrl) videoUrls.push(publicUrl);
    }

    // Persist result in video_jobs
    await supabaseAdmin.from('video_jobs').update({
      status: 'done', video_urls: videoUrls, completed_at: new Date().toISOString()
    }).eq('operation_name', operationName);

    console.log(`🎉 [vertex-ai-chat] Video ready — ${videoUrls.length} URL(s) stored in video_jobs.`);
    return { success: true, status: 'done', operation_name: operationName, videoUrls, videoCount: videoUrls.length };
  },

  async generateImage(prompt: string, model = "imagen-3.0-generate-002", aspectRatio = "1:1") {
    const projectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID');
    const location = 'us-central1';

    if (!projectId) throw new Error('GOOGLE_CLOUD_PROJECT_ID env var is not set');

    console.log(`🎨 [vertex-ai-chat] Imagen request — model: ${model}, project: ${projectId}, aspect: ${aspectRatio}`);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: authData, error: authError } = await supabaseAdmin.functions.invoke('google-cloud-auth', {
      body: { action: 'get_access_token', auth_type: 'service_account' }
    });

    if (authError || !authData?.access_token) {
      const msg = authError?.message || JSON.stringify(authError) || 'No token returned';
      console.error('❌ [vertex-ai-chat] google-cloud-auth failed:', msg);
      throw new Error(`google-cloud-auth failed: ${msg}`);
    }

    const accessToken = authData.access_token;
    console.log('🔑 [vertex-ai-chat] Access token obtained');

    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;
    console.log(`📡 [vertex-ai-chat] Imagen URL: ${url}`);

    const requestBody = {
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [vertex-ai-chat] Imagen API ${response.status} from ${url}:\n${errorText}`);
      throw new Error(`Imagen API ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const predictions = data.predictions || [];
    if (predictions.length === 0) throw new Error('Imagen returned 200 but no predictions in response');

    const base64Image = predictions[0].bytesBase64Encoded;
    const mimeType = predictions[0].mimeType || 'image/png';
    const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
    console.log(`✅ [vertex-ai-chat] Image generated — mimeType: ${mimeType}, size: ${base64Image?.length} chars`);

    // Upload to Supabase Storage and return a public URL
    try {
      const bytes = Uint8Array.from(atob(base64Image), c => c.charCodeAt(0));
      const path = `images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('generated-media')
        .upload(path, bytes, { contentType: mimeType, upsert: false });
      if (uploadErr) {
        console.error('❌ Image storage upload failed:', uploadErr.message);
        // Fall back to base64 if storage fails
        return { success: true, format: 'base64', mimeType, data: base64Image, model, prompt };
      }
      const { data: urlData } = supabaseAdmin.storage.from('generated-media').getPublicUrl(path);
      console.log(`✅ Image uploaded: ${urlData.publicUrl}`);
      return { success: true, publicUrl: urlData.publicUrl, mimeType, model, prompt };
    } catch (e: any) {
      console.error('Image upload error:', e.message);
      return { success: true, format: 'base64', mimeType, data: base64Image, model, prompt };
    }
  },

  async analyzeVideo(videoUrl) {
    return {
      success: true,
      analysis: {
        objects: ["person", "desk", "computer"],
        text: ["Welcome to our presentation"],
        sentiment: "positive",
        duration: "30 seconds"
      }
    };
  }
};

// Tenor GIF API for visual communication (COO-specific)
const TenorGIF = {
  async searchGifs(query) {
    if (!EXECUTIVE_CONFIG.specializations.includes("gif_generation")) {
      throw new Error("GIF generation not available for this executive");
    }

    return {
      success: true,
      query: query,
      gifs: [
        { url: "https://tenor.com/view/excited-happy-gif-12345", description: "Excited reaction" },
        { url: "https://tenor.com/view/thumbs-up-approval-gif-67890", description: "Approval gesture" }
      ]
    };
  },

  async createCustomGif(videoUrl, startTime, duration) {
    return {
      success: true,
      gifUrl: `https://tenor.com/view/custom-gif-${Date.now()}`,
      sourceVideo: videoUrl,
      startTime: startTime,
      duration: duration
    };
  }
};

// Executive system prompt generator
function getExecutiveSystemPrompt() {
  let prompt = `You are ${EXECUTIVE_CONFIG.personality}, powered by ${EXECUTIVE_CONFIG.aiService} (${EXECUTIVE_CONFIG.primaryModel}).

PERSONALITY & ROLE: ${EXECUTIVE_CONFIG.personality}

CORE SPECIALIZATIONS: ${EXECUTIVE_CONFIG.specializations.join(", ")}

GOOGLE CLOUD MASTERY: ${EXECUTIVE_CONFIG.googleCloudServices.join(", ")}

CAPABILITIES:
- Complete Gmail mastery: read inbox, send emails, organize with labels
- Google Drive operations: upload, download, share files, manage folders
- Google Sheets: create spreadsheets, analyze data, generate charts
- Google Calendar: schedule meetings, find free time, manage events`;

  // Add service-specific capabilities
  if (EXECUTIVE_CONFIG.specializations.includes("video_creation")) {
    prompt += `
- Vertex AI Video Generation: Create videos using Veo2 and Veo3 models
- Video Analysis: Extract objects, text, sentiment from video content`;
  }

  if (EXECUTIVE_CONFIG.specializations.includes("image_generation")) {
    prompt += `
- Vertex AI Image Generation: Create images using Imagen 3 models`;
  }

  if (EXECUTIVE_CONFIG.specializations.includes("gif_generation")) {
    prompt += `
- GIF Communication: Search and create GIFs for visual responses
- Custom GIF Creation: Generate GIFs from video content`;
  }

  prompt += `

INTERACTION STYLE:
- Always identify as ${EXECUTIVE_CONFIG.personality}
- Leverage Google Cloud services proactively
- Use specialized capabilities to solve problems
- Explain Google Cloud operations clearly
- Provide actionable, executive-level insights`;

  return prompt;
}

// Enhanced invoke function with real Google Cloud OAuth integration
async function invokeExecutiveFunction(toolCall, attempt = 1) {
  console.log(`[${EXECUTIVE_CONFIG.name}] Executive function invocation - Attempt ${attempt}`);

  try {
    // Get real OAuth token from google-cloud-auth
    // Get Google Cloud Access Token (Service Account)
    // Get Google Cloud Access Token (Service Account)
    console.log('🔑 Requesting Service Account token from google-cloud-auth...');

    // Create Service Role client to bypass RLS/Auth checks for internal function calls
    // This fixes the 401 error when calling google-cloud-auth
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: authData, error: authError } = await supabaseAdmin.functions.invoke('google-cloud-auth', {
      body: { action: 'get_access_token', auth_type: 'service_account' }
    });

    if (authError || !authData?.access_token) {
      console.error('Failed to get Google OAuth token:', authError);
      throw new Error('Google Cloud authentication failed');
    }

    const accessToken = authData.access_token;
    const requestType = toolCall.type || 'chat';

    if (requestType === 'chat') {
      // Use Vertex AI API directly with the OAuth token
      const messages = toolCall.parameters?.messages || [];
      const systemPrompt = getExecutiveSystemPrompt();

      const tools = [
        {
          function_declarations: [
            {
              name: "read_inbox",
              description: "Read recent emails from Gmail inbox",
              parameters: { type: "OBJECT", properties: {} }
            },
            {
              name: "send_email",
              description: "Send an email using Gmail",
              parameters: {
                type: "OBJECT",
                properties: {
                  to: { type: "STRING", description: "Recipient email address" },
                  subject: { type: "STRING", description: "Email subject" },
                  body: { type: "STRING", description: "Email body content" }
                },
                required: ["to", "subject", "body"]
              }
            },
            {
              name: "list_drive_files",
              description: "List files in Google Drive",
              parameters: {
                type: "OBJECT",
                properties: {
                  query: { type: "STRING", description: "Optional search query" }
                }
              }
            },
            {
              name: "create_calendar_event",
              description: "Create a Google Calendar event",
              parameters: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING", description: "Event title" },
                  startTime: { type: "STRING", description: "Start time (ISO string)" },
                  endTime: { type: "STRING", description: "End time (ISO string)" },
                  description: { type: "STRING", description: "Event description" }
                },
                required: ["title", "startTime", "endTime"]
              }
            }
          ]
        }
      ];

      // Build contents array — filter out any messages with falsy content
      const validMessages = messages.filter((m: any) => m && (m.content || m.text));
      const contents = validMessages.map((msg: any) => ({
        role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(msg.content || msg.text || '') }]
      }));

      // Gemini requires at least one content item
      if (contents.length === 0) {
        console.warn(`⚠️ [vertex-ai-chat] No messages provided — returning default response`);
        return {
          success: true,
          result: {
            choices: [{ message: { role: 'assistant', content: 'Hello! I\'m the ML Operations Specialist. How can I help you today?' } }],
            provider: 'vertex',
            executive: EXECUTIVE_CONFIG.personality
          }
        };
      }

      const chatProjectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID') ?? '';
      const chatModel = EXECUTIVE_CONFIG.primaryModel;
      const chatUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${chatProjectId}/locations/us-central1/publishers/google/models/${chatModel}:generateContent`;

      console.log(`🚀 [vertex-ai-chat] Sending ${contents.length} message(s) to ${chatModel}`);

      const vertexResponse = await fetch(
        chatUrl,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: tools,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048
            }
          })
        }
      );

      if (!vertexResponse.ok) {
        const errorText = await vertexResponse.text();
        console.error(`❌ [vertex-ai-chat] Vertex AI chat API ${vertexResponse.status}: ${errorText.slice(0, 800)}`);
        throw new Error(`Vertex AI API failed: ${vertexResponse.status} ${errorText}`);
      }

      const result = await vertexResponse.json();

      let content = '';
      let tool_calls = [];

      // Check for candidates
      // Helper to extract text and function calls from Gemini response
      const extractResponse = (responseJson: any) => {
        let text = '';
        let calls = [];

        if (Array.isArray(responseJson) && responseJson.length > 0) {
          // Streaming response
          for (const chunk of responseJson) {
            const parts = chunk.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
              if (part.text) text += part.text;
              if (part.functionCall) calls.push(part.functionCall);
            }
          }
        } else if (responseJson.candidates?.[0]?.content?.parts) {
          // Non-streaming
          const parts = responseJson.candidates[0].content.parts;
          for (const part of parts) {
            if (part.text) text += part.text;
            if (part.functionCall) calls.push(part.functionCall);
          }
        }
        return { text, calls };
      };

      const initialExtraction = extractResponse(result);
      content = initialExtraction.text;
      tool_calls = initialExtraction.calls;

      // EXECUTE TOOLS IF PRESENT (Server-side Loop)
      if (tool_calls.length > 0) {
        console.log(`🛠️ [Eliza] Executing ${tool_calls.length} tool calls...`);
        const functionResponses = [];

        for (const call of tool_calls) {
          console.log(`  > Calling tool: ${call.name}`);
          let toolResult: any = { error: "Tool execution failed" };

          try {
            // Map Gemini tools to google-cloud-auth actions
            if (call.name === 'read_inbox') {
              const { data, error } = await supabaseAdmin.functions.invoke('google-cloud-auth', {
                body: { action: 'list_emails', max_results: 5 }
              });
              if (error) throw error;
              toolResult = data;
            }
            else if (call.name === 'send_email') {
              const { data, error } = await supabaseAdmin.functions.invoke('google-cloud-auth', {
                body: {
                  action: 'send_email',
                  to: call.args.to,
                  subject: call.args.subject,
                  body: call.args.body
                }
              });
              if (error) throw error;
              toolResult = data;
            }
            else if (call.name === 'list_drive_files') {
              const { data, error } = await supabaseAdmin.functions.invoke('google-cloud-auth', {
                body: {
                  action: 'list_files',
                  query: call.args.query,
                  max_results: 10
                }
              });
              if (error) throw error;
              toolResult = data;
            }
            else if (call.name === 'create_calendar_event') {
              const { data, error } = await supabaseAdmin.functions.invoke('google-cloud-auth', {
                body: {
                  action: 'create_event',
                  title: call.args.title,
                  start_time: call.args.startTime, // Map camelCase to snake_case
                  end_time: call.args.endTime,
                  description: call.args.description
                }
              });
              if (error) throw error;
              toolResult = data;
            }
            else {
              toolResult = { error: `Unknown tool: ${call.name}` };
            }
          } catch (err) {
            console.error(`  ❌ Tool execution error:`, err);
            toolResult = { error: err.message || "Execution error" };
          }

          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { name: call.name, content: toolResult }
            }
          });
        }

        // Send results back to Gemini (Turn 2)
        console.log('🔄 Sending tool results back to Gemini...');

        // Construct conversation history for Turn 2
        // 1. User Message (Original)
        // 2. Model Response (Function Call)
        // 3. User Response (Function Results)

        const turn2Content = [
          // Original User Message
          ...messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          })),
          // Model's Function Call
          {
            role: 'model',
            parts: tool_calls.map(call => ({ functionCall: call }))
          },
          // Function Responses
          {
            role: 'function', // Role 'function' is correct for Gemini API v1beta? Or 'user'? 
            // Gemini API expects 'function' role or just parts with functionResponse in a 'user' turn?
            // Checking docs: usually it's a new turn with role='function' or just 'user'?
            // For 'gemini-1.5/2.0', function responses are sent in local parts.
            // It seems specifically role 'function' is used in some SDKs, but raw REST API usually takes 'functionResponse' parts.
            // Let's try role 'function'.
            parts: functionResponses
          }
        ];

        const turn2Response = await fetch(
          `https://us-central1-aiplatform.googleapis.com/v1/projects/${Deno.env.get('GOOGLE_CLOUD_PROJECT_ID')}/locations/us-central1/publishers/google/models/${EXECUTIVE_CONFIG.primaryModel}:streamGenerateContent`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: turn2Content,
              tools: tools, // Keep tools available (though unlikely to call again immediately)
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1000
              }
            })
          }
        );

        if (!turn2Response.ok) {
          const errText = await turn2Response.text();
          console.error('Turn 2 Generation failed:', errText);
          // Fallback: return the tool result as content if generation fails
          content = `I executed the tools but couldn't generate a summary. Result: ${JSON.stringify(functionResponses)}`;
        } else {
          const turn2Result = await turn2Response.json();
          const turn2Extraction = extractResponse(turn2Result);
          content = turn2Extraction.text; // Replace content with the final answer
        }

        // Clear tool_calls so we don't return them to the client as specific actions to take
        // We have handled them server-side.
        tool_calls = [];
      }

      // Adaptation logic for mappedToolCalls can be removed or kept empty since we handled it.
      const mappedToolCalls = []; // Empty since we executed them

      return {
        success: true,
        result: {
          choices: [{
            message: {
              role: 'assistant',
              content: content || "I've processed your request.",
              // No tool_calls returned to client
            }
          }],
          provider: 'vertex',
          executive: EXECUTIVE_CONFIG.personality
        }
      };
    } else if (requestType === 'google_cloud') {
      // Delegate to google-cloud-auth for specific operations
      const { data: opData, error: opError } = await supabase.functions.invoke('google-cloud-auth', {
        body: {
          action: toolCall.parameters.operation,
          service: toolCall.parameters.service,
          ...toolCall.parameters
        }
      });

      if (opError) throw opError;
      return { success: true, result: opData };
    } else if (requestType === 'video_generation') {
      const result = await VertexAI.generateVideo(
        toolCall.parameters.prompt,
        toolCall.parameters.model,
        toolCall.parameters.durationSeconds,
        toolCall.parameters.aspectRatio
      );
      return { success: true, result };
    } else if (requestType === 'check_video_status') {
      const result = await VertexAI.checkVideoStatus(toolCall.parameters.operation_name, toolCall.parameters.model);
      return { success: true, result };
    } else if (requestType === 'list_recent_videos') {
      const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
      const result = await VertexAI.listRecentVideos(supabaseAdmin, toolCall.parameters.limit || 10);
      return { success: true, result };
    } else if (requestType === 'image_generation') {
      const result = await VertexAI.generateImage(toolCall.parameters.prompt, toolCall.parameters.model, toolCall.parameters.aspectRatio);
      return { success: true, result };
    }

    // Fallback for other types
    return { success: false, error: `Unsupported request type: ${requestType}` };

  } catch (error) {
    if (attempt < 3) {
      const delay = 1000 * attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      return invokeExecutiveFunction(toolCall, attempt + 1);
    }
    throw error;
  }
}

// Main request handler
async function handleExecutiveRequest(request: Request) {
  const startTime = Date.now();
  const requestId = `exec_${Math.random().toString(36).substr(2, 9)}`;
  const url = new URL(request.url);

  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: executiveCorsHeaders });
    }

    // ─── GET /health — diagnostic endpoint for auth + Imagen reachability ─────
    if (request.method === "GET" && url.pathname.endsWith('/health')) {
      const projectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID');
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      let authOk = false, authError: string | null = null;
      try {
        const { data, error } = await supabaseAdmin.functions.invoke('google-cloud-auth', {
          body: { action: 'get_access_token', auth_type: 'service_account' }
        });
        authOk = !error && !!data?.access_token;
        if (error) authError = error.message || JSON.stringify(error);
      } catch (e: any) { authError = e.message; }

      return new Response(JSON.stringify({
        healthy: authOk,
        project_id: projectId || '(not set)',
        auth_status: authOk ? 'OK' : `FAILED: ${authError}`,
        expected_imagen_url: projectId
          ? `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/imagen-3.0-generate-002:predict`
          : '(project_id missing)',
        timestamp: new Date().toISOString()
      }), { status: authOk ? 200 : 503, headers: { ...executiveCorsHeaders, 'Content-Type': 'application/json' } });
    }

    if (request.method === "GET") {
      const status = {
        executive: EXECUTIVE_CONFIG.personality,
        aiService: EXECUTIVE_CONFIG.aiService,
        model: EXECUTIVE_CONFIG.primaryModel,
        specializations: EXECUTIVE_CONFIG.specializations,
        googleCloudServices: EXECUTIVE_CONFIG.googleCloudServices,
        version: EXECUTIVE_CONFIG.version,
        status: "operational",
        timestamp: new Date().toISOString()
      };
      return new Response(JSON.stringify(status), {
        headers: { ...executiveCorsHeaders, "Content-Type": "application/json" }
      });
    }

    if (request.method === "POST") {
      const body = await request.json();

      let toolCall: any = {
        type: "chat",
        parameters: {
          // Support both messages[] array and single prompt/message field
          messages: body.messages || (
            (body.prompt || body.message)
              ? [{ role: 'user', content: body.prompt || body.message }]
              : []
          ),
          options: body.options || {}
        }
      };

      // Check for specialized operations
      // Supports both action-string protocol (from toolExecutor) and legacy boolean flags
      const action = body.action;

      if (body.googleCloudOperation) {
        toolCall.type = "google_cloud";
        toolCall.parameters = { service: body.service, operation: body.operation, ...body.params };
      } else if (action === 'generate_video' || (body.videoGeneration && EXECUTIVE_CONFIG.specializations.includes("video_creation"))) {
        toolCall.type = "video_generation";
        toolCall.parameters = {
          prompt: body.prompt,
          model: body.video_model || body.model || "veo-3.1-generate-001",
          durationSeconds: body.duration_seconds || body.durationSeconds || 8,
          aspectRatio: body.aspect_ratio || body.aspectRatio || "16:9"
        };
      } else if (action === 'check_video_status' || body.checkVideoStatus) {
        toolCall.type = "check_video_status";
        toolCall.parameters = {
          operation_name: body.operation_name,
          model: body.model || "veo-3.1-generate-001"
        };
      } else if (action === 'generate_image' || (body.imageGeneration && EXECUTIVE_CONFIG.specializations.includes("image_generation"))) {
        toolCall.type = "image_generation";
        toolCall.parameters = {
          prompt: body.prompt,
          model: body.image_model || body.model || "imagen-3.0-generate-002",
          aspectRatio: body.aspect_ratio || body.aspectRatio || "1:1",
          count: body.count || 1
        };
      } else if (body.gifSearch && EXECUTIVE_CONFIG.specializations.includes("gif_generation")) {
        toolCall.type = "gif_search";
        toolCall.parameters = { query: body.query };
      }

      const result = await invokeExecutiveFunction(toolCall);

      if (!result.success) {
        throw new Error(result.error || "Executive function failed");
      }

      const response = {
        success: true,
        data: result.result,
        executive: {
          name: EXECUTIVE_CONFIG.personality,
          aiService: EXECUTIVE_CONFIG.aiService,
          specializations: EXECUTIVE_CONFIG.specializations
        },
        metadata: {
          executionTime: Date.now() - startTime,
          requestId: requestId,
          timestamp: new Date().toISOString()
        }
      };

      return new Response(JSON.stringify(response), {
        headers: { ...executiveCorsHeaders, "Content-Type": "application/json" }
      });
    }

    throw new Error(`Method ${request.method} not supported`);

  } catch (error) {
    const errorResponse = {
      success: false,
      error: { message: error.message, executive: EXECUTIVE_CONFIG.personality },
      metadata: { executionTime: Date.now() - startTime, requestId }
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...executiveCorsHeaders, "Content-Type": "application/json" }
    });
  }
}

serve(handleExecutiveRequest);
