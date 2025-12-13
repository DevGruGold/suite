import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CorrelationEvent {
  ip_address: string;
  source_type: string;
  source_id: string;
  source_session_key: string;
  user_agent: string;
  device_fingerprint: string;
  consent_given: boolean;
}

serve(async (req) => {
  const usageTracker = startUsageTracking('correlate-user-identity');

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get client IP from headers
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
      || req.headers.get("x-real-ip") 
      || "0.0.0.0";

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "record_event": {
        const { sessionKey, sourceType, userAgent, deviceFingerprint, metadata } = body;
        
        // Record the correlation event
        const { data, error } = await supabase
          .from("ip_correlation_events")
          .insert({
            ip_address: clientIp,
            source_type: sourceType,
            source_id: crypto.randomUUID(),
            source_session_key: sessionKey,
            user_agent: userAgent,
            device_fingerprint: deviceFingerprint,
            correlation_factors: metadata || {},
            observed_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;

        // Trigger correlation check if consent given
        const consentCheck = await supabase
          .from("ip_correlation_events")
          .select("consent_given")
          .eq("source_session_key", sessionKey)
          .eq("consent_given", true)
          .limit(1);

        if (consentCheck.data?.length) {
          await performCorrelation(supabase, clientIp, sessionKey, deviceFingerprint);
        }

        return new Response(JSON.stringify({ success: true, eventId: data?.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "check_correlation": {
        const { sessionKey } = body;
        
        // Find matches for this session
        const { data: matches } = await supabase
          .from("ip_correlation_matches")
          .select("*")
          .or(`chat_session_id.eq.${sessionKey},device_session_id.eq.${sessionKey}`)
          .order("match_confidence", { ascending: false })
          .limit(1);

        if (matches?.length) {
          const match = matches[0];
          return new Response(JSON.stringify({
            hasCorrelation: true,
            confidence: match.match_confidence,
            matchedSources: Object.keys(match.match_factors || {}),
            userProfileId: match.user_profile_id,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({
          hasCorrelation: false,
          confidence: 0,
          matchedSources: [],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_unified_profile": {
        const { sessionKey } = body;
        
        // Get correlation match
        const { data: match } = await supabase
          .from("ip_correlation_matches")
          .select("user_profile_id")
          .or(`chat_session_id.eq.${sessionKey},device_session_id.eq.${sessionKey}`)
          .single();

        if (!match?.user_profile_id) {
          return new Response(JSON.stringify(null), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get full profile with aggregated data
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", match.user_profile_id)
          .single();

        // Get linked session counts
        const { count: chatCount } = await supabase
          .from("conversation_sessions")
          .select("*", { count: "exact", head: true })
          .eq("user_profile_id", match.user_profile_id);

        const { count: deviceCount } = await supabase
          .from("devices")
          .select("*", { count: "exact", head: true })
          .eq("user_profile_id", match.user_profile_id);

        // Get linked identities
        const { data: identities } = await supabase
          .from("ip_correlation_events")
          .select("id, source_type, source_id, correlation_confidence, created_at")
          .eq("user_profile_id", match.user_profile_id);

        return new Response(JSON.stringify({
          id: profile?.id,
          displayName: profile?.display_name,
          email: profile?.email,
          walletAddress: profile?.wallet_address,
          totalXmrtEarned: profile?.total_xmrt_earned || 0,
          chatSessions: chatCount || 0,
          deviceConnections: deviceCount || 0,
          linkedIdentities: identities?.map(i => ({
            id: i.id,
            type: i.source_type,
            sourceId: i.source_id,
            confidence: i.correlation_confidence,
            createdAt: i.created_at,
          })) || [],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "respond_to_match": {
        const { matchId, accept } = body;
        
        if (accept) {
          await supabase
            .from("ip_correlation_matches")
            .update({ user_acknowledged: true })
            .eq("id", matchId);
        } else {
          // Delete the match if declined
          await supabase
            .from("ip_correlation_matches")
            .delete()
            .eq("id", matchId);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_linked_identities": {
        const { profileId } = body;
        
        const { data } = await supabase
          .from("ip_correlation_events")
          .select("id, source_type, source_id, correlation_confidence, created_at")
          .eq("user_profile_id", profileId);

        return new Response(JSON.stringify(data?.map(i => ({
          id: i.id,
          type: i.source_type,
          sourceId: i.source_id,
          confidence: i.correlation_confidence,
          createdAt: i.created_at,
        })) || []), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "link_identities": {
        const { sourceSessionKey, targetSessionKey } = body;
        
        // Get or create user profile
        let profileId: string;
        
        const { data: existingMatch } = await supabase
          .from("ip_correlation_matches")
          .select("user_profile_id")
          .or(`chat_session_id.eq.${sourceSessionKey},device_session_id.eq.${sourceSessionKey}`)
          .single();

        if (existingMatch?.user_profile_id) {
          profileId = existingMatch.user_profile_id;
        } else {
          const { data: newProfile } = await supabase
            .from("user_profiles")
            .insert({ created_at: new Date().toISOString() })
            .select()
            .single();
          profileId = newProfile!.id;
        }

        // Create correlation match
        await supabase.from("ip_correlation_matches").insert({
          user_profile_id: profileId,
          chat_session_id: sourceSessionKey,
          device_session_id: targetSessionKey,
          match_confidence: 1.0, // Manual link = full confidence
          match_factors: { manual_link: true },
          user_acknowledged: true,
        });

        return new Response(JSON.stringify({ success: true, profileId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_data": {
        const { sessionKey } = body;
        
        // Delete all correlation events for this session
        await supabase
          .from("ip_correlation_events")
          .delete()
          .eq("source_session_key", sessionKey);

        // Delete matches involving this session
        await supabase
          .from("ip_correlation_matches")
          .delete()
          .or(`chat_session_id.eq.${sessionKey},device_session_id.eq.${sessionKey}`);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "run_correlation": {
        // Periodic correlation job
        const correlationResults = await runPeriodicCorrelation(supabase);
        return new Response(JSON.stringify(correlationResults), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("Correlation error:", error);
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function performCorrelation(
  supabase: any,
  ipAddress: string,
  sessionKey: string,
  fingerprint: string
): Promise<void> {
  const TIME_WINDOW_HOURS = 24;
  const windowStart = new Date(Date.now() - TIME_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  // Find all events from same IP within time window (excluding current session)
  const { data: relatedEvents } = await supabase
    .from("ip_correlation_events")
    .select("*")
    .eq("ip_address", ipAddress)
    .neq("source_session_key", sessionKey)
    .gte("observed_at", windowStart)
    .eq("consent_given", true);

  if (!relatedEvents?.length) return;

  // Calculate correlation confidence
  for (const event of relatedEvents) {
    let confidence = 0.4; // Base IP match
    const factors: Record<string, boolean> = { ip_match: true };

    // Check fingerprint match
    if (event.device_fingerprint === fingerprint) {
      confidence += 0.3;
      factors.fingerprint_match = true;
    }

    // Time proximity bonus (closer = higher)
    const timeDiff = Math.abs(
      new Date(event.observed_at).getTime() - Date.now()
    );
    const hoursApart = timeDiff / (1000 * 60 * 60);
    if (hoursApart < 1) {
      confidence += 0.1;
      factors.time_proximity = true;
    }

    // Different source types = more valuable correlation
    const { data: currentEvent } = await supabase
      .from("ip_correlation_events")
      .select("source_type")
      .eq("source_session_key", sessionKey)
      .single();

    if (currentEvent?.source_type !== event.source_type) {
      confidence += 0.2;
      factors.cross_platform = true;
    }

    // Only create match if confidence is high enough
    if (confidence >= 0.7) {
      // Get or create user profile
      let profileId = event.user_profile_id;
      
      if (!profileId) {
        const { data: newProfile } = await supabase
          .from("user_profiles")
          .insert({ created_at: new Date().toISOString() })
          .select()
          .single();
        profileId = newProfile.id;

        // Link original event to profile
        await supabase
          .from("ip_correlation_events")
          .update({ user_profile_id: profileId })
          .eq("id", event.id);
      }

      // Link current session to profile
      await supabase
        .from("ip_correlation_events")
        .update({ user_profile_id: profileId })
        .eq("source_session_key", sessionKey);

      // Create correlation match
      await supabase.from("ip_correlation_matches").upsert({
        user_profile_id: profileId,
        chat_session_id: event.source_type === "chat_session" ? event.source_session_key : sessionKey,
        device_session_id: event.source_type === "device_connection" ? event.source_session_key : sessionKey,
        ip_address: ipAddress,
        match_confidence: confidence,
        match_factors: factors,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      }, {
        onConflict: "user_profile_id,chat_session_id,device_session_id",
      });
    }
  }
}

async function runPeriodicCorrelation(supabase: any): Promise<{ processed: number; matches: number }> {
  let processed = 0;
  let matches = 0;

  // Get recent events that haven't been processed
  const { data: recentEvents } = await supabase
    .from("ip_correlation_events")
    .select("*")
    .eq("consent_given", true)
    .is("user_profile_id", null)
    .gte("observed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(100);

  for (const event of recentEvents || []) {
    processed++;
    await performCorrelation(
      supabase,
      event.ip_address,
      event.source_session_key,
      event.device_fingerprint
    );

    // Check if match was created
    const { data: match } = await supabase
      .from("ip_correlation_matches")
      .select("id")
      .or(`chat_session_id.eq.${event.source_session_key},device_session_id.eq.${event.source_session_key}`)
      .single();

    if (match) matches++;
  }

  return { processed, matches };
}
