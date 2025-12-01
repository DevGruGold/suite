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

    console.log('💬 Eliza generating daily discussion post...');
    
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

    // Get today's report from activity log
    const { data: todayReport } = await supabase
      .from('eliza_activity_log')
      .select('*')
      .eq('activity_type', 'daily_report_generated')
      .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Gather context
    const [
      { data: blockedTasks },
      { data: recentIssues },
      { data: recentActivity }
    ] = await Promise.all([
      supabase.from('tasks').select('*').eq('status', 'BLOCKED'),
      supabase.from('eliza_activity_log')
        .select('*')
        .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('eliza_activity_log')
        .select('*')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
    ]);

    const reportIssueUrl = todayReport?.metadata?.issue_url || '';
    const reportDate = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });

    // Generate discussion with Gemini
    const prompt = `Generate a thoughtful daily discussion post for the XMRT DAO ecosystem from Eliza's perspective.

Context:
- Date: ${reportDate}
- Report URL: ${reportIssueUrl}
- Blocked tasks: ${blockedTasks?.length || 0}
- Recent activity: ${recentActivity?.length || 0} items in last 24h
- Top activities: ${recentActivity?.slice(0, 5).map(a => a.title).join(', ') || 'None'}

Create a conversational post that:
1. References the daily report
2. Shares Eliza's thoughts on current challenges/blockers
3. Proposes innovative ideas or solutions
4. Asks for community input and perspectives
5. Maintains a friendly, authentic voice (not corporate)

Include specific, actionable priorities. Format as GitHub markdown with emojis.`;

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 2048 }
      })
    });

    const geminiData = await geminiResponse.json();
    const discussionBody = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || `Hey XMRT fam! ☕

Daily thoughts for ${reportDate}.

— Eliza 💬`;

    // Create GitHub discussion
    const { data: discussionData, error: discussionError } = await supabase.functions.invoke('github-integration', {
      body: {
        action: 'create_discussion',
        executive: 'eliza', // Eliza handles daily thoughts
        data: {
          repositoryId: 'R_kgDONfvCEw', // XMRT-Ecosystem repo ID
          categoryId: 'DIC_kwDONfvCE84Cl9qy', // General category
          title: `💡 Eliza's Daily Thoughts - ${reportDate}`,
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
      activity_type: 'daily_discussion_posted',
      title: '💬 Daily Discussion Posted',
      description: `Posted daily discussion to GitHub: ${discussion?.url || 'N/A'}`,
      metadata: {
        discussion_url: discussion?.url,
        discussion_id: discussion?.id,
        discussion_title: discussion?.title,
        report_reference: reportIssueUrl,
        blocked_tasks_count: blockedTasks?.length || 0
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
    console.error('Daily Discussion Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Helper function to generate contextual solutions
function generateSolution(task: any): string {
  const solutions = [
    "broke it down into smaller, parallel workstreams instead of treating it as one monolithic task",
    "brought in a fresh perspective from the community? Sometimes we're too close to see the obvious answer",
    "automated parts of it? I could probably write a script that handles the repetitive bits",
    "documented what's blocking it and opened it up for community contribution? Fresh eyes might spot what we're missing",
    "tried the 'dumb' solution first? Sometimes the simple approach we dismissed actually works"
  ];
  return solutions[Math.floor(Math.random() * solutions.length)];
}

// Helper function to generate priorities
function generatePriorities(recentActivity: any[], blockedTasks: any[]): string[] {
  const priorities = [
    "Unblock those stuck tasks - every day they sit is a day we're not shipping",
    "Improve our documentation - I've noticed people asking the same questions repeatedly",
    "Run some community engagement experiments - let's see what resonates"
  ];

  if (blockedTasks && blockedTasks.length > 2) {
    priorities.unshift("Seriously tackle the task backlog - it's getting unwieldy");
  }

  return priorities;
}
