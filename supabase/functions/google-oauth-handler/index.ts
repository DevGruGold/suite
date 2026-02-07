import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const FUNCTION_NAME = 'google-oauth-handler';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Gmail scopes required
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://mail.google.com/'
].join(' ');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({
      error: 'Google OAuth not configured',
      message: 'Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Supabase Edge Functions environment variables'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Construct redirect URI dynamically
  const redirectUri = `${url.origin}/functions/v1/${FUNCTION_NAME}/callback`;

  try {
    // Route: Start OAuth flow
    if (path.includes('/start')) {
      const authUrl = new URL(GOOGLE_AUTH_URL);
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', SCOPES);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token

      console.log('🔐 Starting OAuth flow...');
      console.log('Redirect URI:', redirectUri);

      // Return HTML page that redirects to Google OAuth
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google OAuth - Suite</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 3rem;
              border-radius: 12px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 500px;
            }
            h1 { color: #333; margin-bottom: 1rem; }
            p { color: #666; margin-bottom: 2rem; line-height: 1.6; }
            .btn {
              display: inline-block;
              background: #4285f4;
              color: white;
              padding: 1rem 2rem;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              transition: background 0.3s;
            }
            .btn:hover { background: #357ae8; }
            .info {
              margin-top: 2rem;
              padding: 1rem;
              background: #f0f0f0;
              border-radius: 6px;
              font-size: 0.9rem;
              color: #555;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔐 Google OAuth Setup</h1>
            <p>Click the button below to authorize Suite to access your Gmail account. You'll be redirected to Google to grant permissions.</p>
            <a href="${authUrl.toString()}" class="btn">Connect Google Account</a>
            <div class="info">
              <strong>Scopes requested:</strong><br>
              • Send emails<br>
              • Compose drafts<br>
              • Modify messages<br>
              • Full Gmail access
            </div>
          </div>
        </body>
        </html>
      `, {
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      });
    }

    // Route: OAuth callback
    if (path.includes('/callback')) {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        return new Response(`
          <!DOCTYPE html>
          <html>
          <head><title>OAuth Error</title></head>
          <body style="font-family: sans-serif; padding: 2rem; text-align: center;">
            <h1 style="color: #d32f2f;">❌ OAuth Error</h1>
            <p>Error: ${error}</p>
            <p><a href="/functions/v1/${FUNCTION_NAME}/start">Try again</a></p>
          </body>
          </html>
        `, {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'text/html' }
        });
      }

      if (!code) {
        return new Response('Missing authorization code', { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
        });
      }

      console.log('🔄 Exchanging code for tokens...');

      // Exchange code for tokens
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
        return new Response(`Token exchange failed: ${errorText}`, {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
        });
      }

      const tokens = await tokenResponse.json();

      if (!tokens.refresh_token) {
        return new Response('No refresh token received. Please revoke access and try again.', {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
        });
      }

      console.log('✅ Received tokens, storing in database...');

      // Get user info to store email
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      const userInfo = await userInfoResponse.json();

      // Store in oauth_connections table
      if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase credentials');
        return new Response('Server configuration error', {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
        });
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      // Deactivate existing Google Cloud connections
      await supabase
        .from('oauth_connections')
        .update({ is_active: false })
        .eq('provider', 'google_cloud');

      // Insert new connection
      const { data, error: dbError } = await supabase
        .from('oauth_connections')
        .insert({
          provider: 'google_cloud',
          provider_user_id: userInfo.id || null,
          provider_email: userInfo.email || null,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: tokens.token_type || 'Bearer',
          expires_at: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
          scopes: tokens.scope ? tokens.scope.split(' ') : SCOPES.split(' '),
          is_active: true,
          connected_at: new Date().toISOString(),
          last_refreshed_at: new Date().toISOString(),
          metadata: {
            user_info: userInfo,
            granted_scopes: tokens.scope
          }
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        return new Response(`Database error: ${dbError.message}`, {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
        });
      }

      console.log('✅ OAuth connection saved to database');

      // Success page
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 3rem;
              border-radius: 12px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 500px;
            }
            h1 { color: #4caf50; margin-bottom: 1rem; }
            .email { 
              color: #666; 
              font-size: 1.1rem; 
              margin: 1rem 0;
              font-weight: 600;
            }
            .details {
              margin-top: 2rem;
              padding: 1rem;
              background: #f5f5f5;
              border-radius: 6px;
              text-align: left;
              font-size: 0.9rem;
            }
            .details strong { color: #333; }
            .success-icon {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>
            <h1>Successfully Connected!</h1>
            <div class="email">${userInfo.email || 'Unknown email'}</div>
            <p style="color: #666;">Your Google account has been connected to Suite. You can now send emails via the Gmail API.</p>
            <div class="details">
              <strong>Connection Details:</strong><br>
              • Provider: Google Cloud<br>
              • Connection ID: ${data.id}<br>
              • Scopes: ${tokens.scope ? tokens.scope.split(' ').length : 'N/A'} granted<br>
              • Status: Active
            </div>
            <p style="margin-top: 2rem; color: #888; font-size: 0.9rem;">
              You can close this window now.
            </p>
          </div>
        </body>
        </html>
      `, {
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      });
    }

    // Route: Health check / info
    return new Response(JSON.stringify({
      service: 'google-oauth-handler',
      status: 'ready',
      routes: {
        start: `${url.origin}/functions/v1/${FUNCTION_NAME}/start`,
        callback: `${url.origin}/functions/v1/${FUNCTION_NAME}/callback`
      },
      instructions: [
        '1. Visit /start to begin OAuth flow',
        '2. Grant permissions on Google consent screen',
        '3. You will be redirected back with success confirmation',
        '4. Refresh token will be saved to oauth_connections table'
      ]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
