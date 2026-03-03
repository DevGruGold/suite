import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── HTML email template ────────────────────────────────────────────────────
function buildCompletionEmailHtml(task: {
    id: string;
    title: string;
    assigneeAgentId?: string;
    proofOfWorkLink?: string;
    expectedDeliverables?: string;
    outcomeSummary?: string;
    completedAt: string;
    deliverableStoragePath?: string;
}): string {
    const {
        id, title, assigneeAgentId, proofOfWorkLink,
        expectedDeliverables, outcomeSummary, completedAt, deliverableStoragePath
    } = task;

    const completedDate = new Date(completedAt).toLocaleString('en-US', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/Chicago'
    });

    const deliverableBtn = proofOfWorkLink
        ? `<tr>
             <td align="center" style="padding:24px 0 8px;">
               <a href="${proofOfWorkLink}"
                  style="display:inline-block;padding:14px 32px;background:#6366f1;color:#fff;
                         font-family:Arial,sans-serif;font-size:15px;font-weight:bold;
                         border-radius:8px;text-decoration:none;">
                 📎 View Deliverable
               </a>
             </td>
           </tr>`
        : `<tr>
             <td style="padding:12px 0;font-family:Arial,sans-serif;font-size:14px;color:#888;">
               <em>No proof of work link was provided.</em>
             </td>
           </tr>`;

    const rows = [
        ['Task ID', `<code style="font-size:12px;background:#f3f4f6;padding:2px 6px;border-radius:4px;">${id}</code>`],
        ['Status', '<span style="color:#22c55e;font-weight:bold;">✅ COMPLETED</span>'],
        ['Completed At', completedDate],
        ...(assigneeAgentId ? [['Completed By Agent', assigneeAgentId]] : []),
        ...(expectedDeliverables ? [['Expected Deliverables', expectedDeliverables]] : []),
        ...(deliverableStoragePath ? [['Storage Path', deliverableStoragePath]] : []),
        ...(outcomeSummary ? [['Outcome Summary', outcomeSummary]] : []),
    ].map(([label, value]) => `
        <tr>
          <td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;
                     white-space:nowrap;vertical-align:top;">${label}</td>
          <td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:14px;color:#111827;
                     word-break:break-word;">${value}</td>
        </tr>`).join('');

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:32px 40px;">
              <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.8);letter-spacing:1px;text-transform:uppercase;">XMRT-DAO Executive Council</p>
              <h1 style="margin:8px 0 0;font-family:Arial,sans-serif;font-size:24px;color:#ffffff;">
                ✅ Task Completed
              </h1>
            </td>
          </tr>

          <!-- Task Title -->
          <tr>
            <td style="padding:28px 40px 0;">
              <h2 style="margin:0;font-family:Arial,sans-serif;font-size:20px;color:#111827;">
                ${title}
              </h2>
            </td>
          </tr>

          <!-- Details Table -->
          <tr>
            <td style="padding:20px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                ${rows}
              </table>
            </td>
          </tr>

          <!-- Deliverable Button -->
          <tr>
            <td style="padding:0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${deliverableBtn}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;border-top:1px solid #f3f4f6;margin-top:24px;">
              <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;">
                This notification was generated automatically by the XMRT-DAO Autonomous Agent System.<br>
                Task ID: ${id}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const payload = await req.json();
        console.log('📬 [task-completion-notifier] Webhook received:', JSON.stringify(payload).slice(0, 400));

        const { record } = payload;
        const task = record;

        if (!task) {
            throw new Error('No task record found in payload');
        }

        if (task.status !== 'COMPLETED') {
            return new Response(JSON.stringify({ message: 'Task not completed, ignoring' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const taskId = task.id;
        const taskTitle = task.title;
        const assigneeAgentId = task.assignee_agent_id;
        const proofOfWorkLink = task.proof_of_work_link;
        const completedAt = task.completed_at || new Date().toISOString();
        const expectedDeliverables = task.expected_deliverables;
        const deliverableStoragePath = task.deliverable_storage_path;
        const outcomeSummary = task.resolution_notes || task.metadata?.outcome_summary;
        const notificationRecipients: string[] = Array.isArray(task.notification_recipients) && task.notification_recipients.length > 0
            ? task.notification_recipients
            : (Deno.env.get('EXECUTIVE_EMAIL') ? [Deno.env.get('EXECUTIVE_EMAIL')!] : []);
        const executiveUserId = Deno.env.get('EXECUTIVE_USER_ID');

        console.log(`🎯 [task-completion-notifier] Processing: "${taskTitle}" (${taskId})`);

        const steps: Record<string, string> = {};

        // ── Step 1: Store knowledge (existing behavior) ────────────────────
        try {
            const knowledgeDesc = [
                `Task '${taskTitle}' (ID: ${taskId}) was successfully completed`,
                assigneeAgentId ? `by agent ${assigneeAgentId}` : '',
                proofOfWorkLink ? `Proof of work: ${proofOfWorkLink}.` : 'No proof of work link provided.',
                outcomeSummary ? `Outcome: ${outcomeSummary}.` : '',
                `Completed at: ${completedAt}.`
            ].filter(Boolean).join('. ');

            const { error: knowledgeError } = await supabase.functions.invoke('knowledge-manager/store', {
                body: {
                    action: 'store_knowledge',
                    data: {
                        name: `Task Completed: ${taskTitle}`,
                        description: knowledgeDesc,
                        type: 'fact',
                        metadata: {
                            task_id: taskId,
                            assignee_agent_id: assigneeAgentId,
                            proof_of_work_link: proofOfWorkLink,
                            completed_at: completedAt,
                            source: 'task-completion-notifier'
                        }
                    }
                }
            });
            steps.knowledge = knowledgeError ? `warn: ${knowledgeError.message}` : 'ok';
            if (knowledgeError) console.warn('[task-completion-notifier] knowledge store warn:', knowledgeError.message);
        } catch (e: any) {
            steps.knowledge = `warn: ${e.message}`;
            console.warn('[task-completion-notifier] knowledge store non-fatal error:', e.message);
        }

        // ── Step 2: In-app Inbox Notification ─────────────────────────────
        if (executiveUserId) {
            try {
                const inboxContent = [
                    `**Task:** ${taskTitle}`,
                    `**Status:** ✅ COMPLETED`,
                    proofOfWorkLink ? `**Deliverable:** [View Link](${proofOfWorkLink})` : '',
                    outcomeSummary ? `**Outcome:** ${outcomeSummary}` : '',
                    expectedDeliverables ? `**Expected:** ${expectedDeliverables}` : '',
                ].filter(Boolean).join('\n');

                const { error: inboxError } = await supabase.functions.invoke('inbox-notify', {
                    body: {
                        user_id: executiveUserId,
                        title: `✅ Task Completed: ${taskTitle}`,
                        content: inboxContent,
                        task_id: taskId,
                        metadata: {
                            task_id: taskId,
                            proof_of_work_link: proofOfWorkLink,
                            completed_at: completedAt,
                        }
                    }
                });
                steps.inbox = inboxError ? `warn: ${inboxError.message}` : 'ok';
                if (inboxError) console.warn('[task-completion-notifier] inbox-notify warn:', inboxError.message);
            } catch (e: any) {
                steps.inbox = `warn: ${e.message}`;
                console.warn('[task-completion-notifier] inbox-notify non-fatal error:', e.message);
            }
        } else {
            steps.inbox = 'skipped: EXECUTIVE_USER_ID not set';
            console.info('[task-completion-notifier] Skipping inbox notify — EXECUTIVE_USER_ID not configured');
        }

        // ── Step 3: Gmail Email Notification ──────────────────────────────
        if (notificationRecipients.length > 0) {
            const htmlBody = buildCompletionEmailHtml({
                id: taskId,
                title: taskTitle,
                assigneeAgentId,
                proofOfWorkLink,
                expectedDeliverables,
                outcomeSummary,
                completedAt,
                deliverableStoragePath,
            });

            const emailErrors: string[] = [];
            for (const recipient of notificationRecipients) {
                try {
                    const { error: emailError } = await supabase.functions.invoke('google-gmail', {
                        body: {
                            action: 'send_email',
                            to: recipient,
                            subject: `✅ Task Completed: ${taskTitle}`,
                            body: htmlBody,
                            is_html: true,
                        }
                    });
                    if (emailError) {
                        emailErrors.push(`${recipient}: ${emailError.message}`);
                        console.warn(`[task-completion-notifier] Gmail warn for ${recipient}:`, emailError.message);
                    } else {
                        console.log(`[task-completion-notifier] ✅ Email sent to ${recipient}`);
                    }
                } catch (e: any) {
                    emailErrors.push(`${recipient}: ${e.message}`);
                    console.warn(`[task-completion-notifier] Gmail non-fatal error for ${recipient}:`, e.message);
                }
            }
            steps.email = emailErrors.length === 0
                ? `ok (${notificationRecipients.length} recipient${notificationRecipients.length > 1 ? 's' : ''})`
                : `partial: ${emailErrors.join('; ')}`;
        } else {
            steps.email = 'skipped: no recipients configured (set notification_recipients on task or EXECUTIVE_EMAIL env var)';
            console.info('[task-completion-notifier] Skipping email — no recipients configured');
        }

        console.log(`✅ [task-completion-notifier] Done. Steps:`, steps);

        return new Response(JSON.stringify({ success: true, task_id: taskId, steps }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('[task-completion-notifier] Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
