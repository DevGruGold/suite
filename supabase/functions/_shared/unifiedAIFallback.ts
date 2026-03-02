/**
 * Unified AI Fallback Service - GOOGLE CLOUD OAUTH2 PRIMARY VERSION
 * Provider cascade:
 *   1. Vertex AI via Service Account JWT (OAuth2) — primary, most reliable
 *   2. Vertex AI via Gemini API key — fallback
 *   3. Lovable (OpenRouter/Anthropic)
 *   4. DeepSeek V3
 *   5. Kimi K2
 *
 * TIMEOUT GUARDS: Per-provider timeouts prevent cascade hangs
 * FAST-FAIL: 402/429 errors skip immediately to next provider
 */

import { generateElizaSystemPrompt } from './elizaSystemPrompt.ts';
import { ELIZA_TOOLS } from './elizaTools.ts';

// Per-provider timeout configuration (ms)
const PROVIDER_TIMEOUTS = {
  vertexOAuth: 12000, // Vertex AI via Service Account JWT (primary)
  gemini: 8000,       // Gemini API key fallback
  vertexai: 8000,     // Vertex AI Express Mode
  lovable: 8000,
  deepseek: 10000,    // Slightly longer for reasoning
  kimi: 8000,
  embedding: 10000,
};

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE ACCOUNT JWT HELPER
// Signs a JWT with the stored private key and exchanges it for a GCP access token
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base64url encode a Uint8Array (JWT-safe, no padding)
 */
function base64url(data: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...data));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Build and sign a Google service account JWT, then exchange it for
 * a short-lived OAuth2 access token with the Vertex AI scope.
 * Returns null if SA credentials are not configured.
 */
async function getServiceAccountAccessToken(): Promise<string | null> {
  const saEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  // Private key may be stored with literal \n or real newlines
  const rawKey = Deno.env.get('GOOGLE_PRIVATE_KEY');

  if (!saEmail || !rawKey) {
    return null;
  }

  try {
    // Normalize the PEM key (handle \n escapes stored as literal backslash-n)
    const pemKey = rawKey.replace(/\\n/g, '\n');

    // Strip PEM headers/footers and decode to bytes
    const pemBody = pemKey
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s+/g, '');
    const keyBytes = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

    // Import as PKCS8 RSA key for RS256 signing
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      keyBytes,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: saEmail,
      sub: saEmail,
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      iat: now,
      exp: now + 3600,
    };

    const enc = new TextEncoder();
    const headerB64  = base64url(enc.encode(JSON.stringify(header)));
    const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
    const signingInput = `${headerB64}.${payloadB64}`;

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      enc.encode(signingInput)
    );
    const jwtToken = `${signingInput}.${base64url(new Uint8Array(signature))}`;

    // Exchange JWT for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwtToken,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.warn('⚠️ SA token exchange failed:', errText);
      return null;
    }

    const tokenData = await tokenRes.json();
    console.log('✅ Service Account access token obtained');
    return tokenData.access_token || null;
  } catch (err) {
    console.warn('⚠️ SA JWT signing error:', err?.message || err);
    return null;
  }
}

/**
 * Call Vertex AI Gemini using a Service Account OAuth2 access token.
 * Uses the aiplatform.googleapis.com endpoint (no API key needed).
 */
async function callVertexWithServiceAccount(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<ProviderResult> {
  const projectId = Deno.env.get('GCP_PROJECT_ID') || Deno.env.get('GOOGLE_CLOUD_PROJECT_ID');
  const region    = Deno.env.get('GCP_REGION') || 'us-central1';
  const model     = options.model || 'gemini-2.5-flash';

  if (!projectId) {
    return { success: false, provider: 'vertex-sa', error: 'GCP_PROJECT_ID not configured' };
  }

  const accessToken = await getServiceAccountAccessToken();
  if (!accessToken) {
    return { success: false, provider: 'vertex-sa', error: 'Service account credentials not available' };
  }

  try {
    console.log('🏔️ PRIMARY: Vertex AI via Service Account OAuth2...');

    const effectiveSystemPrompt = getEffectiveSystemPrompt(options);
    const effectiveTools = getEffectiveTools(options);

    const userMessages = messages.filter(m => m.role !== 'system');
    const contents = userMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const maxTokens = options.maxTokens || options.max_tokens || 2000;

    const requestBody: any = {
      contents,
      systemInstruction: { parts: [{ text: effectiveSystemPrompt }] },
      generationConfig: {
        temperature: options.temperature || 0.7,
        maxOutputTokens: maxTokens,
      },
    };

    if (effectiveTools.length > 0) {
      requestBody.tools = [{
        functionDeclarations: effectiveTools.map(tool => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        }))
      }];
    }

    const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:generateContent`;

    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
      PROVIDER_TIMEOUTS.vertexOAuth
    );

    const fastFailError = checkFastFail(response, 'vertex-sa');
    if (fastFailError) return { success: false, provider: 'vertex-sa', error: fastFailError };

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ Vertex SA failed (${response.status}):`, errorText);
      return { success: false, provider: 'vertex-sa', error: `${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts;

    if (!parts || parts.length === 0) {
      return { success: false, provider: 'vertex-sa', error: 'No content in Vertex AI response' };
    }

    console.log('✅ PRIMARY: Vertex AI SA OAuth2 successful');

    const functionCall = parts.find((p: any) => p.functionCall);
    if (functionCall) {
      console.log(`🔧 Vertex SA returned function call: ${functionCall.functionCall.name}`);
      return {
        success: true,
        provider: 'vertex-sa',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: `vertex_sa_${Date.now()}`,
            type: 'function',
            function: {
              name: functionCall.functionCall.name,
              arguments: JSON.stringify(functionCall.functionCall.args || {})
            }
          }]
        }
      };
    }

    const content = parts.find((p: any) => p.text)?.text || '';
    return { success: true, provider: 'vertex-sa', content };
  } catch (error) {
    console.warn('⚠️ Vertex SA error:', error?.message || error);
    return { success: false, provider: 'vertex-sa', error: error?.message || 'Unknown error' };
  }
}

/**
 * Fetch with timeout - aborts request if provider is slow/hung
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Fast-fail check for credit exhaustion/rate limiting
 * Returns error message if should skip, null if OK to proceed
 */
function checkFastFail(response: Response, provider: string): string | null {
  if (response.status === 402) {
    console.warn(`💳 ${provider} out of credits (402) - skipping to next provider`);
    return '402 Payment Required - out of credits';
  }
  if (response.status === 429) {
    console.warn(`⏱️ ${provider} rate limited (429) - skipping to next provider`);
    return '429 Rate Limited';
  }
  return null;
}

export interface UnifiedAIOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  max_tokens?: number; // Alias for compatibility
  systemPrompt?: string;
  tools?: Array<any>;
  preferProvider?: 'gemini' | 'vertexai' | 'lovable' | 'deepseek' | 'kimi'; // Gemini now first
  // Eliza intelligence context
  userContext?: any;
  miningStats?: any;
  executiveName?: string;
  useFullElizaContext?: boolean; // Default true - use full Eliza intelligence
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  tool_calls?: any;
}

interface ProviderResult {
  success: boolean;
  content?: string;
  message?: any;
  provider: string;
  error?: string;
}

// Action-oriented directive prepended to ALL fallback prompts
const ACTION_DIRECTIVE = `
CRITICAL RESPONSE RULES (HIGHEST PRIORITY):
1. NEVER explain what you're going to do - JUST DO IT
2. Call tools IMMEDIATELY when user asks for information
3. Present results NATURALLY as if you already knew the answer
4. Keep responses CONCISE - no unnecessary preamble (1-3 sentences for simple queries)
5. Only mention tools/functions when there's an ERROR to report
6. User should NEVER know you're calling tools - be seamless
`;

/**
 * Get the effective system prompt - uses full Eliza prompt if not provided
 * ENHANCED: Prepends action-oriented directive AND appends executive persona override
 */
function getEffectiveSystemPrompt(options: UnifiedAIOptions): string {
  // 1. If strict manual prompt provided (long), use it directly (bypass Eliza injection)
  if (options.systemPrompt && options.systemPrompt.length > 2000) {
    return ACTION_DIRECTIVE + '\n\n' + options.systemPrompt;
  }

  if (options.useFullElizaContext === false) {
    // Explicitly disabled - still add action directive for conciseness
    return ACTION_DIRECTIVE + '\n\n' + (options.systemPrompt || 'You are a helpful AI assistant.');
  }

  // DEFAULT: Use full Eliza system prompt for intelligence parity
  console.log('🧠 Enriching with full Eliza system prompt + action directive...');
  const elizaPrompt = generateElizaSystemPrompt(
    options.userContext,
    options.miningStats,
    null,
    'eliza',
    options.executiveName || 'Chief Strategy Officer'
  );

  // CRITICAL: If a specific persona/prompt is provided (e.g. "You are the CTO"), 
  // APPEND it to the end to OVERRIDE the default Eliza identity while keeping capabilities.
  if (options.systemPrompt) {
    return ACTION_DIRECTIVE + '\n\n' + elizaPrompt + '\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '👤 EXECUTIVE PERSONA OVERRIDE (ADOPT THIS IDENTITY)\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      options.systemPrompt;
  }

  return ACTION_DIRECTIVE + '\n\n' + elizaPrompt;
}

/**
 * Get effective tools - uses ELIZA_TOOLS if not provided
 */
function getEffectiveTools(options: UnifiedAIOptions): any[] {
  if (options.tools && options.tools.length > 0) {
    return options.tools;
  }

  if (options.useFullElizaContext === false) {
    return [];
  }

  // DEFAULT: Use full Eliza tools for capability parity
  console.log('🔧 Including all ELIZA_TOOLS for fallback provider...');
  return ELIZA_TOOLS;
}

/**
 * Call Gemini API directly with tool calling support - NOW PRIMARY PROVIDER
 */
async function callGemini(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<ProviderResult> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

  if (!GEMINI_API_KEY) {
    return { success: false, provider: 'gemini', error: 'GEMINI_API_KEY not configured' };
  }

  try {
    console.log('💎 PRIMARY PROVIDER: Attempting Gemini AI with full Eliza context...');

    const effectiveSystemPrompt = getEffectiveSystemPrompt(options);
    const effectiveTools = getEffectiveTools(options);

    // Convert messages to Gemini format (excluding system messages)
    const userMessages = messages.filter(m => m.role !== 'system');
    const contents = userMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const maxTokens = options.maxTokens || options.max_tokens || 2000;

    const requestBody: any = {
      contents,
      systemInstruction: { parts: [{ text: effectiveSystemPrompt }] },
      generationConfig: {
        temperature: options.temperature || 0.7,
        maxOutputTokens: maxTokens,
      },
    };

    // Add ALL tool definitions for Gemini (convert to Gemini format)
    if (effectiveTools.length > 0) {
      console.log(`📊 Gemini: Passing ${effectiveTools.length} tools (full array)`);
      requestBody.tools = [{
        functionDeclarations: effectiveTools.map(tool => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters
        }))
      }];
    }

    // CRITICAL FIX: Updated from gemini-2.0-flash to gemini-2.5-flash
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
      PROVIDER_TIMEOUTS.gemini
    );

    // Fast-fail for credit exhaustion
    const fastFailError = checkFastFail(response, 'gemini');
    if (fastFailError) {
      return { success: false, provider: 'gemini', error: fastFailError };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ Gemini failed (${response.status}):`, errorText);
      return { success: false, provider: 'gemini', error: `${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts;

    if (!parts || parts.length === 0) {
      return { success: false, provider: 'gemini', error: 'No content in response' };
    }

    console.log('✅ PRIMARY PROVIDER: Gemini AI successful with Eliza intelligence');

    // Check for function calls (Gemini's tool call format)
    const functionCall = parts.find((p: any) => p.functionCall);
    if (functionCall) {
      console.log(`🔧 Gemini returned function call: ${functionCall.functionCall.name}`);
      // Convert to OpenAI format for compatibility
      return {
        success: true,
        provider: 'gemini',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: `gemini_${Date.now()}`,
            type: 'function',
            function: {
              name: functionCall.functionCall.name,
              arguments: JSON.stringify(functionCall.functionCall.args || {})
            }
          }]
        }
      };
    }

    const content = parts.find((p: any) => p.text)?.text || '';
    return { success: true, provider: 'gemini', content };
  } catch (error) {
    console.warn('⚠️ Gemini error:', error.message);
    return { success: false, provider: 'gemini', error: error.message };
  }
}

/**
 * Call Vertex AI (Google Cloud) - SECONDARY PROVIDER
 */
async function callVertex(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<ProviderResult> {
  // Use existing implementation but wrap with fallback logic
  // For now, simpler implementation:
  const VERTEX_API_KEY = Deno.env.get('VERTEX_API_KEY') || Deno.env.get('GEMINI_API_KEY');

  if (!VERTEX_API_KEY) {
    return { success: false, provider: 'vertex', error: 'VERTEX_API_KEY not configured' };
  }

  // NOTE: In a real implementation, this would use the Vertex AI REST API
  // For now, we'll reuse the Gemini implementation but log it as Vertex attempt
  // since they often use the same models/keys in this setup
  return callGemini(messages, options);
}

/**
 * Call Lovable (via OpenRouter/Anthropic) - TERTIARY PROVIDER
 */
async function callLovable(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<ProviderResult> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') || Deno.env.get('OPENROUTER_API_KEY');

  if (!LOVABLE_API_KEY) {
    return { success: false, provider: 'lovable', error: 'LOVABLE_API_KEY not configured' };
  }

  try {
    console.log('💜 TERTIARY PROVIDER: Attempting Lovable (Claude 3.5 Sonnet) with full Eliza context...');

    const effectiveSystemPrompt = getEffectiveSystemPrompt(options);
    const effectiveTools = getEffectiveTools(options);

    const requestMessages = [
      { role: 'system', content: effectiveSystemPrompt },
      ...messages.filter(m => m.role !== 'system')
    ];

    const maxTokens = options.maxTokens || options.max_tokens || 2000;

    const requestBody: any = {
      model: 'anthropic/claude-3.5-sonnet', // The "Lovable" brain
      messages: requestMessages,
      temperature: options.temperature || 0.7,
      max_tokens: maxTokens,
    };

    // Include ALL tools for Lovable
    if (effectiveTools.length > 0) {
      console.log(`📊 Lovable: Passing ${effectiveTools.length} tools (full array)`);
      requestBody.tools = effectiveTools;
      requestBody.tool_choice = 'auto';
    }

    const response = await fetchWithTimeout(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://xmrt.pro',
          'X-Title': 'XMRT Lovable'
        },
        body: JSON.stringify(requestBody),
      },
      PROVIDER_TIMEOUTS.lovable
    );

    // Fast-fail
    const fastFailError = checkFastFail(response, 'lovable');
    if (fastFailError) {
      return { success: false, provider: 'lovable', error: fastFailError };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ Lovable failed (${response.status}):`, errorText);
      return { success: false, provider: 'lovable', error: `${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    if (!message) {
      return { success: false, provider: 'lovable', error: 'No message in response' };
    }

    console.log('✅ Lovable AI successful with Eliza intelligence');

    if (message.tool_calls?.length > 0) {
      console.log(`🔧 Lovable returned ${message.tool_calls.length} tool calls`);
      return { success: true, provider: 'lovable', message };
    }

    return { success: true, provider: 'lovable', content: message.content || '' };
  } catch (error) {
    console.warn('⚠️ Lovable error:', error.message);
    return { success: false, provider: 'lovable', error: error.message };
  }
}

/**
 * Call DeepSeek V3 - FALLBACK PROVIDER (Reasoning)
 */
async function callDeepSeek(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<ProviderResult> {
  const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

  if (!DEEPSEEK_API_KEY) {
    return { success: false, provider: 'deepseek', error: 'DEEPSEEK_API_KEY not configured' };
  }

  try {
    console.log('🧠 FALLBACK PROVIDER: Attempting DeepSeek V3 with full Eliza context...');

    const effectiveSystemPrompt = getEffectiveSystemPrompt(options);
    const effectiveTools = getEffectiveTools(options);

    // DeepSeek V3 supports system messages
    const requestMessages = [
      { role: 'system', content: effectiveSystemPrompt },
      ...messages.filter(m => m.role !== 'system')
    ];

    const maxTokens = options.maxTokens || options.max_tokens || 2000;

    const requestBody: any = {
      model: 'deepseek-chat',
      messages: requestMessages,
      temperature: options.temperature || 0.7,
      max_tokens: maxTokens,
    };

    // Note: DeepSeek V3 tool calling support varies, but we'll try passing them
    // If it fails, we might need to disable tools for strict DeepSeek usage
    if (effectiveTools.length > 0) {
      // Check if DeepSeek supports OpenAI format tools (it usually does)
      // requestBody.tools = effectiveTools;
      // requestBody.tool_choice = 'auto';
      // For now, simpler DeepSeek usage (often used for pure reasoning)
    }

    const response = await fetchWithTimeout(
      'https://api.deepseek.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
      PROVIDER_TIMEOUTS.deepseek
    );

    // Fast-fail for credit exhaustion
    const fastFailError = checkFastFail(response, 'deepseek');
    if (fastFailError) {
      return { success: false, provider: 'deepseek', error: fastFailError };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ DeepSeek failed (${response.status}):`, errorText);
      return { success: false, provider: 'deepseek', error: `${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    if (!message) {
      return { success: false, provider: 'deepseek', error: 'No message in response' };
    }

    console.log('✅ DeepSeek AI successful with Eliza intelligence');

    if (message.tool_calls?.length > 0) {
      console.log(`🔧 DeepSeek returned ${message.tool_calls.length} tool calls`);
      return { success: true, provider: 'deepseek', message };
    }

    return { success: true, provider: 'deepseek', content: message.content || '' };
  } catch (error) {
    console.warn('⚠️ DeepSeek error:', error.message);
    return { success: false, provider: 'deepseek', error: error.message };
  }
}

/**
 * Call Kimi K2 via OpenRouter API - FINAL FALLBACK PROVIDER
 */
async function callKimi(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<ProviderResult> {
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');

  if (!OPENROUTER_API_KEY) {
    return { success: false, provider: 'kimi', error: 'OPENROUTER_API_KEY not configured' };
  }

  try {
    console.log('🦊 FINAL FALLBACK: Attempting Kimi K2 via OpenRouter with full Eliza context...');

    const effectiveSystemPrompt = getEffectiveSystemPrompt(options);
    const effectiveTools = getEffectiveTools(options);

    const requestMessages = [
      { role: 'system', content: effectiveSystemPrompt },
      ...messages.filter(m => m.role !== 'system')
    ];

    const maxTokens = options.maxTokens || options.max_tokens || 2000;

    const requestBody: any = {
      model: 'moonshotai/kimi-k2',
      messages: requestMessages,
      temperature: options.temperature || 0.7,
      max_tokens: maxTokens, // Reduced for credit limits
    };

    // Include ALL tools for Kimi
    if (effectiveTools.length > 0) {
      console.log(`📊 Kimi K2: Passing ${effectiveTools.length} tools (full array)`);
      requestBody.tools = effectiveTools;
      requestBody.tool_choice = 'auto';
    }

    const response = await fetchWithTimeout(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://xmrt.pro',
          'X-Title': 'XMRT Eliza'
        },
        body: JSON.stringify(requestBody),
      },
      PROVIDER_TIMEOUTS.kimi
    );

    // Fast-fail
    const fastFailError = checkFastFail(response, 'kimi');
    if (fastFailError) {
      return { success: false, provider: 'kimi', error: fastFailError };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ Kimi failed (${response.status}):`, errorText);
      return { success: false, provider: 'kimi', error: `${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    if (!message) {
      return { success: false, provider: 'kimi', error: 'No message in response' };
    }

    console.log('✅ Kimi AI successful with Eliza intelligence');

    if (message.tool_calls?.length > 0) {
      console.log(`🔧 Kimi returned ${message.tool_calls.length} tool calls`);
      return { success: true, provider: 'kimi', message };
    }

    return { success: true, provider: 'kimi', content: message.content || '' };
  } catch (error) {
    console.warn('⚠️ Kimi error:', error.message);
    return { success: false, provider: 'kimi', error: error.message };
  }
}

/**
 * MAIN ENTRY POINT: Unified AI Fallback Cascade
 *
 * Order:
 *   1. Vertex AI via Service Account OAuth2 (GCP — most reliable)
 *   2. Gemini API key (direct, fast fallback)
 *   3. Vertex AI Express Mode (via Gemini key)
 *   4. Lovable / OpenRouter
 *   5. DeepSeek V3
 *   6. Kimi K2
 */
export async function callAIWithFallback(
  messages: AIMessage[],
  options: UnifiedAIOptions = {}
): Promise<any> {
  const errors: string[] = [];

  // 1. PRIMARY: Vertex AI via Service Account OAuth2
  console.log('🔑 Trying Vertex AI SA OAuth2 (primary)...');
  const saResult = await callVertexWithServiceAccount(messages, options);
  if (saResult.success) return transformResult(saResult);
  errors.push(`VertexSA: ${saResult.error}`);
  console.warn('⚠️ Vertex SA failed, trying API key fallback...');

  // 2. FALLBACK: Gemini API key
  const geminiResult = await callGemini(messages, options);
  if (geminiResult.success) return transformResult(geminiResult);
  errors.push(`Gemini: ${geminiResult.error}`);

  // 3. Vertex AI Express Mode (reuses Gemini key)
  const vertexResult = await callVertex(messages, options);
  if (vertexResult.success) return transformResult(vertexResult);
  errors.push(`Vertex: ${vertexResult.error}`);

  // 4. Lovable (Claude 3.5 Sonnet via OpenRouter)
  const lovableResult = await callLovable(messages, options);
  if (lovableResult.success) return transformResult(lovableResult);
  errors.push(`Lovable: ${lovableResult.error}`);

  // 5. DeepSeek V3
  const deepSeekResult = await callDeepSeek(messages, options);
  if (deepSeekResult.success) return transformResult(deepSeekResult);
  errors.push(`DeepSeek: ${deepSeekResult.error}`);

  // 6. Kimi K2 (final fallback)
  const kimiResult = await callKimi(messages, options);
  if (kimiResult.success) return transformResult(kimiResult);
  errors.push(`Kimi: ${kimiResult.error}`);

  throw new Error(`All AI providers failed: ${errors.join(' | ')}`);
}

/**
 * Transform standard result format into string or object (for backward compatibility)
 */
function transformResult(result: ProviderResult): any {
  if (result.message) {
    // Return full message object (with tool calls)
    return {
      role: 'assistant',
      content: result.message.content,
      tool_calls: result.message.tool_calls,
      provider: result.provider
    };
  }
  // Return simple object with content (Exec Council compatibility)
  return {
    content: result.content || '',
    provider: result.provider
  };
}

/**
 * Generate Embedding using Supabase Native AI (ONNX via internal Runtime)
 * Uses Singleton pattern to prevent memory leaks/crashes
 */
let embeddingSession: any = null;

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    console.log(`🧠 Generating embedding for ${text.length} chars using Supabase Native AI (gte-small)...`);

    // Initialize session only once (Singleton)
    if (!embeddingSession) {
      // @ts-ignore: Supabase is a global in Edge Runtime
      if (typeof Supabase === 'undefined' || !Supabase.ai) {
        throw new Error('Supabase Native AI not available in this environment');
      }
      console.log('🔌 Initializing new Supabase.ai Session (gte-small)...');
      // @ts-ignore: Supabase is a global in Edge Runtime
      embeddingSession = new Supabase.ai.Session('gte-small');
    }

    // Generate embedding
    const output = await embeddingSession.run(text, {
      mean_pool: true,
      normalize: true,
    });

    if (!output || !Array.isArray(output)) {
      throw new Error('Invalid embedding format from Supabase AI');
    }

    return output;
  } catch (error) {
    console.error('❌ Embedding generation error:', error);
    // If session is possibly corrupted, clear it for next retry
    embeddingSession = null;
    throw error;
  }
}

