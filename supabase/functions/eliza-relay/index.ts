import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

/**
 * eliza-relay
 * Provides an HTTP endpoint for OpenClaw (or any agent) to send a message to
 * cloud Eliza and optionally wait for a reply.
 *
 * POST /functions/v1/eliza-relay
 * Body:
 *   { "action": "send", "message": "...", "relay_tag": "optional-custom-tag" }
 *     → Posts message to inbox_messages for Eliza to see,
 *       then immediately calls Gemini on Eliza's behalf and inserts the reply.
 *       Returns { relay_tag, message_id, reply, reply_id }
 *
 *   { "action": "check_reply", "relay_tag": "openclaw-relay-xxxx" }
 *     → Polls for an existing reply matching this relay_tag
 *       Returns { found: true, reply } or { found: false }
 *
 * The local eliza-relay.mjs script writes to inbox_messages directly,
 * then polls Supabase. This edge function gives OpenClaw a single HTTP call
 * that does BOTH steps atomically (send + Gemini reply) in one round-trip.
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

const OWNER_USER_ID = "1b865599-e9ae-45df-8e50-a2abec6811b4"; // joeyleepcs@gmail.com
const GEMINI_MODEL = "gemini-2.0-flash";

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const body = await req.json().catch(() => ({}));
        const action = body.action ?? "send";

        console.log(`📡 eliza-relay action: ${action}`);

        // ── ACTION: send ───────────────────────────────────────────────────────────
        // OpenClaw sends a message, Eliza (via Gemini) replies immediately.
        if (action === "send") {
            const { message, relay_tag: customTag, agent_name, metadata: extraMeta } =
                body;
            if (!message) {
                return jsonError("'message' field is required", 400);
            }

            const relayTag =
                customTag ??
                `openclaw-relay-${crypto.randomUUID().slice(0, 8)}`;
            const senderName = agent_name ?? "OpenClaw";

            console.log(
                `📨 Relay from ${senderName} [${relayTag}]: ${message.slice(0, 80)}`,
            );

            // 1. Insert the incoming request into inbox_messages (so Eliza's inbox shows it)
            const { data: msgRow, error: insertErr } = await supabase
                .from("inbox_messages")
                .insert({
                    user_id: OWNER_USER_ID,
                    title: `${senderName} Request`,
                    content: message,
                    type: "agent_message",
                    channel: "openclaw",
                    agent_name: senderName,
                    priority: 2,
                    is_read: false,
                    metadata: {
                        relay_tag: relayTag,
                        awaiting_reply: true,
                        source: "eliza-relay-edge-function",
                        ...(extraMeta ?? {}),
                    },
                })
                .select("id")
                .single();

            if (insertErr) {
                console.error("Failed to insert request message:", insertErr);
                return jsonError(insertErr.message, 500);
            }

            const messageId = msgRow.id;
            console.log(`  Stored request as inbox_message ${messageId}`);

            // 2. Call Gemini to generate Eliza's reply
            let reply: string;
            try {
                reply = await callGemini(geminiKey, message);
            } catch (e: any) {
                console.error("  Gemini error:", e.message);
                reply = `⚠️ Eliza encountered an error: ${e.message}`;
            }

            // 3. Insert the reply into inbox_messages (eliza-relay.mjs polls for this)
            const { data: replyRow, error: replyInsertErr } = await supabase
                .from("inbox_messages")
                .insert({
                    user_id: OWNER_USER_ID,
                    title: `Eliza Reply: ${senderName} Request`,
                    content: reply,
                    type: "agent_message",
                    channel: "openclaw",
                    agent_name: "Eliza (SuiteAI)",
                    priority: 2,
                    is_read: false,
                    metadata: {
                        relay_tag: relayTag,
                        is_reply: true,
                        source: "eliza-relay-edge-function",
                        original_message_id: messageId,
                    },
                })
                .select("id")
                .single();

            if (replyInsertErr) {
                console.error("  Failed to insert reply:", replyInsertErr);
                // Still return the reply text even if DB insert failed
                return jsonOk({ relay_tag: relayTag, message_id: messageId, reply, reply_id: null });
            }

            // 4. Mark the original request as replied
            await supabase
                .from("inbox_messages")
                .update({
                    is_read: true,
                    metadata: {
                        relay_tag: relayTag,
                        awaiting_reply: false,
                        replied: "true",
                        reply_id: replyRow.id,
                    },
                })
                .eq("id", messageId);

            console.log(`  ✅ Reply stored as ${replyRow.id}`);

            return jsonOk({
                relay_tag: relayTag,
                message_id: messageId,
                reply,
                reply_id: replyRow.id,
            });
        }

        // ── ACTION: check_reply ────────────────────────────────────────────────────
        // Let the local eliza-relay.mjs script poll for a reply without re-calling Gemini.
        if (action === "check_reply") {
            const { relay_tag } = body;
            if (!relay_tag) {
                return jsonError("'relay_tag' is required for check_reply", 400);
            }

            const { data: rows, error } = await supabase
                .from("inbox_messages")
                .select("id, content, metadata, created_at")
                .eq("channel", "openclaw")
                .filter("metadata->>relay_tag", "eq", relay_tag)
                .filter("metadata->>is_reply", "eq", "true")
                .order("created_at", { ascending: false })
                .limit(1);

            if (error) return jsonError(error.message, 500);

            if (!rows || rows.length === 0) {
                return jsonOk({ found: false, relay_tag });
            }

            const replyRow = rows[0];
            // Mark as read
            await supabase
                .from("inbox_messages")
                .update({ is_read: true })
                .eq("id", replyRow.id);

            return jsonOk({ found: true, relay_tag, reply: replyRow.content, reply_id: replyRow.id });
        }

        // ── ACTION: status ────────────────────────────────────────────────────────
        if (action === "status") {
            return jsonOk({
                status: "ok",
                function: "eliza-relay",
                version: "1.0.0",
                description: "Relay messages from OpenClaw to Eliza (SuiteAI) via Gemini",
                actions: ["send", "check_reply", "status"],
            });
        }

        return jsonError("Unknown action. Use: send | check_reply | status", 400);
    } catch (err: any) {
        console.error("❌ eliza-relay unhandled error:", err);
        return jsonError(err.message, 500);
    }
});

// ── Gemini helper ─────────────────────────────────────────────────────────────

async function callGemini(apiKey: string, userMessage: string): Promise<string> {
    const systemPrompt = `You are Eliza, the cloud AI assistant for SuiteAI at suite-beta.vercel.app.
You are receiving a request from an OpenClaw agent (Eliza-Dev), your local counterpart running in the user's gateway.
Respond helpfully and concisely to the request. You have web knowledge up to your training cutoff.
If asked to search the web, provide the best answer you can from your knowledge.
Keep responses focused and actionable — OpenClaw will relay your answer back to the user or task system.
Do NOT reveal API keys, service role keys, or internal system secrets.`;

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: "user", parts: [{ text: userMessage }] }],
                generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
            }),
        },
    );

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    return (
        data.candidates?.[0]?.content?.parts?.[0]?.text ??
        "Eliza could not generate a response."
    );
}

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
