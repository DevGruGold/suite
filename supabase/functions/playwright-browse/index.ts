import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'playwright-browse';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface BrowseRequest {
  url: string;
  action?: 'navigate' | 'extract' | 'json';
  timeout?: number;
  waitForSelector?: string;
  screenshot?: boolean;
}

interface BrowseResponse {
  success: boolean;
  url: string;
  status: number;
  headers: Record<string, string>;
  content: string;
  metadata: {
    loadTime: number;
    contentType: string;
    finalUrl: string;
    contentLength: number;
    screenshot?: string;
  };
  error?: string;
}

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    let browseRequest: BrowseRequest;

    // Support both GET and POST
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const targetUrl = url.searchParams.get('url');
      
      if (!targetUrl) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Missing url parameter. Usage: ?url=https://example.com' 
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      browseRequest = {
        url: targetUrl,
        action: (url.searchParams.get('action') as any) || 'navigate',
        timeout: parseInt(url.searchParams.get('timeout') || '45000'),
        screenshot: url.searchParams.get('screenshot') === 'true',
      };
    } else if (req.method === 'POST') {
      browseRequest = await req.json();
      
      if (!browseRequest.url) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Missing url in request body' 
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Method not allowed. Use GET or POST' 
        }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate URL
    let targetUrl: URL;
    try {
      targetUrl = new URL(browseRequest.url);
    } catch (e) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Invalid URL: ${browseRequest.url}` 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Security: Block internal/private IPs
    const hostname = targetUrl.hostname.toLowerCase();
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '10.', '172.16.', '192.168.'];
    if (blockedHosts.some(blocked => hostname.includes(blocked))) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Cannot browse internal/private URLs' 
        }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get browserless.io token from environment
    const browserlessToken = Deno.env.get('BROWSERLESS_TOKEN');
    if (!browserlessToken) {
      console.error('[playwright-browse] BROWSERLESS_TOKEN not configured');
      // Fallback to regular fetch if browserless is not configured
      return await fallbackFetch(browseRequest, startTime, usageTracker, corsHeaders);
    }

    // Set timeout with buffer for browserless processing
    const timeout = browseRequest.timeout || 45000;
    const browserlessTimeout = timeout - 5000; // Give browserless 5s less than our total timeout
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Use browserless.io content API for reliable page rendering
      const browserlessUrl = `https://chrome.browserless.io/content?token=${browserlessToken}`;
      
      const browserlessPayload = {
        url: browseRequest.url,
        waitFor: browseRequest.waitForSelector || 'networkidle2',
        gotoOptions: {
          waitUntil: 'networkidle2',
          timeout: browserlessTimeout,
        },
        // Add retry logic and error handling
        addScriptTag: [{
          content: `
            // Prevent page navigation during content extraction
            window.addEventListener('beforeunload', (e) => {
              e.preventDefault();
              e.returnValue = '';
            });
          `
        }],
      };

      console.log(`[playwright-browse] Requesting via browserless.io: ${browseRequest.url}`);

      const response = await fetch(browserlessUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(browserlessPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[playwright-browse] Browserless error (${response.status}):`, errorText);
        
        // If browserless fails, fallback to regular fetch
        if (response.status === 429) {
          throw new Error('Browserless rate limit exceeded - too many requests');
        }
        
        console.log('[playwright-browse] Falling back to regular fetch due to browserless error');
        return await fallbackFetch(browseRequest, startTime, usageTracker, corsHeaders);
      }

      // Get the rendered HTML content
      const content = await response.text();

      // Limit content size to prevent memory issues
      const maxSize = 5 * 1024 * 1024; // 5MB
      let finalContent = content;
      if (content.length > maxSize) {
        finalContent = content.substring(0, maxSize) + '\n\n[Content truncated - exceeded 5MB limit]';
      }

      const loadTime = Date.now() - startTime;

      const result: BrowseResponse = {
        success: true,
        url: browseRequest.url,
        status: 200,
        headers: {
          'content-type': 'text/html',
        },
        content: finalContent,
        metadata: {
          loadTime,
          contentType: 'text/html',
          finalUrl: browseRequest.url,
          contentLength: finalContent.length,
        },
      };

      console.log(`[playwright-browse] Success via browserless: ${browseRequest.url} in ${loadTime}ms`);
      await usageTracker.success({ url: browseRequest.url, method: 'browserless' });

      return new Response(
        JSON.stringify(result),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );

    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      // Handle specific errors
      let errorMessage = fetchError.message;
      let statusCode = 500;

      if (fetchError.name === 'AbortError') {
        errorMessage = `Request timeout after ${timeout}ms. The page may be slow to load or unresponsive.`;
        statusCode = 504;
        console.error(`[playwright-browse] Timeout after ${timeout}ms for ${browseRequest.url}`);
      } else if (errorMessage.includes('rate limit')) {
        statusCode = 429;
      } else {
        console.error(`[playwright-browse] Browserless fetch error:`, fetchError);
      }

      // Try fallback to regular fetch for timeout/error cases
      if (fetchError.name === 'AbortError' || statusCode === 500) {
        console.log('[playwright-browse] Attempting fallback to regular fetch after error');
        try {
          return await fallbackFetch(browseRequest, startTime, usageTracker, corsHeaders);
        } catch (fallbackError) {
          console.error('[playwright-browse] Fallback also failed:', fallbackError);
        }
      }

      await usageTracker.failure(errorMessage, statusCode);

      const result: BrowseResponse = {
        success: false,
        url: browseRequest.url,
        status: statusCode,
        headers: {},
        content: '',
        metadata: {
          loadTime: Date.now() - startTime,
          contentType: 'text/plain',
          finalUrl: browseRequest.url,
          contentLength: 0,
        },
        error: errorMessage,
      };

      return new Response(
        JSON.stringify(result),
        { 
          status: statusCode, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error: any) {
    console.error('[playwright-browse] Error:', error);
    await usageTracker.failure(error.message, 500);

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error',
        metadata: {
          loadTime: Date.now() - startTime,
        }
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Fallback function for when browserless is unavailable or fails
async function fallbackFetch(
  browseRequest: BrowseRequest,
  startTime: number,
  usageTracker: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  console.log(`[playwright-browse] Using fallback fetch for ${browseRequest.url}`);
  
  const timeout = browseRequest.timeout || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const fetchHeaders: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
    };

    const response = await fetch(browseRequest.url, {
      method: 'GET',
      headers: fetchHeaders,
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const contentType = response.headers.get('content-type') || 'text/plain';
    let content: string;

    if (contentType.includes('application/json')) {
      const json = await response.json();
      content = JSON.stringify(json, null, 2);
    } else if (contentType.includes('text/')) {
      content = await response.text();
    } else {
      const buffer = await response.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      content = `data:${contentType};base64,${base64}`;
    }

    const maxSize = 5 * 1024 * 1024;
    if (content.length > maxSize) {
      content = content.substring(0, maxSize) + '\n\n[Content truncated - exceeded 5MB limit]';
    }

    const loadTime = Date.now() - startTime;

    const result: BrowseResponse = {
      success: true,
      url: browseRequest.url,
      status: response.status,
      headers: responseHeaders,
      content,
      metadata: {
        loadTime,
        contentType,
        finalUrl: response.url,
        contentLength: content.length,
      },
    };

    console.log(`[playwright-browse] Fallback fetch success: ${browseRequest.url} (${response.status}) in ${loadTime}ms`);
    await usageTracker.success({ url: browseRequest.url, method: 'fallback-fetch' });

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (fetchError: any) {
    clearTimeout(timeoutId);

    let errorMessage = fetchError.message;
    let statusCode = 500;

    if (fetchError.name === 'AbortError') {
      errorMessage = `Fallback fetch timeout after ${timeout}ms`;
      statusCode = 504;
    }

    console.error(`[playwright-browse] Fallback fetch error: ${errorMessage}`);

    const result: BrowseResponse = {
      success: false,
      url: browseRequest.url,
      status: statusCode,
      headers: {},
      content: '',
      metadata: {
        loadTime: Date.now() - startTime,
        contentType: 'text/plain',
        finalUrl: browseRequest.url,
        contentLength: 0,
      },
      error: errorMessage,
    };

    return new Response(
      JSON.stringify(result),
      { 
        status: statusCode, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}
