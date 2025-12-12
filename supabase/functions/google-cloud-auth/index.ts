import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// Gmail API
const GMAIL_API_URL = 'https://gmail.googleapis.com/gmail/v1';
// Drive API
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
// Sheets API
const SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
// Calendar API
const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';

// Comprehensive scopes for full Google Cloud access
const SCOPES = [
  // Gemini/AI
  'https://www.googleapis.com/auth/generative-language.retriever',
  'https://www.googleapis.com/auth/generative-language.tuning',
  'https://www.googleapis.com/auth/cloud-platform',
  // Gmail
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  // Google Drive
  'https://www.googleapis.com/auth/drive',
  // Google Sheets
  'https://www.googleapis.com/auth/spreadsheets',
  // Google Calendar
  'https://www.googleapis.com/auth/calendar',
  // Cloud Storage
  'https://www.googleapis.com/auth/devstorage.full_control',
  // Identity
  'openid',
  'email',
  'profile'
].join(' ');

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

// Helper to get fresh access token
async function getAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('Missing Google OAuth credentials');
    return null;
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!tokenResponse.ok) {
    console.error('Token refresh failed:', await tokenResponse.text());
    return null;
  }

  const tokens: TokenResponse = await tokenResponse.json();
  return tokens.access_token;
}

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

// ============= DRIVE ACTIONS =============
async function listDriveFiles(accessToken: string, query = '', maxResults = 20, folderId?: string) {
  const params = new URLSearchParams({
    pageSize: String(maxResults),
    fields: 'files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink)'
  });
  
  let q = query;
  if (folderId) {
    q = q ? `${q} and '${folderId}' in parents` : `'${folderId}' in parents`;
  }
  if (q) params.set('q', q);

  const response = await fetch(`${DRIVE_API_URL}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  return response.json();
}

async function uploadDriveFile(accessToken: string, fileName: string, content: string, mimeType = 'text/plain', folderId?: string) {
  const metadata: any = { name: fileName };
  if (folderId) metadata.parents = [folderId];

  // Create file with multipart upload
  const boundary = 'foo_bar_baz';
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    '',
    content,
    `--${boundary}--`
  ].join('\r\n');

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });

  return response.json();
}

async function getDriveFile(accessToken: string, fileId: string) {
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?fields=*`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.json();
}

async function downloadDriveFile(accessToken: string, fileId: string) {
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.text();
}

async function createDriveFolder(accessToken: string, folderName: string, parentFolderId?: string) {
  const metadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentFolderId) metadata.parents = [parentFolderId];

  const response = await fetch(`${DRIVE_API_URL}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  return response.json();
}

async function shareDriveFile(accessToken: string, fileId: string, email: string, role = 'reader') {
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'user',
      role,
      emailAddress: email
    })
  });

  return response.json();
}

// ============= SHEETS ACTIONS =============
async function createSpreadsheet(accessToken: string, title: string, sheetName = 'Sheet1') {
  const response = await fetch(SHEETS_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: sheetName } }]
    })
  });

  return response.json();
}

async function readSheet(accessToken: string, spreadsheetId: string, range: string) {
  const response = await fetch(`${SHEETS_API_URL}/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.json();
}

async function writeSheet(accessToken: string, spreadsheetId: string, range: string, values: any[][]) {
  const response = await fetch(
    `${SHEETS_API_URL}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values })
    }
  );
  return response.json();
}

async function appendSheet(accessToken: string, spreadsheetId: string, range: string, values: any[][]) {
  const response = await fetch(
    `${SHEETS_API_URL}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values })
    }
  );
  return response.json();
}

async function getSpreadsheetInfo(accessToken: string, spreadsheetId: string) {
  const response = await fetch(`${SHEETS_API_URL}/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.json();
}

// ============= CALENDAR ACTIONS =============
async function listCalendarEvents(accessToken: string, calendarId = 'primary', timeMin?: string, timeMax?: string, maxResults = 10) {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime'
  });
  
  if (timeMin) params.set('timeMin', timeMin);
  else params.set('timeMin', new Date().toISOString());
  
  if (timeMax) params.set('timeMax', timeMax);

  const response = await fetch(`${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  return response.json();
}

async function createCalendarEvent(
  accessToken: string,
  title: string,
  startTime: string,
  endTime: string,
  description?: string,
  attendees?: string[],
  calendarId = 'primary'
) {
  const event: any = {
    summary: title,
    start: { dateTime: startTime },
    end: { dateTime: endTime }
  };
  
  if (description) event.description = description;
  if (attendees?.length) {
    event.attendees = attendees.map(email => ({ email }));
  }

  const response = await fetch(`${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });

  return response.json();
}

async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  updates: { title?: string; startTime?: string; endTime?: string; description?: string },
  calendarId = 'primary'
) {
  const event: any = {};
  if (updates.title) event.summary = updates.title;
  if (updates.startTime) event.start = { dateTime: updates.startTime };
  if (updates.endTime) event.end = { dateTime: updates.endTime };
  if (updates.description) event.description = updates.description;

  const response = await fetch(`${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });

  return response.json();
}

async function deleteCalendarEvent(accessToken: string, eventId: string, calendarId = 'primary') {
  const response = await fetch(`${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  return { success: response.ok };
}

async function getCalendarEvent(accessToken: string, eventId: string, calendarId = 'primary') {
  const response = await fetch(`${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.json();
}

// Main handler
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    // Parse request body for POST requests first to check for action
    let body: any = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }
    
    // Check action from query params OR body (body takes precedence for POST)
    const action = body.action || url.searchParams.get('action') || 'status';

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

    console.log(`🔐 google-cloud-auth: action=${action}`);

    switch (action) {
      // ============= OAUTH FLOW =============
      case 'get_authorization_url': {
        if (!clientId) {
          return new Response(JSON.stringify({
            success: false,
            error: 'GOOGLE_CLIENT_ID not configured'
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Force HTTPS for redirect URI (url.origin may return http:// for edge functions)
        const redirectUri = `https://${url.host}/functions/v1/google-cloud-auth?action=callback`;
        
        const authUrl = new URL(GOOGLE_AUTH_URL);
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', SCOPES);
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('login_hint', 'xmrtsolutions@gmail.com');

        return new Response(JSON.stringify({
          success: true,
          authorization_url: authUrl.toString(),
          redirect_uri: redirectUri,
          scopes_requested: SCOPES.split(' '),
          instructions: 'Open this URL, sign in as xmrtsolutions@gmail.com, authorize, then store the refresh_token in Supabase secrets as GOOGLE_REFRESH_TOKEN'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'callback': {
        const code = url.searchParams.get('code');
        if (!code) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No authorization code provided'
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!clientId || !clientSecret) {
          return new Response(JSON.stringify({
            success: false,
            error: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured'
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Force HTTPS for redirect URI (must match get_authorization_url)
        const redirectUri = `https://${url.host}/functions/v1/google-cloud-auth?action=callback`;

        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
          })
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error('Token exchange failed:', errorText);
          return new Response(JSON.stringify({
            success: false,
            error: 'Token exchange failed',
            details: errorText
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const tokens: TokenResponse = await tokenResponse.json();

        return new Response(JSON.stringify({
          success: true,
          message: 'Authorization successful! Store refresh_token in Supabase secrets as GOOGLE_REFRESH_TOKEN',
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          expires_in: tokens.expires_in,
          scope: tokens.scope
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get_access_token': {
        if (!refreshToken) {
          return new Response(JSON.stringify({
            success: false,
            error: 'GOOGLE_REFRESH_TOKEN not configured. Run authorization flow first.',
            needs_authorization: true
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Failed to refresh access token',
            needs_reauthorization: true
          }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({
          success: true,
          access_token: accessToken
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'status': {
        return new Response(JSON.stringify({
          success: true,
          configured: {
            client_id: !!clientId,
            client_secret: !!clientSecret,
            refresh_token: !!refreshToken
          },
          ready: !!(clientId && clientSecret && refreshToken),
          available_services: ['gmail', 'drive', 'sheets', 'calendar', 'gemini'],
          message: !refreshToken 
            ? 'GOOGLE_REFRESH_TOKEN not set. Run authorization flow to obtain it.'
            : 'Google Cloud OAuth fully configured with Gmail, Drive, Sheets, Calendar access'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ============= GMAIL ACTIONS =============
      case 'send_email': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { to, subject, body: emailBody, is_html } = body;
        if (!to || !subject || !emailBody) {
          return new Response(JSON.stringify({ success: false, error: 'Missing to, subject, or body' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await sendEmail(accessToken, to, subject, emailBody, is_html);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'list_emails': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await listEmails(accessToken, body.query || '', body.max_results || 20);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get_email': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.message_id) {
          return new Response(JSON.stringify({ success: false, error: 'Missing message_id' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await getEmail(accessToken, body.message_id);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'create_draft': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { to, subject, body: draftBody } = body;
        if (!to || !subject || !draftBody) {
          return new Response(JSON.stringify({ success: false, error: 'Missing to, subject, or body' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await createDraft(accessToken, to, subject, draftBody);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ============= DRIVE ACTIONS =============
      case 'list_files': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await listDriveFiles(accessToken, body.query, body.max_results, body.folder_id);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'upload_file': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.file_name || !body.content) {
          return new Response(JSON.stringify({ success: false, error: 'Missing file_name or content' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await uploadDriveFile(accessToken, body.file_name, body.content, body.mime_type, body.folder_id);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get_file': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.file_id) {
          return new Response(JSON.stringify({ success: false, error: 'Missing file_id' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await getDriveFile(accessToken, body.file_id);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'download_file': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.file_id) {
          return new Response(JSON.stringify({ success: false, error: 'Missing file_id' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const content = await downloadDriveFile(accessToken, body.file_id);
        return new Response(JSON.stringify({ success: true, content }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'create_folder': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.folder_name) {
          return new Response(JSON.stringify({ success: false, error: 'Missing folder_name' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await createDriveFolder(accessToken, body.folder_name, body.parent_folder_id);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'share_file': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.file_id || !body.email) {
          return new Response(JSON.stringify({ success: false, error: 'Missing file_id or email' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await shareDriveFile(accessToken, body.file_id, body.email, body.role);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ============= SHEETS ACTIONS =============
      case 'create_spreadsheet': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.title) {
          return new Response(JSON.stringify({ success: false, error: 'Missing title' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await createSpreadsheet(accessToken, body.title, body.sheet_name);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'read_sheet': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.spreadsheet_id || !body.range) {
          return new Response(JSON.stringify({ success: false, error: 'Missing spreadsheet_id or range' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await readSheet(accessToken, body.spreadsheet_id, body.range);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'write_sheet': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.spreadsheet_id || !body.range || !body.values) {
          return new Response(JSON.stringify({ success: false, error: 'Missing spreadsheet_id, range, or values' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await writeSheet(accessToken, body.spreadsheet_id, body.range, body.values);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'append_sheet': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.spreadsheet_id || !body.range || !body.values) {
          return new Response(JSON.stringify({ success: false, error: 'Missing spreadsheet_id, range, or values' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await appendSheet(accessToken, body.spreadsheet_id, body.range, body.values);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get_spreadsheet_info': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.spreadsheet_id) {
          return new Response(JSON.stringify({ success: false, error: 'Missing spreadsheet_id' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await getSpreadsheetInfo(accessToken, body.spreadsheet_id);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ============= CALENDAR ACTIONS =============
      case 'list_events': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await listCalendarEvents(
          accessToken,
          body.calendar_id,
          body.time_min,
          body.time_max,
          body.max_results
        );
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'create_event': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.title || !body.start_time || !body.end_time) {
          return new Response(JSON.stringify({ success: false, error: 'Missing title, start_time, or end_time' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await createCalendarEvent(
          accessToken,
          body.title,
          body.start_time,
          body.end_time,
          body.description,
          body.attendees,
          body.calendar_id
        );
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'update_event': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.event_id) {
          return new Response(JSON.stringify({ success: false, error: 'Missing event_id' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await updateCalendarEvent(
          accessToken,
          body.event_id,
          {
            title: body.title,
            startTime: body.start_time,
            endTime: body.end_time,
            description: body.description
          },
          body.calendar_id
        );
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'delete_event': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.event_id) {
          return new Response(JSON.stringify({ success: false, error: 'Missing event_id' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await deleteCalendarEvent(accessToken, body.event_id, body.calendar_id);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get_event': {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!body.event_id) {
          return new Response(JSON.stringify({ success: false, error: 'Missing event_id' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const result = await getCalendarEvent(accessToken, body.event_id, body.calendar_id);
        return new Response(JSON.stringify({ success: true, result }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        return new Response(JSON.stringify({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: [
            // OAuth
            'get_authorization_url', 'callback', 'get_access_token', 'status',
            // Gmail
            'send_email', 'list_emails', 'get_email', 'create_draft',
            // Drive
            'list_files', 'upload_file', 'get_file', 'download_file', 'create_folder', 'share_file',
            // Sheets
            'create_spreadsheet', 'read_sheet', 'write_sheet', 'append_sheet', 'get_spreadsheet_info',
            // Calendar
            'list_events', 'create_event', 'update_event', 'delete_event', 'get_event'
          ]
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error) {
    console.error('google-cloud-auth error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
