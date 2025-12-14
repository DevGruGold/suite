import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getGoogleAccessToken, isGoogleConfigured, corsHeaders } from "../_shared/googleAuthHelper.ts";

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';

// ============= DRIVE ACTIONS =============

async function listFiles(accessToken: string, query = '', maxResults = 20, folderId?: string) {
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

async function uploadFile(accessToken: string, fileName: string, content: string, mimeType = 'text/plain', folderId?: string) {
  const metadata: any = { name: fileName };
  if (folderId) metadata.parents = [folderId];

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

async function getFile(accessToken: string, fileId: string) {
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?fields=*`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.json();
}

async function downloadFile(accessToken: string, fileId: string) {
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.text();
}

async function createFolder(accessToken: string, folderName: string, parentFolderId?: string) {
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

async function shareFile(accessToken: string, fileId: string, email: string, role = 'reader') {
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!isGoogleConfigured()) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Google Cloud not configured',
        credential_required: true,
        message: 'Please configure Google OAuth credentials'
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const action = body.action;

    console.log(`📁 google-drive: action=${action}`);

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to get access token',
        credential_required: true
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let result;

    switch (action) {
      case 'list_files':
        result = await listFiles(accessToken, body.query, body.max_results, body.folder_id);
        break;

      case 'upload_file':
        result = await uploadFile(accessToken, body.file_name, body.content, body.mime_type, body.folder_id);
        break;

      case 'get_file':
        result = await getFile(accessToken, body.file_id);
        break;

      case 'download_file':
        const content = await downloadFile(accessToken, body.file_id);
        result = { content };
        break;

      case 'create_folder':
        result = await createFolder(accessToken, body.folder_name, body.parent_folder_id);
        break;

      case 'share_file':
        result = await shareFile(accessToken, body.file_id, body.email, body.role);
        break;

      case 'list_actions':
        result = {
          service: 'google-drive',
          actions: [
            { name: 'list_files', params: ['query?', 'max_results?', 'folder_id?'], description: 'List files in Drive' },
            { name: 'upload_file', params: ['file_name', 'content', 'mime_type?', 'folder_id?'], description: 'Upload a file' },
            { name: 'get_file', params: ['file_id'], description: 'Get file metadata' },
            { name: 'download_file', params: ['file_id'], description: 'Download file content' },
            { name: 'create_folder', params: ['folder_name', 'parent_folder_id?'], description: 'Create a folder' },
            { name: 'share_file', params: ['file_id', 'email', 'role?'], description: 'Share file with user' }
          ]
        };
        break;

      default:
        return new Response(JSON.stringify({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: ['list_files', 'upload_file', 'get_file', 'download_file', 'create_folder', 'share_file', 'list_actions']
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('google-drive error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
