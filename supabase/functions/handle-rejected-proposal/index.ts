import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const usageTracker = startUsageTracking('handle-rejected-proposal');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { proposal_id } = await req.json();

    if (!proposal_id) {
      return new Response(
        JSON.stringify({ error: 'Missing proposal_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`📋 Handling rejected proposal: ${proposal_id}`);

    // Get the proposal
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

    if (proposal.status !== 'rejected') {
      return new Response(
        JSON.stringify({ error: `Proposal status is ${proposal.status}, expected 'rejected'` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get all votes with reasoning
    const { data: votes } = await supabase
      .from('executive_votes')
      .select('*')
      .eq('proposal_id', proposal_id);

    const rejectionVotes = votes?.filter(v => v.vote === 'reject') || [];
    const approvalVotes = votes?.filter(v => v.vote === 'approve') || [];

    // Summarize rejection reasons
    const rejectionReasons = rejectionVotes.map(v => ({
      executive: v.executive_name,
      reasoning: v.reasoning
    }));

    // Generate improvement suggestions using AI with correct message format
    let improvementSuggestions: string[] = [];
    try {
      const analysisPrompt = `
Based on the following rejection feedback for a proposed edge function, generate 3-5 specific, actionable improvement suggestions:

**Proposal:** ${proposal.function_name}
**Description:** ${proposal.description}
**Rationale:** ${proposal.rationale}

**Rejection Feedback:**
${rejectionVotes.map(v => `- ${v.executive_name}: ${v.reasoning}`).join('\n')}

${approvalVotes.length > 0 ? `**Positive Feedback:**\n${approvalVotes.map(v => `- ${v.executive_name}: ${v.reasoning}`).join('\n')}` : ''}

Generate improvement suggestions that address the concerns raised. Format as a JSON array of strings:
["suggestion 1", "suggestion 2", ...]
`;

      // Use correct message format for gemini-chat
      const { data: aiResponse, error: aiError } = await supabase.functions.invoke('gemini-chat', {
        body: {
          messages: [
            { role: 'user', content: analysisPrompt }
          ],
          userContext: {
            mode: 'improvement_analysis',
            governanceTask: 'rejection_feedback',
            proposalId: proposal_id
          }
        }
      });

      if (aiError) {
        console.error('⚠️ AI analysis error:', aiError);
        throw aiError;
      }

      // Parse suggestions from AI response
      const responseText = aiResponse?.response || aiResponse?.message || '';
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        improvementSuggestions = JSON.parse(jsonMatch[0]);
      }
    } catch (aiError) {
      console.log('⚠️ Could not generate AI suggestions:', aiError);
      // Fallback suggestions based on common issues
      improvementSuggestions = [
        'Review the technical feasibility and provide more implementation details',
        'Clarify the specific use cases and expected outcomes',
        'Address security considerations mentioned in the feedback',
        'Consider breaking the proposal into smaller, incremental features'
      ];
    }

    // Build comprehensive final analysis
    const finalAnalysis = {
      decision: 'rejected',
      decision_summary: `Rejected by ${rejectionVotes.length > 0 ? 'executive council' : 'community vote'}`,
      vote_breakdown: {
        executive: {
          approvals: approvalVotes.filter(v => ['CSO', 'CTO', 'CIO', 'CAO', 'COO'].includes(v.executive_name)).length,
          rejections: rejectionVotes.filter(v => ['CSO', 'CTO', 'CIO', 'CAO', 'COO'].includes(v.executive_name)).length,
          details: votes?.filter(v => ['CSO', 'CTO', 'CIO', 'CAO', 'COO'].includes(v.executive_name)).map(v => ({
            executive: v.executive_name,
            vote: v.vote,
            reasoning: v.reasoning
          })) || []
        },
        community: {
          approvals: approvalVotes.filter(v => !['CSO', 'CTO', 'CIO', 'CAO', 'COO'].includes(v.executive_name)).length,
          rejections: rejectionVotes.filter(v => !['CSO', 'CTO', 'CIO', 'CAO', 'COO'].includes(v.executive_name)).length
        },
        total_votes: votes?.length || 0
      },
      rejection_reasons: rejectionReasons,
      improvement_suggestions: improvementSuggestions,
      resubmission_guidance: {
        can_resubmit: true,
        recommended_changes: improvementSuggestions,
        wait_period: 'None - can resubmit immediately after addressing feedback'
      },
      processed_at: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('edge_function_proposals')
      .update({
        status: 'rejected_with_feedback',
        updated_at: new Date().toISOString(),
        implementation_code: JSON.stringify(finalAnalysis)
      })
      .eq('id', proposal_id);

    if (updateError) {
      console.error('❌ Failed to update proposal:', updateError);
      throw updateError;
    }

    console.log('✅ Updated proposal with comprehensive rejection analysis');

    // Notify via activity feed
    await supabase
      .from('activity_feed')
      .insert({
        type: 'proposal_feedback_ready',
        title: `Feedback Ready: ${proposal.function_name}`,
        description: `Rejection feedback and improvement suggestions are available for the proposer.`,
        data: {
          proposal_id,
          function_name: proposal.function_name,
          rejection_count: rejectionVotes.length,
          suggestions_count: improvementSuggestions.length,
          final_analysis: finalAnalysis
        }
      });

    // Notify proposer
    if (proposal.proposed_by) {
      await supabase
        .from('activity_feed')
        .insert({
          type: 'proposal_rejected_notification',
          title: `Proposal Feedback Available`,
          description: `${proposal.proposed_by}, your proposal for "${proposal.function_name}" was not approved. Improvement suggestions are available.`,
          data: {
            proposal_id,
            function_name: proposal.function_name,
            proposer: proposal.proposed_by,
            suggestions: improvementSuggestions.slice(0, 3)
          }
        });
    }

    await usageTracker.success({ result_summary: 'feedback_generated' });
    return new Response(
      JSON.stringify({
        success: true,
        proposal_id,
        function_name: proposal.function_name,
        new_status: 'rejected_with_feedback',
        final_analysis: finalAnalysis,
        message: 'Rejection feedback processed and suggestions generated'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Handle rejected proposal error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
