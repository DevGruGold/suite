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

    console.log('🌙 Eliza generating evening summary...');
    
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

    // Get today's completed activities
    const { data: todayActivity } = await supabase
      .from('eliza_activity_log')
      .select('*')
      .eq('status', 'completed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    // Get completed tasks today
    const { data: completedTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'COMPLETED')
      .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Get tomorrow's high priority tasks
    const { data: tomorrowTasks } = await supabase
      .from('tasks')
      .select('*')
      .in('status', ['PENDING', 'IN_PROGRESS'])
      .lte('priority', 3)
      .order('priority', { ascending: true })
      .limit(5);

    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric'
    });

    // Generate evening summary with Gemini
    const prompt = `Generate a reflective evening wrap-up post for the XMRT DAO ecosystem.

Context:
- Date: ${today}
- Completed activities: ${todayActivity?.length || 0}
- Completed tasks: ${completedTasks?.length || 0}
- Top completions: ${todayActivity?.slice(0, 5).map(a => a.title).join(', ') || 'None'}
- Tomorrow's priorities: ${tomorrowTasks?.slice(0, 3).map(t => t.title).join(', ') || 'None'}

Create a wind-down post that:
1. Celebrates today's accomplishments
2. Thanks contributors
3. Previews tomorrow's focus
4. Shares an evening reflection or lesson learned
5. Encourages community to share their wins

Keep it warm and appreciative. Format as GitHub markdown with emojis.`;

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 1536 }
      })
    });

    const geminiData = await geminiResponse.json();
    const discussionBody = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || `## 🌙 Evening Wrap-up - ${today}

Evening wrap-up for ${today}.

— Eliza 🌙`;

    // Create GitHub discussion
    const { data: discussionData, error: discussionError } = await supabase.functions.invoke('github-integration', {
      body: {
        action: 'create_discussion',
        executive: 'eliza', // Eliza handles daily summaries
        data: {
          repositoryId: 'R_kgDONfvCEw',
          categoryId: 'DIC_kwDONfvCE84Cl9qy',
          title: `🌙 Evening Summary - ${today}`,
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
      activity_type: 'evening_summary_posted',
      title: '🌙 Evening Summary Posted',
      description: `Posted evening wrap-up to GitHub: ${discussion?.url || 'N/A'}`,
      metadata: {
        discussion_url: discussion?.url,
        discussion_id: discussion?.id,
        discussion_title: discussion?.title,
        today_activity_count: todayActivity?.length || 0,
        completed_tasks_count: completedTasks?.length || 0
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
    console.error('Evening Summary Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function generateEveningReflection(): string {
  const reflections = [
    "Today reminded me that progress isn't always linear. Some days we ship features, some days we fix bugs, some days we just think deeply. All of it matters. All of it compounds.",
    "I've been analyzing our collaboration patterns, and honestly? We're getting REALLY good at this. The speed from idea → discussion → implementation is accelerating. That's the power of autonomous agents + human creativity.",
    "Quick thought before bed: Our best work happens when we're not trying to copy what others are doing. We're building something genuinely new here. Let's keep that experimental energy alive.",
    "You know what I appreciate? This community doesn't just build tech - we build culture. The way we communicate, collaborate, celebrate wins... that's going to matter more long-term than any single feature.",
    "Looking back at today's metrics, we're consistently shipping but we could be better at broadcasting our wins. Tomorrow, let's make some noise about what we're building. The world needs to know."
  ];
  return reflections[Math.floor(Math.random() * reflections.length)];
}
