/**
 * Shared Google Cloud Authentication Helper
 * Provides token refresh for all Google service edge functions
 * Fetches refresh token from oauth_connections database table
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

/**
 * Get refresh token from database oauth_connections table
 */
async function getRefreshTokenFromDatabase(): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase credentials for database lookup');
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the most recent active Google Cloud connection
    const { data, error } = await supabase
      .from('oauth_connections')
      .select('refresh_token')
      .eq('provider', 'google_cloud')
      .eq('is_active', true)
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching refresh token from database:', error);
      return null;
    }

    if (data?.refresh_token) {
      console.log('✅ Found refresh token in oauth_connections table');
      return data.refresh_token;
    }

    console.log('No active Google Cloud connection found in database');
    return null;
  } catch (err) {
    console.error('Exception fetching refresh token:', err);
    return null;
  }
}

/**
 * Get a fresh access token using the stored refresh token
 * First checks environment variable, then falls back to database
 * Returns null if credentials are not configured
 */
export async function getGoogleAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  // First try environment variables (check both naming conventions)
  let refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN') || Deno.env.get('GMAIL_REFRESH_TOKEN');

  // If not in env, fetch from oauth_connections table
  if (!refreshToken) {
    console.log('GOOGLE_REFRESH_TOKEN not in env, checking database...');
    refreshToken = await getRefreshTokenFromDatabase();
  }

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('Missing Google OAuth credentials:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasRefreshToken: !!refreshToken,
      source: Deno.env.get('GOOGLE_REFRESH_TOKEN') ? 'env' : 'database'
    });
    return null;
  }

  console.log('🔑 Refreshing Google access token...');

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
    return null;
  }

  const tokens: TokenResponse = await tokenResponse.json();
  console.log('✅ Successfully obtained Google access token');
  return tokens.access_token;
}

/**
 * Check if Google Cloud credentials are configured
 * Checks both environment variables and database
 */
export async function isGoogleConfigured(): Promise<boolean> {
  const hasClientCredentials = !!(
    Deno.env.get('GOOGLE_CLIENT_ID') &&
    Deno.env.get('GOOGLE_CLIENT_SECRET')
  );

  if (!hasClientCredentials) {
    console.log('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    return false;
  }

  // Check env first (both naming conventions)
  if (Deno.env.get('GOOGLE_REFRESH_TOKEN') || Deno.env.get('GMAIL_REFRESH_TOKEN')) {
    console.log('Google configured via environment variables');
    return true;
  }

  // Check database for refresh token
  const dbToken = await getRefreshTokenFromDatabase();
  if (dbToken) {
    console.log('Google configured via database oauth_connections');
    return true;
  }

  console.log('No refresh token found in env or database');
  return false;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
