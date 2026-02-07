import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'vote-on-proposal';

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

    const { 
      proposal_id,
      executive_name, // CSO, CTO, CIO, CAO, or COMMUNITY
      vote, // approve, reject, or abstain
      reasoning,
      session_key // Required for COMMUNITY votes
    } = await req.json();

    console.log('📥 Vote request:', { proposal_id, executive_name, vote, session_key: session_key ? '***' : 'none' });

    // Validate required fields
    if (!proposal_id || !executive_name || !vote || !reasoning) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: proposal_id, executive_name, vote, reasoning' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Allow executives and community votes
    const validExecutives = ['CSO', 'CTO', 'CIO', 'CAO', 'COO', 'COMMUNITY'];
    if (!validExecutives.includes(executive_name)) {
      return new Response(
        JSON.stringify({ error: 'Invalid voter name. Use CSO, CTO, CIO, CAO, COO, or COMMUNITY.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Community votes require session_key
    if (executive_name === 'COMMUNITY' && !session_key) {
      return new Response(
        JSON.stringify({ error: 'Community votes require a session_key' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate vote value
    const validVotes = ['approve', 'reject', 'abstain'];
    if (!validVotes.includes(vote)) {
      return new Response(
        JSON.stringify({ error: 'Invalid vote. Use approve, reject, or abstain.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // MANDATORY: Abstention requires valid justification
    if (vote === 'abstain') {
      const validAbstentionReasons = [
        'conflict of interest',
        'insufficient information', 
        'outside expertise',
        'outside my expertise',
        'outside my area',
        'cannot objectively evaluate',
        'proposed this function',
        'i proposed this',
        'my proposal'
      ];
      
      const hasValidReason = validAbstentionReasons.some(reason => 
        reasoning.toLowerCase().includes(reason)
      );
      
      if (!hasValidReason) {
        console.log(`❌ Invalid abstention attempt by ${executive_name}: "${reasoning}"`);
        return new Response(
          JSON.stringify({ 
            error: 'Abstention requires specific justification. Valid reasons: "conflict of interest", "insufficient information", or "outside my expertise". Otherwise, vote approve or reject with your reasoning.',
            invalid_reasoning: reasoning
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      console.log(`✅ Valid abstention by ${executive_name}: ${reasoning}`);
    }

    // Get proposal
    const { data: proposal, error: proposalError } = await supabase
      .from('edge_function_proposals')
      .select('*')
      .eq('id', proposal_id)
      .single();

    if (proposalError || !proposal) {
      console.error('❌ Proposal not found:', proposalError);
      return new Response(
        JSON.stringify({ error: 'Proposal not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (proposal.status !== 'voting') {
      return new Response(
        JSON.stringify({ error: `Proposal is ${proposal.status}, voting closed` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check if user has already voted (for community)
    if (executive_name === 'COMMUNITY' && session_key) {
      const { data: existingVote } = await supabase
        .from('executive_votes')
        .select('id, vote')
        .eq('proposal_id', proposal_id)
        .eq('executive_name', 'COMMUNITY')
        .eq('session_key', session_key)
        .single();

      if (existingVote) {
        // Update existing vote
        const { error: updateError } = await supabase
          .from('executive_votes')
          .update({
            vote,
            reasoning,
            created_at: new Date().toISOString()
          })
          .eq('id', existingVote.id);

        if (updateError) {
          console.error('❌ Failed to update vote:', updateError);
          throw updateError;
        }
        console.log(`✅ Updated existing vote from ${existingVote.vote} to ${vote}`);
      } else {
        // Insert new community vote
        const { error: insertError } = await supabase
          .from('executive_votes')
          .insert({
            proposal_id,
            executive_name,
            vote,
            reasoning,
            session_key
          });

        if (insertError) {
          console.error('❌ Failed to insert vote:', insertError);
          throw insertError;
        }
        console.log('✅ Inserted new community vote');
      }
    } else {
      // Executive vote - check existing then insert/update
      const { data: existingExecVote } = await supabase
        .from('executive_votes')
        .select('id, vote')
        .eq('proposal_id', proposal_id)
        .eq('executive_name', executive_name)
        .is('session_key', null)
        .single();

      if (existingExecVote) {
        // Update existing executive vote
        const { error: updateExecError } = await supabase
          .from('executive_votes')
          .update({
            vote,
            reasoning,
            created_at: new Date().toISOString()
          })
          .eq('id', existingExecVote.id);

        if (updateExecError) {
          console.error('❌ Failed to update executive vote:', updateExecError);
          throw updateExecError;
        }
        console.log(`✅ Updated executive vote: ${executive_name} changed from ${existingExecVote.vote} to ${vote}`);
      } else {
        // Insert new executive vote
        const { error: insertExecError } = await supabase
          .from('executive_votes')
          .insert({
            proposal_id,
            executive_name,
            vote,
            reasoning,
            session_key: null
          });

        if (insertExecError) {
          console.error('❌ Failed to insert executive vote:', insertExecError);
          throw insertExecError;
        }
        console.log(`✅ Recorded new executive vote: ${executive_name} voted ${vote}`);
      }
    }

    // Count votes (only count executive votes for consensus)
    const { data: executiveVotes, error: votesError } = await supabase
      .from('executive_votes')
      .select('*')
      .eq('proposal_id', proposal_id)
      .in('executive_name', ['CSO', 'CTO', 'CIO', 'CAO', 'COO']);

    if (votesError) throw votesError;

    // Count community votes separately
    const { data: communityVotes, error: communityError } = await supabase
      .from('executive_votes')
      .select('*')
      .eq('proposal_id', proposal_id)
      .eq('executive_name', 'COMMUNITY');

    if (communityError) throw communityError;

    const executiveApprovals = executiveVotes?.filter(v => v.vote === 'approve').length || 0;
    const executiveRejections = executiveVotes?.filter(v => v.vote === 'reject').length || 0;
    const totalExecutiveVotes = executiveVotes?.length || 0;
    
    const communityApprovals = communityVotes?.filter(v => v.vote === 'approve').length || 0;
    const communityRejections = communityVotes?.filter(v => v.vote === 'reject').length || 0;
    const totalCommunityVotes = communityVotes?.length || 0;

    console.log(`📊 Executive votes: ${executiveApprovals} approvals, ${executiveRejections} rejections (${totalExecutiveVotes} total)`);
    console.log(`📊 Community votes: ${communityApprovals} approvals, ${communityRejections} rejections (${totalCommunityVotes} total)`);

    // Check for consensus (4/5 executive approval required)
    let consensusReached = false;
    let newStatus = 'voting';

    if (executiveApprovals >= 4) {
      // Consensus reached - approve
      consensusReached = true;
      newStatus = 'approved';
      
      await supabase
        .from('edge_function_proposals')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', proposal_id);

      // Notify about approval
      await supabase
        .from('activity_feed')
        .insert({
          type: 'function_approved',
          title: `Edge Function Approved: ${proposal.function_name}`,
          description: `Consensus reached (${executiveApprovals}/5 executive approvals, ${communityApprovals} community approvals). Ready for deployment.`,
          data: {
            proposal_id,
            function_name: proposal.function_name,
            executive_approvals: executiveApprovals,
            community_approvals: communityApprovals,
            votes_summary: executiveVotes
          }
        });
      
      console.log('🎉 Proposal approved!');

      // Trigger post-approval workflow
      try {
        const { data: workflowData, error: workflowError } = await supabase.functions.invoke('execute-approved-proposal', {
          body: { proposal_id }
        });
        
        if (workflowError) {
          console.error('⚠️ Post-approval workflow failed:', workflowError);
        } else {
          console.log('✅ Post-approval workflow completed:', workflowData?.task_id);
        }
      } catch (wfErr) {
        console.error('⚠️ Post-approval workflow error:', wfErr);
      }

    } else if (executiveRejections >= 3) {
      // Explicit rejection threshold - 3+ executives actively rejected
      consensusReached = true;
      newStatus = 'rejected';
      
      await supabase
        .from('edge_function_proposals')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', proposal_id);

      await supabase
        .from('activity_feed')
        .insert({
          type: 'function_rejected',
          title: `Edge Function Rejected: ${proposal.function_name}`,
          description: `Rejected by executive council (${executiveRejections} explicit rejections).`,
          data: {
            proposal_id,
            function_name: proposal.function_name,
            executive_approvals: executiveApprovals,
            executive_rejections: executiveRejections
          }
        });

      console.log('❌ Proposal rejected (3+ explicit rejections)');

      // Trigger post-rejection workflow
      try {
        await supabase.functions.invoke('handle-rejected-proposal', { body: { proposal_id } });
      } catch (rejErr) {
        console.error('⚠️ Post-rejection workflow error:', rejErr);
      }

      // Trigger post-rejection workflow
      try {
        await supabase.functions.invoke('handle-rejected-proposal', { body: { proposal_id } });
      } catch (rejErr) {
        console.error('⚠️ Post-rejection workflow error:', rejErr);
      }

    } else if (totalExecutiveVotes === 5) {
      // All 5 executives have voted - evaluate based on ACTUAL decisions (not abstentions)
      const abstentions = totalExecutiveVotes - (executiveApprovals + executiveRejections);
      const actualDecisions = executiveApprovals + executiveRejections;
      
      console.log(`📊 Vote breakdown: ${executiveApprovals} approve, ${executiveRejections} reject, ${abstentions} abstain`);
      
      if (actualDecisions === 0) {
        // All 4 abstained - keep in voting for re-evaluation
        console.log('⚠️ All executives abstained - proposal stays in voting for re-evaluation');
        newStatus = 'voting';
        
      } else if (executiveApprovals > executiveRejections) {
        // Majority of actual voters approved (e.g., 2 approve + 0 reject + 2 abstain = 100% of deciders approved)
        consensusReached = true;
        newStatus = 'approved';
        
        await supabase
          .from('edge_function_proposals')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('id', proposal_id);

        await supabase
          .from('activity_feed')
          .insert({
            type: 'function_approved',
            title: `Edge Function Approved: ${proposal.function_name}`,
            description: `Approved by majority of deciders (${executiveApprovals} approve, ${executiveRejections} reject, ${abstentions} abstain).`,
            data: {
              proposal_id,
              function_name: proposal.function_name,
              executive_approvals: executiveApprovals,
              executive_rejections: executiveRejections,
              abstentions
            }
          });

        console.log('🎉 Proposal approved (majority of actual voters)');

        // Trigger post-approval workflow
        try {
          await supabase.functions.invoke('execute-approved-proposal', { body: { proposal_id } });
        } catch (wfErr) {
          console.error('⚠️ Post-approval workflow error:', wfErr);
        }

      } else if (executiveRejections > executiveApprovals) {
        // Majority of actual voters rejected
        consensusReached = true;
        newStatus = 'rejected';
        
        await supabase
          .from('edge_function_proposals')
          .update({ status: 'rejected', updated_at: new Date().toISOString() })
          .eq('id', proposal_id);

        await supabase
          .from('activity_feed')
          .insert({
            type: 'function_rejected',
            title: `Edge Function Rejected: ${proposal.function_name}`,
            description: `Rejected by majority of deciders (${executiveApprovals} approve, ${executiveRejections} reject, ${abstentions} abstain).`,
            data: {
              proposal_id,
              function_name: proposal.function_name,
              executive_approvals: executiveApprovals,
              executive_rejections: executiveRejections,
              abstentions
            }
          });

        console.log('❌ Proposal rejected (majority of actual voters)');

        try {
          await supabase.functions.invoke('handle-rejected-proposal', { body: { proposal_id } });
        } catch (rejErr) {
          console.error('⚠️ Post-rejection workflow error:', rejErr);
        }

      } else {
        // Tie (e.g., 1 approve + 1 reject + 2 abstain) - keep voting for re-evaluation
        console.log('⚠️ Tied actual votes - proposal stays in voting');
        newStatus = 'voting';
      }
    }

    await usageTracker.success({ voter: executive_name, vote_cast: vote, consensus_reached: consensusReached });

    return new Response(
      JSON.stringify({
        success: true,
        vote_recorded: true,
        voter: executive_name,
        vote_cast: vote,
        consensus_reached: consensusReached,
        status: newStatus,
        vote_summary: {
          executive: {
            approvals: executiveApprovals,
            rejections: executiveRejections,
            total: totalExecutiveVotes,
            votes_needed: Math.max(0, 4 - executiveApprovals)
          },
          community: {
            approvals: communityApprovals,
            rejections: communityRejections,
            total: totalCommunityVotes
          }
        },
        proposal
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Vote error:', error);
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
