import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'identify-service-interest';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Service keyword mapping
const SERVICE_KEYWORDS: Record<string, string[]> = {
  'uspto-patent-mcp': ['patent', 'uspto', 'intellectual property', 'trademark', 'invention'],
  'lovable-chat': ['ai chat', 'conversation', 'chatbot', 'assistant', 'talk'],
  'python-executor': ['python', 'code execution', 'script', 'automation', 'compute'],
  'gemini-chat': ['gemini', 'google ai', 'advanced ai', 'multimodal'],
  'github-integration': ['github', 'repository', 'code', 'version control', 'git'],
  'multi-step-orchestrator': ['workflow', 'automation', 'orchestration', 'pipeline'],
  'predictive-analytics': ['analytics', 'prediction', 'forecast', 'data analysis', 'insights'],
};

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { user_message, conversation_history = [], session_key } = await req.json();

    if (!user_message) {
      throw new Error('user_message is required');
    }

    const messageLower = user_message.toLowerCase();
    const detectedServices: Array<{ service: string; confidence: number; keywords_matched: string[] }> = [];

    // Analyze current message
    for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
      const matchedKeywords = keywords.filter(keyword => messageLower.includes(keyword));
      
      if (matchedKeywords.length > 0) {
        const confidence = Math.min(matchedKeywords.length / keywords.length + 0.5, 1.0);
        detectedServices.push({
          service,
          confidence,
          keywords_matched: matchedKeywords,
        });
      }
    }

    // Analyze conversation history for patterns
    if (conversation_history.length > 0) {
      const historyText = conversation_history.map((msg: any) => msg.content).join(' ').toLowerCase();
      
      for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
        if (!detectedServices.find(s => s.service === service)) {
          const matchedKeywords = keywords.filter(keyword => historyText.includes(keyword));
          
          if (matchedKeywords.length >= 2) {
            const confidence = Math.min(matchedKeywords.length / keywords.length * 0.7, 0.8);
            detectedServices.push({
              service,
              confidence,
              keywords_matched: matchedKeywords,
            });
          }
        }
      }
    }

    // Update session with detected services
    if (session_key && detectedServices.length > 0) {
      const { data: session } = await supabase
        .from('conversation_sessions')
        .select('services_interested_in')
        .eq('session_key', session_key)
        .single();

      const existingServices = session?.services_interested_in as string[] || [];
      const newServices = detectedServices.map(s => s.service);
      const uniqueServices = [...new Set([...existingServices, ...newServices])];

      await supabase
        .from('conversation_sessions')
        .update({ 
          services_interested_in: uniqueServices,
          updated_at: new Date().toISOString(),
        })
        .eq('session_key', session_key);

      // Record signal for multiple service interest
      if (uniqueServices.length >= 2) {
        await supabase
          .from('lead_qualification_signals')
          .insert({
            session_key,
            signal_type: 'multiple_service_interest',
            signal_value: { services: uniqueServices },
            confidence_score: 0.8,
          });
      }
    }

    // Sort by confidence
    detectedServices.sort((a, b) => b.confidence - a.confidence);

    await usageTracker.success({ services_detected: detectedServices.length });

    return new Response(
      JSON.stringify({
        success: true,
        detected_services: detectedServices,
        primary_interest: detectedServices[0]?.service || null,
        recommendation: detectedServices.length > 0
          ? `User shows interest in ${detectedServices[0].service}. Offer demo or trial.`
          : 'No specific service interest detected yet. Continue conversation.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in identify-service-interest:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
