import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'check_all';

    console.log(`🗳️ Governance Phase Manager: ${action}`);

    const results: any = { action, timestamp: new Date().toISOString() };

    // Action 1: Trigger executive votes for new proposals
    if (action === 'trigger_executive_votes' || action === 'check_all') {
      const { data: pendingProposals, error: pendingError } = await supabase
        .from('edge_function_proposals')
        .select('id, function_name, voting_phase, executive_deadline, voting_started_at')
        .eq('status', 'voting')
        .eq('voting_phase', 'executive')
        .is('voting_started_at', null);

      if (pendingError) {
        console.error('Error fetching pending proposals:', pendingError);
      } else if (pendingProposals && pendingProposals.length > 0) {
        console.log(`📊 Found ${pendingProposals.length} proposals needing executive votes`);
        
        for (const proposal of pendingProposals) {
          // Set deadlines and trigger voting
          await supabase
            .from('edge_function_proposals')
            .update({
              voting_started_at: new Date().toISOString(),
              executive_deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
              community_deadline: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString() // 25 hours
            })
            .eq('id', proposal.id);

          // Trigger executive voting
          const { error: voteError } = await supabase.functions.invoke('request-executive-votes', {
            body: { proposal_id: proposal.id }
          });

          if (voteError) {
            console.error(`Failed to trigger votes for ${proposal.function_name}:`, voteError);
          } else {
            console.log(`✅ Triggered executive votes for: ${proposal.function_name}`);
          }
        }
        
        results.triggered_votes = pendingProposals.length;
      }
    }

    // Action 2: Check for executive phase deadlines
    if (action === 'check_phase_transitions' || action === 'check_all') {
      // Find proposals where executive phase has ended
      const { data: expiredExec, error: execError } = await supabase
        .from('edge_function_proposals')
        .select('id, function_name, executive_deadline')
        .eq('status', 'voting')
        .eq('voting_phase', 'executive')
        .lt('executive_deadline', new Date().toISOString());

      if (execError) {
        console.error('Error checking executive deadlines:', execError);
      } else if (expiredExec && expiredExec.length > 0) {
        console.log(`⏰ ${expiredExec.length} proposals transitioning to community phase`);
        
        for (const proposal of expiredExec) {
          // Transition to community phase
          await supabase
            .from('edge_function_proposals')
            .update({ 
              voting_phase: 'community',
              updated_at: new Date().toISOString()
            })
            .eq('id', proposal.id);

          // Log activity
          await supabase.from('activity_feed').insert({
            type: 'governance_phase_change',
            title: `Community Voting Open: ${proposal.function_name}`,
            description: 'Executive deliberation complete. Community voting now open for 24 hours.',
            data: { proposal_id: proposal.id, phase: 'community' }
          });

          console.log(`✅ ${proposal.function_name} → Community phase`);
        }
        
        results.transitioned_to_community = expiredExec.length;
      }

      // Also check if all 4 executives voted (early transition)
      const { data: fullVoted, error: fullVotedError } = await supabase
        .from('edge_function_proposals')
        .select('id, function_name')
        .eq('status', 'voting')
        .eq('voting_phase', 'executive');

      if (!fullVotedError && fullVoted) {
        for (const proposal of fullVoted) {
          // Check vote count
          const { data: votes } = await supabase
            .from('executive_votes')
            .select('executive_name')
            .eq('proposal_id', proposal.id)
            .in('executive_name', ['CSO', 'CTO', 'CIO', 'CAO']);

          if (votes && votes.length >= 4) {
            // All executives voted, early transition
            await supabase
              .from('edge_function_proposals')
              .update({ 
                voting_phase: 'community',
                updated_at: new Date().toISOString()
              })
              .eq('id', proposal.id);

            await supabase.from('activity_feed').insert({
              type: 'governance_phase_change',
              title: `Community Voting Open: ${proposal.function_name}`,
              description: 'All executives have voted. Community voting now open for 24 hours.',
              data: { proposal_id: proposal.id, phase: 'community', early_transition: true }
            });

            console.log(`✅ ${proposal.function_name} → Community phase (all executives voted)`);
          }
        }
      }
    }

    // Action 3: Finalize voting when community phase ends
    if (action === 'finalize_voting' || action === 'check_all') {
      const { data: expiredCommunity, error: commError } = await supabase
        .from('edge_function_proposals')
        .select('id, function_name, community_deadline')
        .eq('status', 'voting')
        .eq('voting_phase', 'community')
        .lt('community_deadline', new Date().toISOString());

      if (commError) {
        console.error('Error checking community deadlines:', commError);
      } else if (expiredCommunity && expiredCommunity.length > 0) {
        console.log(`🗳️ ${expiredCommunity.length} proposals ready for final count`);
        
        for (const proposal of expiredCommunity) {
          // Mark as final count phase
          await supabase
            .from('edge_function_proposals')
            .update({ 
              voting_phase: 'final_count',
              updated_at: new Date().toISOString()
            })
            .eq('id', proposal.id);

          // Count votes
          const { data: votes } = await supabase
            .from('executive_votes')
            .select('executive_name, vote')
            .eq('proposal_id', proposal.id);

          const executiveVotes = votes?.filter(v => ['CSO', 'CTO', 'CIO', 'CAO'].includes(v.executive_name)) || [];
          const communityVotes = votes?.filter(v => v.executive_name === 'COMMUNITY') || [];

          const execApprovals = executiveVotes.filter(v => v.vote === 'approve').length;
          const execRejections = executiveVotes.filter(v => v.vote === 'reject').length;
          const communityApprovals = communityVotes.filter(v => v.vote === 'approve').length;
          const communityRejections = communityVotes.filter(v => v.vote === 'reject').length;

          // Determine outcome: 3/4 executive approvals needed
          const approved = execApprovals >= 3;
          const newStatus = approved ? 'approved' : 'rejected';

          await supabase
            .from('edge_function_proposals')
            .update({ 
              status: newStatus,
              voting_phase: 'closed',
              updated_at: new Date().toISOString()
            })
            .eq('id', proposal.id);

          // Log final result
          await supabase.from('activity_feed').insert({
            type: approved ? 'proposal_approved' : 'proposal_rejected',
            title: `${approved ? '✅ Approved' : '❌ Rejected'}: ${proposal.function_name}`,
            description: `Final tally: ${execApprovals}/4 executive approvals, ${communityApprovals} community approvals, ${communityRejections} community rejections.`,
            data: { 
              proposal_id: proposal.id, 
              executive_approvals: execApprovals,
              executive_rejections: execRejections,
              community_approvals: communityApprovals,
              community_rejections: communityRejections,
              outcome: newStatus
            }
          });

          // If approved, trigger implementation workflow
          if (approved) {
            await supabase.functions.invoke('execute-approved-proposal', {
              body: { proposal_id: proposal.id }
            }).catch(e => console.error('Failed to trigger implementation:', e));
          } else {
            await supabase.functions.invoke('handle-rejected-proposal', {
              body: { proposal_id: proposal.id }
            }).catch(e => console.error('Failed to handle rejection:', e));
          }

          console.log(`✅ ${proposal.function_name} → ${newStatus.toUpperCase()}`);
        }
        
        results.finalized = expiredCommunity.length;
      }
    }

    // Return status summary
    const { data: statusSummary } = await supabase
      .from('edge_function_proposals')
      .select('voting_phase, status')
      .eq('status', 'voting');

    const phaseCounts = {
      executive: statusSummary?.filter(p => p.voting_phase === 'executive').length || 0,
      community: statusSummary?.filter(p => p.voting_phase === 'community').length || 0,
      final_count: statusSummary?.filter(p => p.voting_phase === 'final_count').length || 0,
    };

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
        current_status: phaseCounts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Governance phase manager error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});