import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    // Fetch mining state
    const { data: miningStats } = await supabase
      .from("mining_updates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    
    // Fetch agent state
    const { data: agents } = await supabase
      .from("agents")
      .select("*")
      .eq("status", "active");
    
    // Fetch recent conversations
    const { data: conversations } = await supabase
      .from("conversation_sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    
    const globalState = {
      mining: {
        recent_updates: miningStats,
        total_miners: new Set(miningStats?.map(m => m.miner_id)).size
      },
      agents: {
        active_agents: agents,
        total_count: agents?.length || 0,
        superduper_count: agents?.filter(a => a.is_superduper).length || 0
      },
      conversations: {
        recent_sessions: conversations,
        total_sessions: conversations?.length || 0
      },
      timestamp: new Date().toISOString()
    };
    
    return new Response(
      JSON.stringify(globalState),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
