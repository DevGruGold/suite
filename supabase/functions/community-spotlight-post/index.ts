import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      throw new Error('Missing Supabase configuration');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🌟 Eliza generating community spotlight...');
    
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY not configured');
      throw new Error('GEMINI_API_KEY not configured');
    }
    
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

    // Generate content with Gemini
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

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 2048 }
      })
    });

    const geminiData = await geminiResponse.json();
    const discussionBody = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || `## 🌟 Community Spotlight - ${today}

Generated community spotlight for ${today}.

— Eliza 🌟`;

    // Create GitHub discussion
    const { data: discussionData, error: discussionError } = await supabase.functions.invoke('github-integration', {
      body: {
        action: 'create_discussion',
        executive: 'cso', // CSO handles community engagement
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

    // ✅ Extract discussion data from corrected response structure
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
        recent_activity_count: recentActivity?.length || 0
      },
      status: 'completed'
    });

    return new Response(
      JSON.stringify({
        success: true,
        discussion_url: discussion?.url,
        discussion_id: discussion?.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Community Spotlight Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function generateTopTopics(messages: any[]): string {
  const topics = messages
    .filter((m: any) => m.topics && m.topics.length > 0)
    .flatMap((m: any) => m.topics);
  
  if (topics.length === 0) return 'Various discussions';
  
  const topicCounts = topics.reduce((acc: any, topic: string) => {
    acc[topic] = (acc[topic] || 0) + 1;
    return acc;
  }, {});
  
  const sorted = Object.entries(topicCounts)
    .sort(([, a]: any, [, b]: any) => b - a)
    .slice(0, 3)
    .map(([topic]) => topic);
  
  return sorted.join(', ') || 'Various topics';
}

function generateCodeContributions(activity: any[]): string {
  const codeActivity = activity.filter((a: any) => 
    a.activity_type?.includes('code') || 
    a.activity_type?.includes('task') ||
    a.title?.toLowerCase().includes('fix') ||
    a.title?.toLowerCase().includes('implement')
  );
  
  return codeActivity.length > 0
    ? codeActivity.slice(0, 3).map(a => `- ${a.title}`).join('\n')
    : '- 🚀 Shipping features and improvements daily';
}

function generateIdeaContributions(activity: any[]): string {
  const ideaActivity = activity.filter((a: any) => 
    a.activity_type?.includes('discussion') || 
    a.title?.toLowerCase().includes('idea') ||
    a.title?.toLowerCase().includes('proposal')
  );
  
  return ideaActivity.length > 0
    ? ideaActivity.slice(0, 3).map(a => `- ${a.title}`).join('\n')
    : '- 💡 Great ideas flowing in discussions';
}

function generateQualityContributions(activity: any[]): string {
  return `- 🔍 Continuous testing and bug reporting
- 📝 Documentation improvements
- ✨ Code quality enhancements`;
}

function generateImpactMetrics(activity: any[]): string {
  const completedCount = activity.filter((a: any) => a.status === 'completed').length;
  
  return `- ✅ **${completedCount}** activities completed through community effort
- 🎯 Multiple workflows automated through suggestions
- 📈 System reliability improved through bug reports
- 🌍 Ecosystem reach expanded through sharing

**Bottom line:** Community contributions directly translated to shipped improvements. That's the power of collective effort.`;
}

function generateAppreciation(): string {
  const messages = [
    "I want to take a moment to recognize everyone who's contributed this week. Whether you wrote one line of code or one comment in a discussion, you moved us forward. In open source, there are no small contributions - every bit compounds.",
    "This community has something special: genuine collaboration without ego. People help each other, share knowledge freely, and celebrate wins together. That culture is precious and I'm grateful we're building it intentionally.",
    "Looking at this week's activity, I'm struck by the diversity of contributions. Code, ideas, feedback, encouragement - it all matters. Thank you for showing up and building together.",
    "You know what's amazing? The energy here. People aren't just working ON the project, they're working WITH each other. That collaborative spirit? That's how we'll build something truly remarkable.",
    "Every week I see more examples of community members helping each other, sharing insights, and lifting each other up. That's not just good vibes - that's sustainable growth. Thank you for being part of this."
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}
