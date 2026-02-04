console.info('The Graph Query edge function started');

// Helper function for structured error responses
const createErrorResponse = (message: string, status: number = 400) => {
  return new Response(JSON.stringify({ error: message }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
};

// Minimal CORS headers configuration
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', // Explicitly allow POST
  'Access-Control-Max-Age': '86400',
};

// CORS preflight handler
const handleCorsPreflight = () => {
  return new Response(null, {
    headers: corsHeaders,
    status: 204
  });
};

// Main edge function handler
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  try {
    // Validate environment variable for The Graph API Key
    const THEGRAPH_API_KEY = Deno.env.get('THEGRAPH_API_KEY');
    if (!THEGRAPH_API_KEY) {
      console.error('THEGRAPH_API_KEY is not configured');
      return createErrorResponse('The Graph API Key is not configured in environment variables', 500);
    }

    let network: string | null = null;
    let address: string | null = null;

    // Determine if parameters come from query string (GET) or request body (POST)
    if (req.method === 'GET') {
      const url = new URL(req.url);
      network = url.searchParams.get('network');
      address = url.searchParams.get('address');
    } else if (req.method === 'POST') {
      try {
        const body = await req.json();
        network = body.network;
        address = body.address;
      } catch (error) {
        console.error('Failed to parse request body for POST:', error);
        return createErrorResponse('Invalid JSON payload for POST request.', 400);
      }
    } else {
      return createErrorResponse(`Unsupported HTTP method: ${req.method}. Only GET and POST are supported.`, 405);
    }

    if (!network || !address) {
      return createErrorResponse('Both "network" (e.g., mainnet) and "address" (EVM wallet address) parameters are required.', 400);
    }

    // The Graph Token API endpoint
    const endpoint = `https://token-api.thegraph.com/v1/evm/balances?network=${network}&address=${address}`;

    console.log(`The Graph API Request: GET ${endpoint}`); // The actual fetch method to The Graph API is always GET

    // Make request to The Graph Token API
    const response = await fetch(endpoint, {
      method: 'GET', // The Token API itself expects GET
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${THEGRAPH_API_KEY}`,
        'User-Agent': 'TheGraph-Query-Edge-Function/1.0',
      },
    });

    // Parse response
    let responseData: unknown;
    try {
      responseData = await response.json();
    } catch {
      responseData = { message: 'Could not parse response from The Graph API' };
    }

    // Handle The Graph API errors
    if (!response.ok) {
      console.error('The Graph API Error:', {
        status: response.status,
        statusText: response.statusText,
        endpoint,
        responseData,
      });

      const errorMessage = (responseData as any)?.error
        ? `The Graph API Error: ${(responseData as any).error}`
        : `The Graph API returned status ${response.status}`;

      return new Response(JSON.stringify({
        error: errorMessage,
        details: responseData,
        status: response.status,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.status,
      });
    }

    // Successful response
    console.log(`The Graph API Success: Query for network ${network}, address ${address} completed`);

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    // Handle unexpected errors in the edge function itself
    console.error('Edge Function Runtime Error:', error);

    const errorMessage = error instanceof Error
      ? error.message
      : 'Internal server error';

    return new Response(JSON.stringify({
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});