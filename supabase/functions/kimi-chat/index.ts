import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAICredential, createCredentialRequiredResponse } from "../_shared/credentialCascade.ts";
import { EdgeFunctionLogger } from "../_shared/logging.ts";
import { generateElizaSystemPrompt } from "../_shared/elizaSystemPrompt.ts";
import { buildContextualPrompt } from "../_shared/contextBuilder.ts";

const logger = EdgeFunctionLogger("kimi-chat");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const {
      messages,
      conversationHistory = [],
      userContext = { ip: "unknown", isFounder: false },
      miningStats = null,
      systemVersion = null,
      session_credentials = null,
    } = requestBody;

    await logger.info("Request received", "ai_interaction", {
      messagesCount: messages?.length,
      hasHistory: conversationHistory?.length > 0,
      userContext,
      source: requestBody.source || "unknown",
    });

    const OPENROUTER_API_KEY = getAICredential("openrouter", session_credentials);
    if (!OPENROUTER_API_KEY) {
      console.error("⚠️ OPENROUTER_API_KEY not configured");
      await logger.warning("Missing API key", "security", { credential_type: "openrouter" });
      return new Response(
        JSON.stringify(createCredentialRequiredResponse(
          "openrouter",
          "api_key",
          "OpenRouter API key needed to use this AI service (Kimi K2).",
          "https://openrouter.ai/"
        )),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate messages parameter
    if (!messages || !Array.isArray(messages)) {
      console.error("❌ Invalid messages parameter:", {
        type: typeof messages,
        value: messages,
        requestBody: Object.keys(requestBody),
      });
      await logger.error("Invalid request format", new Error("Messages must be an array"), "validation");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid request: messages must be an array",
          received: typeof messages,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("🤖 Kimi K2 (OpenRouter) Chat - Processing request with context:", {
      messagesCount: messages?.length,
      hasHistory: conversationHistory?.length > 0,
      hasMiningStats: !!miningStats,
      hasSystemVersion: !!systemVersion,
      userContext: userContext,
      source: requestBody.source || "unknown",
    });

    // Build system prompt using shared utilities
    const basePrompt = generateElizaSystemPrompt();
    const systemPrompt = buildContextualPrompt(basePrompt, {
      conversationHistory,
      userContext,
      miningStats,
      systemVersion,
    });

    // Prepare messages for OpenRouter
    const openrouterMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    console.log("📤 Calling OpenRouter API (Kimi K2)...");

    const apiStartTime = Date.now();
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://xmrt.pro",
        "X-Title": "XMRT Eliza"
      },
      body: JSON.stringify({
        model: "moonshotai/kimi-k2", // Kimi K2 model on OpenRouter
        messages: openrouterMessages,
        temperature: 0.9,
        max_tokens: 8000,
        stream: false,
      }),
    });

    const apiDuration = Date.now() - apiStartTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter API error (Kimi K2):", response.status, errorText);
      await logger.apiCall("openrouter", response.status, apiDuration, { error: errorText });

      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Rate limit exceeded. Please try again in a moment.",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Try DeepSeek fallback for 402/429/500+ errors
      const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
      if (DEEPSEEK_API_KEY && (response.status === 402 || response.status === 429 || response.status >= 500)) {
        console.log(`⚠️ OpenRouter returned ${response.status}, trying DeepSeek fallback...`);
        
        try {
          const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: openrouterMessages,
              temperature: 0.9,
              max_tokens: 8000,
            }),
          });
          
          if (deepseekResponse.ok) {
            const deepseekData = await deepseekResponse.json();
            const deepseekMessage = deepseekData.choices?.[0]?.message;
            const deepseekContent = deepseekMessage?.content || "I'm here to help with XMRT-DAO tasks.";
            
            console.log('✅ DeepSeek fallback successful');
            await logger.apiCall("deepseek", deepseekResponse.status, Date.now() - apiStartTime, {
              fallback: true,
              originalError: response.status,
            });
            
            return new Response(
              JSON.stringify({ 
                success: true, 
                response: deepseekContent, 
                hasToolCalls: false, 
                executive: "kimi-chat", 
                executiveTitle: "Kimi K2 AI Gateway (DeepSeek Fallback)",
                fallback: 'deepseek'
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } catch (deepseekError) {
          console.warn('⚠️ DeepSeek fallback also failed:', deepseekError.message);
        }
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "API credits depleted. Please check your OpenRouter account.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`OpenRouter API error (Kimi K2): ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    console.log("✅ OpenRouter (Kimi K2) response:", {
      hasContent: !!message?.content,
      usage: data.usage,
    });

    await logger.apiCall("openrouter", response.status, apiDuration, {
      tokens: data.usage,
      model: "moonshotai/kimi-k2",
    });

    // Return the response
    const aiResponse = message?.content || "I\'m here to help with XMRT-DAO tasks.";

    return new Response(
      JSON.stringify({ success: true, response: aiResponse, hasToolCalls: false, executive: "kimi-chat", executiveTitle: "Kimi K2 AI Gateway" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Kimi K2 chat error:", error);
    await logger.error("Function execution failed", error, "error");
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
