import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { startUsageTracking } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'typefully-integration';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, 'eliza', { method: req.method });

  try {
    const TYPEFULLY_API_KEY = Deno.env.get('TYPEFULLY_API_KEY');
    if (!TYPEFULLY_API_KEY) {
      throw new Error('Typefully API Key is not set in Supabase Secrets.');
    }

    const body = await req.json();
    const { action } = body;
    // Accept both camelCase (socialSetId) and snake_case (social_set_id) — AI tool sends camelCase
    const social_set_id = body.social_set_id || body.socialSetId;
    const payload = { ...body };
    delete payload.action;
    delete payload.social_set_id;
    delete payload.socialSetId;


    if (!action) {
      return new Response(JSON.stringify({ error: 'Action is required (e.g., "list-social-sets", "create-draft", "get-me").' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    let endpoint = '';
    let method = 'GET';
    let body = null;

    switch (action) {
      case 'get-me':
        endpoint = 'https://api.typefully.com/v2/me';
        break;
      case 'list-social-sets':
        endpoint = 'https://api.typefully.com/v2/social-sets';
        break;
      case 'create-draft':
        if (!social_set_id) throw new Error('social_set_id is required for create-draft');
        endpoint = `https://api.typefully.com/v2/social-sets/${social_set_id}/drafts`;
        method = 'POST';
        body = JSON.stringify(payload);
        break;
      case 'list-drafts':
        if (!social_set_id) throw new Error('social_set_id is required for list-drafts');
        endpoint = `https://api.typefully.com/v2/social-sets/${social_set_id}/drafts`;
        break;
      case 'update-draft':
        if (!social_set_id || !payload.draft_id) throw new Error('social_set_id and draft_id are required for update-draft');
        endpoint = `https://api.typefully.com/v2/social-sets/${social_set_id}/drafts/${payload.draft_id}`;
        method = 'PATCH';
        body = JSON.stringify(payload);
        break;
      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TYPEFULLY_API_KEY}`,
      },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Typefully API Error:', data);
      return new Response(JSON.stringify({ error: 'Typefully API Error', details: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.status,
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
