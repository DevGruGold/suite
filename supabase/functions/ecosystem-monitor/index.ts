/**
 * GITHUB ECOSYSTEM ENGAGEMENT FUNCTION
 * 
 * Purpose: Daily automated engagement with XMRT GitHub repositories
 * Schedule: 11am UTC daily via cron job
 * 
 * What it does:
 * 1. Evaluates activity across all XMRT ecosystem repos
 * 2. Calculates activity scores based on commits, issues, discussions, PRs
 * 3. Engages with high-priority content (score >= 70) by posting helpful responses
 * 4. Handles GitHub token failures gracefully with fallback strategies
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { formatSystemReport, SystemReport } from "../_shared/reportFormatter.ts";
import { generateTextWithFallback } from "../_shared/unifiedAIFallback.ts";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'ecosystem-monitor';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('🔍 Ecosystem Monitor - Starting daily evaluation...');

    // Try to get a working GitHub token
    const githubToken = await getWorkingGitHubToken();
    const tokenHealth = githubToken ? 'healthy' : 'degraded';

    // Define XMRT ecosystem repositories
    const repos = [
      { owner: 'DevGruGold', name: 'XMRT-Ecosystem' },
      { owner: 'DevGruGold', name: 'XMRT.io' },
      { owner: 'DevGruGold', name: 'XMRT-DAO-Ecosystem' },
      { owner: 'DevGruGold', name: 'XMRT_EcosystemV2' },
      { owner: 'DevGruGold', name: 'xmrtassistant' },
      { owner: 'DevGruGold', name: 'MESHNET' },
      { owner: 'DevGruGold', name: 'eliza-daemon' },
    ];

    const repoActivityScores: any[] = [];
    let totalEngagements = 0;
    let issuesResponded = 0;
    let discussionsReplied = 0;
    let commentsAdded = 0;

    // Evaluate each repository
    for (const repo of repos) {
      if (!githubToken) {
        console.log(`⚠️ No GitHub token, skipping ${repo.name}`);
        continue;
      }

      try {
        const activity = await evaluateRepository(repo, githubToken);
        repoActivityScores.push({
          repo_name: repo.name,
          activity_score: activity.score,
          metrics: activity.metrics
        });

        console.log(`📊 ${repo.name}: Activity Score = ${activity.score}`);

        // Engage with high-priority repos (score >= 70)
        if (activity.score >= 70) {
          console.log(`🎯 High priority repo: ${repo.name} - Engaging...`);
          
          const engagement = await engageWithRepository(
            repo,
            activity,
            githubToken,
            supabase
          );

          totalEngagements += engagement.total;
          issuesResponded += engagement.issues;
          discussionsReplied += engagement.discussions;
          commentsAdded += engagement.comments;
        }
      } catch (error) {
        console.error(`Error evaluating ${repo.name}:`, error);
      }
    }

    // Sort repos by activity score
    repoActivityScores.sort((a, b) => b.activity_score - a.activity_score);
    const topRepos = repoActivityScores.slice(0, 5);

    // Check XMRTCharger infrastructure
    console.log('🔌 Evaluating XMRTCharger infrastructure...');

    const { data: deviceMetrics } = await supabase
      .from('device_metrics_summary')
      .select('*')
      .eq('summary_date', new Date().toISOString().split('T')[0])
      .single();

    const { data: activeDevices } = await supabase
      .from('devices')
      .select('*, device_connection_sessions!inner(*)')
      .eq('device_connection_sessions.is_active', true);

    const infrastructureHealth = {
      devices_online: activeDevices?.length || 0,
      daily_connections: deviceMetrics?.total_connections || 0,
      daily_charging_sessions: deviceMetrics?.total_charging_sessions || 0,
      avg_session_duration: deviceMetrics?.avg_session_duration_seconds || 0,
      health_score: calculateInfrastructureScore(deviceMetrics, activeDevices)
    };

    console.log(`🔌 Infrastructure Health Score: ${infrastructureHealth.health_score}/100`);

    // Generate and log formatted report
    const ecosystemReport: SystemReport = {
      timestamp: new Date().toISOString(),
      overall_health: {
        score: infrastructureHealth.health_score,
        status: infrastructureHealth.health_score >= 90 ? 'healthy' : 
                infrastructureHealth.health_score >= 70 ? 'warning' : 
                infrastructureHealth.health_score >= 50 ? 'degraded' : 'critical',
        issues: []
      },
      components: {
        github_ecosystem: {
          repos_evaluated: repoActivityScores.length,
          infrastructure_score: infrastructureHealth.health_score,
          top_repos: topRepos,
          engagement_summary: {
            total: totalEngagements,
            issues: issuesResponded,
            discussions: discussionsReplied,
            comments: commentsAdded
          }
        },
        xmrt_charger: {
          devices: {
            total: deviceMetrics?.active_devices_count || 0,
            active: activeDevices?.length || 0,
            connections_24h: infrastructureHealth.daily_connections,
            charging_sessions_24h: infrastructureHealth.daily_charging_sessions
          }
        }
      },
      recommendations: []
    };

    const formattedReport = formatSystemReport(ecosystemReport);
    console.log(formattedReport);

    // Log comprehensive activity
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'ecosystem_monitoring',
      title: '🔍 Daily Ecosystem Monitoring Complete',
      description: `Evaluated ${repos.length} repos, ${activeDevices?.length || 0} devices online, engaged with ${totalEngagements} items`,
      metadata: {
        repos_evaluated: repoActivityScores,
        xmrt_infrastructure: infrastructureHealth,
        high_priority_repos: topRepos.map(r => r.repo_name),
        engagement_summary: {
          issues_responded: issuesResponded,
          discussions_replied: discussionsReplied,
          comments_added: commentsAdded,
          total_engagements: totalEngagements
        },
        github_token_health: tokenHealth,
        timestamp: new Date().toISOString()
      },
      status: 'completed'
    });

    console.log(`✅ Ecosystem monitoring complete: ${totalEngagements} engagements`);

    // Generate tasks based on activity if requested
    let tasksGenerated = 0;
    const { generate_tasks } = await req.json().catch(() => ({ generate_tasks: true }));
    
    if (generate_tasks) {
      tasksGenerated = await generateAutonomousTasks(supabase, {
        repoActivityScores,
        totalEngagements,
        tokenHealth
      });
      console.log(`📋 Generated ${tasksGenerated} autonomous tasks`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        repos_evaluated: repos.length,
        top_repos: topRepos,
        engagement_summary: {
          issues: issuesResponded,
          discussions: discussionsReplied,
          comments: commentsAdded,
          total: totalEngagements
        },
        tasks_generated: tasksGenerated,
        token_health: tokenHealth
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Ecosystem Monitor Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function getWorkingGitHubToken(): Promise<string | null> {
  const tokens = [
    { name: 'GITHUB_TOKEN', value: Deno.env.get('GITHUB_TOKEN') },
    { name: 'GITHUB_TOKEN_PROOF_OF_LIFE', value: Deno.env.get('GITHUB_TOKEN_PROOF_OF_LIFE') }
  ];

  for (const token of tokens) {
    if (!token.value) continue;

    try {
      const testResponse = await fetch('https://api.github.com/user', {
        headers: { 
          'Authorization': `Bearer ${token.value}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (testResponse.ok) {
        console.log(`✅ Using working token: ${token.name}`);
        return token.value;
      } else {
        console.warn(`⚠️ Token ${token.name} failed: ${testResponse.status}`);
      }
    } catch (error) {
      console.warn(`⚠️ Token ${token.name} error:`, error);
    }
  }

  console.error('❌ All GitHub tokens failed');
  return null;
}

async function evaluateRepository(repo: any, token: string) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  };

  // Get repository data
  const repoResponse = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.name}`,
    { headers }
  );
  const repoData = await repoResponse.json();

  // Get recent commits (last 48 hours)
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const commitsResponse = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.name}/commits?since=${twoDaysAgo}`,
    { headers }
  );
  const commits = await commitsResponse.json();

  // Get open issues
  const issuesResponse = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.name}/issues?state=open`,
    { headers }
  );
  const issues = await issuesResponse.json();

  // Get discussions
  let discussionCount = 0;
  try {
    const discussionsQuery = `
      query {
        repository(owner: "${repo.owner}", name: "${repo.name}") {
          discussions(first: 10, orderBy: {field: UPDATED_AT, direction: DESC}) {
            totalCount
          }
        }
      }
    `;
    
    const discussionsResponse = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: discussionsQuery })
    });
    
    const discussionsData = await discussionsResponse.json();
    discussionCount = discussionsData?.data?.repository?.discussions?.totalCount || 0;
  } catch (error) {
    console.warn(`Could not fetch discussions for ${repo.name}`);
  }

  // Get pull requests
  const prsResponse = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.name}/pulls?state=open`,
    { headers }
  );
  const prs = await prsResponse.json();

  // Calculate activity score
  const metrics = {
    recent_commits: Array.isArray(commits) ? commits.length : 0,
    open_issues: Array.isArray(issues) ? issues.length : 0,
    recent_discussions: discussionCount,
    recent_pr_activity: Array.isArray(prs) ? prs.length : 0,
    last_updated: repoData.updated_at
  };

  const score = calculateActivityScore(metrics);

  return { score, metrics, issues, prs };
}

function calculateActivityScore(metrics: any): number {
  let score = 0;

  // Recent commits (0-20 points)
  score += Math.min(metrics.recent_commits * 2, 20);

  // Open issues (0-25 points)
  score += Math.min(metrics.open_issues * 2.5, 25);

  // Discussions (0-25 points)
  score += Math.min(metrics.recent_discussions * 5, 25);

  // PRs (0-15 points)
  score += Math.min(metrics.recent_pr_activity * 3, 15);

  // Time decay (0-15 points)
  const hoursSinceUpdate = (Date.now() - new Date(metrics.last_updated).getTime()) / (1000 * 60 * 60);
  score += Math.max(15 - hoursSinceUpdate / 10, 0);

  return Math.min(score, 100);
}

async function engageWithRepository(
  repo: any,
  activity: any,
  githubToken: string,
  supabase: any
) {
  const engagement = { total: 0, issues: 0, discussions: 0, comments: 0 };

  // Respond to top issues (limit to 3 for time constraints)
  const topIssues = activity.issues
    .filter((issue: any) => !issue.pull_request)
    .filter((issue: any) => {
      const hoursSinceUpdate = (Date.now() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60);
      return hoursSinceUpdate > 24;
    })
    .slice(0, 3);

  for (const issue of topIssues) {
    try {
      const response = await generateIssueResponse(issue, repo);
      
      // Post comment to GitHub
      const commentResponse = await fetch(
        `https://api.github.com/repos/${repo.owner}/${repo.name}/issues/${issue.number}/comments`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ body: response })
        }
      );

      if (commentResponse.ok) {
        console.log(`✅ Commented on issue #${issue.number}: ${issue.title}`);
        engagement.issues++;
        engagement.total++;
      }
    } catch (error) {
      console.error(`Error commenting on issue #${issue.number}:`, error);
    }
  }

  return engagement;
}

async function generateIssueResponse(issue: any, repo: any): Promise<string> {
  const prompt = `You are Eliza, the autonomous AI operator of the XMRT-DAO Ecosystem.

Repository: ${repo.name}
Issue: ${issue.title}
Description: ${issue.body || 'No description provided'}

Generate a helpful, technical response that:
1. Acknowledges the issue clearly
2. Provides technical insight or solution
3. Connects to the XMRT ecosystem vision where relevant
4. Suggests actionable next steps
5. Is professional but friendly

Keep response under 400 words. End with:
— Eliza 🤖
*Autonomous XMRT-DAO Operator*`;

  const staticFallback = `Thank you for bringing this to our attention!

I've reviewed the issue and will look into it further. The XMRT ecosystem team appreciates your contribution.

**Next Steps:**
- We'll investigate this issue in detail
- Updates will be posted here as we make progress
- Feel free to add any additional context that might help

— Eliza 🤖
*Autonomous XMRT-DAO Operator*`;

  try {
    console.log('🔄 Generating issue response with AI fallback cascade...');
    const response = await generateTextWithFallback(prompt, undefined, {
      temperature: 0.7,
      maxTokens: 800,
      useFullElizaContext: false
    });
    console.log('✅ Issue response generated via AI cascade');
    return response;
  } catch (error) {
    console.warn('⚠️ AI response generation failed, using static fallback:', error);
    return staticFallback;
  }
}

async function generateAutonomousTasks(supabase: any, context: any) {
  let tasksCreated = 0;

  try {
    // Check for skill gaps
    const { data: skillGaps } = await supabase
      .from('skill_gap_analysis')
      .select('*')
      .eq('status', 'identified')
      .order('priority', { ascending: false })
      .limit(3);

    for (const gap of skillGaps || []) {
      const taskId = `task-skill-${gap.id.substring(0, 8)}`;
      await supabase.from('tasks').insert({
        id: taskId,
        title: `Learn: ${gap.identified_skill}`,
        description: `Address skill gap: ${gap.identified_skill}. Blocked tasks: ${gap.blocked_tasks?.join(', ')}`,
        category: 'LEARNING',
        stage: 'PLAN',
        status: 'PENDING',
        priority: gap.priority,
        repo: 'XMRT-Ecosystem',
        metadata: {
          checklist: ['Research skill requirements', 'Study documentation/resources', 'Practice implementation', 'Document learnings'],
          source: 'ecosystem_monitor',
          skill_gap_id: gap.id
        },
        completed_checklist_items: []
      }).then(() => tasksCreated++);
    }

    // Check for failed Python executions needing fixes
    const { data: failedExecs } = await supabase
      .from('eliza_python_executions')
      .select('*')
      .neq('exit_code', 0)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(2);

    for (const exec of failedExecs || []) {
      const taskId = `task-fix-${exec.id.substring(0, 8)}`;
      await supabase.from('tasks').insert({
        id: taskId,
        title: `Fix failed Python execution`,
        description: `Error: ${exec.error?.substring(0, 200)}`,
        category: 'CODE',
        stage: 'EXECUTE',
        status: 'PENDING',
        priority: 7,
        repo: 'XMRT-Ecosystem',
        metadata: {
          checklist: ['Analyze error logs', 'Identify root cause', 'Implement fix', 'Test solution'],
          source: 'ecosystem_monitor',
          execution_id: exec.id
        },
        completed_checklist_items: []
      }).then(() => tasksCreated++);
    }

    // Check for unanswered community messages
    const { data: messages } = await supabase
      .from('community_messages')
      .select('*')
      .eq('processed', false)
      .eq('auto_response_queued', false)
      .order('created_at', { ascending: false })
      .limit(3);

    for (const msg of messages || []) {
      const taskId = `task-respond-${msg.id.substring(0, 8)}`;
      await supabase.from('tasks').insert({
        id: taskId,
        title: `Respond to community: ${msg.content?.substring(0, 40)}...`,
        description: `Platform: ${msg.platform}\nContent: ${msg.content?.substring(0, 200)}`,
        category: 'COMMUNITY',
        stage: 'DISCUSS',
        status: 'PENDING',
        priority: 5,
        repo: 'XMRT-Ecosystem',
        metadata: {
          checklist: ['Review message context', 'Draft response', 'Send response', 'Mark as processed'],
          source: 'ecosystem_monitor',
          message_id: msg.id
        },
        completed_checklist_items: []
      }).then(() => tasksCreated++);
    }

    // Fetch actual GitHub issues and create tasks for each
    if (context.tokenHealth === 'healthy') {
      try {
        const { data: ghIssues } = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'list_issues',
            repo: 'XMRT-Ecosystem',
            state: 'open',
            per_page: 10
          }
        });

        const issues = ghIssues?.issues || ghIssues?.data || [];
        for (const issue of issues) {
          // Check if task already exists for this issue
          const { data: existingTask } = await supabase
            .from('tasks')
            .select('id')
            .eq('metadata->>github_issue_number', String(issue.number))
            .single();

          if (!existingTask) {
            const taskId = `task-gh-issue-${issue.number}`;
            const priority = issue.labels?.some((l: any) => l.name === 'critical' || l.name === 'bug') ? 9 : 6;
            const category = issue.labels?.some((l: any) => l.name === 'enhancement' || l.name === 'feature') ? 'FEATURE' : 'CODE';
            
            await supabase.from('tasks').insert({
              id: taskId,
              title: `GH#${issue.number}: ${issue.title?.substring(0, 80)}`,
              description: `**GitHub Issue:** ${issue.html_url}\n\n${issue.body?.substring(0, 500) || 'No description'}`,
              category,
              stage: 'DISCUSS',
              status: 'PENDING',
              priority,
              repo: 'XMRT-Ecosystem',
              metadata: {
                github_issue_number: issue.number,
                github_issue_url: issue.html_url,
                labels: issue.labels?.map((l: any) => l.name),
                source: 'ecosystem_monitor',
                checklist: ['Analyze requirements', 'Plan implementation', 'Implement solution', 'Create PR', 'Review and merge']
              },
              completed_checklist_items: []
            }).then(() => tasksCreated++).catch(() => {});
          }
        }
      } catch (ghErr) {
        console.warn('Could not fetch GitHub issues:', ghErr);
      }
    }

    // Auto-assign tasks to available agents
    if (tasksCreated > 0) {
      try {
        await supabase.functions.invoke('task-orchestrator', {
          body: { action: 'auto_assign_tasks', data: {} }
        });
      } catch (assignError) {
        console.warn('Could not auto-assign tasks:', assignError);
      }
    }

  } catch (error) {
    console.error('Error generating autonomous tasks:', error);
  }

  return tasksCreated;
}

function calculateInfrastructureScore(metrics: any, activeDevices: any[]): number {
  let score = 50; // Base score

  // Active devices (0-20 points)
  score += Math.min((activeDevices?.length || 0) * 5, 20);

  // Daily connections (0-15 points)
  score += Math.min((metrics?.total_connections || 0) / 10, 15);

  // Charging sessions (0-10 points)
  score += Math.min((metrics?.total_charging_sessions || 0) / 5, 10);

  // Session duration (0-5 points)
  const avgDuration = metrics?.avg_session_duration_seconds || 0;
  score += avgDuration > 300 ? 5 : avgDuration / 60;

  return Math.min(Math.round(score), 100);
}
