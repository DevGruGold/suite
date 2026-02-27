import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    try {
        // Fetch all pending/processing jobs (limit 5 per run to avoid timeout)
        const { data: jobs, error: fetchErr } = await supabase
            .from('video_jobs')
            .select('*')
            .in('status', ['pending', 'processing'])
            .order('initiated_at', { ascending: true })
            .limit(5);

        if (fetchErr) throw new Error(`Failed to fetch video_jobs: ${fetchErr.message}`);
        if (!jobs || jobs.length === 0) {
            return new Response(JSON.stringify({ success: true, message: 'No pending jobs', processed: 0 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        console.log(`🔄 [video-job-processor] Processing ${jobs.length} pending video job(s)`);

        // Get a service account token once for all jobs
        const { data: authData, error: authError } = await supabase.functions.invoke('google-cloud-auth', {
            body: { action: 'get_access_token', auth_type: 'service_account' }
        });
        if (authError || !authData?.access_token) {
            throw new Error(`google-cloud-auth failed: ${authError?.message || 'No token'}`);
        }
        const accessToken = authData.access_token;

        const projectId = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID') ?? '';
        const location = 'us-central1';

        const results = [];

        for (const job of jobs) {
            const { operation_name, model = 'veo-3.1-generate-001' } = job;

            // Skip very fresh jobs (give Veo at least 60s before first poll)
            const ageMs = Date.now() - new Date(job.initiated_at).getTime();
            if (ageMs < 60_000) {
                results.push({ operation_name, action: 'skipped_too_fresh', age_seconds: Math.round(ageMs / 1000) });
                continue;
            }

            // Skip jobs that expired their LRO window (> 8 minutes old — Veo LROs last ~5 min)
            if (ageMs > 8 * 60_000) {
                await supabase.from('video_jobs').update({
                    status: 'failed',
                    error_message: 'LRO expired — Vertex AI Veo LROs are only valid for ~5 minutes after initiation'
                }).eq('operation_name', operation_name);
                results.push({ operation_name, action: 'marked_expired' });
                continue;
            }

            console.log(`🔍 [video-job-processor] Polling: ${operation_name} (age: ${Math.round(ageMs / 1000)}s)`);

            // Mark as being polled
            await supabase.from('video_jobs').update({ last_polled_at: new Date().toISOString(), status: 'processing' })
                .eq('operation_name', operation_name);

            try {
                const pollUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:fetchPredictOperation`;
                const pollResp = await fetch(pollUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ operationName: operation_name })
                });

                if (!pollResp.ok) {
                    const errText = await pollResp.text();
                    console.warn(`⚠️ [video-job-processor] Poll ${pollResp.status} for ${operation_name}: ${errText.slice(0, 200)}`);

                    if (pollResp.status === 404) {
                        // LRO expired — check if video appeared in storage in the last 10 minutes
                        const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
                        const { data: recentFiles } = await supabase.storage
                            .from('generated-media')
                            .list('videos', { limit: 20, sortBy: { column: 'created_at', order: 'desc' } });

                        const recentVideo = recentFiles?.find((f: any) => f.created_at > cutoff);
                        if (recentVideo) {
                            const publicUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/generated-media/videos/${recentVideo.name}`;
                            await supabase.from('video_jobs').update({
                                status: 'done',
                                video_urls: [publicUrl],
                                completed_at: new Date().toISOString(),
                                error_message: 'LRO expired but recent video found in storage (heuristic match)'
                            }).eq('operation_name', operation_name);
                            results.push({ operation_name, action: 'completed_via_storage_heuristic', url: publicUrl });
                        } else {
                            await supabase.from('video_jobs').update({
                                status: 'failed',
                                error_message: 'LRO 404 — operation expired before completion'
                            }).eq('operation_name', operation_name);
                            results.push({ operation_name, action: 'failed_lro_expired' });
                        }
                    }
                    continue;
                }

                const pollData = await pollResp.json();

                if (pollData.error) {
                    await supabase.from('video_jobs').update({
                        status: 'failed',
                        error_message: JSON.stringify(pollData.error)
                    }).eq('operation_name', operation_name);
                    results.push({ operation_name, action: 'failed_vertex_error', error: pollData.error });
                    continue;
                }

                if (!pollData.done) {
                    console.log(`⏳ [video-job-processor] Still processing: ${operation_name}`);
                    results.push({ operation_name, action: 'still_processing' });
                    continue;
                }

                // ✅ Done — extract and upload video
                console.log(`🎬 [video-job-processor] DONE: ${operation_name} — uploading video...`);
                const samples: any[] =
                    pollData.response?.generateVideoResponse?.generatedSamples ||
                    pollData.response?.predictions ||
                    pollData.response?.videos ||
                    pollData.predictions ||
                    [];

                const videoUrls: string[] = [];
                for (const s of samples) {
                    const video = s.video || s;
                    if (video.bytesBase64Encoded) {
                        try {
                            const bytes = Uint8Array.from(atob(video.bytesBase64Encoded), (c: string) => c.charCodeAt(0));
                            const path = `videos/${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;
                            const { error: uploadErr } = await supabase.storage
                                .from('generated-media')
                                .upload(path, bytes, { contentType: 'video/mp4', upsert: false });
                            if (!uploadErr) {
                                const { data: urlData } = supabase.storage.from('generated-media').getPublicUrl(path);
                                videoUrls.push(urlData.publicUrl);
                                console.log(`✅ [video-job-processor] Uploaded: ${urlData.publicUrl}`);
                            } else {
                                console.error(`❌ Upload error: ${uploadErr.message}`);
                            }
                        } catch (e: any) {
                            console.error(`❌ Upload exception: ${e.message}`);
                        }
                    } else if (video.uri || video.gcsUri) {
                        videoUrls.push(video.uri || video.gcsUri);
                    }
                }

                await supabase.from('video_jobs').update({
                    status: 'done',
                    video_urls: videoUrls,
                    completed_at: new Date().toISOString()
                }).eq('operation_name', operation_name);

                console.log(`🎉 [video-job-processor] Job complete: ${operation_name} — ${videoUrls.length} video(s)`);
                results.push({ operation_name, action: 'completed', urls: videoUrls });

            } catch (jobErr: any) {
                console.error(`❌ [video-job-processor] Job error for ${operation_name}: ${jobErr.message}`);
                results.push({ operation_name, action: 'error', error: jobErr.message });
            }
        }

        return new Response(JSON.stringify({ success: true, processed: jobs.length, results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (err: any) {
        console.error(`❌ [video-job-processor] Fatal error: ${err.message}`);
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
