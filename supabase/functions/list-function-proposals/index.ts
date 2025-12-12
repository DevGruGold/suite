import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'list-function-proposals';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { status } = await req.json().catch(() => ({}));

    let query = supabase
      .from('edge_function_proposals')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: proposals, error: proposalsError } = await query;

    if (proposalsError) throw proposalsError;

    // Get votes for each proposal
    const proposalsWithVotes = await Promise.all(
      proposals.map(async (proposal) => {
        const { data: votes } = await supabase
          .from('executive_votes')
          .select('*')
          .eq('proposal_id', proposal.id);

        return {
          ...proposal,
          votes: votes || [],
          vote_summary: {
            total: votes?.length || 0,
            approvals: votes?.filter(v => v.vote === 'approve').length || 0,
            rejections: votes?.filter(v => v.vote === 'reject').length || 0,
            abstentions: votes?.filter(v => v.vote === 'abstain').length || 0
          }
        };
      })
    );

    await usageTracker.success({ proposals_count: proposalsWithVotes.length });

    return new Response(
      JSON.stringify({
        proposals: proposalsWithVotes,
        total: proposalsWithVotes.length,
        by_status: {
          pending: proposalsWithVotes.filter(p => p.status === 'pending').length,
          voting: proposalsWithVotes.filter(p => p.status === 'voting').length,
          approved: proposalsWithVotes.filter(p => p.status === 'approved').length,
          rejected: proposalsWithVotes.filter(p => p.status === 'rejected').length,
          deployed: proposalsWithVotes.filter(p => p.status === 'deployed').length
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('List proposals error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
