import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'process-contributor-reward';

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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { contribution_id } = await req.json();

    // Fetch validated contribution
    const { data: contribution, error: fetchError } = await supabase
      .from('github_contributions')
      .select('*')
      .eq('id', contribution_id)
      .eq('is_validated', true)
      .is('reward_paid_at', null)
      .single();

    if (fetchError || !contribution) {
      throw new Error('Contribution not found or already paid');
    }

    if (contribution.xmrt_earned <= 0) {
      throw new Error('No reward to pay');
    }

    // Mark as paid
    await supabase.from('github_contributions').update({
      reward_paid_at: new Date().toISOString(),
    }).eq('id', contribution_id);

    // Update contributor totals
    const { data: contributor } = await supabase
      .from('github_contributors')
      .select('*')
      .eq('github_username', contribution.github_username)
      .single();

    if (contributor) {
      const newTotal = Number(contributor.total_xmrt_earned || 0) + Number(contribution.xmrt_earned);
      const newContributions = (contributor.total_contributions || 0) + 1;
      
      // Calculate new average score
      const currentTotal = (contributor.avg_validation_score || 0) * (contributor.total_contributions || 0);
      const newAvg = (currentTotal + contribution.validation_score) / newContributions;

      await supabase.from('github_contributors').update({
        total_xmrt_earned: newTotal,
        total_contributions: newContributions,
        avg_validation_score: newAvg,
        last_contribution_at: new Date().toISOString(),
      }).eq('id', contributor.id);
    }

    // Log activity
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'xmrt_reward_paid',
      title: `💰 ${contribution.xmrt_earned} XMRT Paid`,
      description: `Reward for ${contribution.contribution_type} by @${contribution.github_username}`,
      status: 'completed',
      metadata: {
        contribution_id,
        github_username: contribution.github_username,
        wallet_address: contribution.wallet_address,
        xmrt_amount: contribution.xmrt_earned,
        validation_score: contribution.validation_score,
      },
    });

    // TODO: Integrate with actual XMRT token contract
    // For now, we're just logging the reward
    console.log(`Would transfer ${contribution.xmrt_earned} XMRT to ${contribution.wallet_address}`);
    await usageTracker.success({ xmrt_paid: contribution.xmrt_earned });

    return new Response(JSON.stringify({
      success: true,
      xmrt_paid: contribution.xmrt_earned,
      wallet_address: contribution.wallet_address,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error processing reward:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});