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
        const { 
            user_id, 
            title, 
            content, 
            task_id, 
            metadata,
            type = 'system',
            channel = 'internal',
            priority = 2,
            agent_id,
            agent_name,
            action_url
        } = body;

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
            type,
            channel,
            priority,
            metadata: metadata || {}
        };

        if (task_id) record.task_id = task_id;
        if (agent_id) record.agent_id = agent_id;
        if (agent_name) record.agent_name = agent_name;
        if (action_url) record.action_url = action_url;

        const { data, error } = await supabase
            .from('inbox_messages')
            .insert(record)
            .select()
            .single();

        if (error) {
            console.error('[inbox-notify] DB insert error:', error);
            throw error;
        }

        // ── Step 2: Handle Email Notifications ─────────────────────────────
        try {
            // Fetch user profile and email preference
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('email_notifications_enabled')
                .eq('id', user_id)
                .single();

            if (profile?.email_notifications_enabled) {
                // Fetch user email from auth.users (requires service role key access)
                const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user_id);
                const userEmail = userData?.user?.email;

                if (userEmail) {
                    console.log(`[inbox-notify] 📧 Sending email notification to ${userEmail} for message: "${title}"`);
                    
                    const emailBody = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
    <h2 style="color: #333;">${title}</h2>
    <div style="color: #555; line-height: 1.6; white-space: pre-wrap;">${content}</div>
    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 12px; color: #888;">
        Reply directly to this email to respond to the Executive Agent.<br>
        Manage your notification settings in the <a href="https://suite-beta.vercel.app/dashboard/profile">Suite Profile</a>.
    </p>
</div>
                    `;

                    await supabase.functions.invoke('google-gmail', {
                        body: {
                            action: 'send_email',
                            to: userEmail,
                            subject: `[Suite] ${title}`,
                            body: emailBody,
                            is_html: true
                        }
                    });
                }
            }
        } catch (emailErr: any) {
            console.warn('[inbox-notify] ⚠️ Non-fatal error sending email notification:', emailErr.message);
        }

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
