import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * sync-gmail-replies — Polls Gmail for unread replies and syncs them to the Suite Inbox.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const EXECUTIVE_USER_ID = Deno.env.get('EXECUTIVE_USER_ID');
  if (!EXECUTIVE_USER_ID) {
    return new Response(JSON.stringify({ error: 'EXECUTIVE_USER_ID not configured' }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  try {
    console.log('📬 [sync-gmail-replies] Polling for unread emails...');

    // 1. List unread emails
    const listRes = await supabase.functions.invoke('google-gmail', {
      body: { action: 'list_emails', query: 'is:unread', max_results: 10 }
    });

    if (!listRes.data?.success || !listRes.data.result.messages) {
      return new Response(JSON.stringify({ success: true, count: 0, message: 'No unread messages' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const messages = listRes.data.result.messages;
    const results = [];

    for (const msg of messages) {
      try {
        // 2. Get full email detail
        const getRes = await supabase.functions.invoke('google-gmail', {
          body: { action: 'get_email', message_id: msg.id }
        });

        const detail = getRes.data?.result;
        if (!detail) continue;

        const headers = detail.payload.headers;
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
        const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
        const messageId = detail.id;

        // Extract email address: "Name <email@example.com>" -> "email@example.com"
        const emailMatch = fromHeader.match(/<(.+?)>/) || [null, fromHeader];
        const senderEmail = emailMatch[1].trim();

        console.log(`📩 Processing message from ${senderEmail}: "${subject}"`);

        // 3. Find user by email
        // We look for the user in auth.users by email
        const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
        const targetUser = userData?.users.find(u => u.email?.toLowerCase() === senderEmail.toLowerCase());

        if (targetUser) {
          // Extract body text
          let body = '';
          const parts = detail.payload.parts || [detail.payload];
          const textPart = parts.find((p: any) => p.mimeType === 'text/plain');
          if (textPart?.body?.data) {
            body = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          }

          // 4. Insert into inbox_messages for the Executive Agent
          const { error: insertError } = await supabase
            .from('inbox_messages')
            .insert({
              user_id: EXECUTIVE_USER_ID,
              title: `RE: ${subject}`,
              content: body || '(No text content)',
              type: 'email',
              channel: 'email',
              agent_name: targetUser.user_metadata?.full_name || senderEmail,
              metadata: {
                gmail_message_id: messageId,
                sender_email: senderEmail,
                original_subject: subject
              }
            });

          if (!insertError) {
            // 5. Mark as read in Gmail
            await supabase.functions.invoke('google-gmail', {
              body: {
                action: 'modify_message',
                message_id: messageId,
                remove_labels: ['UNREAD']
              }
            });

            console.log(`✅ Synced reply from ${senderEmail} to Executive Inbox`);
            results.push({ id: messageId, status: 'synced', user: targetUser.id });
          } else {
            console.error(`❌ Failed to insert inbox message:`, insertError);
          }
        } else {
          console.warn(`⚠️ No user found matching email ${senderEmail}, skipping.`);
          results.push({ id: messageId, status: 'ignored', reason: 'user_not_found' });
        }
      } catch (err: any) {
        console.error(`❌ Error processing message ${msg.id}:`, err.message);
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('[sync-gmail-replies] Global error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
