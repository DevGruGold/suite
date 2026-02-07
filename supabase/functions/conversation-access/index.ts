import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to check if a string is a valid UUID
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

serve(async (req) => {
  const usageTracker = startUsageTracking('conversation-access');

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const { action, sessionKey, sessionId, messageData, limit, offset, sessionData } = requestBody;
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Conversation access request:", { action, sessionKey, sessionId, isValidUUID: sessionId ? isValidUUID(sessionId) : null });

    // Validate session ownership based on session_key
    if (!sessionKey) {
      return new Response(
        JSON.stringify({ error: "Session key required for authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    switch (action) {
      case "get_session": {
        // Get or create session for this session_key
        const { data: sessions, error } = await supabase
          .from("conversation_sessions")
          .select("*")
          .eq("session_key", sessionKey)
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, session: sessions?.[0] || null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_session": {
        
        // Create new session
        const { data, error } = await supabase
          .from("conversation_sessions")
          .insert(sessionData)
          .select()
          .single();

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, session: data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_messages": {
        if (!sessionId) {
          return new Response(
            JSON.stringify({ error: "Session ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify session ownership - handle both UUID and session_key formats
        let session;
        
        // Check if sessionId is a valid UUID first
        if (isValidUUID(sessionId)) {
          const { data, error } = await supabase
            .from("conversation_sessions")
            .select("id, session_key")
            .eq("id", sessionId)
            .maybeSingle();
          
          if (error) {
            console.error("Error fetching session by UUID:", error);
          }
          session = data;
        }
        
        // If not found or not a UUID, try as session_key
        if (!session) {
          const { data, error } = await supabase
            .from("conversation_sessions")
            .select("id, session_key")
            .eq("session_key", sessionId)
            .maybeSingle();
          
          if (error) {
            console.error("Error fetching session by session_key:", error);
          }
          session = data;
        }

        if (!session || session.session_key !== sessionKey) {
          return new Response(
            JSON.stringify({ error: "Unauthorized access to this session" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get messages for this session - use the actual UUID
        const actualSessionId = session.id;
        const { data: messages, error } = await supabase
          .from("conversation_messages")
          .select("*")
          .eq("session_id", actualSessionId)
          .order("timestamp", { ascending: false })
          .range(offset || 0, (offset || 0) + (limit || 49));

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, messages: messages || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_summaries": {
        if (!sessionId) {
          return new Response(
            JSON.stringify({ error: "Session ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify session ownership - handle both UUID and session_key formats
        let session;
        
        // Check if sessionId is a valid UUID first
        if (isValidUUID(sessionId)) {
          const { data, error } = await supabase
            .from("conversation_sessions")
            .select("id, session_key")
            .eq("id", sessionId)
            .maybeSingle();
          
          if (error) {
            console.error("Error fetching session by UUID:", error);
          }
          session = data;
        }
        
        // If not found or not a UUID, try as session_key
        if (!session) {
          const { data, error } = await supabase
            .from("conversation_sessions")
            .select("id, session_key")
            .eq("session_key", sessionId)
            .maybeSingle();
          
          if (error) {
            console.error("Error fetching session by session_key:", error);
          }
          session = data;
        }

        if (!session || session.session_key !== sessionKey) {
          return new Response(
            JSON.stringify({ error: "Unauthorized access to this session" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get summaries for this session - use the actual UUID
        const actualSessionId = session.id;
        const { data: summaries, error } = await supabase
          .from("conversation_summaries")
          .select("summary_text, message_count, created_at")
          .eq("session_id", actualSessionId)
          .order("created_at", { ascending: true });

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, summaries: summaries || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "add_message": {
        if (!sessionId || !messageData) {
          return new Response(
            JSON.stringify({ error: "Session ID and message data required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify session ownership - handle both UUID and session_key formats
        let session;
        
        // Check if sessionId is a valid UUID first
        if (isValidUUID(sessionId)) {
          const { data, error } = await supabase
            .from("conversation_sessions")
            .select("id, session_key")
            .eq("id", sessionId)
            .maybeSingle();
          
          if (error) {
            console.error("Error fetching session by UUID:", error);
          }
          session = data;
        }
        
        // If not found or not a UUID, try as session_key
        if (!session) {
          const { data, error } = await supabase
            .from("conversation_sessions")
            .select("id, session_key")
            .eq("session_key", sessionId)
            .maybeSingle();
          
          if (error) {
            console.error("Error fetching session by session_key:", error);
          }
          session = data;
        }

        if (!session || session.session_key !== sessionKey) {
          return new Response(
            JSON.stringify({ error: "Unauthorized access to this session" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Insert message - use the actual UUID
        const actualSessionId = session.id;
        const { data, error } = await supabase
          .from("conversation_messages")
          .insert({
            session_id: actualSessionId,
            ...messageData
          })
          .select()
          .single();

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, message: data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update_session": {
        if (!sessionId) {
          return new Response(
            JSON.stringify({ error: "Session ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify session ownership - handle both UUID and session_key formats
        let session;
        
        // Check if sessionId is a valid UUID first
        if (isValidUUID(sessionId)) {
          const { data, error } = await supabase
            .from("conversation_sessions")
            .select("id, session_key")
            .eq("id", sessionId)
            .maybeSingle();
          
          if (error) {
            console.error("Error fetching session by UUID:", error);
          }
          session = data;
        }
        
        // If not found or not a UUID, try as session_key
        if (!session) {
          const { data, error } = await supabase
            .from("conversation_sessions")
            .select("id, session_key")
            .eq("session_key", sessionId)
            .maybeSingle();
          
          if (error) {
            console.error("Error fetching session by session_key:", error);
          }
          session = data;
        }

        if (!session || session.session_key !== sessionKey) {
          return new Response(
            JSON.stringify({ error: "Unauthorized access to this session" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update session - use the actual UUID
        const actualSessionId = session.id;
        const { data, error } = await supabase
          .from("conversation_sessions")
          .update(messageData)
          .eq("id", actualSessionId)
          .select()
          .single();

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, session: data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        await usageTracker.failure('Invalid action', 400);
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

  } catch (error) {
    console.error("Conversation access error:", error);
    await usageTracker.failure(error instanceof Error ? error.message : "Unknown error", 500);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
