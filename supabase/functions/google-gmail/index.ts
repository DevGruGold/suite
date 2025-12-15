import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getGoogleAccessToken, isGoogleConfigured, corsHeaders } from "../_shared/googleAuthHelper.ts";
import { startUsageTrackingWithRequest } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'google-gmail';

const GMAIL_API_URL = 'https://gmail.googleapis.com/gmail/v1';

// ============= GMAIL ACTIONS =============

async function sendEmail(accessToken: string, to: string, subject: string, body: string, isHtml = false) {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
    '',
    body
  ].join('\r\n');

  const encodedMessage = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch(`${GMAIL_API_URL}/users/me/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodedMessage })
  });

  return response.json();
}

async function listEmails(accessToken: string, query = '', maxResults = 20) {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (query) params.set('q', query);

  const response = await fetch(`${GMAIL_API_URL}/users/me/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const data = await response.json();
  if (!data.messages) return { messages: [], count: 0 };

  // Get first 5 message details for preview
  const previews = await Promise.all(
    data.messages.slice(0, 5).map(async (msg: any) => {
      const detailResponse = await fetch(`${GMAIL_API_URL}/users/me/messages/${msg.id}?format=metadata`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const detail = await detailResponse.json();
      const headers = detail.payload?.headers || [];
      return {
        id: msg.id,
        subject: headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)',
        from: headers.find((h: any) => h.name === 'From')?.value || 'unknown',
        date: headers.find((h: any) => h.name === 'Date')?.value || ''
      };
    })
  );

  return { messages: previews, total: data.resultSizeEstimate || data.messages.length };
}

async function getEmail(accessToken: string, messageId: string) {
  const response = await fetch(`${GMAIL_API_URL}/users/me/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.json();
}

async function createDraft(accessToken: string, to: string, subject: string, body: string) {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body
  ].join('\r\n');

  const encodedMessage = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch(`${GMAIL_API_URL}/users/me/drafts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: { raw: encodedMessage } })
  });

  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch { body = {}; }

  const usageTracker = startUsageTrackingWithRequest(FUNCTION_NAME, req, body);

  try {
    // Check if Google is configured (async - checks env and database)
    if (!(await isGoogleConfigured())) {
      await usageTracker.failure('Google Cloud not configured', 401);
      return new Response(JSON.stringify({
        success: false,
        error: 'Google Cloud not configured',
        credential_required: true,
        message: 'Please configure Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) and authorize via OAuth flow'
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const action = body.action;

    console.log(`📧 google-gmail: action=${action}`);

    // Get access token
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      await usageTracker.failure('Failed to get access token', 401);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to get access token',
        credential_required: true
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let result;

    switch (action) {
      case 'send_email':
        result = await sendEmail(accessToken, body.to, body.subject, body.body, body.is_html);
        break;

      case 'list_emails':
        result = await listEmails(accessToken, body.query, body.max_results);
        break;

      case 'get_email':
        result = await getEmail(accessToken, body.message_id);
        break;

      case 'create_draft':
        result = await createDraft(accessToken, body.to, body.subject, body.body);
        break;

      case 'list_actions':
        result = {
          service: 'google-gmail',
          actions: [
            { name: 'send_email', params: ['to', 'subject', 'body', 'is_html?'], description: 'Send an email' },
            { name: 'list_emails', params: ['query?', 'max_results?'], description: 'List emails with optional search' },
            { name: 'get_email', params: ['message_id'], description: 'Get full email content' },
            { name: 'create_draft', params: ['to', 'subject', 'body'], description: 'Create email draft' }
          ]
        };
        break;

      default:
        await usageTracker.failure(`Unknown action: ${action}`, 400);
        return new Response(JSON.stringify({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: ['send_email', 'list_emails', 'get_email', 'create_draft', 'list_actions']
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await usageTracker.success({ result_summary: `${action} completed` });
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('google-gmail error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
