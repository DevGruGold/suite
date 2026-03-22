import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';
import {
  EdgeFunctionLogger,
  createRequestContext,
} from '../_shared/logging.ts';

const FUNCTION_NAME = 'vectorize-memory';
const logger = EdgeFunctionLogger(FUNCTION_NAME);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, {
    method: req.method,
  });
  const startedAt = Date.now();
  const requestContext = createRequestContext(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Fast boot: check content-length BEFORE parsing JSON
  const contentLength = parseInt(req.headers.get('content-length') || '0');
  if (contentLength === 0 || contentLength < 5) {
    console.log('📋 Empty body - cron trigger, returning fast');
    await usageTracker.success({ cron: true });
    await logger.requestStart('Vectorize-memory cron trigger received', {
      ...requestContext,
      operation: 'cron_noop',
    });
    await logger.requestComplete(
      'Vectorize-memory cron trigger completed',
      {
        ...requestContext,
        operation: 'cron_noop',
        duration_ms: Date.now() - startedAt,
        status: 200,
      },
      { cron: true }
    );
    return new Response(
      JSON.stringify({
        success: true,
        cron: true,
        message: 'Cron trigger - no memory data provided',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { memory_id, content, context_type } = await req.json();
    requestContext.operation = 'vectorize_memory';
    await logger.requestStart('Vectorize-memory request received', {
      ...requestContext,
      memory_id,
      context_type,
    });

    // Validate required fields - prevent null content crashes
    if (!memory_id) {
      console.warn('⚠️ Skipping vectorization - missing memory_id');
      await logger.requestComplete(
        'Vectorize-memory skipped: missing memory_id',
        {
          ...requestContext,
          duration_ms: Date.now() - startedAt,
          status: 400,
        }
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: 'memory_id is required',
          skipped: true,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (
      !content ||
      typeof content !== 'string' ||
      content.trim().length === 0
    ) {
      console.warn(
        `⚠️ Skipping vectorization for ${memory_id} - null or empty content`
      );
      await logger.requestComplete(
        'Vectorize-memory skipped: invalid content',
        {
          ...requestContext,
          memory_id,
          duration_ms: Date.now() - startedAt,
          status: 400,
        }
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: 'content is required and must be a non-empty string',
          memory_id,
          skipped: true,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(
      `🧠 Vectorizing memory ${memory_id} (${content.length} chars)...`
    );

    // Lazy import to avoid boot-time overhead
    const { generateEmbedding } =
      await import('../_shared/unifiedAIFallback.ts');

    // Try to generate embedding with timeout guard (prevent cron hangs)
    let embedding: number[];
    const EMBEDDING_TIMEOUT_MS = 12000; // 12 second timeout for embeddings

    try {
      const embeddingPromise = generateEmbedding(content);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Embedding generation timeout')),
          EMBEDDING_TIMEOUT_MS
        )
      );

      embedding = await Promise.race([embeddingPromise, timeoutPromise]);
      console.log('✅ Embedding generated successfully');
    } catch (error) {
      console.error('❌ Embedding generation failed:', error.message);
      await usageTracker.failure(error.message, 503);
      await logger.requestComplete(
        'Vectorize-memory embedding generation failed',
        {
          ...requestContext,
          memory_id,
          duration_ms: Date.now() - startedAt,
          status: 503,
        },
        { error: error.message }
      );
      return new Response(
        JSON.stringify({
          error: 'Vectorization unavailable - timeout or GEMINI_API_KEY issue',
          details: error.message,
          memory_id,
          skipped: true,
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update memory context with embedding
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: updateError } = await supabase
      .from('memory_contexts')
      .update({ embedding })
      .eq('id', memory_id);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw updateError;
    }

    console.log(`✅ Memory ${memory_id} vectorized successfully`);
    await usageTracker.success({ memory_id });
    await logger.requestComplete(
      'Vectorize-memory request completed',
      {
        ...requestContext,
        memory_id,
        context_type,
        duration_ms: Date.now() - startedAt,
        status: 200,
      },
      { embedding_dimensions: embedding.length }
    );

    return new Response(JSON.stringify({ success: true, memory_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in vectorize-memory function:', error);
    await usageTracker.failure(error.message, 500);
    await logger.requestComplete(
      'Vectorize-memory request failed',
      {
        ...requestContext,
        duration_ms: Date.now() - startedAt,
        status: 500,
      },
      { error: error.message }
    );
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
