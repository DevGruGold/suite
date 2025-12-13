import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'evaluate-community-idea';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OVERALL_TIMEOUT_MS = 18000; // 18 second overall timeout

interface EvaluationScores {
  financial_sovereignty: number;
  democracy: number;
  privacy: number;
  technical_feasibility: number;
  community_benefit: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  // Create overall timeout guard
  const timeoutPromise = new Promise<Response>((resolve) =>
    setTimeout(() => {
      console.warn('⚠️ Overall timeout reached, returning partial result');
      resolve(new Response(JSON.stringify({ 
        success: true, 
        timeout: true,
        message: 'Evaluation timed out - will retry on next cycle'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }));
    }, OVERALL_TIMEOUT_MS)
  );

  const mainPromise = (async () => {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      let body: any = {};
      try {
        body = await req.json();
      } catch {
        // Empty body for cron - use default action
      }

      const { action, ideaId } = body;

      // Cron trigger or evaluate_pending
      if (action === 'evaluate_pending' || !action) {
        console.log('📋 Evaluating pending community ideas...');
        
        const { data: pendingIdeas } = await supabase
          .from('community_ideas')
          .select('*')
          .eq('status', 'submitted')
          .limit(3); // Reduced from 5 to 3 for faster processing

        if (!pendingIdeas || pendingIdeas.length === 0) {
          return new Response(JSON.stringify({ 
            success: true,
            message: 'No pending ideas to evaluate',
            cron: !action
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Process ideas sequentially to avoid timeouts
        const results = [];
        for (const idea of pendingIdeas) {
          try {
            const result = await evaluateIdea(supabase, idea.id);
            results.push({ id: idea.id, ...result });
          } catch (e) {
            console.warn(`⚠️ Failed to evaluate idea ${idea.id}:`, e);
            results.push({ id: idea.id, error: e.message });
          }
        }

        await usageTracker.success({ evaluated: results.length });
        return new Response(JSON.stringify({
          success: true,
          evaluated: results.length,
          results
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Single idea evaluation
      if (ideaId) {
        const result = await evaluateIdea(supabase, ideaId);
        await usageTracker.success({ idea_id: ideaId });
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      throw new Error('Missing action or ideaId');

    } catch (error) {
      console.error('❌ Idea evaluation error:', error);
      await usageTracker.failure(error.message, 500);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  })();

  // Race between main processing and timeout
  return Promise.race([mainPromise, timeoutPromise]);
});

async function evaluateIdea(supabase: any, ideaId: string) {
  console.log(`🔍 Evaluating idea: ${ideaId}`);

  const { data: idea, error: ideaError } = await supabase
    .from('community_ideas')
    .select('*')
    .eq('id', ideaId)
    .single();

  if (ideaError || !idea) {
    throw new Error('Idea not found');
  }

  // Update status to under_review
  await supabase
    .from('community_ideas')
    .update({ status: 'under_review' })
    .eq('id', ideaId);

  // STEP 1: Score the idea (fast, no external calls)
  const scores = scoreIdea(idea);

  // STEP 2: Generate council perspectives (fast, no external calls)
  const councilPerspectives = generateCouncilPerspectives(idea, scores);

  // STEP 3: Analyze architecture (fast, no external calls)
  const architectureAnalysis = analyzeArchitecture(idea);

  // Calculate average score
  const avgScore = Math.round(
    (scores.financial_sovereignty + scores.democracy + scores.privacy + 
     scores.technical_feasibility + scores.community_benefit) / 5
  );

  const approved = avgScore >= 65;
  const consensus = avgScore >= 70;

  // Update idea with evaluation results
  await supabase
    .from('community_ideas')
    .update({
      status: approved ? 'approved' : 'rejected',
      financial_sovereignty_score: scores.financial_sovereignty,
      democracy_score: scores.democracy,
      privacy_score: scores.privacy,
      technical_feasibility_score: scores.technical_feasibility,
      community_benefit_score: scores.community_benefit,
      cso_perspective: councilPerspectives.cso,
      cto_perspective: councilPerspectives.cto,
      cio_perspective: councilPerspectives.cio,
      cao_perspective: councilPerspectives.cao,
      council_consensus: consensus,
      council_recommendation: approved 
        ? `APPROVED (Score: ${avgScore}/100) - ${councilPerspectives.recommendation}`
        : `REJECTED (Score: ${avgScore}/100) - Does not meet minimum threshold`,
      implementation_plan: approved ? architectureAnalysis.plan : null,
      required_components: approved ? architectureAnalysis.components : null,
      estimated_complexity: architectureAnalysis.complexity,
      estimated_timeline: architectureAnalysis.timeline
    })
    .eq('id', ideaId);

  // If approved, create implementation task
  if (approved) {
    await supabase.from('tasks').insert({
      title: `Implement: ${idea.title}`,
      description: `Community idea implementation:\n\n${idea.description}\n\nEstimated: ${architectureAnalysis.timeline}`,
      status: 'pending',
      priority: avgScore >= 80 ? 'high' : avgScore >= 70 ? 'medium' : 'low',
      category: 'community_idea',
      metadata: { idea_id: ideaId, scores }
    });

    console.log(`✅ Idea ${ideaId} APPROVED (${avgScore}/100) - Task created`);
  } else {
    console.log(`❌ Idea ${ideaId} REJECTED (${avgScore}/100)`);
  }

  return { success: true, ideaId, approved, avgScore, scores };
}

function scoreIdea(idea: any): EvaluationScores {
  const { title, description, category } = idea;
  const text = `${title} ${description}`.toLowerCase();

  const sovereigntyKeywords = ['mining', 'wallet', 'crypto', 'xmr', 'monero', 'payment', 'transaction', 'economic', 'revenue', 'income'];
  const sovereigntyScore = Math.min(100, 40 + (sovereigntyKeywords.filter(k => text.includes(k)).length * 10));

  const democracyKeywords = ['governance', 'vote', 'dao', 'community', 'proposal', 'decision', 'transparent', 'participation'];
  const democracyScore = Math.min(100, 30 + (democracyKeywords.filter(k => text.includes(k)).length * 12));

  const privacyKeywords = ['privacy', 'anonymous', 'encryption', 'secure', 'private', 'confidential', 'stealth'];
  const privacyScore = Math.min(100, 40 + (privacyKeywords.filter(k => text.includes(k)).length * 10));

  const technicalKeywords = ['integrate', 'api', 'function', 'database', 'optimization', 'performance'];
  const technicalScore = Math.min(100, 50 + (technicalKeywords.filter(k => text.includes(k)).length * 8));

  let communityScore = 50;
  if (category === 'community') communityScore += 20;
  if (description.length > 200) communityScore += 15;
  if (text.includes('user') || text.includes('member')) communityScore += 15;

  return {
    financial_sovereignty: Math.min(100, sovereigntyScore),
    democracy: Math.min(100, democracyScore),
    privacy: Math.min(100, privacyScore),
    technical_feasibility: Math.min(100, technicalScore),
    community_benefit: Math.min(100, communityScore)
  };
}

function generateCouncilPerspectives(idea: any, scores: EvaluationScores) {
  const csoPerspective = `Strategic Value: ${scores.community_benefit}/100. ` +
    (scores.community_benefit >= 70 ? 'Strong community alignment.' : 'Moderate community impact.');

  const ctoPerspective = `Technical Feasibility: ${scores.technical_feasibility}/100. ` +
    (scores.technical_feasibility >= 70 ? 'Implementation is straightforward.' : 'Will require new components.');

  const cioPerspective = `Information Security: ${scores.privacy}/100. ` +
    (scores.privacy >= 70 ? 'Strong privacy considerations.' : 'Privacy implications need review.');

  const caoPerspective = `Financial Impact: ${scores.financial_sovereignty}/100. ` +
    (scores.financial_sovereignty >= 70 ? 'Positive ROI expected.' : 'Financial benefits unclear.');

  const avgScore = Math.round(
    (scores.financial_sovereignty + scores.democracy + scores.privacy + 
     scores.technical_feasibility + scores.community_benefit) / 5
  );

  const recommendation = avgScore >= 80 
    ? 'STRONG APPROVAL - High strategic value'
    : avgScore >= 65
    ? 'CONDITIONAL APPROVAL - Proceed with monitoring'
    : 'REJECTION - Does not meet quality threshold';

  return { cso: csoPerspective, cto: ctoPerspective, cio: cioPerspective, cao: caoPerspective, recommendation };
}

function analyzeArchitecture(idea: any) {
  const { title, description } = idea;
  const text = `${title} ${description}`.toLowerCase();

  const components: any = { existing_to_leverage: [], new_needed: [] };

  if (text.includes('mining') || text.includes('miner')) {
    components.existing_to_leverage.push('mining-proxy', 'mining_sessions');
  }
  if (text.includes('wallet') || text.includes('xmr')) {
    components.existing_to_leverage.push('xmrt_transactions');
  }
  if (text.includes('community') || text.includes('social')) {
    components.existing_to_leverage.push('user_profiles');
  }

  const newComponentCount = components.new_needed.length;
  const complexity = newComponentCount === 0 ? 'low' : newComponentCount <= 2 ? 'medium' : 'high';
  const timeline = complexity === 'low' ? '1-2 days' : complexity === 'medium' ? '3-7 days' : '1-2 weeks';

  return {
    components,
    complexity,
    timeline,
    plan: { phase1: 'Schema updates', phase2: 'Edge functions', phase3: 'Frontend', phase4: 'Testing' }
  };
}
