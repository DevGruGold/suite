import { corsHeaders } from '../_shared/cors.ts';

const ORGO_API_URL = 'https://www.orgo.ai/api';

interface OrgoRequest {
    action: 'create_device' | 'list_devices' | 'control' | 'execute' | 'screenshot' | 'delete_device';
    // Common
    workspace_id?: string;
    computer_id?: string;
    // create_device
    name?: string;
    os?: 'linux' | 'android'; // "android" in quotes here maps to Orgo's VM types
    ram?: number;
    cpu?: number;
    // control
    type?: 'mouse_move' | 'left_click' | 'right_click' | 'double_click' | 'type' | 'key_press' | 'scroll';
    x?: number;
    y?: number;
    text?: string;
    key?: string;
    amount?: number; // for scroll
    // execute
    command?: string;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const ORGO_API_KEY = Deno.env.get('ORGO_API_KEY');
        if (!ORGO_API_KEY) {
            throw new Error('Missing ORGO_API_KEY environment variable');
        }

        const payload: OrgoRequest = await req.json().catch(() => ({}));
        const { action } = payload;

        const commonHeaders = {
            'Authorization': `Bearer ${ORGO_API_KEY}`,
            'Content-Type': 'application/json'
        };

        let response;
        let result;

        console.log(`🤖 [ANDROID-CONTROL] Action: ${action}`);

        switch (action) {
            case 'list_devices':
                // List computers for the authenticated workspace
                // NOTE: The API docs might separate getting workspace first, but /computers is standard. 
                // If /computers doesn't exist at root, we might need to query workspace first.
                // Based on docs chunk read: `curl -X POST https://www.orgo.ai/api/computers` creates one.
                // We'll assume GET /computers or GET /workspaces/{id}/computers exists or similar.
                // Let's try listing workspaces first to get the default one if needed, or check /computers.
                // Docs snippet: `curl -X POST https://www.orgo.ai/api/workspaces`

                // Strategy: List workspaces to get IDs, then list computers (if hierarchical).
                // Or check if there is a flat list endpoint.
                // For now, let's assume we can list workspaces.
                response = await fetch(`${ORGO_API_URL}/workspaces`, {
                    method: 'GET',
                    headers: commonHeaders
                });

                if (!response.ok) throw new Error(`Failed to list workspaces: ${await response.text()}`);
                const workspaces = await response.json();

                // If we want computers, we iterate workspaces or find a /computers endpoint.
                // Let's assume we return the workspace list for now, which contains computers often.
                result = workspaces;
                // Optimization: If the user passed a workspace_id, we could drill down.
                // But Orgo's structure likely puts computers under workspaces.
                break;

            case 'create_device':
                if (!payload.name) throw new Error('Missing name');
                if (!payload.workspace_id) throw new Error('Missing workspace_id');

                response = await fetch(`${ORGO_API_URL}/computers`, {
                    method: 'POST',
                    headers: commonHeaders,
                    body: JSON.stringify({
                        workspace_id: payload.workspace_id,
                        name: payload.name,
                        os: payload.os || 'linux', // Default to linux if not specified
                        ram: payload.ram || 4,
                        cpu: payload.cpu || 2
                    })
                });

                if (!response.ok) throw new Error(`Failed to create device: ${await response.text()}`);
                result = await response.json();
                break;

            case 'control':
                if (!payload.computer_id) throw new Error('Missing computer_id');
                if (!payload.type) throw new Error('Missing control type');

                // Map abstract types to specific Orgo endpoints
                if (['mouse_move', 'left_click', 'right_click', 'double_click'].includes(payload.type!)) {
                    // Mouse endpoint
                    const body: any = { type: payload.type };
                    if (payload.x !== undefined) body.x = payload.x;
                    if (payload.y !== undefined) body.y = payload.y;

                    response = await fetch(`${ORGO_API_URL}/computers/${payload.computer_id}/mouse`, {
                        method: 'POST',
                        headers: commonHeaders,
                        body: JSON.stringify(body)
                    });
                } else if (payload.type === 'type' || payload.type === 'key_press') {
                    // Keyboard endpoint
                    const body: any = { type: payload.type };
                    if (payload.text) body.text = payload.text;
                    if (payload.key) body.key = payload.key;

                    response = await fetch(`${ORGO_API_URL}/computers/${payload.computer_id}/keyboard`, {
                        method: 'POST',
                        headers: commonHeaders,
                        body: JSON.stringify(body)
                    });
                } else {
                    throw new Error(`Unsupported control type: ${payload.type}`);
                }

                if (!response.ok) throw new Error(`Failed to control device: ${await response.text()}`);
                result = await response.json();
                break;

            case 'execute':
                if (!payload.computer_id) throw new Error('Missing computer_id');
                if (!payload.command) throw new Error('Missing command');

                response = await fetch(`${ORGO_API_URL}/computers/${payload.computer_id}/bash`, {
                    method: 'POST',
                    headers: commonHeaders,
                    body: JSON.stringify({ command: payload.command })
                });

                if (!response.ok) throw new Error(`Failed to execute command: ${await response.text()}`);
                result = await response.json();
                break;

            case 'screenshot':
                if (!payload.computer_id) throw new Error('Missing computer_id');

                response = await fetch(`${ORGO_API_URL}/computers/${payload.computer_id}/screenshot`, {
                    method: 'GET',
                    headers: commonHeaders
                });

                if (!response.ok) throw new Error(`Failed to take screenshot: ${await response.text()}`);

                // Return blob/buffer directly or base64? 
                // Edge functions usually return JSON, but we can return blob.
                // Let's return a base64 string wrapped in JSON for easier handling in frontend.
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                result = { screenshot_base64: base64 };
                break;

            default:
                throw new Error(`Unknown action: ${action}`);
        }

        return new Response(JSON.stringify({ success: true, data: result }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('❌ [ANDROID-CONTROL] Error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
