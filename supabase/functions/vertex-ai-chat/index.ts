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
  async generateVideo(prompt, model = "veo2") {
    if (!EXECUTIVE_CONFIG.specializations.includes("video_creation")) {
      throw new Error("Video generation not available for this executive");
    }

    return {
      success: true,
      videoId: `video_${Date.now()}`,
      model: model,
      prompt: prompt,
      status: "processing",
      estimatedCompletion: "2-3 minutes",
      downloadUrl: `https://storage.googleapis.com/vertex-videos/${Date.now()}.mp4`
    };
  },

  async generateImage(prompt, model = "imagen-3.0-generate-002", aspectRatio = "1:1") {
    const projectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID');
    const location = 'us-central1';

    console.log(`🎨 [Eliza] Calling Imagen API: ${model}`);

    // Create Service Role client to bypass RLS/Auth checks for internal function calls
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get Access Token using Service Role client
    const { data: authData, error: authError } = await supabaseAdmin.functions.invoke('google-cloud-auth', {
      body: { action: 'get_access_token', auth_type: 'service_account' }
    });

    if (authError || !authData?.access_token) {
      console.error('❌ [Eliza] Auth Error:', authError);
      throw new Error(`Auth failed: ${authError?.message || 'No token'}`);
    }

    const accessToken = authData.access_token;
    console.log('🔑 [Eliza] Successfully obtained access token');

    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

    const requestBody = {
      instances: [{ prompt: prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: aspectRatio
      }
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
      console.error(`❌ [Eliza] Imagen API Error (${response.status}): ${errorText}`);
      throw new Error(`Imagen API call failed: ${errorText}`);
    }

    const data = await response.json();

    // Extract base64 image from prediction response
    const predictions = data.predictions || [];
    if (predictions.length === 0) {
      throw new Error('No image generated');
    }

    // Imagen 3 response structure
    const base64Image = predictions[0].bytesBase64Encoded;
    const mimeType = predictions[0].mimeType || 'image/png';

    return {
      success: true,
      format: "base64",
      mimeType: mimeType,
      data: base64Image,
      model: model,
      prompt: prompt
    };
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

      const vertexResponse = await fetch(
        `https://us-central1-aiplatform.googleapis.com/v1/projects/${Deno.env.get('GOOGLE_CLOUD_PROJECT_ID')}/locations/us-central1/publishers/google/models/${EXECUTIVE_CONFIG.primaryModel}:streamGenerateContent`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: messages.map(msg => ({
              role: msg.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: msg.content }]
            })),
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1000
            }
          })
        }
      );

      if (!vertexResponse.ok) {
        const errorText = await vertexResponse.text();
        throw new Error(`Vertex AI API failed: ${vertexResponse.status} ${errorText}`);
      }

      const result = await vertexResponse.json();
      // Handle streaming or non-streaming response format
      const content = Array.isArray(result)
        ? result.map(r => r.candidates?.[0]?.content?.parts?.[0]?.text || '').join('')
        : result.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';

      return {
        success: true,
        result: {
          choices: [{ message: { role: 'assistant', content } }],
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
      const result = await VertexAI.generateVideo(toolCall.parameters.prompt, toolCall.parameters.model);
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
async function handleExecutiveRequest(request) {
  const startTime = Date.now();
  const requestId = `exec_${Math.random().toString(36).substr(2, 9)}`;

  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: executiveCorsHeaders });
    }

    if (request.method === "GET") {
      const status = {
        executive: EXECUTIVE_CONFIG.personality,
        aiService: EXECUTIVE_CONFIG.aiService,
        model: EXECUTIVE_CONFIG.primaryModel,
        specializations: EXECUTIVE_CONFIG.specializations,
        googleCloudServices: EXECUTIVE_CONFIG.googleCloudServices,
        version: EXECUTIVE_CONFIG.version,
        systemPrompt: getExecutiveSystemPrompt(),
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
          messages: body.messages || [],
          options: body.options || {}
        }
      };

      // Check for specialized operations
      if (body.googleCloudOperation) {
        toolCall.type = "google_cloud";
        toolCall.parameters = { service: body.service, operation: body.operation, ...body.params };
      } else if (body.videoGeneration && EXECUTIVE_CONFIG.specializations.includes("video_creation")) {
        toolCall.type = "video_generation";
        toolCall.parameters = { prompt: body.prompt, model: body.model || "veo2" };
      } else if (body.imageGeneration && EXECUTIVE_CONFIG.specializations.includes("image_generation")) {
        toolCall.type = "image_generation";
        toolCall.parameters = { prompt: body.prompt, model: body.model || "imagen-3.0-generate-002", aspectRatio: body.aspectRatio || "1:1" };
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
