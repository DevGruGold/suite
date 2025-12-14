/**
 * Shared Google Cloud Authentication Helper
 * Provides token refresh for all Google service edge functions
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

/**
 * Get a fresh access token using the stored refresh token
 * Returns null if credentials are not configured
 */
export async function getGoogleAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('Missing Google OAuth credentials');
    return null;
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
    console.error('Token refresh failed:', await tokenResponse.text());
    return null;
  }

  const tokens: TokenResponse = await tokenResponse.json();
  return tokens.access_token;
}

/**
 * Check if Google Cloud credentials are configured
 */
export function isGoogleConfigured(): boolean {
  return !!(
    Deno.env.get('GOOGLE_CLIENT_ID') &&
    Deno.env.get('GOOGLE_CLIENT_SECRET') &&
    Deno.env.get('GOOGLE_REFRESH_TOKEN')
  );
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
