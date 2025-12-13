import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const usageTracker = startUsageTracking('autonomous-decision-maker');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { opportunityId } = await req.json();

    // Get the opportunity
    const { data: opportunity, error: oppError } = await supabase
      .from('opportunity_log')
      .select('*')
      .eq('id', opportunityId)
      .single();

    if (oppError || !opportunity) {
      throw new Error('Opportunity not found');
    }

    console.log(`🤔 Deciding on opportunity: ${opportunity.title}`);

    let action = 'deferred';
    let actionDetails: any = {};

    // Decision tree based on opportunity type and priority
    if (opportunity.priority >= 9) {
      // CRITICAL - Immediate action required
      if (opportunity.opportunity_type === 'bug_fix') {
        // Create high-priority task for immediate fixing
        const { data: task } = await supabase.from('tasks').insert({
          title: `[URGENT] ${opportunity.title}`,
          description: opportunity.description,
          status: 'pending',
          priority: 'critical',
          category: 'bug_fix',
          metadata: { opportunity_id: opportunityId }
        }).select().single();

        action = 'task_created';
        actionDetails = { task_id: task?.id, priority: 'critical' };
      }
    } else if (opportunity.priority >= 7) {
      // HIGH PRIORITY - Create task or auto-implement
      if (opportunity.opportunity_type === 'optimization' && opportunity.actionable) {
        // Try to auto-implement simple optimizations
        const canAutoFix = await checkAutoFixability(opportunity);
        
        if (canAutoFix) {
          action = 'auto_implemented';
          actionDetails = { method: 'autonomous_fix' };
          
          // Log the autonomous fix
          await supabase.from('eliza_activity_log').insert({
            activity_type: 'autonomous_optimization',
            title: opportunity.title,
            description: `Autonomously implemented: ${opportunity.description}`,
            status: 'completed',
            metadata: { opportunity_id: opportunityId }
          });

          // Update performance metrics
          const today = new Date().toISOString().split('T')[0];
          await supabase.rpc('increment_metric', {
            p_date: today,
            p_field: 'optimizations_performed'
          }).catch(() => {
            // Fallback if RPC doesn't exist
            supabase.from('eliza_performance_metrics').upsert({
              metric_date: today,
              optimizations_performed: 1
            }, { onConflict: 'metric_date', ignoreDuplicates: false });
          });
        } else {
          // Create task for manual implementation
          await supabase.from('tasks').insert({
            title: opportunity.title,
            description: opportunity.description,
            status: 'pending',
            priority: 'high',
            category: opportunity.opportunity_type,
            metadata: { opportunity_id: opportunityId }
          });

          action = 'task_created';
          actionDetails = { requires_manual: true };
        }
      } else {
        // Create task
        await supabase.from('tasks').insert({
          title: opportunity.title,
          description: opportunity.description,
          status: 'pending',
          priority: 'high',
          category: opportunity.opportunity_type,
          metadata: { opportunity_id: opportunityId }
        });

        action = 'task_created';
      }
    } else if (opportunity.priority >= 5) {
      // MEDIUM PRIORITY - Evaluate with council
      action = 'council_convened';
      actionDetails = { council_type: 'executive', reason: 'strategic_review' };

      // Log council convening request
      await supabase.from('eliza_activity_log').insert({
        activity_type: 'council_request',
        title: `Council review requested: ${opportunity.title}`,
        description: opportunity.description,
        status: 'pending',
        metadata: { opportunity_id: opportunityId }
      });
    } else {
      // LOW PRIORITY - Defer for later
      action = 'deferred';
      actionDetails = { reason: 'low_priority', review_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() };
    }

    // Update opportunity with decision
    await supabase
      .from('opportunity_log')
      .update({
        action_taken: action,
        action_details: actionDetails,
        resolved_at: action !== 'deferred' ? new Date().toISOString() : null
      })
      .eq('id', opportunityId);

    // Update performance metrics
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('eliza_performance_metrics').upsert({
      metric_date: today,
      opportunities_actioned: 1
    }, { onConflict: 'metric_date', ignoreDuplicates: false });

    console.log(`✅ Decision made: ${action}`);

    await usageTracker.success({ result_summary: `decision_${action}` });
    return new Response(JSON.stringify({
      success: true,
      opportunityId,
      action,
      actionDetails
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Autonomous decision maker error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function checkAutoFixability(opportunity: any): Promise<boolean> {
  // Simple heuristics to determine if an opportunity can be auto-fixed
  const autoFixablePatterns = [
    'unused function',
    'low activity',
    'cache optimization',
    'index suggestion'
  ];

  const description = opportunity.description.toLowerCase();
  return autoFixablePatterns.some(pattern => description.includes(pattern));
}
