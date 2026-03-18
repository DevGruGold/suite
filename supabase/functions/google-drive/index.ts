import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getGoogleAccessToken, isGoogleConfigured, corsHeaders, extractUserContext, UserTokenInfo } from "../_shared/googleAuthHelper.ts";
import { startUsageTrackingWithRequest } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'google-drive';

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
  
  // Check if this is a binary file type that needs base64 decoding
  const isBinaryFile = mimeType.startsWith('image/') || 
                      mimeType.startsWith('video/') || 
                      mimeType.startsWith('audio/') ||
                      mimeType === 'application/pdf' ||
                      mimeType === 'application/zip' ||
                      mimeType === 'application/x-zip-compressed' ||
                      mimeType === 'application/octet-stream';

  let body: string | Uint8Array;

  if (isBinaryFile) {
    // Remove data URL prefix if present (e.g., "data:image/png;base64,")
    const base64Data = content.includes('base64,') 
      ? content.split('base64,')[1] 
      : content;
    
    // Decode base64 to binary
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    // Build multipart body as binary
    const encoder = new TextEncoder();
    
    // Metadata part
    const metadataPart = encoder.encode(
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n' +
      '\r\n' +
      JSON.stringify(metadata) +
      '\r\n'
    );
    
    // File content part with proper headers for binary data
    const contentPartHeader = encoder.encode(
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n` +
      '\r\n'
    );
    
    // Closing boundary
    const closingBoundary = encoder.encode(`\r\n--${boundary}--`);
    
    // Combine all parts
    const totalLength = metadataPart.length + contentPartHeader.length + binaryData.length + closingBoundary.length;
    body = new Uint8Array(totalLength);
    
    let offset = 0;
    body.set(metadataPart, offset);
    offset += metadataPart.length;
    body.set(contentPartHeader, offset);
    offset += contentPartHeader.length;
    body.set(binaryData, offset);
    offset += binaryData.length;
    body.set(closingBoundary, offset);
  } else {
    // For text files, keep original behavior
    body = [
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
  }

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: body
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

  let body: any = {};
  try {
    body = await req.json();
  } catch { body = {}; }

  const usageTracker = startUsageTrackingWithRequest(FUNCTION_NAME, req, body);

  try {
    // Extract user context from request
    const userContext = await extractUserContext(req, body);
    console.log('👤 User context:', { 
      userId: userContext.userId, 
      userEmail: userContext.userEmail, 
      requestedFrom: userContext.requestedFrom 
    });

    if (!(await isGoogleConfigured(userContext))) {
      await usageTracker.failure('Google Cloud not configured', 401);
      return new Response(JSON.stringify({
        success: false,
        error: 'Google Cloud not configured',
        credential_required: true,
        message: 'Please configure Google OAuth credentials and authorize via OAuth flow'
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const action = body.action;

    console.log(`📁 google-drive: action=${action}`);

    // Get access token with user context
    const tokenOrErr = await getGoogleAccessToken(userContext);
    
    // Check for error response
    if ('error' in tokenOrErr) {
      const err = tokenOrErr as { error: string; code: number; reason?: string };
      await usageTracker.failure(err.error, err.code);
      return new Response(JSON.stringify({ 
        success: false, 
        error: err.error, 
        reason: err.reason 
      }), { 
        status: err.code, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    // Success - we have a valid token info
    const tokenInfo = tokenOrErr as UserTokenInfo;
    usageTracker.setUserInfo(tokenInfo.userEmail, tokenInfo.userId);
    console.log(`📁 Operating as: ${tokenInfo.userEmail || 'env-fallback'}`);
    const accessToken = tokenInfo.accessToken;

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
        await usageTracker.failure(`Unknown action: ${action}`, 400);
        return new Response(JSON.stringify({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: ['list_files', 'upload_file', 'get_file', 'download_file', 'create_folder', 'share_file', 'list_actions']
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await usageTracker.success({ result_summary: `${action} completed` });
    
    // Return result with user info
    return new Response(JSON.stringify({ 
      success: true, 
      result,
      user: { 
        email: tokenInfo.userEmail, 
        id: tokenInfo.userId 
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('google-drive error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
