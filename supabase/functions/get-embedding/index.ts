import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Timeout for embedding requests
const EMBEDDING_TIMEOUT_MS = 10000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Embedding request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Generate embedding using OpenAI (primary)
 */
async function generateOpenAIEmbedding(content: string): Promise<number[] | null> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    console.warn('⚠️ OpenAI API key not configured for embeddings');
    return null;
  }

  try {
    console.log('🧠 Generating embedding via OpenAI...');
    const response = await fetchWithTimeout(
      'https://api.openai.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: content,
        }),
      },
      EMBEDDING_TIMEOUT_MS
    );

    // Fast-fail for credit exhaustion
    if (response.status === 402 || response.status === 429) {
      console.warn(`⚠️ OpenAI embeddings ${response.status} - trying fallback`);
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('⚠️ OpenAI embedding API error:', errorText);
      return null;
    }

    const data = await response.json();
    console.log('✅ OpenAI embedding generated successfully');
    return data.data[0].embedding;
  } catch (error) {
    console.warn('⚠️ OpenAI embedding error:', error.message);
    return null;
  }
}

/**
 * Generate embedding using Gemini (fallback)
 */
async function generateGeminiEmbedding(content: string): Promise<number[] | null> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) {
    console.warn('⚠️ Gemini API key not configured for embeddings');
    return null;
  }

  try {
    console.log('💎 Generating embedding via Gemini (fallback)...');
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text: content }] },
        }),
      },
      EMBEDDING_TIMEOUT_MS
    );

    // Fast-fail for credit exhaustion
    if (response.status === 402 || response.status === 429) {
      console.warn(`⚠️ Gemini embeddings ${response.status} - no more fallbacks`);
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('⚠️ Gemini embedding API error:', errorText);
      return null;
    }

    const data = await response.json();
    console.log('✅ Gemini embedding generated successfully');
    return data.embedding?.values || null;
  } catch (error) {
    console.warn('⚠️ Gemini embedding error:', error.message);
    return null;
  }
}

serve(async (req) => {
  const usageTracker = startUsageTracking('get-embedding');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content } = await req.json();
    
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No content to embed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Truncate very long content to prevent token limit issues
    const truncatedContent = content.slice(0, 8000);

    // Try OpenAI first, then Gemini fallback
    let embedding = await generateOpenAIEmbedding(truncatedContent);
    let provider = 'openai';
    
    if (!embedding) {
      embedding = await generateGeminiEmbedding(truncatedContent);
      provider = 'gemini';
    }

    if (!embedding) {
      console.error('❌ All embedding providers failed');
      return new Response(
        JSON.stringify({ error: 'All embedding providers failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await usageTracker.success({ result_summary: `embedding_generated_${provider}`, provider });
    return new Response(
      JSON.stringify({ success: true, embedding, provider }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-embedding function:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
