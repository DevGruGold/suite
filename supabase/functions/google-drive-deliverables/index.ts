import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeliverableRequest {
    task_id: string;
    agent_name?: string;
    deliverable_type?: 'report' | 'plan' | 'data' | 'analysis' | 'summary';
    title?: string;
    content_markdown?: string;
    content_csv?: string;         // optional: triggers Sheet creation
    share_with_email?: string;    // optional: share deliverables with this email
}

interface DeliverableResult {
    success: boolean;
    docId?: string;
    docUrl?: string;
    pdfUrl?: string;
    sheetId?: string;
    sheetUrl?: string;
    folderId?: string;
    folderUrl?: string;
    fileName?: string;
    error?: string;
}

// ─── Markdown → Docs API batchUpdate requests ────────────────────────────────
// Converts a Markdown string into an ordered list of Docs API insertText +
// updateParagraphStyle requests. Supports: H1/H2/H3, bullet lists, bold, code.
function markdownToDocsRequests(markdown: string): any[] {
    const lines = markdown.split('\n');
    const requests: any[] = [];
    let index = 1; // Docs API inserts from index 1

    // Helper: insert text, then apply a paragraph style to that range
    const insertLine = (text: string, style: string | null = null, bold = false) => {
        const fullText = text + '\n';
        requests.push({ insertText: { location: { index }, text: fullText } });

        if (style) {
            requests.push({
                updateParagraphStyle: {
                    range: { startIndex: index, endIndex: index + fullText.length },
                    paragraphStyle: { namedStyleType: style },
                    fields: 'namedStyleType'
                }
            });
        }

        if (bold) {
            requests.push({
                updateTextStyle: {
                    range: { startIndex: index, endIndex: index + text.length },
                    textStyle: { bold: true },
                    fields: 'bold'
                }
            });
        }

        index += fullText.length;
    };

    for (const raw of lines) {
        const line = raw.trimEnd();

        if (line.startsWith('### ')) {
            insertLine(line.slice(4), 'HEADING_3');
        } else if (line.startsWith('## ')) {
            insertLine(line.slice(3), 'HEADING_2');
        } else if (line.startsWith('# ')) {
            insertLine(line.slice(2), 'HEADING_1');
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
            // Bullet list item — insert text then apply bullet style
            const text = line.slice(2);
            requests.push({ insertText: { location: { index }, text: text + '\n' } });
            requests.push({
                createParagraphBullets: {
                    range: { startIndex: index, endIndex: index + text.length + 1 },
                    bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE'
                }
            });
            index += text.length + 1;
        } else if (line === '' || line === '---') {
            // Empty line / HR
            insertLine('');
        } else if (line.startsWith('**') && line.endsWith('**')) {
            insertLine(line.replace(/\*\*/g, ''), 'NORMAL_TEXT', true);
        } else {
            insertLine(line, 'NORMAL_TEXT');
        }
    }

    return requests;
}

// ─── CSV → 2D array ──────────────────────────────────────────────────────────
function csvToValues(csv: string): string[][] {
    return csv.trim().split('\n').map(row =>
        row.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
    );
}

// ─── Build file naming ───────────────────────────────────────────────────────
function buildFileName(taskId: string, agentName: string, type: string): string {
    const shortId = taskId.slice(0, 8);
    const agent = agentName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `${shortId}_${agent}_${date}_${type}`;
}

// ─── google-cloud-auth helper ─────────────────────────────────────────────────
async function callGoogleAuth(supabaseAdmin: any, action: string, params: Record<string, unknown>) {
    const { data, error } = await supabaseAdmin.functions.invoke('google-cloud-auth', {
        body: { action, ...params }
    });
    if (error) throw new Error(`google-cloud-auth/${action} error: ${error.message}`);
    if (!data?.success) throw new Error(`google-cloud-auth/${action} failed: ${data?.error || JSON.stringify(data)}`);
    return data;
}

// ─── Ensure Drive folder exists ───────────────────────────────────────────────
// Creates the nested folder path "XMRT-DAO Deliverables/{type}/{shortTaskId}"
// and returns the leaf folderId. Uses search-then-create to avoid duplicates.
async function ensureFolder(
    supabaseAdmin: any,
    accessToken: string,
    deliverableType: string,
    shortTaskId: string
): Promise<{ folderId: string; folderUrl: string }> {

    const DRIVE = 'https://www.googleapis.com/drive/v3';
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    const findOrCreate = async (name: string, parentId?: string): Promise<string> => {
        let q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        if (parentId) q += ` and '${parentId}' in parents`;

        const searchResp = await fetch(`${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
            headers: authHeader
        });
        const searchData = await searchResp.json();

        if (searchData.files?.length > 0) return searchData.files[0].id;

        // Create
        const meta: any = { name, mimeType: 'application/vnd.google-apps.folder' };
        if (parentId) meta.parents = [parentId];
        const createResp = await fetch(`${DRIVE}/files`, {
            method: 'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(meta)
        });
        const createData = await createResp.json();
        if (!createData.id) throw new Error(`Failed to create folder "${name}": ${JSON.stringify(createData)}`);
        return createData.id;
    };

    const rootId = await findOrCreate('XMRT-DAO Deliverables');
    const typeId = await findOrCreate(deliverableType, rootId);
    const taskFolderId = await findOrCreate(shortTaskId, typeId);

    return {
        folderId: taskFolderId,
        folderUrl: `https://drive.google.com/drive/folders/${taskFolderId}`
    };
}

// ─── Move a Drive file into a folder ─────────────────────────────────────────
async function moveToFolder(accessToken: string, fileId: string, folderId: string): Promise<void> {
    // Add new parent, remove from root
    const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}&removeParents=root&fields=id,parents`,
        {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        }
    );
    if (!resp.ok) {
        const err = await resp.text();
        console.warn(`⚠️ moveToFolder warning for file ${fileId}: ${err}`);
    }
}

// ─── Set file sharing permissions ────────────────────────────────────────────
async function setPublicReadable(accessToken: string, fileId: string, shareWithEmail?: string): Promise<void> {
    const base = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
    const h = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    // Anyone with link can view
    await fetch(base, {
        method: 'POST', headers: h,
        body: JSON.stringify({ type: 'anyone', role: 'reader' })
    });

    // Also share directly with specific email if provided
    if (shareWithEmail) {
        await fetch(base, {
            method: 'POST', headers: h,
            body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: shareWithEmail })
        });
    }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const body: DeliverableRequest = await req.json();
        const {
            task_id,
            agent_name = 'XMRT-Agent',
            deliverable_type = 'report',
            content_markdown = '',
            content_csv,
            share_with_email,
        } = body;

        const title = body.title || `${deliverable_type.charAt(0).toUpperCase() + deliverable_type.slice(1)} — Task ${task_id?.slice(0, 8) ?? 'unknown'}`;

        if (!task_id) {
            return new Response(JSON.stringify({ success: false, error: 'task_id is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        console.log(`📄 [drive-deliverables] Starting for task ${task_id}, type=${deliverable_type}`);

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // ── 1. Get Google OAuth token ──────────────────────────────────────────
        const { data: authData, error: authError } = await supabaseAdmin.functions.invoke('google-cloud-auth', {
            body: { action: 'get_access_token', auth_type: 'service_account' }
        });
        if (authError || !authData?.access_token) {
            throw new Error(`Google auth failed: ${authError?.message || 'no token'}`);
        }
        const accessToken: string = authData.access_token;
        console.log('🔑 [drive-deliverables] Access token obtained');

        const fileName = buildFileName(task_id, agent_name, deliverable_type);
        const shortId = task_id.slice(0, 8);

        // ── 2. Ensure Drive folder hierarchy ──────────────────────────────────
        const { folderId, folderUrl } = await ensureFolder(supabaseAdmin, accessToken, deliverableType, shortId);
        console.log(`📁 [drive-deliverables] Folder ready: ${folderId}`);

        // ── 3. Create Google Doc and insert content ────────────────────────────
        let docId: string | undefined;
        let docUrl: string | undefined;
        let pdfUrl: string | undefined;

        const DOCS_URL = 'https://docs.googleapis.com/v1/documents';
        const authHeader = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

        // Create empty doc
        const createDocResp = await fetch(DOCS_URL, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({ title })
        });
        const docData = await createDocResp.json();
        if (!createDocResp.ok) throw new Error(`create_doc failed: ${docData.error?.message}`);
        docId = docData.documentId;
        docUrl = `https://docs.google.com/document/d/${docId}/edit`;
        console.log(`📝 [drive-deliverables] Doc created: ${docId}`);

        // Insert content if provided
        if (content_markdown.trim()) {
            const docRequests = markdownToDocsRequests(content_markdown);
            if (docRequests.length > 0) {
                const batchResp = await fetch(`${DOCS_URL}/${docId}:batchUpdate`, {
                    method: 'POST',
                    headers: authHeader,
                    body: JSON.stringify({ requests: docRequests })
                });
                if (!batchResp.ok) {
                    const errBody = await batchResp.text();
                    console.warn(`⚠️ batchUpdate partial failure: ${errBody}`);
                } else {
                    console.log(`✅ [drive-deliverables] Content inserted into doc (${docRequests.length} ops)`);
                }
            }
        }

        // Move doc into the task folder
        await moveToFolder(accessToken, docId!, folderId);

        // Set doc as publicly readable (anyone with link)
        await setPublicReadable(accessToken, docId!, share_with_email);

        // ── 4. Export Doc → PDF ───────────────────────────────────────────────
        try {
            const exportResp = await fetch(
                `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=application%2Fpdf`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            if (exportResp.ok) {
                const pdfBytes = await exportResp.arrayBuffer();
                const boundary = 'pdf_mp_boundary';
                const pdfMeta = JSON.stringify({
                    name: `${fileName}.pdf`,
                    mimeType: 'application/pdf',
                    parents: [folderId]
                });
                const enc = new TextEncoder();
                const pre = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${pdfMeta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
                const post = enc.encode(`\r\n--${boundary}--`);
                const combined = new Uint8Array(pre.byteLength + pdfBytes.byteLength + post.byteLength);
                combined.set(pre, 0);
                combined.set(new Uint8Array(pdfBytes), pre.byteLength);
                combined.set(post, pre.byteLength + pdfBytes.byteLength);

                const pdfUploadResp = await fetch(
                    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
                    {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
                        body: combined
                    }
                );
                const pdfData = await pdfUploadResp.json();
                if (pdfData.id) {
                    await setPublicReadable(accessToken, pdfData.id, share_with_email);
                    pdfUrl = pdfData.webViewLink || `https://drive.google.com/file/d/${pdfData.id}/view`;
                    console.log(`✅ [drive-deliverables] PDF uploaded: ${pdfUrl}`);
                }
            } else {
                console.warn(`⚠️ [drive-deliverables] PDF export skipped: ${exportResp.status}`);
            }
        } catch (pdfErr: any) {
            console.warn(`⚠️ [drive-deliverables] PDF generation failed (non-fatal): ${pdfErr.message}`);
        }

        // ── 5. Create Google Sheet if CSV data provided ────────────────────────
        let sheetId: string | undefined;
        let sheetUrl: string | undefined;

        if (content_csv?.trim()) {
            try {
                const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
                const createSheetResp = await fetch(SHEETS_URL, {
                    method: 'POST',
                    headers: authHeader,
                    body: JSON.stringify({ properties: { title: `${title} — Data` } })
                });
                const sheetData = await createSheetResp.json();
                if (!createSheetResp.ok) throw new Error(`Sheet create failed: ${sheetData.error?.message}`);

                sheetId = sheetData.spreadsheetId;
                sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

                // Populate with CSV data
                const values = csvToValues(content_csv);
                await fetch(
                    `${SHEETS_URL}/${sheetId}/values/A1?valueInputOption=USER_ENTERED`,
                    {
                        method: 'PUT',
                        headers: authHeader,
                        body: JSON.stringify({ values })
                    }
                );

                // Move sheet to folder
                await moveToFolder(accessToken, sheetId, folderId);
                await setPublicReadable(accessToken, sheetId, share_with_email);
                console.log(`✅ [drive-deliverables] Sheet created: ${sheetId}`);
            } catch (sheetErr: any) {
                console.warn(`⚠️ [drive-deliverables] Sheet creation failed (non-fatal): ${sheetErr.message}`);
            }
        }

        // ── 6. Build deliverable record ────────────────────────────────────────
        const deliverableRecord = {
            type: deliverable_type,
            title,
            fileName,
            folderId,
            folderUrl,
            docId,
            docUrl,
            pdfUrl,
            sheetId,
            sheetUrl,
            createdAt: new Date().toISOString(),
            agentName: agent_name
        };

        // ── 7. Update tasks table ─────────────────────────────────────────────
        // Build a deliverables footer for last_work_result
        const deliverableFooter = [
            '\n\n---',
            '📄 **Google Drive Deliverables:**',
            docUrl ? `• 📝 [Google Doc](${docUrl})` : null,
            pdfUrl ? `• 📋 [PDF Export](${pdfUrl})` : null,
            sheetUrl ? `• 📊 [Data Sheet](${sheetUrl})` : null,
            folderUrl ? `• 📁 [Drive Folder](${folderUrl})` : null,
        ].filter(Boolean).join('\n');

        // Fetch current last_work_result to avoid overwriting existing content
        const { data: taskRow } = await supabaseAdmin
            .from('tasks')
            .select('last_work_result, drive_deliverables')
            .eq('id', task_id)
            .single();

        const existingResult = taskRow?.last_work_result || '';
        const existingDeliverables = Array.isArray(taskRow?.drive_deliverables) ? taskRow.drive_deliverables : [];

        await supabaseAdmin
            .from('tasks')
            .update({
                last_work_result: existingResult.includes('Google Drive Deliverables')
                    ? existingResult  // already has links — don't duplicate
                    : existingResult + deliverableFooter,
                drive_deliverables: [...existingDeliverables, deliverableRecord]
            })
            .eq('id', task_id);

        console.log(`✅ [drive-deliverables] Task ${task_id} updated with deliverable links`);

        // ── 8. Log to eliza_activity_log ──────────────────────────────────────
        try {
            await supabaseAdmin.from('eliza_activity_log').insert({
                title: `Drive Deliverable Created: ${title}`,
                description: `${agent_name} generated a ${deliverable_type} deliverable for task ${task_id}`,
                activity_type: 'deliverable_created',
                status: 'completed',
                metadata: deliverableRecord,
                mentioned_to_user: false
            });
        } catch (_) { /* non-fatal */ }

        const result: DeliverableResult = {
            success: true,
            docId, docUrl, pdfUrl,
            sheetId, sheetUrl,
            folderId, folderUrl,
            fileName
        };

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error(`❌ [drive-deliverables] Error:`, error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Unknown error in drive-deliverables'
        }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
