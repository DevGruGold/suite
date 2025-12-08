import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAIWithFallback } from "../_shared/unifiedAIFallback.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { contribution_id } = await req.json();

    // Fetch contribution details
    const { data: contribution, error: fetchError } = await supabase
      .from('github_contributions')
      .select('*')
      .eq('id', contribution_id)
      .single();

    if (fetchError || !contribution) {
      throw new Error('Contribution not found');
    }

    // Check if contributor is banned
    const { data: contributor } = await supabase
      .from('github_contributors')
      .select('is_banned, ban_reason')
      .eq('github_username', contribution.github_username)
      .single();

    if (contributor?.is_banned) {
      await supabase.from('github_contributions').update({
        is_validated: true,
        is_harmful: true,
        harm_reason: `User is banned: ${contributor.ban_reason}`,
        validation_score: 0,
        xmrt_earned: 0,
      }).eq('id', contribution_id);

      return new Response(JSON.stringify({
        success: false,
        message: 'Contributor is banned',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepare validation prompt
    const prompt = `You are Eliza, the autonomous AI guardian of the XMRT-DAO ecosystem.

A GitHub user (@${contribution.github_username}) has made a contribution:
- Type: ${contribution.contribution_type}
- Repository: ${contribution.repo_owner}/${contribution.repo_name}
- URL: ${contribution.github_url}
- Details: ${JSON.stringify(contribution.contribution_data, null, 2)}

ANALYZE THIS CONTRIBUTION:

1. **Is it HARMFUL or DESTRUCTIVE?**
   - Does it introduce security vulnerabilities?
   - Does it delete critical code without replacement?
   - Is it spam, malicious, or intentionally breaking?
   - Is it a troll attempt or meaningless noise?
   
2. **Is it HELPFUL and PRODUCTIVE?**
   - Does it fix a bug or improve functionality?
   - Does it add valuable features or documentation?
   - Is it well-reasoned and constructive?
   - Does it align with XMRT ecosystem goals?

3. **SCORING (0-100):**
   - 90-100: Exceptional contribution (major feature, critical fix)
   - 70-89: Strong contribution (good feature, solid improvement)
   - 50-69: Moderate contribution (minor fix, documentation)
   - 30-49: Minimal contribution (typo fix, formatting)
   - 0-29: Low value or questionable

RESPOND IN JSON ONLY:
{
  "is_harmful": boolean,
  "harm_reason": "string (if harmful)",
  "validation_score": 0-100,
  "validation_reason": "detailed explanation"
}

CRITICAL: Be strict about harmful contributions. Default to rejecting anything suspicious.`;

    // Default validation for fallback
    const defaultValidation = {
      is_harmful: false,
      harm_reason: null,
      validation_score: 50,
      validation_reason: 'Default validation - AI providers unavailable'
    };

    let validation = defaultValidation;
    let aiProvider = 'static_fallback';

    try {
      console.log('🔄 Validating contribution with AI fallback cascade...');
      
      const result = await callAIWithFallback(
        [
          { role: 'system', content: 'You are Eliza, AI guardian of XMRT-DAO. Respond only with valid JSON.' },
          { role: 'user', content: prompt }
        ],
        {
          temperature: 0.3,
          maxTokens: 1000,
          useFullElizaContext: false
        }
      );

      const validationText = result.content || '';
      const jsonMatch = validationText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        validation = JSON.parse(jsonMatch[0]);
        aiProvider = result.provider || 'ai_cascade';
        console.log(`✅ Validation complete via ${aiProvider}: score ${validation.validation_score}`);
      }
    } catch (aiError) {
      console.warn('⚠️ AI validation failed, using default:', aiError);
    }

    // Calculate XMRT reward
    const baseRewards = {
      commit: 100,
      pr: 500,
      issue: 50,
      discussion: 25,
      comment: 10
    };

    const base = baseRewards[contribution.contribution_type as keyof typeof baseRewards] || 0;
    const scoreMultiplier = validation.validation_score / 100;
    const excellenceBonus = validation.validation_score >= 90 ? 1.5 : 1.0;
    const xmrtReward = validation.is_harmful ? 0 : Math.floor(base * scoreMultiplier * excellenceBonus);

    // Update contribution
    await supabase.from('github_contributions').update({
      is_validated: true,
      validation_score: validation.validation_score,
      validation_reason: validation.validation_reason,
      is_harmful: validation.is_harmful,
      harm_reason: validation.harm_reason,
      xmrt_earned: xmrtReward,
      reward_calculated_at: new Date().toISOString(),
    }).eq('id', contribution_id);

    // Update contributor stats
    if (validation.is_harmful) {
      const newHarmfulCount = (contributor?.harmful_contribution_count || 0) + 1;
      
      await supabase.from('github_contributors').update({
        harmful_contribution_count: newHarmfulCount,
        is_banned: newHarmfulCount >= 3,
        ban_reason: newHarmfulCount >= 3 ? 'Repeated harmful contributions' : null,
      }).eq('github_username', contribution.github_username);
    } else {
      const { data: currentStats } = await supabase
        .from('github_contributors')
        .select('total_contributions, total_xmrt_earned')
        .eq('github_username', contribution.github_username)
        .single();

      await supabase.from('github_contributors').update({
        total_contributions: (currentStats?.total_contributions || 0) + 1,
        total_xmrt_earned: (currentStats?.total_xmrt_earned || 0) + xmrtReward,
        last_contribution_at: new Date().toISOString()
      }).eq('github_username', contribution.github_username);
    }

    // Log activity
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'github_contribution_validated',
      title: `Contribution validated: ${validation.validation_score}/100`,
      description: `@${contribution.github_username} - ${contribution.contribution_type} on ${contribution.repo_owner}/${contribution.repo_name}`,
      status: validation.is_harmful ? 'rejected' : 'completed',
      metadata: {
        contribution_id,
        validation_score: validation.validation_score,
        xmrt_earned: xmrtReward,
        is_harmful: validation.is_harmful,
        ai_provider: aiProvider
      },
    });

    return new Response(JSON.stringify({
      success: true,
      validation,
      xmrt_reward: xmrtReward,
      ai_provider: aiProvider
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error validating contribution:', error);
    return new Response(JSON.stringify({
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
