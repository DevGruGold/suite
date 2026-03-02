// Unified AI Gateway with Comprehensive Fallback System
// Priority: Vertex AI (gemini-2.5-pro/flash, GCP credits) → Gemini API key → DeepSeek → OpenAI → Kimi
// Last updated: 2026-03-02 — Vertex AI SA auth wired as priority 1

import { getVertexAuth, getVertexEndpoint } from './vertexAuthHelper.ts';

export interface AIProvider {
  name: string;
  apiKey?: string;
  endpoint: string;
  model: string;
  priority: number;
  rateLimit: number;
  timeout: number;
  available: boolean;
}

export interface GatewayConfig {
  providers: AIProvider[];
  fallbackStrategy: 'sequential' | 'random' | 'load_balance';
  retryAttempts: number;
  circuitBreakerThreshold: number;
}

// Production AI Gateway Configuration
// Priority order: Vertex gemini-2.5-pro → Vertex gemini-2.5-flash → Gemini API → DeepSeek → OpenAI → Kimi
const GATEWAY_CONFIG: GatewayConfig = {
  providers: [
    {
      name: 'vertex-pro',
      // Endpoint is dynamically set per-request via vertexAuthHelper
      endpoint: getVertexEndpoint('gemini-2.5-pro'),
      model: 'gemini-2.5-pro',
      priority: 1,
      rateLimit: 10000, // High — backed by $1000 GCP credits
      timeout: 60000,
      available: true
    },
    {
      name: 'vertex-flash',
      endpoint: getVertexEndpoint('gemini-2.5-flash'),
      model: 'gemini-2.5-flash',
      priority: 2,
      rateLimit: 10000,
      timeout: 30000,
      available: true
    },
    {
      name: 'gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      model: 'gemini-2.5-flash',
      priority: 3,
      rateLimit: 2000, // Free tier — 15 RPM limit
      timeout: 30000,
      available: true
    },
    {
      name: 'deepseek',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      priority: 4,
      rateLimit: 1500,
      timeout: 30000,
      available: true
    },
    {
      name: 'openai',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      priority: 5,
      rateLimit: 3000,
      timeout: 30000,
      available: true
    },
    {
      name: 'kimi',
      endpoint: 'https://api.moonshot.cn/v1/chat/completions',
      model: 'moonshot-v1-8k',
      priority: 6,
      rateLimit: 500,
      timeout: 30000,
      available: true
    }
  ],
  fallbackStrategy: 'sequential',
  retryAttempts: 3,
  circuitBreakerThreshold: 5
};

// Circuit breaker for tracking provider failures
class CircuitBreaker {
  private failures: Map<string, number> = new Map();
  private lastFailureTime: Map<string, number> = new Map();
  private readonly resetTimeout = 300000; // 5 minutes

  isProviderAvailable(providerName: string): boolean {
    const failures = this.failures.get(providerName) || 0;
    const lastFailure = this.lastFailureTime.get(providerName) || 0;

    // Reset if enough time has passed
    if (Date.now() - lastFailure > this.resetTimeout) {
      this.failures.set(providerName, 0);
      return true;
    }

    return failures < GATEWAY_CONFIG.circuitBreakerThreshold;
  }

  recordFailure(providerName: string): void {
    const current = this.failures.get(providerName) || 0;
    this.failures.set(providerName, current + 1);
    this.lastFailureTime.set(providerName, Date.now());
  }

  recordSuccess(providerName: string): void {
    this.failures.set(providerName, 0);
  }
}

const circuitBreaker = new CircuitBreaker();

// Enhanced error handling for different failure types
export class AIGatewayError extends Error {
  constructor(
    message: string,
    public provider: string,
    public statusCode?: number,
    public errorType?: 'token_exhausted' | 'rate_limit' | 'timeout' | 'service_unavailable' | 'unknown'
  ) {
    super(message);
    this.name = 'AIGatewayError';
  }
}

// Detect error type from response
function detectErrorType(response: Response, error?: any): 'token_exhausted' | 'rate_limit' | 'timeout' | 'service_unavailable' | 'unknown' {
  if (response.status === 402) return 'token_exhausted';
  if (response.status === 429) return 'rate_limit';
  if (response.status === 503 || response.status === 502) return 'service_unavailable';
  if (response.status === 408 || error?.name === 'AbortError') return 'timeout';
  return 'unknown';
}

// Get available providers based on circuit breaker and priority
function getAvailableProviders(): AIProvider[] {
  return GATEWAY_CONFIG.providers
    .filter(provider =>
      provider.available &&
      circuitBreaker.isProviderAvailable(provider.name)
    )
    .sort((a, b) => a.priority - b.priority);
}

// Execute chat completion with a specific provider
async function executeWithProvider(
  provider: AIProvider,
  messages: any[],
  options: any = {}
): Promise<any> {
  console.log(`[Gateway] Attempting ${provider.name} model=${provider.model} (priority: ${provider.priority})`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), provider.timeout);

    const isGemini = provider.name === 'gemini' || provider.name === 'vertex-pro' || provider.name === 'vertex-flash';

    // Prepare request body
    let requestBody: any;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let endpoint = provider.endpoint;

    if (isGemini) {
      // Gemini / Vertex AI format
      requestBody = {
        contents: messages
          .filter((msg: any) => msg.role !== 'system')
          .map((msg: any) => ({
            role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
            parts: [{ text: String(msg.content || '') }]
          })),
        systemInstruction: messages.find((m: any) => m.role === 'system')
          ? { parts: [{ text: messages.find((m: any) => m.role === 'system').content }] }
          : undefined,
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: options.max_tokens || 2048
        }
      };

      // Convert OpenAI-style tools to Gemini function_declarations
      if (options.tools && options.tools.length > 0) {
        const functionDeclarations = options.tools
          .filter((t: any) => t.type === 'function' && t.function)
          .map((t: any) => ({
            name: t.function.name,
            description: t.function.description || '',
            parameters: t.function.parameters || { type: 'object', properties: {} }
          }));
        if (functionDeclarations.length > 0) {
          requestBody.tools = [{ function_declarations: functionDeclarations }];
        }
      }

      // Set auth headers for Vertex vs free Gemini
      if (provider.name === 'vertex-pro' || provider.name === 'vertex-flash') {
        const vertexAuth = await getVertexAuth(provider.model);
        if (vertexAuth) {
          headers = vertexAuth.headers;
          endpoint = vertexAuth.endpoint;
          console.log(`[Gateway]   🔐 Vertex auth: ${vertexAuth.authType} → ${endpoint.split('/models/')[1]?.split(':')[0]}`);
        } else {
          throw new AIGatewayError(
            `Vertex AI credentials unavailable for ${provider.name}`,
            provider.name,
            401,
            'service_unavailable'
          );
        }
      } else {
        // Free Gemini endpoint — API key in URL
        const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';
        if (!geminiKey) {
          throw new AIGatewayError('GEMINI_API_KEY not set', provider.name, 401, 'service_unavailable');
        }
        endpoint = `${provider.endpoint}?key=${geminiKey}`;
      }

    } else {
      // OpenAI-compatible format (openai, deepseek, kimi)
      requestBody = {
        model: provider.model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 2048,
        stream: false
      };

      if (options.tools && options.tools.length > 0) {
        requestBody.tools = options.tools;
        requestBody.tool_choice = options.tool_choice || 'auto';
      }

      const apiKey = await getAPIKey(provider.name);
      if (!apiKey) {
        throw new AIGatewayError(`No API key for ${provider.name}`, provider.name, 401, 'service_unavailable');
      }
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['User-Agent'] = 'DevGruGold-Suite/2.0';
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorType = detectErrorType(response);
      const errorText = await response.text();

      if (errorType === 'token_exhausted') {
        console.log(`[Gateway] ${provider.name} token exhausted, marking unavailable`);
        provider.available = false;
      }

      throw new AIGatewayError(
        `${provider.name} failed: ${response.status} ${errorText.slice(0, 300)}`,
        provider.name,
        response.status,
        errorType
      );
    }

    const result = await response.json();

    // Normalize response to OpenAI format
    let normalizedResponse;
    if (isGemini) {
      const candidate = result.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const textParts = parts.filter((p: any) => p.text);
      const funcCallParts = parts.filter((p: any) => p.functionCall);

      const toolCalls = funcCallParts.map((p: any, i: number) => ({
        id: `call_${i}_${Date.now()}`,
        type: 'function',
        function: {
          name: p.functionCall.name,
          arguments: JSON.stringify(p.functionCall.args || {})
        }
      }));

      normalizedResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: textParts.map((p: any) => p.text).join('') || null,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined
          }
        }],
        usage: result.usageMetadata || {},
        provider: provider.name
      };
    } else {
      normalizedResponse = { ...result, provider: provider.name };
    }

    circuitBreaker.recordSuccess(provider.name);
    console.log(`[Gateway] ✅ ${provider.name} succeeded`);
    return normalizedResponse;

  } catch (error: any) {
    circuitBreaker.recordFailure(provider.name);
    console.log(`[Gateway] ❌ ${provider.name} failed: ${error.message}`);

    if (error instanceof AIGatewayError) throw error;

    throw new AIGatewayError(
      `${provider.name} execution failed: ${error.message}`,
      provider.name,
      undefined,
      error.name === 'AbortError' ? 'timeout' : 'unknown'
    );
  }
}

// Get API key for non-Vertex providers
async function getAPIKey(providerName: string): Promise<string> {
  const apiKeys: Record<string, string> = {
    gemini: Deno.env.get('GEMINI_API_KEY') || '',
    deepseek: Deno.env.get('DEEPSEEK_API_KEY') || '',
    openai: Deno.env.get('OPENAI_API_KEY') || '',
    kimi: Deno.env.get('KIMI_API_KEY') || '',
  };
  return apiKeys[providerName] || '';
}

// Main gateway function with comprehensive fallback
export async function executeAIRequest(
  messages: any[],
  options: any = {}
): Promise<any> {
  const startTime = Date.now();
  const requestId = `req_${Math.random().toString(36).substr(2, 9)}`;

  console.log(`[Gateway] [${requestId}] Starting AI request with ${messages.length} messages`);

  const availableProviders = getAvailableProviders();

  if (availableProviders.length === 0) {
    throw new AIGatewayError(
      'No available AI providers - all services are down or exhausted',
      'gateway',
      503,
      'service_unavailable'
    );
  }

  console.log(`[Gateway] [${requestId}] Provider cascade: ${availableProviders.map(p => p.name).join(' → ')}`);

  let lastError: AIGatewayError | null = null;

  for (let i = 0; i < availableProviders.length; i++) {
    const provider = availableProviders[i];

    try {
      const result = await executeWithProvider(provider, messages, options);

      console.log(`[Gateway] [${requestId}] ✅ ${provider.name} responded in ${Date.now() - startTime}ms`);

      return {
        ...result,
        metadata: {
          provider: provider.name,
          model: provider.model,
          executionTime: Date.now() - startTime,
          requestId,
          fallbackAttempt: i + 1,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error: any) {
      lastError = error as AIGatewayError;
      console.log(`[Gateway] [${requestId}] Provider ${provider.name} failed: ${error.message}`);

      if (error.errorType === 'token_exhausted') {
        provider.available = false;
      }

      if (i < availableProviders.length - 1) {
        console.log(`[Gateway] [${requestId}] ⬇️ Falling back to ${availableProviders[i + 1].name}...`);
        continue;
      }
    }
  }

  console.error(`[Gateway] [${requestId}] All providers failed after ${Date.now() - startTime}ms`);

  throw new AIGatewayError(
    `All AI providers failed. Last error: ${lastError?.message || 'Unknown error'}`,
    'gateway',
    503,
    'service_unavailable'
  );
}

// Health check function
export async function checkGatewayHealth(): Promise<any> {
  const availableProviders = getAvailableProviders();

  return {
    status: availableProviders.length > 0 ? 'healthy' : 'degraded',
    availableProviders: availableProviders.length,
    totalProviders: GATEWAY_CONFIG.providers.length,
    providers: GATEWAY_CONFIG.providers.map(p => ({
      name: p.name,
      model: p.model,
      available: p.available,
      circuitBreakerOpen: !circuitBreaker.isProviderAvailable(p.name),
      priority: p.priority
    })),
    cascade: GATEWAY_CONFIG.providers.filter(p => p.available).map(p => p.name).join(' → '),
    timestamp: new Date().toISOString()
  };
}

// Export configuration for debugging
export { GATEWAY_CONFIG };
