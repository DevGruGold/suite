import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

serve(async (req) => {
  try {
    const { event_type, payload, source_repo } = await req.json();
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    // Log event for audit trail
    const { data: eventLog, error: logError } = await supabase
      .from("event_log")
      .insert({
        event_type,
        payload,
        source_repo,
        timestamp: new Date().toISOString()
      })
      .select()
      .single();
    
    if (logError) throw logError;
    
    // Broadcast to realtime channel
    const channel = supabase.channel("global:state-changes");
    await channel.send({
      type: "broadcast",
      event: event_type,
      payload: {
        ...payload,
        event_id: eventLog.id,
        source_repo
      }
    });
    
    return new Response(
      JSON.stringify({ success: true, event_id: eventLog.id }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
