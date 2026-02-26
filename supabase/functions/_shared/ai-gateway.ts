// Unified AI Gateway with Comprehensive Fallback System
// Handles token exhaustion and service failures automatically

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
// Priority order: Gemini (free/Google) → DeepSeek → OpenAI → Vertex AI → Kimi
const GATEWAY_CONFIG: GatewayConfig = {
  providers: [
    {
      name: 'gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      model: 'gemini-2.0-flash',
      priority: 1,
      rateLimit: 2000,
      timeout: 30000,
      available: true
    },
    {
      name: 'deepseek',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      priority: 2,
      rateLimit: 1500,
      timeout: 30000,
      available: true
    },
    {
      name: 'openai',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      priority: 3,
      rateLimit: 3000,
      timeout: 30000,
      available: true
    },
    {
      name: 'vertex',
      endpoint: 'https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent',
      model: 'gemini-2.0-flash',
      priority: 4,
      rateLimit: 1000,
      timeout: 30000,
      available: true
    },
    {
      name: 'kimi',
      endpoint: 'https://api.moonshot.cn/v1/chat/completions',
      model: 'moonshot-v1-8k',
      priority: 5,
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
  console.log(`[Gateway] Attempting ${provider.name} (priority: ${provider.priority})`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), provider.timeout);

    // Prepare request based on provider
    let requestBody: any;
    let endpoint = provider.endpoint;

    if (provider.name === 'gemini' || provider.name === 'vertex') {
      // Gemini API format
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
          maxOutputTokens: options.max_tokens || 1000
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
    } else {
      // OpenAI-compatible format (openai, deepseek, lovable)
      requestBody = {
        model: provider.model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 1000,
        stream: false
      };

      // Forward tool definitions if provided
      if (options.tools && options.tools.length > 0) {
        requestBody.tools = options.tools;
        requestBody.tool_choice = options.tool_choice || 'auto';
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAPIKey(provider.name)}`,
        'User-Agent': 'DevGruGold-Suite/1.0'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorType = detectErrorType(response);
      const errorText = await response.text();

      // Handle specific error types
      if (errorType === 'token_exhausted') {
        console.log(`[Gateway] ${provider.name} token exhausted, marking unavailable`);
        provider.available = false;
      }

      throw new AIGatewayError(
        `${provider.name} failed: ${response.status} ${errorText}`,
        provider.name,
        response.status,
        errorType
      );
    }

    const result = await response.json();

    // Normalize response format
    let normalizedResponse;
    if (provider.name === 'gemini' || provider.name === 'vertex') {
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
      // OpenAI-compatible — pass through directly (tool_calls already in correct format)
      normalizedResponse = {
        ...result,
        provider: provider.name
      };
    }

    circuitBreaker.recordSuccess(provider.name);
    console.log(`[Gateway] ✅ ${provider.name} succeeded`);

    return normalizedResponse;

  } catch (error) {
    circuitBreaker.recordFailure(provider.name);
    console.log(`[Gateway] ❌ ${provider.name} failed: ${error.message}`);

    if (error instanceof AIGatewayError) {
      throw error;
    }

    throw new AIGatewayError(
      `${provider.name} execution failed: ${error.message}`,
      provider.name,
      undefined,
      error.name === 'AbortError' ? 'timeout' : 'unknown'
    );
  }
}

// Get API key for provider
async function getAPIKey(providerName: string): Promise<string> {
  const apiKeys: Record<string, string> = {
    gemini: Deno.env.get('GEMINI_API_KEY') || '',
    deepseek: Deno.env.get('DEEPSEEK_API_KEY') || '',
    openai: Deno.env.get('OPENAI_API_KEY') || '',
    vertex: Deno.env.get('GOOGLE_CLOUD_API_KEY') || Deno.env.get('GEMINI_API_KEY') || '',
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

  console.log(`[Gateway] [${requestId}] Available providers: ${availableProviders.map(p => p.name).join(', ')}`);

  let lastError: AIGatewayError | null = null;

  // Try each provider in order
  for (let i = 0; i < availableProviders.length; i++) {
    const provider = availableProviders[i];

    try {
      const result = await executeWithProvider(provider, messages, options);

      console.log(`[Gateway] [${requestId}] Success with ${provider.name} in ${Date.now() - startTime}ms`);

      return {
        ...result,
        metadata: {
          provider: provider.name,
          executionTime: Date.now() - startTime,
          requestId,
          fallbackAttempt: i + 1,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      lastError = error as AIGatewayError;
      console.log(`[Gateway] [${requestId}] Provider ${provider.name} failed: ${error.message}`);

      // If this is a token exhaustion, mark provider as unavailable
      if (error.errorType === 'token_exhausted') {
        provider.available = false;
        console.log(`[Gateway] [${requestId}] Marked ${provider.name} as unavailable due to token exhaustion`);
      }

      // Continue to next provider unless this is the last one
      if (i < availableProviders.length - 1) {
        console.log(`[Gateway] [${requestId}] Falling back to next provider...`);
        continue;
      }
    }
  }

  // All providers failed
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
      available: p.available,
      circuitBreakerOpen: !circuitBreaker.isProviderAvailable(p.name),
      priority: p.priority
    })),
    timestamp: new Date().toISOString()
  };
}

// Export configuration for debugging
export { GATEWAY_CONFIG };
