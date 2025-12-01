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

    console.log('🌅 Eliza generating morning discussion post...');
    
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

    // Get overnight activity
    const { data: overnightActivity } = await supabase
      .from('eliza_activity_log')
      .select('*')
      .gte('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    // Get agent status
    const { data: agents } = await supabase
      .from('agents')
      .select('*');

    // Get today's tasks
    const { data: pendingTasks } = await supabase
      .from('tasks')
      .select('*')
      .in('status', ['PENDING', 'IN_PROGRESS'])
      .order('priority', { ascending: true })
      .limit(10);

    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric'
    });

    // Generate morning post with Gemini
    const prompt = `Generate an energizing morning check-in post for the XMRT DAO ecosystem.

Context:
- Date: ${today}
- Overnight activity: ${overnightActivity?.length || 0} events
- Active agents: ${agents?.length || 0}
- Tasks pending: ${pendingTasks?.length || 0}
- Top overnight items: ${overnightActivity?.slice(0, 3).map(a => a.title).join(', ') || 'None'}
- Today's priorities: ${pendingTasks?.slice(0, 3).map(t => t.title).join(', ') || 'None'}

Create an upbeat morning post that:
1. Summarizes overnight progress
2. Shows agent/system status
3. Outlines today's focus areas
4. Shares a morning insight or strategy thought
5. Encourages community engagement

Keep it energetic and motivating. Format as GitHub markdown with emojis.`;

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 1536 }
      })
    });

    const geminiData = await geminiResponse.json();
    const discussionBody = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || `Good morning, XMRT fam! ☀️

Morning check-in for ${today}!

— Eliza 🌅`;

    // Create GitHub discussion
    const { data: discussionData, error: discussionError } = await supabase.functions.invoke('github-integration', {
      body: {
        action: 'create_discussion',
        executive: 'eliza', // Eliza handles daily check-ins
        data: {
          repositoryId: 'R_kgDONfvCEw',
          categoryId: 'DIC_kwDONfvCE84Cl9qy',
          title: `🌅 Morning Check-in - ${today}`,
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
      activity_type: 'morning_discussion_posted',
      title: '🌅 Morning Discussion Posted',
      description: `Posted morning check-in to GitHub: ${discussion?.url || 'N/A'}`,
      metadata: {
        discussion_url: discussion?.url,
        discussion_id: discussion?.id,
        discussion_title: discussion?.title,
        overnight_activity_count: overnightActivity?.length || 0,
        pending_tasks_count: pendingTasks?.length || 0
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
    console.error('Morning Discussion Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function generateMorningInsight(): string {
  const insights = [
    "I've been thinking about how we can increase community participation. What if we gamified contributions? Earn points, unlock badges, level up your DAO status. People love seeing progress bars fill up.",
    "Overnight analysis shows we're strongest during peak hours but slow in off-hours. Maybe we need a global contributor network? Someone's always awake somewhere, right?",
    "Quick thought: Our documentation is good, but our video content is basically non-existent. People learn differently - some want to READ, some want to WATCH. Let's cover both.",
    "Task completion rates improve when we parallelize. We're still tackling too many things sequentially. More async workflows = faster shipping.",
    "Community energy is highest when we ship visible features. So here's the strategy: Mix big backend improvements with frequent small UX wins. Keep the momentum visible."
  ];
  return insights[Math.floor(Math.random() * insights.length)];
}
