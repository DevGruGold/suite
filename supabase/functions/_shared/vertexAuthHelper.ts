/**
 * Vertex AI Service Account Authentication Helper
 *
 * Two authentication tiers:
 *  1. Service Account JWT (GOOGLE_CLOUD_SERVICE_KEY secret — SA JSON key) → best, uses $1000 credits
 *  2. VERTEX_AI_API_KEY → Express Mode API key fallback
 *
 * GCP Project: gen-lang-client-0520972806 (set via GCP_PROJECT_ID secret)
 *
 * Usage:
 *   import { getVertexAuth } from '../_shared/vertexAuthHelper.ts';
 *   const auth = await getVertexAuth('gemini-2.5-flash');
 *   if (auth) {
 *     const { headers, endpoint } = auth;
 *     // fetch(endpoint, { headers, body: ... })
 *   }
 */

const TOKEN_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TOKEN_LIFETIME_SECS = 3600;

// Simple in-memory token cache to avoid signing a new JWT on every request
let _tokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Attempt to generate a service-account JWT Bearer token.
 * Reads the GOOGLE_CLOUD_SERVICE_KEY or VERTEX_SERVICE_ACCOUNT_JSON env var (JSON key).
 */
async function getServiceAccountToken(): Promise<string | null> {
    // Return cached token if still valid (with 5-minute buffer)
    if (_tokenCache && Date.now() < _tokenCache.expiresAt - 5 * 60 * 1000) {
        return _tokenCache.token;
    }

    // Try both secret names
    const saJsonStr = Deno.env.get('GOOGLE_CLOUD_SERVICE_KEY') || Deno.env.get('VERTEX_SERVICE_ACCOUNT_JSON');
    if (!saJsonStr) {
        return null;
    }

    try {
        const sa = JSON.parse(saJsonStr);
        const { client_email, private_key, token_uri } = sa;

        if (!client_email || !private_key) {
            console.warn('⚠️ Service account JSON missing client_email or private_key');
            return null;
        }

        const tokenUrl = token_uri || 'https://oauth2.googleapis.com/token';
        const now = Math.floor(Date.now() / 1000);

        // Build the JWT header + payload (base64url encoded)
        const b64url = (obj: unknown) =>
            btoa(JSON.stringify(obj))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');

        const signingInput = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
            iss: client_email,
            sub: client_email,
            scope: TOKEN_SCOPE,
            aud: tokenUrl,
            iat: now,
            exp: now + TOKEN_LIFETIME_SECS,
        })}`;

        // Import the RSA private key for RS256 signing
        const pemBody = private_key
            .replace(/\\n/g, '\n')
            .replace(/-----BEGIN PRIVATE KEY-----/, '')
            .replace(/-----END PRIVATE KEY-----/, '')
            .replace(/\s/g, '');

        const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
        const cryptoKey = await crypto.subtle.importKey(
            'pkcs8',
            binaryKey.buffer,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signatureBuf = await crypto.subtle.sign(
            'RSASSA-PKCS1-v1_5',
            cryptoKey,
            new TextEncoder().encode(signingInput)
        );

        const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuf)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        const jwt = `${signingInput}.${signatureB64}`;

        // Exchange JWT for OAuth2 access token
        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: jwt,
            }),
        });

        if (!tokenRes.ok) {
            const err = await tokenRes.text();
            console.error(`❌ Vertex SA token exchange failed [${tokenRes.status}]: ${err.slice(0, 200)}`);
            return null;
        }

        const tokenData = await tokenRes.json();
        _tokenCache = {
            token: tokenData.access_token,
            expiresAt: Date.now() + (tokenData.expires_in || TOKEN_LIFETIME_SECS) * 1000,
        };

        console.log('✅ Vertex AI service account token obtained');
        return tokenData.access_token;
    } catch (err: any) {
        console.error('❌ getServiceAccountToken error:', err.message);
        return null;
    }
}

/**
 * Get the Vertex AI endpoint URL for a given Gemini model.
 */
export function getVertexEndpoint(
    model: string = 'gemini-2.5-flash',
    location: string = 'us-central1',
    action: string = 'generateContent'
): string {
    const projectId = Deno.env.get('GCP_PROJECT_ID') || 'gen-lang-client-0520972806';
    return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:${action}`;
}

/**
 * Returns auth headers + endpoint for Vertex AI.
 * 
 * Auth order:
 *  1. Service account JWT (GOOGLE_CLOUD_SERVICE_KEY) → Bearer token → uses GCP credits
 *  2. VERTEX_AI_API_KEY → Express Mode (simpler but separate quota)
 *  3. null → Vertex unavailable, caller should fall back
 */
export async function getVertexAuth(model: string = 'gemini-2.5-flash'): Promise<{
    headers: Record<string, string>;
    endpoint: string;
    authType: 'service_account' | 'api_key';
} | null> {
    const endpoint = getVertexEndpoint(model);

    // Tier 1: Service account JWT auth
    const saToken = await getServiceAccountToken();
    if (saToken) {
        return {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${saToken}`,
            },
            endpoint,
            authType: 'service_account',
        };
    }

    // Tier 2: Express Mode API key (appended to URL as ?key=...)
    const apiKey = Deno.env.get('VERTEX_AI_API_KEY');
    if (apiKey) {
        console.log('ℹ️ Using VERTEX_AI_API_KEY (Express Mode fallback)');
        return {
            headers: { 'Content-Type': 'application/json' },
            endpoint: `${endpoint}?key=${apiKey}`,
            authType: 'api_key',
        };
    }

    console.warn('⚠️ No Vertex AI credentials available (set GOOGLE_CLOUD_SERVICE_KEY or VERTEX_AI_API_KEY)');
    return null;
}

// Re-export for backward compatibility
export const getVertexAccessToken = getServiceAccountToken;
