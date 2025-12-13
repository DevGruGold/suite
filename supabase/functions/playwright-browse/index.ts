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
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
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
        timeout: parseInt(url.searchParams.get('timeout') || '30000'),
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

    // Set timeout
    const timeout = browseRequest.timeout || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Prepare fetch options
      const fetchHeaders: HeadersInit = {
        'User-Agent': 'XMRT-Eliza-Browser/1.0 (Autonomous AI Agent)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        ...browseRequest.headers,
      };

      // Perform the fetch
      const response = await fetch(browseRequest.url, {
        method: browseRequest.method || 'GET',
        headers: fetchHeaders,
        body: browseRequest.body,
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      // Extract response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Get content based on content type
      const contentType = response.headers.get('content-type') || 'text/plain';
      let content: string;

      if (contentType.includes('application/json')) {
        const json = await response.json();
        content = JSON.stringify(json, null, 2);
      } else if (contentType.includes('text/')) {
        content = await response.text();
      } else {
        // For binary content, return base64
        const buffer = await response.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        content = `data:${contentType};base64,${base64}`;
      }

      // Limit content size to prevent memory issues
      const maxSize = 5 * 1024 * 1024; // 5MB
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

      // Log successful browse
      console.log(`[playwright-browse] Success: ${browseRequest.url} (${response.status}) in ${loadTime}ms`);
      await usageTracker.success({ url: browseRequest.url, status: response.status });

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
        errorMessage = `Request timeout after ${timeout}ms`;
        statusCode = 504;
      } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('DNS')) {
        errorMessage = `DNS lookup failed for ${targetUrl.hostname}`;
        statusCode = 502;
      } else if (errorMessage.includes('ECONNREFUSED')) {
        errorMessage = `Connection refused by ${targetUrl.hostname}`;
        statusCode = 502;
      }

      console.error(`[playwright-browse] Fetch error: ${errorMessage}`, fetchError);

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
