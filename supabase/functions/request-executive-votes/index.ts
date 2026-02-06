import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callAIWithFallback } from '../_shared/unifiedAIFallback.ts';

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
  },
  COO: {
    title: 'Chief Operations Officer',
    focus: 'Operational efficiency, task pipeline impact, agent workload, execution feasibility',
    prompt: 'Analyze this proposal from an operations perspective. Consider: How will this impact the task pipeline? What is the execution complexity? Does it integrate well with existing agents and workflows?'
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

    const executives = ['CSO', 'CTO', 'CIO', 'CAO', 'COO'];
    const voteResults: any[] = [];
    const errors: any[] = [];

    // Call each executive to analyze and vote
    for (const exec of executives) {
      try {
        console.log(`📊 Requesting vote from ${exec}...`);

        const perspective = executivePerspectives[exec as keyof typeof executivePerspectives];

        // Build analysis prompt with STRICT JSON-only requirement
        const analysisPrompt = `🚨 RESPOND WITH JSON ONLY - NO OTHER TEXT 🚨

You are the ${perspective.title} (${exec}) of XMRT DAO.

PROPOSAL TO EVALUATE:
- Function: ${proposal.function_name}
- Description: ${proposal.description}
- Rationale: ${proposal.rationale}
- Category: ${proposal.category || 'general'}
- Use Cases: ${Array.isArray(proposal.use_cases) ? proposal.use_cases.join(', ') : proposal.use_cases || 'Not specified'}

YOUR TASK: Analyze from your ${perspective.focus} perspective and VOTE.

VOTING RULES:
- You MUST vote "approve" or "reject" with 2-3 sentence reasoning
- Abstain ONLY for: conflict of interest, insufficient info, outside expertise
- If none apply, you MUST decide approve/reject

⚠️ CRITICAL: Output ONLY this JSON, nothing else:
{"vote": "approve", "reasoning": "Your 2-3 sentence justification from ${perspective.focus} perspective"}

OR:
{"vote": "reject", "reasoning": "Your 2-3 sentence justification from ${perspective.focus} perspective"}

⛔ DO NOT output any text before the JSON
⛔ DO NOT explain your thinking process
⛔ DO NOT use markdown formatting
✅ ONLY output the raw JSON object`;

        // Call lovable-chat to get executive's analysis using correct message format
        // Call unified AI fallback to get executive's analysis
        // This fails over to Gemini/Vertex/others if primary provider is out of tokens
        console.log(`🧠 Calling AI for ${exec} (Fallback Enabled)...`);

        let aiResult;
        try {
          // Determine preferred provider based on executive persona
          // CSO/COO -> Gemini (Strategy/Ops)
          // CTO -> DeepSeek (Tech/Code)
          // CIO -> Vertex AI (Innovation/Vision)
          // CAO -> Lovable/Claude (Analytics/Data)
          const providerMap: Record<string, 'gemini' | 'deepseek' | 'vertexai' | 'lovable' | 'kimi'> = {
            'CSO': 'gemini',
            'CTO': 'deepseek',
            'CIO': 'vertexai',
            'CAO': 'gemini',
            'COO': 'gemini'
          };

          const preferredProvider = providerMap[exec] || 'gemini';

          aiResult = await callAIWithFallback([
            { role: 'user', content: analysisPrompt }
          ], {
            preferProvider: preferredProvider,
            userContext: {
              executiveRole: exec,
              mode: 'governance_analysis',
              governanceTask: 'proposal_analysis',
              proposalId: proposal_id
            },
            executiveName: perspective.title, // Pass full title for specialized system prompt
            temperature: 0.4, // Lower temperature for more consistent JSON
            maxTokens: 1000
          });

        } catch (err) {
          console.error(`❌ All AI providers failed for ${exec}:`, err);
          const errorMessage = err instanceof Error ? err.message : String(err);
          errors.push({ executive: exec, error: errorMessage });
          continue;
        }

        // Standardize response format
        const responseText = typeof aiResult === 'string' ? aiResult : (aiResult.content || aiResult.message?.content || '');

        // Validate response exists
        if (!responseText) {
          console.error(`❌ ${exec} returned empty response`);
          errors.push({ executive: exec, error: 'Empty response from AI' });
          continue;
        }

        // Parse the AI response to extract vote and reasoning
        // Default to REJECT (accountability) instead of abstain (avoidance)
        let vote = 'reject';
        let reasoning = `${exec} could not complete analysis - defaulting to reject for accountability.`;

        try {
          console.log(`📝 ${exec} raw response (first 500 chars): ${responseText.slice(0, 500)}`);

          // Try multiple JSON extraction strategies
          let parsed = null;

          // Strategy 1: Look for JSON object anywhere in response
          const jsonMatch = responseText.match(/\{\s*"vote"\s*:\s*"[^"]+"\s*,\s*"reasoning"\s*:\s*"[^"]*"\s*\}/);
          if (jsonMatch) {
            try {
              parsed = JSON.parse(jsonMatch[0]);
            } catch (e) {
              console.log(`⚠️ JSON match found but parse failed: ${jsonMatch[0].slice(0, 100)}`);
            }
          }

          // Strategy 2: Try to find JSON with more flexible regex (handles escaped quotes)
          if (!parsed) {
            const flexMatch = responseText.match(/\{[\s\S]*?"vote"[\s\S]*?"reasoning"[\s\S]*?\}/);
            if (flexMatch) {
              try {
                // Clean up common issues
                const cleaned = flexMatch[0].replace(/\n/g, ' ').replace(/\r/g, '');
                parsed = JSON.parse(cleaned);
              } catch (e) {
                console.log(`⚠️ Flexible match parse failed`);
              }
            }
          }

          // Strategy 3: Extract vote and reasoning separately using regex
          if (!parsed) {
            const voteMatch = responseText.match(/"vote"\s*:\s*"(approve|reject|abstain)"/i);
            const reasoningMatch = responseText.match(/"reasoning"\s*:\s*"([^"]+)"/);
            if (voteMatch) {
              parsed = {
                vote: voteMatch[1].toLowerCase(),
                reasoning: reasoningMatch ? reasoningMatch[1] : 'Reasoning extracted from response'
              };
            }
          }

          if (parsed && parsed.vote) {
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
            // Fallback: look for vote keywords in text with context
            const lowerResponse = responseText.toLowerCase();

            // Look for explicit vote statements
            if (lowerResponse.includes('i vote to approve') ||
              lowerResponse.includes('my vote is approve') ||
              lowerResponse.includes('vote: approve') ||
              lowerResponse.includes('"approve"')) {
              vote = 'approve';
            } else if (lowerResponse.includes('i vote to reject') ||
              lowerResponse.includes('my vote is reject') ||
              lowerResponse.includes('vote: reject') ||
              lowerResponse.includes('"reject"')) {
              vote = 'reject';
            } else if (lowerResponse.includes('approve') && !lowerResponse.includes('reject')) {
              vote = 'approve';
            } else if (lowerResponse.includes('reject') || lowerResponse.includes('oppose')) {
              vote = 'reject';
            }
            // Extract meaningful reasoning from the text (increased limit)
            reasoning = responseText.slice(0, 1500);
          }
        } catch (parseError) {
          console.error(`⚠️ Failed to parse ${exec} response:`, parseError);
          reasoning = `${exec} analysis failed - defaulting to reject. Original: ${responseText.slice(0, 200) || 'No response'}`;
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
