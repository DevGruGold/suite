import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { target_repos, force_refresh } = await req.json();
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    // Gather current state from all sources
    const [miningStats, agentStatus, conversationStats] = await Promise.all([
      supabase.from("mining_updates").select("*").order("created_at", { ascending: false }).limit(1),
      supabase.from("agents").select("*").eq("status", "active"),
      supabase.from("conversation_sessions").select("id", { count: "exact" })
    ]);
    
    const syncPayload = {
      mining: miningStats.data,
      agents: agentStatus.data,
      conversations: {
        total_sessions: conversationStats.count
      },
      timestamp: new Date().toISOString(),
      force_refresh
    };
    
    // Broadcast sync request
    const channel = supabase.channel("global:sync-request");
    await channel.send({
      type: "broadcast",
      event: "dashboard:sync",
      payload: syncPayload
    });
    
    return new Response(
      JSON.stringify({ success: true, syncPayload }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
