import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { startUsageTrackingWithRequest } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'hume-access-token';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTrackingWithRequest(FUNCTION_NAME, req);

  try {
    const HUME_API_KEY = Deno.env.get('HUME_API_KEY');
    const HUME_SECRET_KEY = Deno.env.get('HUME_SECRET_KEY');

    if (!HUME_API_KEY || !HUME_SECRET_KEY) {
      console.error('❌ Missing Hume credentials');
      await usageTracker.failure('Hume API credentials not configured', 500);
      return new Response(
        JSON.stringify({ 
          error: 'Hume API credentials not configured',
          missing: !HUME_API_KEY ? 'HUME_API_KEY' : 'HUME_SECRET_KEY'
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('🎭 Generating Hume access token...');

    // Create Basic auth header from API key and secret
    const authString = `${HUME_API_KEY}:${HUME_SECRET_KEY}`;
    const encodedAuth = btoa(authString);

    // Request access token from Hume OAuth endpoint
    const response = await fetch("https://api.hume.ai/oauth2-cc/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${encodedAuth}`,
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Hume token error:', response.status, errorText);
      await usageTracker.failure(`Failed to get Hume access token: ${response.status}`, response.status);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to get Hume access token',
          status: response.status,
          details: errorText
        }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await response.json();
    console.log('✅ Hume access token generated successfully');

    await usageTracker.success({ result_summary: 'Token generated' });
    return new Response(
      JSON.stringify({ 
        accessToken: data.access_token,
        expiresIn: data.expires_in,
        tokenType: data.token_type
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Hume token generation error:', error);
    await usageTracker.failure(error.message || 'Unknown error occurred', 500);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
