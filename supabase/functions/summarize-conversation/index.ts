import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { generateTextWithFallback } from "../_shared/unifiedAIFallback.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_TIMEOUT_MS = 12000; // 12 second timeout for AI calls

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body for cron triggers
    }

    const { session_id, messages } = body;

    // Early return for cron triggers with no session/messages
    if (!session_id || !messages || messages.length === 0) {
      console.log('📝 Cron trigger - no conversation to summarize');
      return new Response(JSON.stringify({ 
        success: true, 
        cron: true, 
        message: 'No conversation provided for summarization'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📝 Summarizing conversation for session ${session_id}...`);

    // Prepare conversation text (truncate to avoid token limits)
    const conversationText = messages.slice(-20).map((msg: any) => 
      `${msg.message_type}: ${msg.content?.slice(0, 200) || ''}`
    ).join('\n');

    const prompt = `Create a concise summary of this conversation. Focus on key topics and decisions. Keep it under 150 words.

CONVERSATION:
${conversationText.slice(0, 3000)}

SUMMARY:`;

    const staticFallback = `Conversation summary for session ${session_id}:
- ${messages.length} messages exchanged
- Topics: General conversation
- See full conversation for details`;

    let summary: string;
    let aiProvider = 'static_fallback';

    try {
      console.log('🔄 Generating summary with AI fallback cascade...');
      
      // Wrap AI call with timeout
      const aiPromise = generateTextWithFallback(prompt, undefined, {
        temperature: 0.5,
        maxTokens: 300,
        useFullElizaContext: false
      });

      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => {
          console.warn('⚠️ AI summarization timed out');
          resolve(null);
        }, AI_TIMEOUT_MS)
      );

      const result = await Promise.race([aiPromise, timeoutPromise]);
      
      if (result) {
        summary = result.content;
        aiProvider = result.provider;
        console.log(`✅ Summary generated via ${aiProvider}`);
      } else {
        summary = staticFallback;
      }
    } catch (aiError) {
      console.warn('⚠️ All AI providers failed, using static fallback:', aiError);
      summary = staticFallback;
    }

    // Store summary in database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: summaryData, error: insertError } = await supabase
      .from('conversation_summaries')
      .insert({
        session_id,
        summary_text: summary,
        message_count: messages.length,
        start_message_id: messages[0]?.id,
        end_message_id: messages[messages.length - 1]?.id,
        metadata: { 
          generated_at: new Date().toISOString(),
          ai_provider: aiProvider
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      throw insertError;
    }

    console.log(`✅ Created summary for session ${session_id} using ${aiProvider}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        summary_id: summaryData.id, 
        summary,
        ai_provider: aiProvider
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in summarize-conversation function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
