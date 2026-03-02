/**
 * Storyboard Creation Edge Function
 *
 * Generates professional storyboards for marketing campaigns, social media,
 * product demos, and brand storytelling using Vertex AI Imagen 3.
 *
 * Actions:
 *   create_storyboard  — full pipeline: shot list → panels → assembled board metadata
 *   generate_panel     — generate a single panel image
 *   list_storyboards   — list saved storyboards for a session
 *   get_storyboard     — retrieve a saved storyboard
 *   delete_storyboard  — delete a storyboard
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// ─── Cinematography vocabulary ─────────────────────────────────────────────

const SHOT_TYPES: Record<string, string> = {
    ECU: 'Extreme Close-Up: fills frame with a single detail (eye, hand, object)',
    CU: 'Close-Up: subject fills frame, showing face or key object clearly',
    MCU: 'Medium Close-Up: framed from chest up, intimate but context-aware',
    MS: 'Medium Shot: framed from waist up, conversational distance',
    MLS: 'Medium Long Shot: framed from knees up, shows body language',
    LS: 'Long Shot: full body visible, establishes subject in environment',
    WS: 'Wide Shot: wide environment, subject small in frame',
    EWS: 'Extreme Wide Shot: vast landscape/environment, subject tiny or absent',
};

const CAMERA_ANGLES: Record<string, string> = {
    eye_level: 'Eye Level: neutral, relatable perspective',
    high_angle: 'High Angle: looking down on subject, can feel diminutive or vulnerable',
    low_angle: 'Low Angle: looking up at subject, powerful or imposing',
    birds_eye: "Bird's Eye: directly overhead, abstract or disorienting",
    worms_eye: "Worm's Eye: extreme low angle, dramatic grandeur",
    dutch_angle: 'Dutch Angle: tilted camera for unease or tension',
    over_the_shoulder: 'Over-the-Shoulder: behind character looking at another, conversational',
    static: 'Static: locked-off camera, no movement',
};

const CAMERA_MOVEMENTS: Record<string, string> = {
    pan: 'Pan: horizontal rotation of camera on fixed axis',
    tilt: 'Tilt: vertical rotation of camera on fixed axis',
    dolly: 'Dolly: camera physically moves toward/away from subject',
    truck: 'Truck: camera physically moves left/right parallel to subject',
    crane_jib: 'Crane/Jib: camera rises or lowers on arm for dramatic reveals',
    zoom: 'Zoom: focal length changes, subject grows/shrinks without moving camera',
    steadicam: 'Steadicam/Gimbal: smoothly follows action with stabilized movement',
    handheld: 'Handheld: intentional camera shake for urgency or documentary feel',
    static: 'Static: no movement',
};

const LAYOUTS: Record<string, { columns: number; rows: number }> = {
    '2x3': { columns: 2, rows: 3 },
    '3x3': { columns: 3, rows: 3 },
    '2x2': { columns: 2, rows: 2 },
    'single': { columns: 1, rows: 1 },
};

// ─── Types ─────────────────────────────────────────────────────────────────

interface Shot {
    shot_number: number;
    description: string;       // what happens in this shot
    shot_type?: string;       // ECU | CU | MCU | MS | MLS | LS | WS | EWS
    camera_angle?: string;
    camera_movement?: string;
    duration_sec?: number;
    dialogue?: string;
    sound?: string;
    notes?: string;
}

interface StoryboardRequest {
    title: string;
    style?: string;       // 'photorealistic' | 'illustration' | 'sketch' | 'cinematic'
    aspect_ratio?: string;       // '16:9' | '9:16' | '1:1' | '4:3'
    layout?: string;       // '2x3' | '3x3' | '2x2' | 'single'
    brand_context?: string;       // brief brand description for style consistency
    shots: Shot[];
    session_id?: string;
}

// ─── Google Cloud auth helper ───────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
    const { data, error } = await supabase.functions.invoke('google-cloud-auth', {
        body: { action: 'get_access_token', auth_type: 'service_account' }
    });
    if (error || !data?.access_token) throw new Error('Google Cloud authentication failed');
    return data.access_token;
}

// ─── Image generation ───────────────────────────────────────────────────────

async function generatePanelImage(
    accessToken: string,
    prompt: string,
    aspectRatio: string = '16:9'
): Promise<{ base64: string; mimeType: string }> {
    const GOOGLE_CLOUD_PROJECT_ID = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID') || 'xmrt-dao';
    const GOOGLE_CLOUD_LOCATION = Deno.env.get('GOOGLE_CLOUD_LOCATION') || 'us-central1';
    const IMAGEN_ENDPOINT = `https://${GOOGLE_CLOUD_LOCATION}-aiplatform.googleapis.com/v1/projects/${GOOGLE_CLOUD_PROJECT_ID}/locations/${GOOGLE_CLOUD_LOCATION}/publishers/google/models/imagen-3.0-generate-001:predict`;

    const res = await fetch(IMAGEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            instances: [{ prompt }],
            parameters: {
                sampleCount: 1,
                aspectRatio,
                safetyFilterLevel: 'block_some',
                personGeneration: 'allow_adult',
            }
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Imagen 3 error ${res.status}: ${err.slice(0, 300)}`);
    }

    const result = await res.json();
    const pred = result.predictions?.[0];
    if (!pred?.bytesBase64Encoded) throw new Error('No image data returned from Imagen');

    return { base64: pred.bytesBase64Encoded, mimeType: pred.mimeType || 'image/png' };
}

// ─── Prompt builder ─────────────────────────────────────────────────────────

function buildPanelPrompt(shot: Shot, style: string, brandContext: string): string {
    const shotDesc = SHOT_TYPES[shot.shot_type || ''] || '';
    const angleDesc = CAMERA_ANGLES[shot.camera_angle || ''] || '';
    const moveDesc = CAMERA_MOVEMENTS[shot.camera_movement || ''] || '';

    const stylePrefixes: Record<string, string> = {
        photorealistic: 'photorealistic cinematic film frame,',
        illustration: 'professional storyboard illustration, clean line art,',
        sketch: 'pencil sketch storyboard panel, hand-drawn style,',
        cinematic: 'anamorphic cinematic frame, film grain,',
    };
    const stylePrefix = stylePrefixes[style] || 'cinematic storyboard panel,';

    const parts = [
        stylePrefix,
        shot.description,
        shotDesc ? `Shot: ${shot.shot_type} — ${shotDesc.split(':')[1]?.trim()}` : '',
        angleDesc ? `Angle: ${angleDesc.split(':')[0]}` : '',
        moveDesc ? `Camera: ${moveDesc.split(':')[0]}` : '',
        brandContext ? `Brand style: ${brandContext}` : '',
        'storyboard panel, professional composition, clear subject, high quality',
    ].filter(Boolean);

    return parts.join(', ');
}

// ─── Save to DB ─────────────────────────────────────────────────────────────

async function saveStoryboard(
    sessionId: string,
    title: string,
    metadata: any,
    panels: any[]
) {
    const { data, error } = await supabase
        .from('storyboards')
        .insert({
            session_id: sessionId,
            title,
            panel_count: panels.length,
            metadata,
            panels,      // stored as JSONB
            created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

    if (error) {
        console.warn('⚠️ Could not save storyboard to DB (table may not exist yet):', error.message);
        return null;
    }
    return data?.id;
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

    try {
        if (req.method === 'GET') {
            return new Response(JSON.stringify({
                success: true,
                function: 'storyboard-creation',
                status: 'operational',
                actions: ['create_storyboard', 'generate_panel', 'list_storyboards', 'get_storyboard', 'delete_storyboard'],
                shot_types: Object.keys(SHOT_TYPES),
                camera_angles: Object.keys(CAMERA_ANGLES),
                camera_movements: Object.keys(CAMERA_MOVEMENTS),
                layouts: Object.keys(LAYOUTS),
                styles: ['photorealistic', 'illustration', 'sketch', 'cinematic'],
                aspect_ratios: ['16:9', '9:16', '1:1', '4:3'],
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const body = await req.json();
        const { action } = body;
        const sessionId = body.session_id || 'default';
        console.log(`🎬 [storyboard-creation] action=${action}, session=${sessionId}`);

        // ── create_storyboard ─────────────────────────────────────────────────
        if (action === 'create_storyboard') {
            const req_data: StoryboardRequest = {
                title: body.title || 'Untitled Storyboard',
                style: body.style || 'cinematic',
                aspect_ratio: body.aspect_ratio || '16:9',
                layout: body.layout || '2x3',
                brand_context: body.brand_context || '',
                shots: body.shots || [],
                session_id: sessionId,
            };

            if (!req_data.shots.length) {
                return new Response(JSON.stringify({ success: false, error: 'shots array is required and cannot be empty' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            const MAX_PANELS = 12;
            if (req_data.shots.length > MAX_PANELS) {
                return new Response(JSON.stringify({ success: false, error: `Maximum ${MAX_PANELS} shots per storyboard` }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            console.log(`🎬 Generating ${req_data.shots.length}-panel storyboard: "${req_data.title}"`);

            let accessToken: string;
            try {
                accessToken = await getAccessToken();
            } catch (authErr) {
                return new Response(JSON.stringify({ success: false, error: `Auth failed: ${authErr}` }), {
                    status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            const panels: any[] = [];
            const errors: string[] = [];

            for (const shot of req_data.shots) {
                const prompt = buildPanelPrompt(shot, req_data.style!, req_data.brand_context!);
                console.log(`🖼️ Panel ${shot.shot_number}: ${prompt.slice(0, 100)}...`);

                try {
                    const image = await generatePanelImage(accessToken, prompt, req_data.aspect_ratio);
                    panels.push({
                        shot_number: shot.shot_number,
                        shot_type: shot.shot_type,
                        camera_angle: shot.camera_angle,
                        camera_movement: shot.camera_movement,
                        duration_sec: shot.duration_sec,
                        dialogue: shot.dialogue,
                        sound: shot.sound,
                        notes: shot.notes,
                        description: shot.description,
                        prompt_used: prompt,
                        image_base64: image.base64,
                        image_mime_type: image.mimeType,
                        generated_at: new Date().toISOString(),
                    });
                } catch (panelErr) {
                    console.error(`❌ Panel ${shot.shot_number} generation failed:`, panelErr);
                    errors.push(`Panel ${shot.shot_number}: ${panelErr}`);
                    // push placeholder so board is still structured
                    panels.push({
                        shot_number: shot.shot_number,
                        description: shot.description,
                        error: String(panelErr),
                        image_base64: null,
                    });
                }
            }

            const layout = LAYOUTS[req_data.layout || '2x3'] || LAYOUTS['2x3'];
            const totalDur = req_data.shots.reduce((s, sh) => s + (sh.duration_sec || 0), 0);
            const successCount = panels.filter(p => p.image_base64).length;

            const storyboard = {
                title: req_data.title,
                style: req_data.style,
                aspect_ratio: req_data.aspect_ratio,
                layout,
                panel_count: panels.length,
                panels_successful: successCount,
                total_duration_sec: totalDur,
                panels,
                errors,
                created_at: new Date().toISOString(),
            };

            // Save to DB (best-effort)
            const storyboardId = await saveStoryboard(sessionId, req_data.title, {
                style: req_data.style, aspect_ratio: req_data.aspect_ratio, layout, total_duration_sec: totalDur,
            }, panels);

            return new Response(JSON.stringify({
                success: true,
                storyboard_id: storyboardId,
                storyboard,
                summary: `Generated ${successCount}/${panels.length} panels for "${req_data.title}"`,
                errors: errors.length ? errors : undefined,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // ── generate_panel ───────────────────────────────────────────────────
        if (action === 'generate_panel') {
            const shot: Shot = body.shot || {};
            if (!shot.description) {
                return new Response(JSON.stringify({ success: false, error: 'shot.description is required' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            const style = body.style || 'cinematic';
            const aspectRatio = body.aspect_ratio || '16:9';
            const brandContext = body.brand_context || '';

            const accessToken = await getAccessToken();
            const prompt = buildPanelPrompt(shot, style, brandContext);
            const image = await generatePanelImage(accessToken, prompt, aspectRatio);

            return new Response(JSON.stringify({
                success: true,
                panel: {
                    ...shot,
                    prompt_used: prompt,
                    image_base64: image.base64,
                    image_mime_type: image.mimeType,
                    generated_at: new Date().toISOString(),
                }
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // ── list_storyboards ─────────────────────────────────────────────────
        if (action === 'list_storyboards') {
            const { data, error } = await supabase
                .from('storyboards')
                .select('id, title, panel_count, metadata, created_at')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            return new Response(JSON.stringify({ success: true, storyboards: data || [] }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // ── get_storyboard ───────────────────────────────────────────────────
        if (action === 'get_storyboard') {
            if (!body.storyboard_id) {
                return new Response(JSON.stringify({ success: false, error: 'storyboard_id required' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            const { data, error } = await supabase
                .from('storyboards')
                .select('*')
                .eq('id', body.storyboard_id)
                .single();
            if (error) throw error;
            return new Response(JSON.stringify({ success: true, storyboard: data }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // ── delete_storyboard ────────────────────────────────────────────────
        if (action === 'delete_storyboard') {
            if (!body.storyboard_id) {
                return new Response(JSON.stringify({ success: false, error: 'storyboard_id required' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            const { error } = await supabase.from('storyboards').delete().eq('id', body.storyboard_id);
            if (error) throw error;
            return new Response(JSON.stringify({ success: true, deleted: body.storyboard_id }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            success: false,
            error: `Unknown action: ${action}`,
            available_actions: ['create_storyboard', 'generate_panel', 'list_storyboards', 'get_storyboard', 'delete_storyboard'],
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (err) {
        console.error('storyboard-creation error:', err);
        return new Response(JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
