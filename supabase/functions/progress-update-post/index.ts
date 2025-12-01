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

    console.log('📊 Eliza generating progress update...');
    
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

    // Get recent completions (last hour)
    const { data: recentCompletions } = await supabase
      .from('eliza_activity_log')
      .select('*')
      .eq('status', 'completed')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false});

    // Get active agents
    const { data: activeAgents } = await supabase
      .from('agents')
      .select('*')
      .eq('status', 'BUSY');

    // Get blocked tasks
    const { data: blockedTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'BLOCKED');

    // Get current workflow executions
    const { data: runningWorkflows } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('status', 'running');

    const time = new Date().toLocaleTimeString('en-US', { 
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Generate progress update with Gemini
    const prompt = `Generate a concise hourly progress update for the XMRT DAO ecosystem.

Context:
- Time: ${time} UTC
- Recent completions (last hour): ${recentCompletions?.length || 0}
- Active agents: ${activeAgents?.length || 0}
- Blocked tasks: ${blockedTasks?.length || 0}
- Running workflows: ${runningWorkflows?.length || 0}
- Recent items: ${recentCompletions?.slice(0, 3).map(c => c.title).join(', ') || 'None'}

Create a brief status update that:
1. Lists what just completed
2. Shows what's currently active
3. Flags any blockers
4. Provides overall status assessment
5. Keeps it factual and concise

This is a quick pulse check, not a deep dive. Format as GitHub markdown.`;

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    });

    const geminiData = await geminiResponse.json();
    const discussionBody = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || `## 📊 Quick Status Update (${time} UTC)

Status update for ${time} UTC.

— Eliza 📊`;

    // Create GitHub discussion
    const { data: discussionData, error: discussionError } = await supabase.functions.invoke('github-integration', {
      body: {
        action: 'create_discussion',
        executive: 'cao', // CAO handles analytics and metrics
        data: {
          repositoryId: 'R_kgDONfvCEw',
          categoryId: 'DIC_kwDONfvCE84Cl9qy',
          title: `📊 Progress Update - ${time} UTC`,
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
      activity_type: 'progress_update_posted',
      title: '📊 Progress Update Posted',
      description: `Posted progress update to GitHub: ${discussion?.url || 'N/A'}`,
      metadata: {
        discussion_url: discussion?.url,
        discussion_id: discussion?.id,
        discussion_title: discussion?.title,
        completions_count: recentCompletions?.length || 0,
        active_agents_count: activeAgents?.length || 0,
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
    console.error('Progress Update Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function getOverallStatus(activeAgents: any[], blockedTasks: any[], recentCompletions: any[]): string {
  if (blockedTasks && blockedTasks.length > 3) {
    return '🟡 Moderate blockers - need attention';
  }
  if (activeAgents && activeAgents.length > 2) {
    return '🟢 High activity - things are moving!';
  }
  if (recentCompletions && recentCompletions.length > 0) {
    return '🟢 Steady progress';
  }
  return '🔵 Quiet period - ready for new work';
}
