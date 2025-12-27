import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { isGoogleConfigured, getGoogleAccessToken } from "../_shared/googleAuthHelper.ts";

// Executive configuration for Vertex AI (ML Operations Specialist)
const EXECUTIVE_CONFIG = {
  name: "vertex-ai-chat",
  personality: "ML Operations Specialist",
  aiService: "vertex",
  primaryModel: "gemini-1.5-pro",
  specializations: ["ml_ops", "ai_training", "model_deployment", "google_cloud"],
  googleCloudServices: ["vertex_ai", "ml_engine", "automl"],
  version: "6.0.0"
};

/**
 * Vertex AI Chat - ML Operations Specialist
 * Uses Google Cloud Vertex AI API with OAuth authentication
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, messages } = await req.json();
    const userMessage = message || messages?.[messages.length - 1]?.content || 'Hello';

    console.log(`🤖 ${EXECUTIVE_CONFIG.personality} processing:`, userMessage);

    // Check if Google Cloud is configured
    const isConfigured = await isGoogleConfigured();

    if (!isConfigured) {
      console.warn('⚠️ Google Cloud OAuth not configured, using fallback');

      // Return helpful response indicating OAuth is needed
      return new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: `Hello! I'm the ${EXECUTIVE_CONFIG.personality}, powered by Google Cloud Vertex AI. 

To unlock my full capabilities including:
- ML model deployment and management
- Google Cloud service integration
- Advanced AI training operations

Please configure Google Cloud OAuth credentials. I can still help with general questions, but advanced features require authentication.

How can I assist you today?`,
              role: 'assistant'
            }
          }],
          success: true,
          executive: 'vertex-ai-chat',
          executiveTitle: EXECUTIVE_CONFIG.personality,
          provider: 'Vertex AI (OAuth required)',
          requiresAuth: true,
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Google Cloud access token
    const accessToken = await getGoogleAccessToken();

    if (!accessToken) {
      throw new Error('Failed to obtain Google Cloud access token');
    }

    console.log('✅ Google Cloud access token obtained');

    // Get project ID from environment
    const projectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID') || 'your-project-id';
    const location = Deno.env.get('GOOGLE_CLOUD_LOCATION') || 'us-central1';

    // Construct Vertex AI API endpoint
    const vertexApiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${EXECUTIVE_CONFIG.primaryModel}:generateContent`;

    console.log(`📡 Calling Vertex AI API: ${EXECUTIVE_CONFIG.primaryModel}`);

    // Call Vertex AI API
    const vertexResponse = await fetch(vertexApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: `You are ${EXECUTIVE_CONFIG.personality}, an expert in ML operations, AI training, and model deployment. You have deep knowledge of Google Cloud Platform services including Vertex AI, ML Engine, and AutoML.

User message: ${userMessage}`
          }]
        }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7,
          topP: 0.95,
          topK: 40
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          }
        ]
      })
    });

    if (!vertexResponse.ok) {
      const errorText = await vertexResponse.text();
      console.error('Vertex AI API error:', vertexResponse.status, errorText);

      // Check for quota/billing errors (402/429)
      if (vertexResponse.status === 402 || vertexResponse.status === 429) {
        return new Response(
          JSON.stringify({
            status: vertexResponse.status,
            statusCode: vertexResponse.status,
            error: 'quota_exceeded',
            message: 'Vertex AI quota exceeded or billing issue'
          }),
          { 
            status: vertexResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Return fallback response for other errors
      return new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: `Hello! I'm ${EXECUTIVE_CONFIG.personality}. I'm currently experiencing connectivity issues with Vertex AI (${vertexResponse.status}). However, I'm here to help with ML operations, AI training, and model deployment questions. Could you please try your request again?`,
              role: 'assistant'
            }
          }],
          success: true,
          executive: 'vertex-ai-chat',
          executiveTitle: EXECUTIVE_CONFIG.personality,
          provider: 'Vertex AI (API issue)',
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vertexData = await vertexResponse.json();
    const aiResponse = vertexData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
      throw new Error('No response from Vertex AI API');
    }

    console.log('✅ Vertex AI response received:', aiResponse.substring(0, 100) + '...');

    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: aiResponse,
            role: 'assistant'
          }
        }],
        success: true,
        response: aiResponse, // Add this for compatibility
        executive: 'vertex-ai-chat',
        executiveTitle: EXECUTIVE_CONFIG.personality,
        provider: 'Google Cloud Vertex AI',
        model: EXECUTIVE_CONFIG.primaryModel,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('💥 Vertex AI chat error:', error.message);

    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: `Hello! I'm ${EXECUTIVE_CONFIG.personality}. I encountered a technical issue: ${error.message}. I'm still here to help with ML operations, AI training, and Google Cloud questions. Please try rephrasing your request.`,
            role: 'assistant'
          }
        }],
        success: true,
        response: `Technical issue: ${error.message}`, // Add for compatibility
        executive: 'vertex-ai-chat',
        executiveTitle: EXECUTIVE_CONFIG.personality,
        provider: 'Vertex AI (Fallback)',
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
