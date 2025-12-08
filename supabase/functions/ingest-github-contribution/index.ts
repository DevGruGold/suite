import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { payload, contribution_type, event_type } = body;

    console.log(`[ingest-github-contribution] Received ${contribution_type || event_type} event`);

    // Extract contribution details based on event type
    let githubUsername: string | null = null;
    let repoOwner: string | null = null;
    let repoName: string | null = null;
    let githubUrl: string | null = null;
    let contributionData: any = {};
    let detectedType = contribution_type || 'unknown';

    // Handle different GitHub event types
    if (payload?.sender?.login) {
      githubUsername = payload.sender.login;
    }

    if (payload?.repository) {
      repoOwner = payload.repository.owner?.login || payload.repository.owner?.name;
      repoName = payload.repository.name;
    }

    // Detect contribution type from event structure
    if (payload?.commits) {
      // Push event with commits
      detectedType = 'commit';
      const commits = payload.commits || [];
      githubUrl = commits[0]?.url || payload.compare;
      contributionData = {
        commit_count: commits.length,
        commits: commits.map((c: any) => ({
          id: c.id,
          message: c.message,
          author: c.author?.name || c.author?.username,
          added: c.added?.length || 0,
          removed: c.removed?.length || 0,
          modified: c.modified?.length || 0
        }))
      };
      // Use pusher as username for push events
      githubUsername = payload.pusher?.name || payload.sender?.login;
    } else if (payload?.pull_request) {
      // Pull request event
      detectedType = 'pr';
      githubUrl = payload.pull_request.html_url;
      contributionData = {
        pr_number: payload.pull_request.number,
        title: payload.pull_request.title,
        state: payload.pull_request.state,
        merged: payload.pull_request.merged,
        additions: payload.pull_request.additions,
        deletions: payload.pull_request.deletions,
        changed_files: payload.pull_request.changed_files
      };
      githubUsername = payload.pull_request.user?.login;
    } else if (payload?.issue) {
      // Issue event
      detectedType = 'issue';
      githubUrl = payload.issue.html_url;
      contributionData = {
        issue_number: payload.issue.number,
        title: payload.issue.title,
        state: payload.issue.state,
        labels: payload.issue.labels?.map((l: any) => l.name)
      };
      githubUsername = payload.issue.user?.login;
    } else if (payload?.discussion) {
      // Discussion event
      detectedType = 'discussion';
      githubUrl = payload.discussion.html_url;
      contributionData = {
        discussion_number: payload.discussion.number,
        title: payload.discussion.title,
        category: payload.discussion.category?.name
      };
      githubUsername = payload.discussion.user?.login;
    } else if (payload?.comment) {
      // Comment event (on issue, PR, or discussion)
      detectedType = 'comment';
      githubUrl = payload.comment.html_url;
      contributionData = {
        comment_id: payload.comment.id,
        body_preview: payload.comment.body?.substring(0, 200)
      };
      githubUsername = payload.comment.user?.login;
    }

    if (!githubUsername) {
      console.log('[ingest-github-contribution] No GitHub username found in payload');
      return new Response(JSON.stringify({
        success: false,
        error: 'No GitHub username found in payload'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Ensure contributor exists in github_contributors table
    const { data: existingContributor } = await supabase
      .from('github_contributors')
      .select('id, wallet_address, is_banned')
      .eq('github_username', githubUsername)
      .single();

    if (!existingContributor) {
      // Create new contributor record
      await supabase.from('github_contributors').insert({
        github_username: githubUsername,
        total_contributions: 0,
        total_xmrt_earned: 0,
        is_banned: false
      });
      console.log(`[ingest-github-contribution] Created new contributor: ${githubUsername}`);
    } else if (existingContributor.is_banned) {
      console.log(`[ingest-github-contribution] Contributor ${githubUsername} is banned, skipping`);
      return new Response(JSON.stringify({
        success: false,
        error: 'Contributor is banned'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Insert the contribution record
    const { data: contribution, error: insertError } = await supabase
      .from('github_contributions')
      .insert({
        github_username: githubUsername,
        contribution_type: detectedType,
        repo_owner: repoOwner,
        repo_name: repoName,
        github_url: githubUrl,
        contribution_data: contributionData,
        wallet_address: existingContributor?.wallet_address || null,
        is_validated: false,
        xmrt_earned: 0
      })
      .select()
      .single();

    if (insertError) {
      console.error('[ingest-github-contribution] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[ingest-github-contribution] Created contribution ${contribution.id} for ${githubUsername}`);

    // Trigger validation
    const { data: validationResult, error: validationError } = await supabase.functions.invoke(
      'validate-github-contribution',
      { body: { contribution_id: contribution.id } }
    );

    if (validationError) {
      console.error('[ingest-github-contribution] Validation error:', validationError);
    } else {
      console.log(`[ingest-github-contribution] Validation complete:`, validationResult);
    }

    // Log activity
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'github_contribution_ingested',
      title: `GitHub ${detectedType}: @${githubUsername}`,
      description: `${detectedType} on ${repoOwner}/${repoName}`,
      status: 'completed',
      metadata: {
        contribution_id: contribution.id,
        contribution_type: detectedType,
        github_username: githubUsername,
        repo: `${repoOwner}/${repoName}`
      }
    });

    return new Response(JSON.stringify({
      success: true,
      contribution_id: contribution.id,
      contribution_type: detectedType,
      github_username: githubUsername,
      validation: validationResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ingest-github-contribution] Error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
