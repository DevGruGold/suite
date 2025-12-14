import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Executive perspectives for analyzing proposals
const executivePerspectives = {
  CSO: {
    title: 'Chief Strategy Officer',
    focus: 'Strategic value, DAO alignment, long-term vision, community benefit',
    prompt: 'Analyze this proposal from a strategic perspective. Consider: Does it align with XMRT DAO goals? Will it benefit the community? Is it strategically valuable long-term?'
  },
  CTO: {
    title: 'Chief Technology Officer', 
    focus: 'Technical feasibility, code quality, security, scalability',
    prompt: 'Analyze this proposal from a technical perspective. Consider: Is it technically feasible? Are there security concerns? Will it scale well? Does it follow best practices?'
  },
  CIO: {
    title: 'Chief Innovation Officer',
    focus: 'Innovation potential, uniqueness, future possibilities, creative value',
    prompt: 'Analyze this proposal from an innovation perspective. Consider: Is it truly innovative? Does it open new possibilities? Is it creative and forward-thinking?'
  },
  CAO: {
    title: 'Chief Analytics Officer',
    focus: 'ROI assessment, metrics, data-driven value, measurable outcomes',
    prompt: 'Analyze this proposal from an analytics perspective. Consider: What is the expected ROI? Can we measure its success? Does the data support this approach?'
  }
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

    const { proposal_id } = await req.json();

    if (!proposal_id) {
      return new Response(
        JSON.stringify({ error: 'Missing proposal_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`🗳️ Requesting executive votes for proposal: ${proposal_id}`);

    // Get the proposal details
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
        JSON.stringify({ error: `Proposal is ${proposal.status}, not accepting votes` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Update proposal to show voting has been initiated
    await supabase
      .from('edge_function_proposals')
      .update({ 
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal_id);

    // Log activity that executives are being called to vote
    await supabase
      .from('activity_feed')
      .insert({
        type: 'executive_deliberation',
        title: `Executives Called to Vote: ${proposal.function_name}`,
        description: 'AI executives are analyzing the proposal and preparing their votes.',
        data: { proposal_id, function_name: proposal.function_name }
      });

    const executives = ['CSO', 'CTO', 'CIO', 'CAO'];
    const voteResults: any[] = [];
    const errors: any[] = [];

    // Call each executive to analyze and vote
    for (const exec of executives) {
      try {
        console.log(`📊 Requesting vote from ${exec}...`);
        
        const perspective = executivePerspectives[exec as keyof typeof executivePerspectives];
        
        // Build analysis prompt with mandatory decision requirement
        const analysisPrompt = `
You are the ${perspective.title} (${exec}) of XMRT DAO. ${perspective.prompt}

## Proposal to Evaluate:
**Function Name:** ${proposal.function_name}
**Description:** ${proposal.description}
**Rationale:** ${proposal.rationale}
**Use Cases:** ${Array.isArray(proposal.use_cases) ? proposal.use_cases.join(', ') : proposal.use_cases}
**Proposed By:** ${proposal.proposed_by}
**Category:** ${proposal.category || 'general'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ MANDATORY VOTING RULES (YOU MUST FOLLOW THESE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. You MUST vote either "approve" OR "reject" with clear reasoning
2. Abstaining is ONLY allowed for these THREE specific reasons:
   - "conflict of interest" (you proposed this function yourself)
   - "insufficient information" (critical technical details missing to evaluate)
   - "outside expertise" (completely outside your domain expertise)
3. If NONE of these apply, you MUST vote approve or reject
4. Vague reasoning like "need more info" without specifics = REJECT

Your vote carries weight in governance. Make a decision and own it.

Based on your analysis focusing on ${perspective.focus}, provide your vote and detailed reasoning (2-3 sentences).

Respond in JSON format:
{"vote": "approve" OR "reject", "reasoning": "Your detailed reasoning here"}

ONLY use {"vote": "abstain", "reasoning": "..."} if you meet one of the three valid abstention criteria listed above.
`;

        // Call lovable-chat to get executive's analysis using correct message format
        const { data: aiResponse, error: aiError } = await supabase.functions.invoke('lovable-chat', {
          body: {
            messages: [
              { role: 'user', content: analysisPrompt }
            ],
            userContext: {
              executiveRole: exec,
              mode: 'governance_analysis',
              governanceTask: 'proposal_analysis',
              proposalId: proposal_id
            }
          }
        });

        if (aiError) {
          // Extract detailed error from response if available
          const errorDetail = aiResponse?.error || aiError.message;
          console.error(`❌ ${exec} analysis failed:`, errorDetail);
          errors.push({ executive: exec, error: errorDetail });
          continue;
        }

        // Validate response exists
        if (!aiResponse?.response && !aiResponse?.message) {
          console.error(`❌ ${exec} returned empty response`);
          errors.push({ executive: exec, error: 'Empty response from AI' });
          continue;
        }

        // Parse the AI response to extract vote and reasoning
        // Default to REJECT (accountability) instead of abstain (avoidance)
        let vote = 'reject';
        let reasoning = `${exec} could not complete analysis - defaulting to reject for accountability.`;

        try {
          const responseText = aiResponse?.response || aiResponse?.message || '';
          
          // Try to parse JSON from response
          const jsonMatch = responseText.match(/\{[\s\S]*"vote"[\s\S]*"reasoning"[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const parsedVote = parsed.vote?.toLowerCase() || '';
            reasoning = parsed.reasoning || reasoning;
            
            // Only accept abstain if it has valid justification
            if (parsedVote === 'abstain') {
              const validAbstentionReasons = [
                'conflict of interest',
                'insufficient information', 
                'outside expertise',
                'outside my expertise',
                'outside my area',
                'cannot objectively evaluate'
              ];
              const hasValidReason = validAbstentionReasons.some(reason => 
                reasoning.toLowerCase().includes(reason)
              );
              if (hasValidReason) {
                vote = 'abstain';
              } else {
                // Invalid abstention - look for approval/rejection signals
                const lowerReasoning = reasoning.toLowerCase();
                if (lowerReasoning.includes('approve') || lowerReasoning.includes('support') || lowerReasoning.includes('beneficial')) {
                  vote = 'approve';
                } else {
                  vote = 'reject';
                  reasoning = `${reasoning} (Abstention without valid justification converted to reject)`;
                }
                console.log(`⚠️ ${exec} attempted invalid abstention - converted to ${vote}`);
              }
            } else if (['approve', 'reject'].includes(parsedVote)) {
              vote = parsedVote;
            }
          } else {
            // Fallback: look for keywords - prioritize approve/reject over abstain
            const lowerResponse = responseText.toLowerCase();
            if (lowerResponse.includes('approve') || lowerResponse.includes('support')) {
              vote = 'approve';
            } else if (lowerResponse.includes('reject') || lowerResponse.includes('oppose') || lowerResponse.includes('against')) {
              vote = 'reject';
            }
            // If neither found, keep default 'reject'
            reasoning = responseText.slice(0, 500);
          }
        } catch (parseError) {
          console.error(`⚠️ Failed to parse ${exec} response:`, parseError);
          reasoning = `${exec} analysis failed - defaulting to reject. Original: ${aiResponse?.response?.slice(0, 200) || 'No response'}`;
          vote = 'reject';
        }

        // Final validation - abstain only with valid reason, otherwise reject
        if (!['approve', 'reject', 'abstain'].includes(vote)) {
          vote = 'reject';
        }

        console.log(`✅ ${exec} voted: ${vote}`);

        // Record the vote
        const { data: voteData, error: voteError } = await supabase.functions.invoke('vote-on-proposal', {
          body: {
            proposal_id,
            executive_name: exec,
            vote,
            reasoning: `[${perspective.title}] ${reasoning}`
          }
        });

        if (voteError) {
          console.error(`❌ Failed to record ${exec} vote:`, voteError);
          errors.push({ executive: exec, error: voteError.message });
        } else {
          voteResults.push({
            executive: exec,
            vote,
            reasoning,
            consensus_reached: voteData?.consensus_reached,
            status: voteData?.status
          });

          // If consensus reached, stop calling more executives
          if (voteData?.consensus_reached) {
            console.log(`🎉 Consensus reached after ${exec} vote: ${voteData.status}`);
            break;
          }
        }

        // Small delay between executive calls to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (execError: any) {
        console.error(`❌ Error processing ${exec}:`, execError);
        errors.push({ executive: exec, error: execError.message });
      }
    }

    // Log completion
    const finalStatus = voteResults.find(v => v.consensus_reached)?.status || 'voting';
    await supabase
      .from('activity_feed')
      .insert({
        type: 'deliberation_complete',
        title: `Executive Deliberation Complete: ${proposal.function_name}`,
        description: `${voteResults.length} executives voted. Status: ${finalStatus}`,
        data: { 
          proposal_id, 
          votes: voteResults.map(v => ({ exec: v.executive, vote: v.vote })),
          final_status: finalStatus
        }
      });

    return new Response(
      JSON.stringify({
        success: true,
        proposal_id,
        function_name: proposal.function_name,
        votes_collected: voteResults.length,
        votes: voteResults,
        errors: errors.length > 0 ? errors : undefined,
        final_status: finalStatus,
        consensus_reached: voteResults.some(v => v.consensus_reached)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Request executive votes error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
