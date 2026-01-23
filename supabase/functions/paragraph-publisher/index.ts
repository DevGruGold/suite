import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { startUsageTracking } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'paragraph-publisher';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, 'eliza', { method: req.method });

  try {
    const PARAGRAPH_API_KEY = Deno.env.get('PARAGRAPH_API_KEY');
    if (!PARAGRAPH_API_KEY) {
      throw new Error('Paragraph.com API Key is not set in Supabase Secrets.');
    }

    // Parse request body
    const { title, body, markdown, imageUrl, sendNewsletter, slug, categories } = await req.json();

    // Paragraph API requires 'title' and 'markdown'
    // We support 'body' as an alias for 'markdown' for backward compatibility with the instructions
    const content = markdown || body;

    if (!title || !content) {
      return new Response(JSON.stringify({ error: 'Title and content (markdown or body) are required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const PARAGRAPH_API_ENDPOINT = 'https://api.paragraph.com/v1/posts';

    const response = await fetch(PARAGRAPH_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PARAGRAPH_API_KEY}`,
      },
      body: JSON.stringify({
        title: title,
        markdown: content,
        imageUrl: imageUrl,
        sendNewsletter: sendNewsletter || false,
        slug: slug,
        categories: categories,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Paragraph.com API Error:', data);
      return new Response(JSON.stringify({ error: 'Failed to publish to Paragraph.com', details: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.status,
      });
    }

    return new Response(JSON.stringify({ message: 'Successfully published to Paragraph.com', data }), {
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
