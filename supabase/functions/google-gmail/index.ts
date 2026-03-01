import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getGoogleAccessToken, isGoogleConfigured, corsHeaders } from "../_shared/googleAuthHelper.ts";
import { startUsageTrackingWithRequest } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'google-gmail';

const GMAIL_API_URL = 'https://gmail.googleapis.com/gmail/v1';

// ============= TYPES =============

interface InlineImage {
  /** Content-ID used in HTML as <img src="cid:YOUR_CID"> */
  cid: string;
  /** Base64-encoded image bytes */
  data: string;
  /** e.g. "image/png", "image/jpeg", "image/gif" */
  mimeType: string;
}

interface VideoEmbed {
  /** Full URL to the video (YouTube, Vimeo, etc.) */
  url: string;
  /** URL to a thumbnail image shown in the email */
  thumbnailUrl?: string;
  /** Caption displayed under the thumbnail */
  title?: string;
}

// ============= MIME BUILDER =============

/**
 * Generates a random MIME boundary string.
 */
function makeBoundary(): string {
  return `boundary_${crypto.randomUUID().replace(/-/g, '')}`;
}

/**
 * Base64url-encodes a UTF-8 string for the Gmail API raw message format.
 */
function toBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Encodes arbitrary binary data (already base64) into a MIME-safe line-wrapped block.
 * Gmail API accepts raw base64 in MIME parts without line-length restrictions,
 * so we just pass it through.
 */
function wrapBase64(data: string): string {
  // Insert CRLF every 76 characters (RFC 2045)
  return data.replace(/(.{76})/g, '$1\r\n');
}

/**
 * Builds an HTML block for a video thumbnail.  Email clients do not support
 * the <video> element, so the industry standard is a linked thumbnail image
 * that opens the video URL when clicked.
 */
function buildVideoBlock(video: VideoEmbed): string {
  const title = video.title ?? 'Click to play video';
  if (video.thumbnailUrl) {
    return `
<table align="center" cellpadding="0" cellspacing="0" style="margin:20px auto;border-radius:8px;overflow:hidden;max-width:560px;">
  <tr>
    <td style="position:relative;">
      <a href="${video.url}" target="_blank" style="display:block;text-decoration:none;">
        <img src="${video.thumbnailUrl}" alt="${title}"
             style="display:block;width:100%;max-width:560px;border:0;" />
        <!-- Play button overlay -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                    width:72px;height:72px;border-radius:50%;
                    background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;">
          <div style="width:0;height:0;border-style:solid;border-width:18px 0 18px 36px;
                      border-color:transparent transparent transparent #ffffff;margin-left:6px;"></div>
        </div>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center"
        style="background:#f4f4f4;padding:10px 16px;font-family:Arial,sans-serif;font-size:14px;color:#555;">
      <a href="${video.url}" target="_blank" style="color:#0077cc;text-decoration:none;">▶ ${title}</a>
    </td>
  </tr>
</table>`;
  }

  // Fallback: no thumbnail — render a styled CTA button
  return `
<table align="center" cellpadding="0" cellspacing="0" style="margin:20px auto;">
  <tr>
    <td align="center" style="border-radius:6px;background:#0077cc;">
      <a href="${video.url}" target="_blank"
         style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;
                font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">
        ▶ ${title}
      </a>
    </td>
  </tr>
</table>`;
}

/**
 * Builds a complete RFC 2822 / MIME email string and returns it base64url-encoded,
 * ready for the Gmail API `raw` field.
 *
 * Structure when HTML or images/video are present:
 *
 *   multipart/mixed  (outer — reserved for future file attachments)
 *   └── multipart/related   (HTML + inline images, wired by CID)
 *       ├── text/html
 *       └── image/...  × N
 *
 * When only plain text is requested the function returns a simple single-part message.
 */
function buildMimeMessage(
  to: string,
  subject: string,
  body: string,
  options: {
    isHtml?: boolean;
    images?: InlineImage[];
    video?: VideoEmbed;
    plainFallback?: string;
  } = {}
): string {
  const { isHtml = false, images = [], video } = options;
  const useRich = isHtml || images.length > 0 || !!video;

  // ── Fast path: plain text only ───────────────────────────────────────────
  if (!useRich) {
    const msg = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      body
    ].join('\r\n');
    return toBase64Url(msg);
  }

  // ── Rich path ────────────────────────────────────────────────────────────

  // 1. Optionally append video thumbnail block to HTML body
  let htmlBody = body;
  if (video) {
    htmlBody += buildVideoBlock(video);
  }

  const boundaryRelated = makeBoundary();
  const boundaryMixed = makeBoundary();

  const lines: string[] = [];

  // Outer envelope headers
  lines.push(`To: ${to}`);
  lines.push(`Subject: ${subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: multipart/mixed; boundary="${boundaryMixed}"`);
  lines.push('');

  // ── multipart/mixed opener ───────────────────────────────────────────────
  lines.push(`--${boundaryMixed}`);

  if (images.length > 0) {
    // Wrap HTML + images in multipart/related
    lines.push(`Content-Type: multipart/related; boundary="${boundaryRelated}"`);
    lines.push('');

    // HTML part
    lines.push(`--${boundaryRelated}`);
    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(wrapBase64(btoa(unescape(encodeURIComponent(htmlBody)))));

    // Inline image parts
    for (const img of images) {
      lines.push(`--${boundaryRelated}`);
      lines.push(`Content-Type: ${img.mimeType}; name="${img.cid}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push(`Content-Disposition: inline; filename="${img.cid}"`);
      lines.push(`Content-ID: <${img.cid}>`);
      lines.push('X-Attachment-Id: ' + img.cid);
      lines.push('');
      lines.push(wrapBase64(img.data));
    }

    lines.push(`--${boundaryRelated}--`);
  } else {
    // HTML only — no inline images
    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(wrapBase64(btoa(unescape(encodeURIComponent(htmlBody)))));
  }

  // Close outer boundary
  lines.push(`--${boundaryMixed}--`);

  const rawMessage = lines.join('\r\n');
  return toBase64Url(rawMessage);
}

// ============= GMAIL ACTIONS =============

async function sendEmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  isHtml = false,
  images: InlineImage[] = [],
  video?: VideoEmbed
) {
  const encodedMessage = buildMimeMessage(to, subject, body, { isHtml, images, video });

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

async function createDraft(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  isHtml = false,
  images: InlineImage[] = [],
  video?: VideoEmbed
) {
  const encodedMessage = buildMimeMessage(to, subject, body, { isHtml, images, video });

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

// ============= HANDLER =============

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
        result = await sendEmail(
          accessToken,
          body.to,
          body.subject,
          body.body,
          body.is_html ?? false,
          body.images ?? [],
          body.video
        );
        break;

      case 'list_emails':
        result = await listEmails(accessToken, body.query, body.max_results);
        break;

      case 'get_email':
        result = await getEmail(accessToken, body.message_id);
        break;

      case 'create_draft':
        result = await createDraft(
          accessToken,
          body.to,
          body.subject,
          body.body,
          body.is_html ?? false,
          body.images ?? [],
          body.video
        );
        break;

      case 'list_actions':
        result = {
          service: 'google-gmail',
          actions: [
            {
              name: 'send_email',
              params: [
                'to',
                'subject',
                'body',
                'is_html?',
                'images? [{cid, data (base64), mimeType}]',
                'video? {url, thumbnailUrl?, title?}'
              ],
              description: 'Send an email. Supports plain text, HTML, inline embedded images (via CID), and video thumbnail blocks.'
            },
            {
              name: 'list_emails',
              params: ['query?', 'max_results?'],
              description: 'List emails with optional search'
            },
            {
              name: 'get_email',
              params: ['message_id'],
              description: 'Get full email content'
            },
            {
              name: 'create_draft',
              params: [
                'to',
                'subject',
                'body',
                'is_html?',
                'images? [{cid, data (base64), mimeType}]',
                'video? {url, thumbnailUrl?, title?}'
              ],
              description: 'Create an email draft. Supports the same rich media options as send_email.'
            }
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
