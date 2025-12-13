import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'qualify-lead';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { session_key, user_signals } = await req.json();

    if (!session_key) {
      throw new Error('session_key is required');
    }

    const signals = [];
    
    // Process user signals and create qualification signals
    if (user_signals) {
      if (user_signals.mentioned_budget) {
        signals.push({
          session_key,
          signal_type: 'budget_mentioned',
          signal_value: { has_budget: true },
          confidence_score: 0.9,
        });
      }

      if (user_signals.has_urgent_need) {
        signals.push({
          session_key,
          signal_type: 'urgency_expressed',
          signal_value: { urgent: true },
          confidence_score: 0.85,
        });
      }

      if (user_signals.company_mentioned) {
        const companySize = user_signals.company_mentioned.toLowerCase().includes('enterprise') ||
                           user_signals.company_mentioned.toLowerCase().includes('corporation') 
                           ? 'large' : 'small';
        
        signals.push({
          session_key,
          signal_type: companySize === 'large' ? 'company_size_large' : 'company_size_small',
          signal_value: { company: user_signals.company_mentioned },
          confidence_score: 0.7,
        });
      }

      if (user_signals.use_case_complexity) {
        const complexityScore = {
          simple: 0.3,
          moderate: 0.6,
          complex: 0.9,
        }[user_signals.use_case_complexity] || 0.5;

        if (user_signals.use_case_complexity === 'complex') {
          signals.push({
            session_key,
            signal_type: 'technical_sophistication_high',
            signal_value: { complexity: user_signals.use_case_complexity },
            confidence_score: complexityScore,
          });
        }
      }
    }

    // Insert signals
    if (signals.length > 0) {
      const { error } = await supabase
        .from('lead_qualification_signals')
        .insert(signals);

      if (error) throw error;
    }

    // Get updated lead score (trigger will calculate it)
    const { data: session } = await supabase
      .from('conversation_sessions')
      .select('lead_score, acquisition_stage')
      .eq('session_key', session_key)
      .single();

    const leadScore = session?.lead_score || 0;
    const qualification = leadScore >= 70 ? 'high' : leadScore >= 40 ? 'medium' : 'low';

    await usageTracker.success({ lead_score: leadScore, qualification });

    return new Response(
      JSON.stringify({
        success: true,
        session_key,
        lead_score: leadScore,
        qualification,
        signals_recorded: signals.length,
        recommendation: leadScore >= 70 
          ? 'High-value lead - prioritize for demo and paid tier'
          : leadScore >= 40 
          ? 'Qualified lead - offer free trial'
          : 'Low engagement - nurture with educational content',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in qualify-lead:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
