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
 * Extract user context from request headers and body
 * Looks for user identification in multiple places:
 * 1. Authorization header (JWT token)
 * 2. x-user-email header
 * 3. x-user-id header
 * 4. Request body fields (user_email, user_id, requested_from)
 */
export function extractUserContext(req: Request, body: any): { 
  userId?: string; 
  userEmail?: string; 
  requestedFrom?: string;
  authMethod?: string;
} {
  const context: { userId?: string; userEmail?: string; requestedFrom?: string; authMethod?: string } = {};
  
  try {
    // Check headers first (these are more reliable)
    const userEmailHeader = req.headers.get('x-user-email');
    const userIdHeader = req.headers.get('x-user-id');
    const authHeader = req.headers.get('authorization');
    
    // Try to extract from JWT if available
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        // This is a simple extraction - in production you'd want to verify the JWT
        const token = authHeader.substring(7);
        const base64Url = token.split('.')[1];
        if (base64Url) {
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          
          const payload = JSON.parse(jsonPayload);
          context.userId = payload.sub || payload.user_id;
          context.userEmail = payload.email;
          context.authMethod = 'jwt';
        }
      } catch (e) {
        console.debug('Could not parse JWT token:', e);
      }
    }
    
    // Override with explicit headers if provided (these take precedence)
    if (userEmailHeader) {
      context.userEmail = userEmailHeader;
      context.authMethod = context.authMethod ? 'header+others' : 'header';
    }
    
    if (userIdHeader) {
      context.userId = userIdHeader;
      context.authMethod = context.authMethod ? 'header+others' : 'header';
    }
    
    // Then check body parameters (lowest precedence, but useful for debugging)
    if (body) {
      if (body.user_email && !context.userEmail) {
        context.userEmail = body.user_email;
        context.authMethod = context.authMethod ? 'body+others' : 'body';
      }
      
      if (body.user_id && !context.userId) {
        context.userId = body.user_id;
        context.authMethod = context.authMethod ? 'body+others' : 'body';
      }
      
      // requestedFrom is specifically for "act as" functionality
      if (body.requested_from) {
        context.requestedFrom = body.requested_from;
      }
      
      // Also check for nested user object
      if (body.user) {
        if (body.user.email && !context.userEmail) {
          context.userEmail = body.user.email;
        }
        if (body.user.id && !context.userId) {
          context.userId = body.user.id;
        }
      }
    }
    
    // Clean up - ensure email is lowercase for consistency
    if (context.userEmail) {
      context.userEmail = context.userEmail.toLowerCase();
    }
    
    if (context.requestedFrom) {
      context.requestedFrom = context.requestedFrom.toLowerCase();
    }
    
    return context;
  } catch (error) {
    console.error('Error extracting user context:', error);
    return {};
  }
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
