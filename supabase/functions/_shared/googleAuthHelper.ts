// supabase/functions/_shared/googleAuthHelper.ts
// Exports: corsHeaders, isGoogleConfigured, getGoogleAccessToken

const tokenCache: { accessToken?: string; expiresAt?: number } = {};

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

// Returns true if required env vars for server-side refresh flow exist
export function isGoogleConfigured(): boolean {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');
  const projectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID');
  return !!(clientId && clientSecret && refreshToken && projectId);
}

/**
 * Obtain a Google Cloud access token using a server-side refresh token.
 * - Caches token in memory until expiry - 60s margin.
 * - Returns null on failure (caller should handle).
 */
export async function getGoogleAccessToken(): Promise<string | null> {
  // Return cached token if still valid
  if (tokenCache.accessToken && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('Google OAuth env vars missing: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN');
    return null;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  // Timeout for token fetch
  const controller = new AbortController();
  const timeoutMs = Number(Deno.env.get('GOOGLE_TOKEN_FETCH_TIMEOUT_MS') || 15000);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Failed to refresh Google access token', res.status, text ? `: ${text.slice(0, 500)}` : '');
      return null;
    }

    const data = await res.json().catch(() => null);
    if (!data || !data.access_token || !data.expires_in) {
      console.error('Unexpected token response from Google', JSON.stringify(data));
      return null;
    }

    tokenCache.accessToken = data.access_token;
    tokenCache.expiresAt = Date.now() + data.expires_in * 1000;

    return tokenCache.accessToken;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.error('Google token fetch aborted (timeout)');
    } else {
      console.error('Error fetching Google access token:', (err as Error).message);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}