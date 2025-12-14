import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";
import { executeToolCall } from "../_shared/toolExecutor.ts";
import { getEnrichedElizaContext } from "../_shared/unifiedAIContext.ts";
import { logEdgeFunctionUsage, UsageTracker } from "../_shared/edgeFunctionUsageLogger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VERTEX_AI_API_KEY = Deno.env.get("VERTEX_AI_API_KEY");

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface VertexContent {
  role: "user" | "model";
  parts: { text: string }[];
}

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
  // Make a follow-up call to synthesize results into natural language
  const synthesisPrompt = `You executed the tool "${toolName}" and got this result:
${JSON.stringify(toolResult, null, 2)}

Provide a natural, conversational response summarizing this data for the user. Be concise but informative.`;

  try {
    const response = await fetch(
      `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent?key=${VERTEX_AI_API_KEY}`,
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

serve(async (req) => {
  const tracker = new UsageTracker("vertex-ai-chat", req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!VERTEX_AI_API_KEY) {
      throw new Error("VERTEX_AI_API_KEY is not configured");
    }

    const { messages, model = "gemini-2.5-flash", temperature = 0.7, maxTokens = 4096, stream = false, includeTools = true } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      throw new Error("Messages array is required");
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
      ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:streamGenerateContent?key=${VERTEX_AI_API_KEY}`
      : `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${VERTEX_AI_API_KEY}`;

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
