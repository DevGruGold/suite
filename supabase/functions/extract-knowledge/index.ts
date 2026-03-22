import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';
import {
  EdgeFunctionLogger,
  createRequestContext,
} from '../_shared/logging.ts';

const FUNCTION_NAME = 'extract-knowledge';
const logger = EdgeFunctionLogger(FUNCTION_NAME);
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const AI_TIMEOUT_MS = 15000;

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME);
  const startedAt = Date.now();
  const requestContext = createRequestContext(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    let body: any = {};
    const contentLength = parseInt(req.headers.get('content-length') || '0');

    if (contentLength > 5) {
      try {
        body = await req.json();
      } catch {}
    }

    const { message_id, content, session_id } = body;
    requestContext.operation =
      content && message_id ? 'direct_extract' : 'cron_extract';
    await logger.requestStart('Extract-knowledge request received', {
      ...requestContext,
      message_id,
      session_id,
      content_present: Boolean(content),
    });

    // DIRECT MODE: Payload provided (e.g. from UI or other function)
    if (content && message_id) {
      console.log(
        `🔍 Direct Mode: Extracting knowledge from message ${message_id}...`
      );
      const result = await processContent(
        supabase,
        content,
        message_id,
        session_id
      );

      await usageTracker.success({
        result_summary: 'direct_extraction',
        ...result,
      });
      await logger.requestComplete(
        'Extract-knowledge direct extraction completed',
        {
          ...requestContext,
          duration_ms: Date.now() - startedAt,
          status: 200,
        },
        {
          entity_count: result.entities?.length || 0,
          ai_provider: result.ai_provider,
        }
      );
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CRON MODE: Empty payload -> Fetch pending NEWS items
    console.log(
      '⏰ Cron Mode: Fetching pending NEWS from eliza_activity_log...'
    );

    // 1. Fetch recent news publications
    // The user complained about "internal logs" (likely chat/api logs).
    // We strictly target "daily_news_published" events here.
    const { data: newsItems, error: newsError } = await supabase
      .from('eliza_activity_log')
      .select('*')
      .eq('activity_type', 'daily_news_published')
      .order('created_at', { ascending: false })
      .limit(10);

    if (newsError) throw newsError;

    if (!newsItems || newsItems.length === 0) {
      console.log('No recent news items found in eliza_activity_log');
      await usageTracker.success({ result_summary: 'cron_no_news' });
      await logger.requestComplete(
        'Extract-knowledge cron completed with no news',
        {
          ...requestContext,
          duration_ms: Date.now() - startedAt,
          status: 200,
        }
      );
      return new Response(
        JSON.stringify({ success: true, message: 'No news found to process' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let processedCount = 0;
    const results = [];

    for (const item of newsItems) {
      if (processedCount >= 3) break;

      // Check if already processed
      const { count } = await supabase
        .from('knowledge_entities')
        .select('id', { count: 'exact', head: true })
        .filter('metadata->>source_log_id', 'eq', item.id);

      if (count && count > 0) continue;

      // Construct content to analyze
      // We use the description (summary) and metadata
      const newsContent = `
News Title: ${item.title}
Summary: ${item.description}
Original Story: ${item.metadata?.original_story || ''}
        `.trim();

      if (newsContent.length > 20) {
        console.log(`Processing news item: ${item.id}`);
        // Pass item.id as source reference
        const result = await processContent(
          supabase,
          newsContent,
          `log_${item.id}`,
          undefined,
          { source_log_id: item.id, type: 'news' }
        );
        results.push(result);
        processedCount++;
      }
    }

    console.log(
      `✅ Cron run complete. Processed ${processedCount} news items.`
    );
    await usageTracker.success({ result_summary: 'cron_extraction_complete' });
    await logger.requestComplete(
      'Extract-knowledge cron completed',
      {
        ...requestContext,
        duration_ms: Date.now() - startedAt,
        status: 200,
      },
      { processed_count: processedCount }
    );

    return new Response(
      JSON.stringify({ success: true, processed: processedCount, results }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in extract-knowledge function:', error);
    await usageTracker.failure(error.message, 500);
    await logger.requestComplete(
      'Extract-knowledge request failed',
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

async function processContent(
  supabase: any,
  content: string,
  sourceId: string,
  sessionId?: string,
  extraMetadata: any = {}
) {
  let entities: any[] = [];
  let aiProvider = 'static_fallback';

  try {
    const { callAIWithFallback } =
      await import('../_shared/unifiedAIFallback.ts');

    const aiPromise = callAIWithFallback(
      [
        {
          role: 'system',
          content:
            'Extract key entities from the news content. Return entities in JSON format with fields: entity_name, entity_type, description, confidence_score (0-1). Focus on Organizations, People, Locations, and Concepts.',
        },
        {
          role: 'user',
          content: `Extract entities from this text and return as JSON array:
${content.slice(0, 2000)}

Return format: [{"entity_name": "...", "entity_type": "...", "description": "...", "confidence_score": 0.8}]`,
        },
      ],
      {
        temperature: 0.3,
        maxTokens: 1000,
        useFullElizaContext: false,
      }
    );

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), AI_TIMEOUT_MS)
    );

    const result = await Promise.race([aiPromise, timeoutPromise]);

    if (result) {
      const responseText = result.content || '';
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        entities = JSON.parse(jsonMatch[0]);
        aiProvider = result.provider || 'ai_cascade';
      }
    }
  } catch (aiError) {
    console.warn('AI extraction failed:', aiError);
  }

  if (entities.length === 0) {
    // Basic fallback
    const words = content
      .split(/\s+/)
      .filter((w: string) => w.length > 5 && /^[A-Z]/.test(w)); // Capitalized words
    const uniqueWords = [...new Set(words)].slice(0, 5);
    entities = uniqueWords.map((word: string) => ({
      entity_name: word,
      entity_type: 'keyword',
      description: 'Auto-extracted keyword',
      confidence_score: 0.3,
    }));
  }

  if (entities.length > 0) {
    await Promise.all(
      entities.slice(0, 10).map((entity) =>
        supabase.from('knowledge_entities').insert({
          entity_name: entity.entity_name,
          entity_type: entity.entity_type,
          description: entity.description || null,
          confidence_score: entity.confidence_score || 0.5,
          metadata: {
            source_id: sourceId,
            session_id: sessionId,
            ai_provider: aiProvider,
            ...extraMetadata,
          },
        })
      )
    );
  }

  return { entities, ai_provider: aiProvider };
}
