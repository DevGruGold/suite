import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'governance-phase-manager';

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

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'check_all';

    console.log(`🗳️ Governance Phase Manager: ${action}`);

    const results: any = { action, timestamp: new Date().toISOString() };

    // ACTION 0: Initialize deadlines for any proposals with null deadlines (CRITICAL FIX)
    const { data: needsDeadlines, error: initError } = await supabase
      .from('edge_function_proposals')
      .select('id, function_name')
      .eq('status', 'voting')
      .eq('voting_phase', 'executive')
      .is('executive_deadline', null);

    if (!initError && needsDeadlines && needsDeadlines.length > 0) {
      console.log(`🔧 Initializing deadlines for ${needsDeadlines.length} proposals with null deadlines`);
      
      for (const proposal of needsDeadlines) {
        const now = new Date();
        await supabase
          .from('edge_function_proposals')
          .update({
            voting_started_at: now.toISOString(),
            executive_deadline: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), // 1 hour
            community_deadline: new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString() // 25 hours
          })
          .eq('id', proposal.id);
        
        console.log(`✅ Set deadlines for: ${proposal.function_name}`);
      }
      
      results.initialized_deadlines = needsDeadlines.length;
    }

    // Action 1: Trigger executive votes for proposals without complete executive votes
    if (action === 'trigger_executive_votes' || action === 'check_all') {
      // Get all proposals in executive phase (include null deadlines OR within deadline)
      const { data: execProposals, error: pendingError } = await supabase
        .from('edge_function_proposals')
        .select('id, function_name, voting_phase, executive_deadline, voting_started_at')
        .eq('status', 'voting')
        .eq('voting_phase', 'executive')
        .or(`executive_deadline.is.null,executive_deadline.gt.${new Date().toISOString()}`);

      if (pendingError) {
        console.error('Error fetching executive proposals:', pendingError);
      } else if (execProposals && execProposals.length > 0) {
        console.log(`📊 Checking ${execProposals.length} proposals in executive phase`);
        let triggered = 0;
        
        for (const proposal of execProposals) {
          // Check how many executives have voted
          const { data: existingVotes } = await supabase
            .from('executive_votes')
            .select('executive_name')
            .eq('proposal_id', proposal.id)
            .in('executive_name', ['CSO', 'CTO', 'CIO', 'CAO']);

          const votedExecutives = existingVotes?.map(v => v.executive_name) || [];
          const missingExecutives = ['CSO', 'CTO', 'CIO', 'CAO'].filter(e => !votedExecutives.includes(e));

          // If any executives haven't voted yet, trigger voting for them
          if (missingExecutives.length > 0) {
            console.log(`📋 ${proposal.function_name}: ${votedExecutives.length}/4 executives voted. Missing: ${missingExecutives.join(', ')}`);
            
            // Ensure deadlines are set if this is a new proposal
            if (!proposal.voting_started_at) {
              await supabase
                .from('edge_function_proposals')
                .update({
                  voting_started_at: new Date().toISOString(),
                  executive_deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
                  community_deadline: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString() // 25 hours
                })
                .eq('id', proposal.id);
            }

            // Trigger voting for missing executives
            const { error: voteError } = await supabase.functions.invoke('request-executive-votes', {
              body: { 
                proposal_id: proposal.id,
                target_executives: missingExecutives
              }
            });

            if (voteError) {
              console.error(`Failed to trigger votes for ${proposal.function_name}:`, voteError);
            } else {
              console.log(`✅ Triggered votes for ${missingExecutives.join(', ')} on: ${proposal.function_name}`);
              triggered++;
            }
          } else {
            console.log(`✅ ${proposal.function_name}: All 4 executives have voted`);
          }
        }
        
        results.triggered_votes = triggered;
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
      // Check both community phase with expired deadline AND executive phase with expired deadline
      const { data: expiredProposals, error: commError } = await supabase
        .from('edge_function_proposals')
        .select('id, function_name, community_deadline, executive_deadline, voting_phase')
        .eq('status', 'voting')
        .in('voting_phase', ['community', 'executive']);

      if (commError) {
        console.error('Error checking deadlines:', commError);
      } else if (expiredProposals && expiredProposals.length > 0) {
        const now = new Date();
        
        // Filter proposals ready for finalization
        const readyToFinalize = expiredProposals.filter(p => {
          if (p.voting_phase === 'community' && p.community_deadline) {
            return new Date(p.community_deadline) < now;
          }
          // Also finalize executive phase if deadline passed (Eliza decides with available votes)
          if (p.voting_phase === 'executive' && p.executive_deadline) {
            return new Date(p.executive_deadline) < now;
          }
          return false;
        });

        if (readyToFinalize.length > 0) {
          console.log(`🗳️ ${readyToFinalize.length} proposals ready for Eliza's weighted determination`);
        }
        
        for (const proposal of readyToFinalize) {
          // Mark as final count phase
          await supabase
            .from('edge_function_proposals')
            .update({ 
              voting_phase: 'final_count',
              updated_at: new Date().toISOString()
            })
            .eq('id', proposal.id);

          // Get ALL votes (executive + community)
          const { data: votes } = await supabase
            .from('executive_votes')
            .select('executive_name, vote, reasoning')
            .eq('proposal_id', proposal.id);

          const executiveNames = ['CSO', 'CTO', 'CIO', 'CAO'];
          const executiveVotes = votes?.filter(v => executiveNames.includes(v.executive_name)) || [];
          const communityVotes = votes?.filter(v => v.executive_name === 'COMMUNITY') || [];

          const execApprovals = executiveVotes.filter(v => v.vote === 'approve').length;
          const execRejections = executiveVotes.filter(v => v.vote === 'reject').length;
          const communityApprovals = communityVotes.filter(v => v.vote === 'approve').length;
          const communityRejections = communityVotes.filter(v => v.vote === 'reject').length;

          // WEIGHTED VOTING ALGORITHM
          // Executive vote = 10 points, Community vote = 1 point
          const EXEC_WEIGHT = 10;
          const COMMUNITY_WEIGHT = 1;
          
          const weightedApprove = (execApprovals * EXEC_WEIGHT) + (communityApprovals * COMMUNITY_WEIGHT);
          const weightedReject = (execRejections * EXEC_WEIGHT) + (communityRejections * COMMUNITY_WEIGHT);
          
          let approved = false;
          let decisionMethod = '';
          let reasoning = '';

          // Decision Tree:
          if (execApprovals >= 3) {
            // Clear executive consensus (3+ approvals)
            approved = true;
            decisionMethod = 'executive_consensus';
            reasoning = `Clear executive consensus with ${execApprovals}/4 executives approving. Community supported with ${communityApprovals} additional approvals.`;
          } else if (execRejections >= 3) {
            // Clear executive rejection
            approved = false;
            decisionMethod = 'executive_rejection';
            reasoning = `Executive council rejected with ${execRejections}/4 votes against. Community had ${communityRejections} rejections.`;
          } else if (executiveVotes.length === 0) {
            // No executives voted - community supermajority decides
            const totalCommunity = communityApprovals + communityRejections;
            if (totalCommunity > 0) {
              const approvalRate = communityApprovals / totalCommunity;
              approved = approvalRate >= 0.6; // 60% supermajority
              decisionMethod = 'community_supermajority';
              reasoning = `No executives voted within the deadline. Community decided with ${(approvalRate * 100).toFixed(0)}% approval rate (${communityApprovals}/${totalCommunity} votes). ${approved ? 'Met' : 'Did not meet'} 60% supermajority threshold.`;
            } else {
              // No votes at all - reject by default
              approved = false;
              decisionMethod = 'community_supermajority';
              reasoning = 'No votes were cast by executives or community. Proposal rejected due to lack of participation.';
            }
          } else {
            // Incomplete/split executive votes - use weighted scoring
            if (weightedApprove > weightedReject) {
              approved = true;
              decisionMethod = 'weighted_score';
              reasoning = `Weighted voting determined approval. Score: ${weightedApprove} approve vs ${weightedReject} reject. (${execApprovals} executives + ${communityApprovals} community approved, ${execRejections} executives + ${communityRejections} community rejected)`;
            } else if (weightedReject > weightedApprove) {
              approved = false;
              decisionMethod = 'weighted_score';
              reasoning = `Weighted voting determined rejection. Score: ${weightedReject} reject vs ${weightedApprove} approve. (${execRejections} executives + ${communityRejections} community rejected, ${execApprovals} executives + ${communityApprovals} community approved)`;
            } else {
              // Tie - Eliza breaks the tie based on community sentiment
              const communityLeans = communityApprovals > communityRejections;
              approved = communityLeans;
              decisionMethod = 'tie_breaker';
              reasoning = `Weighted scores tied at ${weightedApprove}. Eliza breaks tie based on community sentiment: ${communityApprovals} approvals vs ${communityRejections} rejections. Decision: ${approved ? 'APPROVED' : 'REJECTED'}.`;
            }
          }

          const newStatus = approved ? 'approved' : 'rejected';

          // Store detailed decision report
          await supabase.from('eliza_decision_reports').insert({
            proposal_id: proposal.id,
            decision: newStatus,
            decision_method: decisionMethod,
            reasoning: reasoning,
            executive_votes: executiveVotes.reduce((acc, v) => ({ ...acc, [v.executive_name]: { vote: v.vote, reasoning: v.reasoning } }), {}),
            community_votes: { approvals: communityApprovals, rejections: communityRejections },
            weighted_score_approve: weightedApprove,
            weighted_score_reject: weightedReject,
            total_executive_votes: executiveVotes.length,
            total_community_votes: communityVotes.length
          });

          await supabase
            .from('edge_function_proposals')
            .update({ 
              status: newStatus,
              voting_phase: 'closed',
              updated_at: new Date().toISOString()
            })
            .eq('id', proposal.id);

          // Log final result with Eliza's reasoning
          await supabase.from('activity_feed').insert({
            type: approved ? 'proposal_approved' : 'proposal_rejected',
            title: `${approved ? '✅ Approved' : '❌ Rejected'}: ${proposal.function_name}`,
            description: reasoning,
            data: { 
              proposal_id: proposal.id, 
              decision_method: decisionMethod,
              executive_approvals: execApprovals,
              executive_rejections: execRejections,
              community_approvals: communityApprovals,
              community_rejections: communityRejections,
              weighted_approve: weightedApprove,
              weighted_reject: weightedReject,
              outcome: newStatus
            }
          });

          // Trigger appropriate workflow
          if (approved) {
            await supabase.functions.invoke('execute-approved-proposal', {
              body: { proposal_id: proposal.id }
            }).catch(e => console.error('Failed to trigger implementation:', e));
          } else {
            await supabase.functions.invoke('handle-rejected-proposal', {
              body: { proposal_id: proposal.id }
            }).catch(e => console.error('Failed to handle rejection:', e));
          }

          console.log(`✅ ${proposal.function_name} → ${newStatus.toUpperCase()} (${decisionMethod})`);
        }
        
        results.finalized = readyToFinalize.length;
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

    await usageTracker.success({ ...results, ...phaseCounts });

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
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});