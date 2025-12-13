import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'governance-phase-manager';
const OVERALL_TIMEOUT_MS = 25000; // 25 second overall timeout
const INVOKE_TIMEOUT_MS = 8000; // 8 second timeout for invoke calls

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Timeout wrapper for invoke calls
async function invokeWithTimeout(supabase: any, functionName: string, body: any): Promise<any> {
  const invokePromise = supabase.functions.invoke(functionName, { body });
  const timeoutPromise = new Promise<{ error: Error }>((resolve) =>
    setTimeout(() => resolve({ error: new Error(`${functionName} invoke timeout`) }), INVOKE_TIMEOUT_MS)
  );
  return Promise.race([invokePromise, timeoutPromise]);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  // Overall timeout guard
  const timeoutPromise = new Promise<Response>((resolve) =>
    setTimeout(() => {
      console.warn('⚠️ Governance phase manager overall timeout');
      resolve(new Response(JSON.stringify({ 
        success: true, 
        timeout: true,
        message: 'Phase manager timed out - will continue on next cycle'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }));
    }, OVERALL_TIMEOUT_MS)
  );

  const mainPromise = (async () => {
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const body = await req.json().catch(() => ({}));
      const action = body.action || 'check_all';

      console.log(`🗳️ Governance Phase Manager: ${action}`);

      const results: any = { action, timestamp: new Date().toISOString() };

      // ACTION 0: Initialize deadlines for proposals with null deadlines
      const { data: needsDeadlines } = await supabase
        .from('edge_function_proposals')
        .select('id, function_name')
        .eq('status', 'voting')
        .eq('voting_phase', 'executive')
        .is('executive_deadline', null)
        .limit(5);

      if (needsDeadlines && needsDeadlines.length > 0) {
        console.log(`🔧 Initializing deadlines for ${needsDeadlines.length} proposals`);
        
        for (const proposal of needsDeadlines) {
          const now = new Date();
          await supabase
            .from('edge_function_proposals')
            .update({
              voting_started_at: now.toISOString(),
              executive_deadline: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
              community_deadline: new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString()
            })
            .eq('id', proposal.id);
        }
        results.initialized_deadlines = needsDeadlines.length;
      }

      // Action 1: Trigger executive votes
      if (action === 'trigger_executive_votes' || action === 'check_all') {
        const { data: execProposals } = await supabase
          .from('edge_function_proposals')
          .select('id, function_name, voting_phase, executive_deadline')
          .eq('status', 'voting')
          .eq('voting_phase', 'executive')
          .limit(5);

        if (execProposals && execProposals.length > 0) {
          let triggered = 0;
          
          for (const proposal of execProposals.slice(0, 3)) { // Limit to 3 to prevent timeout
            const { data: existingVotes } = await supabase
              .from('executive_votes')
              .select('executive_name')
              .eq('proposal_id', proposal.id)
              .in('executive_name', ['CSO', 'CTO', 'CIO', 'CAO']);

            const votedExecutives = existingVotes?.map(v => v.executive_name) || [];
            const missingExecutives = ['CSO', 'CTO', 'CIO', 'CAO'].filter(e => !votedExecutives.includes(e));

            if (missingExecutives.length > 0) {
              console.log(`📋 ${proposal.function_name}: Missing votes from ${missingExecutives.join(', ')}`);
              
              const { error: voteError } = await invokeWithTimeout(supabase, 'request-executive-votes', {
                proposal_id: proposal.id,
                target_executives: missingExecutives.slice(0, 2) // Only trigger 2 at a time
              });

              if (!voteError) {
                triggered++;
              }
            }
          }
          results.triggered_votes = triggered;
        }
      }

      // Action 2: Check phase transitions
      if (action === 'check_phase_transitions' || action === 'check_all') {
        const { data: expiredExec } = await supabase
          .from('edge_function_proposals')
          .select('id, function_name')
          .eq('status', 'voting')
          .eq('voting_phase', 'executive')
          .lt('executive_deadline', new Date().toISOString())
          .limit(5);

        if (expiredExec && expiredExec.length > 0) {
          for (const proposal of expiredExec) {
            await supabase
              .from('edge_function_proposals')
              .update({ voting_phase: 'community', updated_at: new Date().toISOString() })
              .eq('id', proposal.id);

            console.log(`✅ ${proposal.function_name} → Community phase`);
          }
          results.transitioned_to_community = expiredExec.length;
        }

        // Early transition if all 4 voted
        const { data: fullVoted } = await supabase
          .from('edge_function_proposals')
          .select('id, function_name')
          .eq('status', 'voting')
          .eq('voting_phase', 'executive')
          .limit(5);

        if (fullVoted) {
          for (const proposal of fullVoted) {
            const { data: votes } = await supabase
              .from('executive_votes')
              .select('executive_name')
              .eq('proposal_id', proposal.id)
              .in('executive_name', ['CSO', 'CTO', 'CIO', 'CAO']);

            if (votes && votes.length >= 4) {
              await supabase
                .from('edge_function_proposals')
                .update({ voting_phase: 'community', updated_at: new Date().toISOString() })
                .eq('id', proposal.id);
              console.log(`✅ ${proposal.function_name} → Community (all voted)`);
            }
          }
        }
      }

      // Action 3: Finalize voting
      if (action === 'finalize_voting' || action === 'check_all') {
        const { data: expiredProposals } = await supabase
          .from('edge_function_proposals')
          .select('id, function_name, community_deadline, executive_deadline, voting_phase')
          .eq('status', 'voting')
          .in('voting_phase', ['community', 'executive'])
          .limit(5);

        if (expiredProposals) {
          const now = new Date();
          const readyToFinalize = expiredProposals.filter(p => {
            if (p.voting_phase === 'community' && p.community_deadline) {
              return new Date(p.community_deadline) < now;
            }
            if (p.voting_phase === 'executive' && p.executive_deadline) {
              return new Date(p.executive_deadline) < now;
            }
            return false;
          });

          for (const proposal of readyToFinalize.slice(0, 2)) { // Limit to 2
            await supabase
              .from('edge_function_proposals')
              .update({ voting_phase: 'final_count', updated_at: now.toISOString() })
              .eq('id', proposal.id);

            const { data: votes } = await supabase
              .from('executive_votes')
              .select('executive_name, vote')
              .eq('proposal_id', proposal.id);

            const execVotes = votes?.filter(v => ['CSO', 'CTO', 'CIO', 'CAO'].includes(v.executive_name)) || [];
            const communityVotes = votes?.filter(v => v.executive_name === 'COMMUNITY') || [];

            const execApprovals = execVotes.filter(v => v.vote === 'approve').length;
            const communityApprovals = communityVotes.filter(v => v.vote === 'approve').length;
            
            const weightedApprove = (execApprovals * 10) + (communityApprovals * 1);
            const weightedReject = ((execVotes.length - execApprovals) * 10) + ((communityVotes.length - communityApprovals) * 1);
            
            const approved = weightedApprove > weightedReject || execApprovals >= 3;
            const newStatus = approved ? 'approved' : 'rejected';

            await supabase
              .from('edge_function_proposals')
              .update({ status: newStatus, voting_phase: 'closed', updated_at: now.toISOString() })
              .eq('id', proposal.id);

            console.log(`✅ ${proposal.function_name} → ${newStatus.toUpperCase()}`);

            // Trigger downstream (non-blocking)
            if (approved) {
              invokeWithTimeout(supabase, 'execute-approved-proposal', { proposal_id: proposal.id })
                .catch(e => console.warn('Execute trigger failed:', e));
            }
          }
          results.finalized = readyToFinalize.length;
        }
      }

      // Status summary
      const { data: statusSummary } = await supabase
        .from('edge_function_proposals')
        .select('voting_phase')
        .eq('status', 'voting');

      const phaseCounts = {
        executive: statusSummary?.filter(p => p.voting_phase === 'executive').length || 0,
        community: statusSummary?.filter(p => p.voting_phase === 'community').length || 0,
        final_count: statusSummary?.filter(p => p.voting_phase === 'final_count').length || 0,
      };

      await usageTracker.success({ ...results, ...phaseCounts });

      return new Response(
        JSON.stringify({ success: true, ...results, current_status: phaseCounts }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error: any) {
      console.error('❌ Governance Phase Manager Error:', error);
      await usageTracker.error(error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  })();

  return Promise.race([mainPromise, timeoutPromise]);
});
