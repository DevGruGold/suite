import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

/**
 * openclaw-relay
 * Bidirectional relay endpoint for communication between cloud Eliza (SuiteAI)
 * and the local OpenClaw agent.
 *
 * Since OpenClaw runs locally (no public HTTP), the cloud cannot push to it directly.
 * Instead, messages are queued in inbox_messages (channel='openclaw_inbound') and
 * OpenClaw polls this function to retrieve them.
 *
 * Actions:
 *
 *   POST { "action": "send", "message": "...", "relay_tag"?: "...", "metadata"?: {} }
 *     → Eliza (SuiteAI) delivers a message to OpenClaw's inbound queue.
 *       Returns { relay_tag, message_id }
 *
 *   POST { "action": "poll", "limit"?: 5 }
 *     → OpenClaw retrieves its pending inbound messages and marks them read.
 *       Returns { messages: [...] }
 *
 *   POST { "action": "reply", "relay_tag": "...", "reply": "...", "original_message_id"?: "..." }
 *     → OpenClaw posts its reply back into inbox_messages so Eliza can see it.
 *       Returns { reply_id }
 *
 *   POST { "action": "status" }
 *     → Health check. Returns { status: "ok", ... }
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OWNER_USER_ID = "1b865599-e9ae-45df-8e50-a2abec6811b4"; // joeyleepcs@gmail.com
// All openclaw messages use the 'openclaw' channel (DB constraint).
// Direction is determined by metadata: target='openclaw' means Eliza→OpenClaw inbound.
const OPENCLAW_INBOUND_CHANNEL = "openclaw";

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const body = await req.json().catch(() => ({}));
        const action = body.action ?? "poll";

        console.log(`📡 openclaw-relay action: ${action}`);

        // ── ACTION: send ──────────────────────────────────────────────────────────
        // Eliza (cloud) queues a message for OpenClaw to pick up via polling.
        if (action === "send") {
            const { message, relay_tag: customTag, sender_name, metadata: extraMeta } = body;
            if (!message) {
                return jsonError("'message' field is required", 400);
            }

            const relayTag = customTag ?? `eliza-relay-${crypto.randomUUID().slice(0, 8)}`;
            const senderName = sender_name ?? "Eliza (SuiteAI)";

            console.log(`📨 Eliza→OpenClaw [${relayTag}]: ${message.slice(0, 80)}`);

            const { data: msgRow, error: insertErr } = await supabase
                .from("inbox_messages")
                .insert({
                    user_id: OWNER_USER_ID,
                    title: `${senderName} → OpenClaw`,
                    content: message,
                    type: "agent_message",
                    channel: OPENCLAW_INBOUND_CHANNEL,
                    agent_name: senderName,
                    priority: 2,
                    is_read: false,
                    metadata: {
                        relay_tag: relayTag,
                        target: "openclaw",
                        source: "eliza-suite",
                        awaiting_reply: true,
                        ...(extraMeta ?? {}),
                    },
                })
                .select("id")
                .single();

            if (insertErr) {
                console.error("Failed to insert message:", insertErr);
                return jsonError(insertErr.message, 500);
            }

            console.log(`  ✅ Queued as inbox_message ${msgRow.id}`);
            return jsonOk({ relay_tag: relayTag, message_id: msgRow.id });
        }

        // ── ACTION: poll ──────────────────────────────────────────────────────────
        // OpenClaw calls this to retrieve messages queued for it by Eliza.
        if (action === "poll") {
            const limit = Math.min(Number(body.limit ?? 5), 20);

            const { data: messages, error: fetchErr } = await supabase
                .from("inbox_messages")
                .select("id, title, content, metadata, created_at")
                .eq("channel", OPENCLAW_INBOUND_CHANNEL)
                .eq("is_read", false)
                .filter("metadata->>target", "eq", "openclaw")
                .order("created_at", { ascending: true })
                .limit(limit);

            if (fetchErr) {
                console.error("Poll fetch error:", fetchErr);
                return jsonError(fetchErr.message, 500);
            }

            if (!messages || messages.length === 0) {
                return jsonOk({ messages: [] });
            }

            console.log(`📬 Delivering ${messages.length} message(s) to OpenClaw`);

            // Mark all returned messages as read (delivered)
            const ids = messages.map((m: any) => m.id);
            await supabase
                .from("inbox_messages")
                .update({ is_read: true })
                .in("id", ids);

            return jsonOk({ messages });
        }

        // ── ACTION: reply ─────────────────────────────────────────────────────────
        // OpenClaw posts its reply back so Eliza can see it in the inbox.
        if (action === "reply") {
            const { relay_tag, reply, original_message_id } = body;
            if (!relay_tag || !reply) {
                return jsonError("'relay_tag' and 'reply' are required", 400);
            }

            console.log(`💬 OpenClaw→Eliza reply [${relay_tag}]`);

            const { data, error } = await supabase
                .from("inbox_messages")
                .insert({
                    user_id: OWNER_USER_ID,
                    title: `OpenClaw Reply`,
                    content: reply,
                    type: "agent_message",
                    channel: "openclaw",
                    agent_name: "OpenClaw",
                    priority: 2,
                    is_read: false,
                    metadata: {
                        relay_tag,
                        is_reply: true,
                        source: "openclaw-local",
                        original_message_id: original_message_id ?? null,
                    },
                })
                .select("id")
                .single();

            if (error) return jsonError(error.message, 500);

            console.log(`  ✅ Reply stored as ${data.id}`);
            return jsonOk({ reply_id: data.id });
        }

        // ── ACTION: status ─────────────────────────────────────────────────────────
        if (action === "status") {
            return jsonOk({
                status: "ok",
                function: "openclaw-relay",
                version: "2.0.0",
                description: "Relay messages between Eliza (SuiteAI) and local OpenClaw agent",
                actions: ["send", "poll", "reply", "status"],
                channels: {
                    eliza_to_openclaw: `inbox_messages.channel = '${OPENCLAW_INBOUND_CHANNEL}'`,
                    openclaw_to_eliza: "POST { action: 'reply', relay_tag, reply }",
                },
            });
        }

        return jsonError("Unknown action. Use: send | poll | reply | status", 400);

    } catch (err: any) {
        console.error("❌ openclaw-relay unhandled error:", err);
        return jsonError(err.message, 500);
    }
});

// ── Response helpers ──────────────────────────────────────────────────────────

function jsonOk(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function jsonError(message: string, status: number): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
