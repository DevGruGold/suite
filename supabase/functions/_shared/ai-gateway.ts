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
const GATEWAY_CONFIG: GatewayConfig = {
  providers: [
    {
      name: 'vertex',
      endpoint: 'https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/us-central1/publishers/google/models/gemini-1.5-flash:streamGenerateContent',
      model: 'gemini-1.5-flash',
      priority: 1,
      rateLimit: 2000,
      timeout: 30000,
      available: true
    },
    {
      name: 'openai',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      priority: 2,
      rateLimit: 3000,
      timeout: 30000,
      available: true
    },
    {
      name: 'gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent',
      model: 'gemini-1.5-flash',
      priority: 3,
      rateLimit: 1500,
      timeout: 30000,
      available: true
    },
    {
      name: 'deepseek',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      priority: 4,
      rateLimit: 1000,
      timeout: 30000,
      available: true
    },
    {
      name: 'lovable',
      endpoint: 'https://api.lovable.dev/v1/chat/completions',
      model: 'claude-3.5-sonnet',
      priority: 5,
      rateLimit: 500,
      timeout: 30000,
      available: false  // Currently out of tokens
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
        contents: messages.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        })),
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: options.max_tokens || 1000
        }
      };
    } else {
      // OpenAI-compatible format
      requestBody = {
        model: provider.model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 1000,
        stream: false
      };
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
      normalizedResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: result.candidates?.[0]?.content?.parts?.[0]?.text || 'No response'
          }
        }],
        usage: result.usageMetadata || {},
        provider: provider.name
      };
    } else {
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

// Get API key for provider (mock implementation - should use secure storage)
async function getAPIKey(providerName: string): Promise<string> {
  // In production, these should come from Supabase secrets or environment variables
  const apiKeys = {
    openai: Deno.env.get('OPENAI_API_KEY') || 'sk-placeholder',
    gemini: Deno.env.get('GEMINI_API_KEY') || 'placeholder',
    deepseek: Deno.env.get('DEEPSEEK_API_KEY') || 'placeholder',
    lovable: Deno.env.get('LOVABLE_API_KEY') || 'placeholder',
    vertex: Deno.env.get('GOOGLE_CLOUD_API_KEY') || 'placeholder'
  };
  
  return apiKeys[providerName] || 'placeholder';
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
