import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { generateTextWithFallback } from "../_shared/unifiedAIFallback.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id, messages } = await req.json();

    console.log(`📝 Summarizing conversation for session ${session_id}...`);

    // Prepare conversation text
    const conversationText = messages.map((msg: any) => 
      `${msg.message_type}: ${msg.content}`
    ).join('\n');

    const prompt = `Create a concise summary of this conversation. Focus on key topics, decisions, and action items. Keep it under 200 words.

CONVERSATION:
${conversationText}

SUMMARY:`;

    const staticFallback = `Conversation summary for session ${session_id}:
- ${messages.length} messages exchanged
- Topics discussed: General conversation
- Key points: See full conversation for details`;

    let summary: string;
    let aiProvider = 'static_fallback';

    try {
      console.log('🔄 Generating summary with AI fallback cascade...');
      summary = await generateTextWithFallback(prompt, undefined, {
        temperature: 0.5,
        maxTokens: 500,
        useFullElizaContext: false
      });
      aiProvider = 'ai_cascade';
      console.log('✅ Summary generated via AI cascade');
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
