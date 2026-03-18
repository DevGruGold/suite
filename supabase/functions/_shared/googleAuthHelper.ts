/**
 * Shared Google Cloud Authentication Helper
 * Provides token refresh for all Google service edge functions
 * Fetches refresh token from oauth_connections database table with user context
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

export interface UserTokenInfo {
  accessToken: string;
  userEmail: string;
  userId: string;
}

/**
 * Get Supabase service role client
 */
function getSrClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials for database lookup');
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Exchange refresh token for access token
 */
async function exchangeAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    console.error('Missing Google OAuth client credentials');
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
    const errorText = await tokenResponse.text();
    console.error('Token refresh failed:', errorText);
    return null;
  }

  const tokens: TokenResponse = await tokenResponse.json();
  return tokens.access_token;
}

/**
 * Get refresh token from database oauth_connections table with strict user context
 */
async function getUserRefreshTokenStrict(opts: { 
  userId?: string; 
  userEmail?: string; 
  requestedFrom?: string 
}): Promise<{ refreshToken: string; userEmail?: string; userId?: string } | null> {
  try {
    const supabase = getSrClient();
    
    let q = supabase
      .from('oauth_connections')
      .select('refresh_token, user_id, account_email, is_active, updated_at')
      .eq('provider', 'google_cloud')
      .eq('is_active', true);

    if (opts.userId) {
      q = q.eq('user_id', opts.userId);
    } else if (opts.userEmail) {
      q = q.eq('account_email', opts.userEmail.toLowerCase());
    } else {
      return null; // No user context -> do not read other users' tokens
    }

    if (opts.requestedFrom) {
      q = q.eq('account_email', opts.requestedFrom.toLowerCase());
    }

    const { data, error } = await q
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('DB error fetching from oauth_connections:', error.message);
      return null;
    }
    
    if (!data) return null;

    return { 
      refreshToken: data.refresh_token as string, 
      userEmail: data.account_email as string, 
      userId: data.user_id as string 
    };
  } catch (err) {
    console.error('Exception fetching refresh token:', err);
    return null;
  }
}

/**
 * Get a fresh access token using the stored refresh token with user context
 * First checks user-specific tokens in database, then falls back to environment variable
 */
export async function getGoogleAccessToken(
  userCtx: { userId?: string; userEmail?: string; requestedFrom?: string }
): Promise<UserTokenInfo | { error: string; code: number; reason?: string }> {
  try {
    const strict = await getUserRefreshTokenStrict(userCtx);

    // If requestedFrom is specified but no matching token found, return error
    if (userCtx.requestedFrom && !strict) {
      return { 
        error: `Requested from address not connected for this user: ${userCtx.requestedFrom}`, 
        code: 403, 
        reason: 'requested_from_not_owned' 
      };
    }

    // No user-specific token found, try environment fallback
    if (!strict) {
      const envRefresh = Deno.env.get('GOOGLE_REFRESH_TOKEN') || Deno.env.get('GMAIL_REFRESH_TOKEN');
      
      if (!envRefresh) {
        return { error: 'No Google account connected for this user', code: 401 };
      }
      
      const access = await exchangeAccessToken(envRefresh);
      if (!access) {
        return { error: 'Failed to exchange env refresh token', code: 401 };
      }
      
      return { 
        accessToken: access, 
        userEmail: 'env-fallback', 
        userId: 'env-fallback' 
      };
    }

    // Exchange user-specific refresh token
    const access = await exchangeAccessToken(strict.refreshToken);
    if (!access) {
      return { error: 'Failed to get access token', code: 401 };
    }
    
    return { 
      accessToken: access, 
      userEmail: strict.userEmail || '', 
      userId: strict.userId || '' 
    };
  } catch (err) {
    console.error('Error getting Google access token:', err);
    return { error: 'Internal error getting access token', code: 500 };
  }
}

/**
 * Check if Google Cloud credentials are configured for a specific user
 * Checks both user-specific tokens in database and environment variables
 */
export async function isGoogleConfigured(userCtx?: { userId?: string; userEmail?: string }): Promise<boolean> {
  try {
    const hasClientCredentials = !!(
      Deno.env.get('GOOGLE_CLIENT_ID') &&
      Deno.env.get('GOOGLE_CLIENT_SECRET')
    );

    if (!hasClientCredentials) {
      console.log('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
      return false;
    }

    // If user context provided, check for user-specific token
    if (userCtx && (userCtx.userId || userCtx.userEmail)) {
      const userToken = await getUserRefreshTokenStrict({
        userId: userCtx.userId,
        userEmail: userCtx.userEmail
      });
      
      if (userToken) {
        console.log('Google configured for user via database');
        return true;
      }
    }

    // Check environment fallback
    if (Deno.env.get('GOOGLE_REFRESH_TOKEN') || Deno.env.get('GMAIL_REFRESH_TOKEN')) {
      console.log('Google configured via environment variables (fallback)');
      return true;
    }

    console.log('No refresh token found for user context or env');
    return false;
  } catch (err) {
    console.error('Error checking Google configuration:', err);
    return false;
  }
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
