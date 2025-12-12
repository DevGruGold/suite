import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// Scopes for Google Cloud/Gemini access
const SCOPES = [
  'https://www.googleapis.com/auth/generative-language.retriever',
  'https://www.googleapis.com/auth/generative-language.tuning',
  'https://www.googleapis.com/auth/cloud-platform',
  'openid',
  'email',
  'profile'
].join(' ');

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'get_access_token';

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

    console.log(`🔐 google-cloud-auth: action=${action}`);

    switch (action) {
      case 'get_authorization_url': {
        // Generate one-time authorization URL for xmrtsolutions@gmail.com
        if (!clientId) {
          return new Response(JSON.stringify({
            success: false,
            error: 'GOOGLE_CLIENT_ID not configured'
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const redirectUri = `${url.origin}/functions/v1/google-cloud-auth?action=callback`;
        
        const authUrl = new URL(GOOGLE_AUTH_URL);
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', SCOPES);
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token

        console.log('📤 Generated authorization URL');
        return new Response(JSON.stringify({
          success: true,
          authorization_url: authUrl.toString(),
          redirect_uri: redirectUri,
          instructions: 'Open this URL in browser, sign in as xmrtsolutions@gmail.com, authorize, then capture the refresh_token from the callback'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'callback': {
        // Handle OAuth callback - exchange code for tokens
        const code = url.searchParams.get('code');
        if (!code) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No authorization code provided'
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!clientId || !clientSecret) {
          return new Response(JSON.stringify({
            success: false,
            error: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured'
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const redirectUri = `${url.origin}/functions/v1/google-cloud-auth?action=callback`;

        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
          })
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error('Token exchange failed:', errorText);
          return new Response(JSON.stringify({
            success: false,
            error: 'Token exchange failed',
            details: errorText
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const tokens: TokenResponse = await tokenResponse.json();
        console.log('✅ Token exchange successful');

        // Return refresh token for manual storage in Supabase secrets
        return new Response(JSON.stringify({
          success: true,
          message: 'Authorization successful! Store this refresh_token in Supabase secrets as GOOGLE_REFRESH_TOKEN',
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          expires_in: tokens.expires_in,
          token_type: tokens.token_type,
          scope: tokens.scope
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get_access_token': {
        // Get fresh access token using stored refresh token
        if (!refreshToken) {
          return new Response(JSON.stringify({
            success: false,
            error: 'GOOGLE_REFRESH_TOKEN not configured. Run authorization flow first.',
            needs_authorization: true
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!clientId || !clientSecret) {
          return new Response(JSON.stringify({
            success: false,
            error: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured'
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
          })
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error('Token refresh failed:', errorText);
          return new Response(JSON.stringify({
            success: false,
            error: 'Token refresh failed',
            details: errorText,
            needs_reauthorization: true
          }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const tokens: TokenResponse = await tokenResponse.json();
        console.log('✅ Access token refreshed successfully');

        return new Response(JSON.stringify({
          success: true,
          access_token: tokens.access_token,
          expires_in: tokens.expires_in,
          token_type: tokens.token_type
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'status': {
        // Check OAuth configuration status
        return new Response(JSON.stringify({
          success: true,
          configured: {
            client_id: !!clientId,
            client_secret: !!clientSecret,
            refresh_token: !!refreshToken
          },
          ready: !!(clientId && clientSecret && refreshToken),
          message: !refreshToken 
            ? 'GOOGLE_REFRESH_TOKEN not set. Run authorization flow to obtain it.'
            : 'Google Cloud OAuth fully configured'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        return new Response(JSON.stringify({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: ['get_authorization_url', 'callback', 'get_access_token', 'status']
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error) {
    console.error('google-cloud-auth error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
