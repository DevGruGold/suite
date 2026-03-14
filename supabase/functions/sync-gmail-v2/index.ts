import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * sync-gmail-v2 — Edge function to sync email replies back to the Suite inbox.
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

        const EXECUTIVE_USER_ID = Deno.env.get('EXECUTIVE_USER_ID');
        if (!EXECUTIVE_USER_ID) {
            throw new Error('EXECUTIVE_USER_ID environment variable is not set');
        }

        console.log('[sync-gmail-v2] 🔄 Starting Gmail sync...');

        // Step 1: List unread messages
        const { data: listData, error: listError } = await supabase.functions.invoke('google-gmail', {
            body: { 
                action: 'list_messages',
                q: 'is:unread' 
            }
        });

        if (listError) throw listError;

        const messages = listData?.messages || [];
        console.log(`[sync-gmail-v2] Found ${messages.length} unread messages.`);

        const processed = [];

        for (const msg of messages) {
            try {
                // Step 2: Get message details
                const { data: detailData, error: detailError } = await supabase.functions.invoke('google-gmail', {
                    body: { 
                        action: 'get_message',
                        id: msg.id
                    }
                });

                if (detailError) throw detailError;

                const headers = detailData.payload?.headers || [];
                const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
                const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
                
                const emailMatch = fromHeader.match(/<(.+)>|(\S+@\S+)/);
                const senderEmail = emailMatch ? (emailMatch[1] || emailMatch[2]) : fromHeader;

                if (!senderEmail) continue;

                console.log(`[sync-gmail-v2] Processing message from: ${senderEmail}`);

                // Simple heuristic: attribute to executive_user_id for now
                // but store sender email in metadata.
                const { error: insertError } = await supabase
                    .from('inbox_messages')
                    .insert({
                        user_id: EXECUTIVE_USER_ID,
                        title: `Reply from ${senderEmail}: ${subjectHeader}`,
                        content: detailData.snippet || '',
                        type: 'reply',
                        channel: 'email',
                        priority: 1,
                        metadata: {
                            gmail_id: msg.id,
                            sender_email: senderEmail,
                            original_subject: subjectHeader
                        }
                    });

                if (insertError) throw insertError;

                // Step 5: Mark as read
                await supabase.functions.invoke('google-gmail', {
                    body: {
                        action: 'modify_message',
                        id: msg.id,
                        removeLabelIds: ['UNREAD']
                    }
                });

                processed.push(msg.id);
            } catch (msgErr: any) {
                console.error(`[sync-gmail-v2] ❌ Error processing message ${msg.id}:`, msgErr.message);
            }
        }

        return new Response(
            JSON.stringify({ success: true, processed }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err: any) {
        console.error('[sync-gmail-v2] Fatal Error:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
