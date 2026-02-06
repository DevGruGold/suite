import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { getGitHubCredential } from "../_shared/credentialCascade.ts";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'github-issue-scanner';
const DEFAULT_REPOS = ['XMRT-Ecosystem']; // Default repo to scan if not configured
const GITHUB_OWNER = Deno.env.get('GITHUB_OWNER') || 'DevGruGold';

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { action, data } = await req.json().catch(() => ({ action: 'trigger_scan', data: {} }));

        // Determine repos to scan (can be passed in or default)
        const reposToScan = data?.repos || DEFAULT_REPOS;

        console.log(`🔍 Starting GitHub Issue Scan for: ${reposToScan.join(', ')}`);

        // Get GitHub Token using shared credential logic
        // We pass empty data because we just want the system token (OAuth or PAT)
        const accessToken = await getGitHubCredential({});

        if (!accessToken) {
            throw new Error('No GitHub credentials available for scanning.');
        }

        let headers: Record<string, string>;
        if (accessToken.startsWith('oauth_app:')) {
            const [, clientId, clientSecret] = accessToken.split(':');
            const basicAuth = btoa(`${clientId}:${clientSecret}`);
            headers = {
                'Authorization': `Basic ${basicAuth}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Antigravity-Issue-Scanner'
            };
        } else {
            const isOAuthToken = accessToken.startsWith('gho_');
            const authPrefix = isOAuthToken ? 'Bearer' : 'token';
            headers = {
                'Authorization': `${authPrefix} ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Antigravity-Issue-Scanner'
            };
        }

        const results = [];
        let newTasksCount = 0;

        for (const repo of reposToScan) {
            console.log(`📂 Scanning repo: ${GITHUB_OWNER}/${repo}`);

            try {
                // Fetch open issues (not PRs)
                const issuesUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/issues?state=open&per_page=50`;
                const issuesResponse = await fetch(issuesUrl, { headers });

                if (!issuesResponse.ok) {
                    console.error(`❌ Failed to fetch issues for ${repo}: ${issuesResponse.statusText}`);
                    results.push({ repo, status: 'error', error: issuesResponse.statusText });
                    continue;
                }

                const issues = await issuesResponse.json();
                const openIssues = issues.filter((i: any) => !i.pull_request); // Filter out PRs if API returns them

                console.log(`Found ${openIssues.length} open issues in ${repo}`);

                for (const issue of openIssues) {
                    // Check if task already exists for this issue
                    const { data: existingTask } = await supabase
                        .from('tasks')
                        .select('id')
                        .eq('metadata->>issue_id', issue.id.toString())
                        .single();

                    if (!existingTask) {
                        console.log(`✨ New Issue Detected: #${issue.number} - ${issue.title}`);

                        // Create Task
                        const { data: newTask, error: taskError } = await supabase
                            .from('tasks')
                            .insert({
                                title: `[GitHub] ${repo} #${issue.number}: ${issue.title}`,
                                description: `**Source**: GitHub Issue #${issue.number}\n**Link**: ${issue.html_url}\n\n${issue.body || 'No description provided.'}`,
                                status: 'PENDING',
                                priority: 'medium', // Could infer from labels
                                source: 'github',
                                metadata: {
                                    issue_id: issue.id,
                                    issue_number: issue.number,
                                    repo_name: repo,
                                    author: issue.user.login,
                                    html_url: issue.html_url
                                }
                            })
                            .select()
                            .single();

                        if (taskError) {
                            console.error(`Error creating task for issue #${issue.number}:`, taskError);
                            continue;
                        }

                        // Notify User via Inbox
                        // Trying to find a user ID to notify - ideally the system owner or active user
                        // For now, we'll try to find a default user or broadcast
                        // Since inbox_messages requires a user_id, we'll try to get the first superadmin or similar
                        // Or if specific user triggered this scan, use that. 
                        // Fallback: Notify all "active" users or just log if no user context?
                        // BETTER: Insert into inbox_messages for *all* admins? Or just one?
                        // Let's grab the first user from auth.users (requires service role) or just skip if we can't determine.
                        // Actually, best practice is to notify the "System Owner". 
                        // Let's create a generic notification.

                        // For now, let's look for any user id to attach to (or maybe `inbox_messages` allows null? No, schema said references auth.users)
                        // We will fetch a candidate user ID
                        const { data: candidateUser } = await supabase.from('users').select('id').limit(1).single(); // Assuming 'users' view or table exists, otherwise specific user
                        // If 'users' table not available, try to guess or use a known ID? 
                        // In suite schema there is normally a `user_profiles` or similar. 
                        // Let's check `user_profiles`.
                        const { data: userProfile } = await supabase.from('user_profiles').select('id').limit(1).single();

                        if (userProfile && newTask) {
                            await supabase.from('inbox_messages').insert({
                                user_id: userProfile.id,
                                task_id: newTask.id,
                                title: `New GitHub Issue: #${issue.number}`,
                                content: `New issue in ${repo}: ${issue.title}`,
                                type: 'alert'
                            });
                        }

                        newTasksCount++;
                    }
                }

                results.push({ repo, status: 'success', issues_scanned: openIssues.length });

            } catch (err) {
                console.error(`Exception scanning ${repo}:`, err);
                results.push({ repo, status: 'failed', error: err.message });
            }
        }

        await usageTracker.success({ new_tasks: newTasksCount, results });

        return new Response(
            JSON.stringify({ success: true, new_tasks: newTasksCount, results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Scan Error:', error);
        await usageTracker.failure(error.message, 500);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
