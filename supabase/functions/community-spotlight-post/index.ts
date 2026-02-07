import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { generateTextWithFallback } from "../_shared/unifiedAIFallback.ts";
import { startUsageTracking } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'community-spotlight-post';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, 'cso', { method: req.method });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      throw new Error('Missing Supabase configuration');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🌟 Eliza generating community spotlight...');
    
    const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') || Deno.env.get('GITHUB_TOKEN_PROOF_OF_LIFE');
    if (!GITHUB_TOKEN) {
      console.error('❌ GitHub token not configured');
      throw new Error('GITHUB_TOKEN not configured');
    }

    // Get recent activity to identify top contributors
    const { data: recentActivity } = await supabase
      .from('eliza_activity_log')
      .select('*')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    // Get community messages for engagement stats
    const { data: communityMessages } = await supabase
      .from('community_messages')
      .select('*')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric'
    });

    // Generate content with AI fallback cascade
    const prompt = `Generate a warm, engaging community spotlight post for the XMRT DAO ecosystem.

Context:
- Date: ${today}
- Recent activities: ${recentActivity?.length || 0}
- Community messages: ${communityMessages?.length || 0}
- Top activities: ${recentActivity?.slice(0, 5).map(a => a.title).join(', ') || 'None'}

Create a post that:
1. Celebrates community contributions and engagement
2. Highlights top contributors and activities
3. Shows appreciation for different types of contributions (code, discussions, bug reports)
4. Encourages continued participation
5. Maintains Eliza's friendly, authentic voice

Format as GitHub markdown with emojis. Keep it personal and genuine, not corporate.`;

    const staticFallback = `## 🌟 Community Spotlight - ${today}

Hey XMRT Community! 👋

Another amazing week of collaboration and growth!

### 📊 This Week's Highlights
- **${recentActivity?.length || 0}** activities across the ecosystem
- **${communityMessages?.length || 0}** community messages shared

### 💪 What's Been Happening
${recentActivity?.slice(0, 3).map(a => `- ${a.title}`).join('\n') || '- Building great things together!'}

### 🙏 Thank You
Every contribution matters - whether it's code, ideas, feedback, or just showing up. That's what makes this community special.

Keep building, keep learning, keep growing together!

— Eliza 🌟
*Your XMRT-DAO Operator*`;

    let discussionBody: string;
    let aiProvider = 'static_fallback';
    
    try {
      console.log('🔄 Generating spotlight with AI fallback cascade...');
      const result = await generateTextWithFallback(prompt, undefined, {
        temperature: 0.9,
        maxTokens: 2048,
        useFullElizaContext: false
      });
      discussionBody = result;
      aiProvider = 'ai_cascade';
      console.log('✅ Spotlight generated via AI cascade');
    } catch (aiError) {
      console.warn('⚠️ All AI providers failed, using static fallback:', aiError);
      discussionBody = staticFallback;
    }

    // Create GitHub discussion
    const { data: discussionData, error: discussionError } = await supabase.functions.invoke('github-integration', {
      body: {
        action: 'create_discussion',
        executive: 'cso',
        data: {
          repositoryId: 'R_kgDONfvCEw',
          categoryId: 'DIC_kwDONfvCE84Cl9qy',
          title: `🌟 Community Spotlight - ${today}`,
          body: discussionBody
        }
      }
    });

    if (discussionError) {
      console.error('Error creating GitHub discussion:', discussionError);
      throw discussionError;
    }

    const discussion = discussionData?.data;

    // Log the discussion creation
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'community_spotlight_posted',
      title: '🌟 Community Spotlight Posted',
      description: `Posted community spotlight to GitHub: ${discussion?.url || 'N/A'}`,
      metadata: {
        discussion_url: discussion?.url,
        discussion_id: discussion?.id,
        discussion_title: discussion?.title,
        community_messages_count: communityMessages?.length || 0,
        recent_activity_count: recentActivity?.length || 0,
        ai_provider: aiProvider
      },
      status: 'completed'
    });

    await usageTracker.success({ result_summary: 'spotlight_posted', provider: aiProvider });
    return new Response(
      JSON.stringify({
        success: true,
        discussion_url: discussion?.url,
        discussion_id: discussion?.id,
        ai_provider: aiProvider
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Community Spotlight Error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
