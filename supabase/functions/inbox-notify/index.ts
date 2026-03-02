import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * inbox-notify — lightweight edge function to send a message to a user's inbox.
 *
 * Primarily used by Eliza in auto-approve mode to ask questions non-blockingly.
 *
 * Body:
 *   user_id  (string, required) — UUID of the target user
 *   title    (string, required) — Short subject line shown in the notification bell
 *   content  (string, required) — Full message / question body
 *   task_id  (string, optional) — Link to an originating task
 *   metadata (object, optional) — Extra context stored alongside the message
 */
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const body = await req.json();
        const { user_id, title, content, task_id, metadata } = body;

        if (!user_id || !title || !content) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: user_id, title, content' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const record: any = {
            user_id,
            title: title.substring(0, 255),
            content,
            is_read: false,
            created_at: new Date().toISOString(),
        };

        if (task_id) record.task_id = task_id;

        const { data, error } = await supabase
            .from('inbox_messages')
            .insert(record)
            .select()
            .single();

        if (error) {
            console.error('[inbox-notify] DB insert error:', error);
            throw error;
        }

        console.log(`[inbox-notify] ✅ Sent inbox message to user ${user_id}: "${title}"`);

        return new Response(
            JSON.stringify({ success: true, message_id: data.id, user_id, title }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err: any) {
        console.error('[inbox-notify] Error:', err);
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
