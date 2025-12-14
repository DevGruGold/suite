import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";
import { executeToolCall } from "../_shared/toolExecutor.ts";
import { getEnrichedElizaContext } from "../_shared/unifiedAIContext.ts";
import { UsageTracker } from "../_shared/edgeFunctionUsageLogger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VERTEX_AI_API_KEY = Deno.env.get("VERTEX_AI_API_KEY");
const GCP_PROJECT_ID = Deno.env.get("GCP_PROJECT_ID") || "xmrt-suite";
const GCP_LOCATION = Deno.env.get("GCP_LOCATION") || "us-central1";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface VertexContent {
  role: "user" | "model";
  parts: { text: string }[];
}

// ═══════════════════════════════════════════════════════════════
// IMAGE GENERATION
// ═══════════════════════════════════════════════════════════════
async function generateImage(prompt: string, options: {
  model?: string;
  aspectRatio?: string;
  count?: number;
}): Promise<{ images: string[]; text?: string }> {
  const model = options.model || "gemini-2.5-flash-preview-05-20";
  const count = Math.min(options.count || 1, 4);
  
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${VERTEX_AI_API_KEY}`;
  
  const aspectHint = options.aspectRatio ? ` The image should be in ${options.aspectRatio} aspect ratio.` : "";
  const countHint = count > 1 ? ` Generate ${count} different variations.` : "";
  
  console.log(`[vertex-ai-chat] Image generation with model: ${model}`);
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: `Generate an image: ${prompt}${aspectHint}${countHint}` }]
      }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        temperature: 1.0,
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[vertex-ai-chat] Image generation error: ${response.status}`, errorText);
    throw new Error(`Image generation failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  
  const images: string[] = [];
  let text = "";
  
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      const dataUri = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      images.push(dataUri);
    } else if (part.text) {
      text += part.text;
    }
  }

  console.log(`[vertex-ai-chat] Generated ${images.length} images`);
  return { images, text };
}

// ═══════════════════════════════════════════════════════════════
// VIDEO GENERATION (Veo)
// ═══════════════════════════════════════════════════════════════
async function generateVideo(prompt: string, options: {
  model?: string;
  aspectRatio?: string;
  durationSeconds?: number;
}): Promise<{ operationId: string; operationName: string }> {
  const model = options.model || "veo-2.0-generate-001";
  const aspectRatio = options.aspectRatio || "16:9";
  const durationSeconds = options.durationSeconds || 5;
  
  // Veo uses predictLongRunning endpoint
  const endpoint = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${model}:predictLongRunning`;
  
  console.log(`[vertex-ai-chat] Starting video generation with model: ${model}`);
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${VERTEX_AI_API_KEY}`
    },
    body: JSON.stringify({
      instances: [{
        prompt: prompt
      }],
      parameters: {
        aspectRatio: aspectRatio,
        durationSeconds: durationSeconds,
        sampleCount: 1
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[vertex-ai-chat] Video generation error: ${response.status}`, errorText);
    throw new Error(`Video generation failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const operationName = data.name;
  const operationId = operationName?.split("/").pop() || "unknown";
  
  console.log(`[vertex-ai-chat] Video operation started: ${operationId}`);
  return { operationId, operationName };
}

async function checkVideoStatus(operationName: string): Promise<{
  done: boolean;
  videoUrl?: string;
  error?: string;
}> {
  const endpoint = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/${operationName}`;
  
  console.log(`[vertex-ai-chat] Checking video status: ${operationName}`);
  
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${VERTEX_AI_API_KEY}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Status check failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (data.done) {
    if (data.error) {
      return { done: true, error: data.error.message };
    }
    const videoUrl = data.response?.predictions?.[0]?.videoUri;
    return { done: true, videoUrl };
  }
  
  return { done: false };
}

// ═══════════════════════════════════════════════════════════════
// CHAT HELPERS
// ═══════════════════════════════════════════════════════════════
function convertToVertexFormat(messages: Message[]): { contents: VertexContent[]; systemInstruction?: { parts: { text: string }[] } } {
  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system");

  const systemInstruction = systemMessages.length > 0 
    ? { parts: [{ text: systemMessages.map(m => m.content).join("\n\n") }] }
    : undefined;

  const contents: VertexContent[] = nonSystemMessages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  return { contents, systemInstruction };
}

function convertToolsToVertexFormat(tools: typeof ELIZA_TOOLS) {
  return {
    functionDeclarations: tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters
    }))
  };
}

async function synthesizeToolResults(toolName: string, toolResult: any): Promise<string> {
  const synthesisPrompt = `You executed the tool "${toolName}" and got this result:
${JSON.stringify(toolResult, null, 2)}

Provide a natural, conversational response summarizing this data for the user. Be concise but informative.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${VERTEX_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: synthesisPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        })
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(toolResult);
    }
  } catch (e) {
    console.error("Synthesis call failed:", e);
  }
  
  return JSON.stringify(toolResult);
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════
serve(async (req) => {
  const tracker = new UsageTracker("vertex-ai-chat", req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!VERTEX_AI_API_KEY) {
      throw new Error("VERTEX_AI_API_KEY is not configured");
    }

    const body = await req.json();
    const { 
      action = "chat",
      messages, 
      model = "gemini-2.5-flash", 
      temperature = 0.7, 
      maxTokens = 4096, 
      stream = false, 
      includeTools = true,
      // Image generation params
      prompt,
      aspect_ratio,
      count,
      image_model,
      // Video generation params
      video_model,
      duration_seconds,
      operation_name
    } = body;

    // ═══════════════════════════════════════════════════════════════
    // ACTION: GENERATE IMAGE
    // ═══════════════════════════════════════════════════════════════
    if (action === "generate_image") {
      if (!prompt) {
        throw new Error("prompt is required for image generation");
      }
      
      console.log(`[vertex-ai-chat] Generating image: ${prompt.substring(0, 50)}...`);
      
      const result = await generateImage(prompt, {
        model: image_model,
        aspectRatio: aspect_ratio,
        count: count
      });
      
      tracker.succeed({ action: "generate_image", imageCount: result.images.length });
      return new Response(
        JSON.stringify({
          success: true,
          images: result.images,
          text: result.text,
          count: result.images.length,
          provider: "vertex-ai-express"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // ACTION: GENERATE VIDEO
    // ═══════════════════════════════════════════════════════════════
    if (action === "generate_video") {
      if (!prompt) {
        throw new Error("prompt is required for video generation");
      }
      
      console.log(`[vertex-ai-chat] Starting video generation: ${prompt.substring(0, 50)}...`);
      
      const result = await generateVideo(prompt, {
        model: video_model,
        aspectRatio: aspect_ratio,
        durationSeconds: duration_seconds
      });
      
      tracker.succeed({ action: "generate_video", operationId: result.operationId });
      return new Response(
        JSON.stringify({
          success: true,
          operationId: result.operationId,
          operationName: result.operationName,
          message: "Video generation started. Use vertex_check_video_status to poll for completion.",
          provider: "vertex-ai-express"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // ACTION: CHECK VIDEO STATUS
    // ═══════════════════════════════════════════════════════════════
    if (action === "check_video_status") {
      if (!operation_name) {
        throw new Error("operation_name is required to check video status");
      }
      
      console.log(`[vertex-ai-chat] Checking video status: ${operation_name}`);
      
      const result = await checkVideoStatus(operation_name);
      
      tracker.succeed({ action: "check_video_status", done: result.done });
      return new Response(
        JSON.stringify({
          success: true,
          ...result,
          provider: "vertex-ai-express"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // ACTION: CHAT (default)
    // ═══════════════════════════════════════════════════════════════
    if (!messages || !Array.isArray(messages)) {
      throw new Error("Messages array is required for chat action");
    }

    // Enrich with Eliza context
    const enrichedContext = await getEnrichedElizaContext();
    const enrichedMessages: Message[] = [
      { role: "system", content: enrichedContext.systemPrompt },
      ...messages
    ];

    // Convert to Vertex AI format
    const { contents, systemInstruction } = convertToVertexFormat(enrichedMessages);

    // Build request body
    const requestBody: any = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      }
    };

    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }

    // Add tools if requested
    if (includeTools) {
      requestBody.tools = [convertToolsToVertexFormat(ELIZA_TOOLS)];
    }

    // Determine endpoint
    const endpoint = stream 
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${VERTEX_AI_API_KEY}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${VERTEX_AI_API_KEY}`;

    console.log(`[vertex-ai-chat] Calling ${model} with ${contents.length} content parts`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[vertex-ai-chat] API error ${response.status}:`, errorText);
      
      // Handle rate limiting
      if (response.status === 429) {
        tracker.fail(new Error("Rate limit exceeded"));
        return new Response(
          JSON.stringify({ error: "Vertex AI rate limit exceeded. Free tier allows 10 requests per minute per model." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`Vertex AI API error: ${response.status} - ${errorText}`);
    }

    // Handle streaming response
    if (stream) {
      tracker.succeed({ stream: true });
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" }
      });
    }

    // Handle regular response
    const data = await response.json();
    
    // Check for function calls
    const candidate = data.candidates?.[0];
    const functionCall = candidate?.content?.parts?.find((p: any) => p.functionCall);

    if (functionCall) {
      const { name, args } = functionCall.functionCall;
      console.log(`[vertex-ai-chat] Tool call detected: ${name}`);

      try {
        const toolResult = await executeToolCall(name, args);
        const synthesizedResponse = await synthesizeToolResults(name, toolResult);
        
        tracker.succeed({ toolCalled: name });
        return new Response(
          JSON.stringify({
            response: synthesizedResponse,
            model,
            provider: "vertex-ai-express",
            toolCalled: name,
            toolResult
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (toolError) {
        console.error(`[vertex-ai-chat] Tool execution failed:`, toolError);
        tracker.fail(toolError as Error);
        return new Response(
          JSON.stringify({
            response: `I tried to use the ${name} tool but encountered an error: ${toolError}`,
            model,
            provider: "vertex-ai-express",
            error: String(toolError)
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Regular text response
    const textContent = candidate?.content?.parts?.[0]?.text || "";
    
    tracker.succeed({ model, tokensUsed: data.usageMetadata?.totalTokenCount });
    return new Response(
      JSON.stringify({
        response: textContent,
        model,
        provider: "vertex-ai-express",
        usage: data.usageMetadata
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[vertex-ai-chat] Error:", error);
    tracker.fail(error as Error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
