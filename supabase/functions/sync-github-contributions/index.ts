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

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const repo = body.repo || 'XMRT-Ecosystem';
    const owner = body.owner || 'DevGruGold';
    const maxCommits = body.max_commits || 100;

    console.log(`[sync-github-contributions] Starting sync for ${owner}/${repo}`);

    // Step 1: Fetch recent commits via github-integration
    const { data: commitsData, error: commitsError } = await supabase.functions.invoke('github-integration', {
      body: {
        action: 'list_commits',
        repo: repo,
        per_page: maxCommits
      }
    });

    if (commitsError) {
      console.error('[sync-github-contributions] Error fetching commits:', commitsError);
      throw new Error(`Failed to fetch commits: ${commitsError.message}`);
    }

    // github-integration returns { success: true, data: [...commits...] }
    const commits = commitsData?.data || commitsData?.commits || [];
    console.log(`[sync-github-contributions] Fetched ${commits.length} commits`);

    if (!Array.isArray(commits) || commits.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No commits found to sync',
        synced: 0,
        skipped: 0
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 2: Get already processed commit URLs
    const commitUrls = commits.map((c: any) => c.html_url).filter(Boolean);
    const { data: existingContribs } = await supabase
      .from('github_contributions')
      .select('github_url')
      .in('github_url', commitUrls);

    const processedUrls = new Set((existingContribs || []).map((c: any) => c.github_url));
    console.log(`[sync-github-contributions] Already processed: ${processedUrls.size} commits`);

    // Step 3: Process new commits
    let synced = 0;
    let skipped = 0;
    let totalXmrtAwarded = 0;
    const results: any[] = [];

    for (const commit of commits) {
      if (!commit.html_url || processedUrls.has(commit.html_url)) {
        skipped++;
        continue;
      }

      const authorName = commit.author?.login || commit.commit?.author?.name || 'unknown';
      const commitMessage = commit.commit?.message || '';
      
      // Determine contribution type from commit message
      let contributionType = 'commit';
      if (commitMessage.toLowerCase().includes('fix')) contributionType = 'bug_fix';
      else if (commitMessage.toLowerCase().includes('feat')) contributionType = 'feature';
      else if (commitMessage.toLowerCase().includes('doc')) contributionType = 'documentation';
      else if (commitMessage.toLowerCase().includes('test')) contributionType = 'test';

      // Build payload for ingest - use single_commit format that ingest understands
      const payload = {
        single_commit: true,
        sha: commit.sha,
        message: commitMessage,
        author: {
          login: authorName,
          avatar_url: commit.author?.avatar_url
        },
        html_url: commit.html_url,
        stats: commit.stats || { additions: 0, deletions: 0, total: 0 },
        repo_owner: owner,
        repo_name: repo
      };

      try {
        const { data: ingestResult, error: ingestError } = await supabase.functions.invoke('ingest-github-contribution', {
          body: {
            payload,
            contribution_type: contributionType,
            event_type: 'api_sync'
          }
        });

        if (ingestError) {
          console.error(`[sync-github-contributions] Error ingesting commit ${commit.sha}:`, ingestError);
          continue;
        }

        synced++;
        const xmrtAwarded = ingestResult?.validation?.xmrt_awarded || 0;
        totalXmrtAwarded += xmrtAwarded;
        
        results.push({
          sha: commit.sha?.substring(0, 7),
          author: authorName,
          xmrt: xmrtAwarded,
          type: contributionType
        });

      } catch (err) {
        console.error(`[sync-github-contributions] Failed to process commit ${commit.sha}:`, err);
      }
    }

    // Step 4: Log activity
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'github_sync',
      title: 'GitHub Contributions Synced',
      description: `Synced ${synced} new commits, awarded ${totalXmrtAwarded.toFixed(2)} XMRT`,
      status: 'completed',
      metadata: {
        repo: `${owner}/${repo}`,
        synced,
        skipped,
        total_xmrt: totalXmrtAwarded,
        duration_ms: Date.now() - startTime
      }
    });

    console.log(`[sync-github-contributions] Complete: ${synced} synced, ${skipped} skipped, ${totalXmrtAwarded} XMRT awarded`);

    return new Response(JSON.stringify({
      success: true,
      message: `Synced ${synced} contributions`,
      synced,
      skipped,
      total_xmrt_awarded: totalXmrtAwarded,
      results,
      duration_ms: Date.now() - startTime
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[sync-github-contributions] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Sync failed'
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
