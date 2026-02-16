import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getGitHubCredential, createCredentialRequiredResponse } from "../_shared/credentialCascade.ts";
import { applyExecutiveAttribution, isValidExecutive } from "../_shared/executiveAttribution.ts";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';
import { resolveGitHubAssignee } from "../_shared/githubPersonas.ts";

const FUNCTION_NAME = 'github-integration';

const GITHUB_CLIENT_ID = Deno.env.get('GITHUB_CLIENT_ID');
const GITHUB_CLIENT_SECRET = Deno.env.get('GITHUB_CLIENT_SECRET');
const GITHUB_OWNER = Deno.env.get('GITHUB_OWNER') || 'DevGruGold';
const DEFAULT_GITHUB_REPO_NAME = Deno.env.get('DEFAULT_GITHUB_REPO_NAME') || 'XMRT-Ecosystem';

function normalizeRepo(repoInput: string | undefined, defaultRepo: string): string {
  if (!repoInput) return defaultRepo;
  if (repoInput.includes('/')) {
    const parts = repoInput.split('/');
    return parts[parts.length - 1];
  }
  return repoInput;
}

function validateGitHubConfig(): void {
  const hasOAuth = GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET;
  const hasPAT = Deno.env.get('GITHUB_TOKEN') || Deno.env.get('GITHUB_TOKEN_PROOF_OF_LIFE');

  if (!hasOAuth && !hasPAT) {
    throw new Error('GitHub authentication not configured. Need either (GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET) or GITHUB_TOKEN');
  }

  if (hasOAuth) {
    console.log(`✅ GitHub OAuth configured (5,000 req/hr) - Owner: ${GITHUB_OWNER}`);
  } else {
    console.warn(`⚠️ Using PAT fallback (60 req/hr) - Owner: ${GITHUB_OWNER}`);
  }
}

async function getAccessToken(code: string): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: code,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`OAuth error: ${data.error_description || data.error}`);
  }

  if (!data.access_token) {
    throw new Error('No access token received from GitHub');
  }

  return data.access_token;
}

function getRepoName(data: any): string {
  return normalizeRepo(data?.repo, DEFAULT_GITHUB_REPO_NAME);
}

function validateRepoForWriteAction(actionName: string, data: any): { repo: string; error?: string } {
  const repo = getRepoName(data);

  if (!repo) {
    return {
      repo: '',
      error: `No repository could be determined for action '${actionName}'. Please ensure DEFAULT_GITHUB_REPO_NAME is set or specify 'repo' in the request.`
    };
  }

  return { repo };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    validateGitHubConfig();

    const requestBody = await req.json();
    const { action, data, code, session_credentials } = requestBody;

    console.log(`🔧 GitHub Integration - Action: ${action}`, data);

    if (action === 'oauth_callback') {
      if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'OAuth not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.'
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      if (!code) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Missing OAuth code'
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      const accessToken = await getAccessToken(code);

      return new Response(
        JSON.stringify({
          success: true,
          access_token: accessToken,
          message: 'OAuth authentication successful'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!action) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required field: action'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const authSessionCredentials = session_credentials ? {
      github_oauth_token: session_credentials.github_oauth_token,
    } : undefined;

    const accessToken = await getGitHubCredential(data, authSessionCredentials);
    if (!accessToken) {
      console.error('🔐 All GitHub credential sources exhausted');
      return new Response(
        JSON.stringify(createCredentialRequiredResponse(
          'github',
          'oauth_or_backend',
          'To complete this GitHub operation, please authenticate with GitHub OAuth or ensure backend tokens are configured.',
          'https://github.com/settings/tokens/new?scopes=repo,read:org',
          ['repo', 'read:org', 'read:discussion']
        )),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let headers: Record<string, string>;

    if (accessToken.startsWith('oauth_app:')) {
      const [, clientId, clientSecret] = accessToken.split(':');
      const basicAuth = btoa(`${clientId}:${clientSecret}`);
      headers = {
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      console.log('🔐 Using OAuth app credentials (high rate limit)');
    } else {
      const isOAuthToken = accessToken.startsWith('gho_');
      const authPrefix = isOAuthToken ? 'Bearer' : 'token';
      headers = {
        'Authorization': `${authPrefix} ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      console.log(`🔐 Using GitHub ${authPrefix} auth`);
    }

    let result;
    let responseData;

    switch (action) {
      case 'list_issues': {
        const repo = getRepoName(data);
        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/issues?state=${data?.state || 'open'}&per_page=${data?.per_page || 30}`,
          { headers }
        );
        break;
      }

      case 'list_discussions': {
        const repo = getRepoName(data);
        result = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `
              query {
                repository(owner: "${GITHUB_OWNER}", name: "${repo}") {
                  discussions(first: ${data?.first || 20}) {
                    nodes {
                      id
                      title
                      body
                      createdAt
                      author { login }
                      comments(first: 5) {
                        nodes {
                          body
                          author { login }
                        }
                      }
                    }
                  }
                }
              }
            `,
          }),
        });
        break;
      }

      case 'get_repo_info': {
        const repo = getRepoName(data);
        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}`,
          { headers }
        );
        break;
      }

      case 'list_pull_requests': {
        const repo = getRepoName(data);
        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/pulls?state=${data?.state || 'open'}`,
          { headers }
        );
        break;
      }

      case 'get_file_content': {
        const repo = getRepoName(data);
        const fileResult = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/contents/${data.path}${data.branch ? `?ref=${data.branch}` : ''}`,
          { headers }
        );

        if (!fileResult.ok) {
          const errorData = await fileResult.json();
          return new Response(
            JSON.stringify({
              success: false,
              error: `File not found: ${data.path}`,
              details: errorData
            }),
            {
              status: fileResult.status,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const fileData = await fileResult.json();

        if (fileData.content && fileData.encoding === 'base64') {
          try {
            const decodedContent = atob(fileData.content.replace(/\n/g, ''));
            const lines = decodedContent.split('\n').length;
            const sizeKB = (decodedContent.length / 1024).toFixed(2);

            fileData.userFriendly = {
              summary: `📄 Retrieved file: **${fileData.name}**\n\n` +
                `📁 Path: \`${fileData.path}\`\n` +
                `📏 Size: ${sizeKB} KB (${lines} lines)\n` +
                `🔗 [View on GitHub](${fileData.html_url || `https://github.com/${GITHUB_OWNER}/${repo}/blob/${data.branch || 'main'}/${data.path}`})`,
              content: decodedContent,
              metadata: {
                lines,
                sizeKB,
                path: fileData.path,
                name: fileData.name
              }
            };
            fileData.decodedContent = decodedContent;
          } catch (e) {
            console.warn('Failed to decode file content:', e);
          }
        }

        result = { ok: true, json: async () => fileData };
        break;
      }

      case 'search_code': {
        const repo = getRepoName(data);
        if (!data.query) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required field: query'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        result = await fetch(
          `https://api.github.com/search/code?q=${encodeURIComponent(data.query)}+repo:${GITHUB_OWNER}/${repo}`,
          { headers }
        );
        break;
      }

      case 'list_files': {
        const repo = getRepoName(data);
        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/contents/${data?.path || ''}${data?.branch ? `?ref=${data.branch}` : ''}`,
          { headers }
        );
        break;
      }

      case 'get_branch_info': {
        const repo = getRepoName(data);
        if (!data.branch_name) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required field: branch_name'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/branches/${data.branch_name}`,
          { headers }
        );
        break;
      }

      case 'list_branches': {
        const repo = getRepoName(data);
        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/branches?per_page=${data?.per_page || 30}`,
          { headers }
        );
        break;
      }

      case 'get_issue_comments': {
        const repo = getRepoName(data);
        if (!data.issue_number) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required field: issue_number'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/issues/${data.issue_number}/comments?per_page=${data.per_page || 30}`,
          { headers }
        );
        break;
      }

      case 'get_discussion_comments': {
        const repo = getRepoName(data);
        if (!data.discussion_number) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required field: discussion_number'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        result = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `
              query {
                repository(owner: "${GITHUB_OWNER}", name: "${repo}") {
                  discussion(number: ${data.discussion_number}) {
                    id
                    title
                    body
                    comments(first: ${data.first || 30}) {
                      nodes {
                        id
                        body
                        createdAt
                        author { login }
                        replies(first: 10) {
                          nodes {
                            id
                            body
                            createdAt
                            author { login }
                          }
                        }
                      }
                    }
                  }
                }
              }
            `,
          }),
        });
        break;
      }

      case 'create_issue': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        let issueBody = data.body || '';
        const issueExecutive = data.executive || 'eliza';

        if (isValidExecutive(issueExecutive)) {
          issueBody = applyExecutiveAttribution(issueBody, issueExecutive, 'issue', {
            includeHeader: true,
            includeFooter: true,
            includeTimestamp: true
          });
        }

        if (session_credentials?.github_username) {
          issueBody += `\n\n_User: @${session_credentials.github_username}_`;
        }

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/issues`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              title: data.title,
              body: issueBody,
              labels: data.labels || [],
              assignees: (data.assignees || []).map((a: string) => resolveGitHubAssignee(a)),
            }),
          }
        );
        break;
      }

      case 'close_issue': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        if (!data.issue_number) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required field: issue_number'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        console.log(`🔐 Closing issue #${data.issue_number} in ${GITHUB_OWNER}/${repo}`);

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/issues/${data.issue_number}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              state: 'closed'
            }),
          }
        );
        break;
      }

      case 'comment_on_issue': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        let commentBody = data.body || '';
        const commentExecutive = data.executive || 'eliza';

        if (isValidExecutive(commentExecutive)) {
          commentBody = applyExecutiveAttribution(commentBody, commentExecutive, 'comment', {
            includeHeader: true,
            includeFooter: true,
            includeTimestamp: true
          });
        }

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/issues/${data.issue_number}/comments`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ body: commentBody }),
          }
        );
        break;
      }

      case 'comment_on_discussion': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        if (!data.discussion_number || !data.body) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required fields: discussion_number, body'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const discussionIdQuery = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `
                query {
                    repository(owner: "${GITHUB_OWNER}", name: "${repo}") {
                        discussion(number: ${data.discussion_number}) {
                            id
                        }
                    }
                }
            `,
          }),
        });
        const discussionIdResponse = await discussionIdQuery.json();

        if (discussionIdResponse.errors || !discussionIdResponse.data?.repository?.discussion?.id) {
          console.error('❌ GraphQL Error fetching discussion ID:', discussionIdResponse.errors);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Failed to find discussion ID for the given number',
              details: discussionIdResponse.errors || 'Discussion not found'
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const discussionNodeId = discussionIdResponse.data.repository.discussion.id;

        let discussionCommentBody = data.body || '';
        const discussionExecutive = data.executive || 'eliza';

        if (isValidExecutive(discussionExecutive)) {
          discussionCommentBody = applyExecutiveAttribution(discussionCommentBody, discussionExecutive, 'comment', {
            includeHeader: true,
            includeFooter: true,
            includeTimestamp: true
          });
        }

        result = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `
                mutation {
                    addDiscussionComment(input: {
                        discussionId: "${discussionNodeId}",
                        body: "${discussionCommentBody.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
                    }) {
                        comment {
                            id
                            body
                            url
                            author { login }
                        }
                    }
                }
            `,
          }),
        });
        const rawGraphQLCommentResponse = await result.json();
        console.log('📊 GitHub GraphQL Discussion Comment Response:', JSON.stringify(rawGraphQLCommentResponse, null, 2));

        if (rawGraphQLCommentResponse.errors) {
          console.error('❌ GraphQL Errors:', rawGraphQLCommentResponse.errors);
        }

        result = {
          ok: result.ok && !rawGraphQLCommentResponse.errors,
          json: async () => rawGraphQLCommentResponse
        } as Response;
        break;
      }

      case 'trigger_workflow': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        const workflowFile = data.workflow_file;
        const ref = data.ref || 'main';
        const inputs = data.inputs || {};

        console.log(`🚀 Triggering workflow: ${workflowFile} on ${GITHUB_OWNER}/${repo}@${ref}`);

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/actions/workflows/${workflowFile}/dispatches`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ ref, inputs }),
          }
        );

        if (result.status === 204) {
          console.log(`✅ Workflow ${workflowFile} triggered successfully`);
          responseData = {
            success: true,
            message: `Workflow ${workflowFile} triggered on ${ref}`,
            workflow_file: workflowFile,
            ref,
            inputs
          };
        } else {
          const errorText = await result.text();
          console.error(`❌ Failed to trigger workflow: ${errorText}`);
          throw new Error(`Failed to trigger workflow: ${result.status} ${errorText}`);
        }
        break;
      }

      case 'create_discussion': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        const repoInfoQuery = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `
              query {
                repository(owner: "${GITHUB_OWNER}", name: "${repo}") {
                  id
                  discussionCategories(first: 20) {
                    nodes {
                      id
                      name
                    }
                  }
                }
              }
            `,
          }),
        });

        const repoInfo = await repoInfoQuery.json();
        console.log('📦 Repository info for discussion:', repoInfo);

        if (repoInfo.errors) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Failed to fetch repository info',
              details: repoInfo.errors
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const repository = repoInfo.data?.repository;
        if (!repository) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Repository ${GITHUB_OWNER}/${repo} not found or discussions not enabled`
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const repositoryId = repository.id;
        const categories = repository.discussionCategories.nodes;

        const categoryName = (data.category || 'General').toLowerCase();
        const matchedCategory = categories.find(
          (cat: { name: string }) => cat.name.toLowerCase() === categoryName
        ) || categories.find(
          (cat: { name: string }) => cat.name.toLowerCase().includes('general')
        ) || categories[0];

        if (!matchedCategory) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'No discussion categories available. Please enable discussions on the repository.',
              availableCategories: categories.map((c: { name: string }) => c.name)
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        console.log(`📝 Creating discussion in category: ${matchedCategory.name} (${matchedCategory.id})`);

        const discussionTitle = (data.title || 'Untitled Discussion').replace(/"/g, '\\"');
        let rawBody = data.body || 'No description provided.';
        const discussionExecutive = data.executive || 'eliza';

        if (isValidExecutive(discussionExecutive)) {
          rawBody = applyExecutiveAttribution(rawBody, discussionExecutive, 'discussion', {
            includeHeader: true,
            includeFooter: true,
            includeTimestamp: true
          });
        }

        if (session_credentials?.github_username) {
          rawBody += `\n\n_User: @${session_credentials.github_username}_`;
        }

        const discussionBody = rawBody.replace(/"/g, '\\"').replace(/\n/g, '\\n');

        result = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `
              mutation {
                createDiscussion(input: {
                  repositoryId: "${repositoryId}",
                  categoryId: "${matchedCategory.id}",
                  title: "${discussionTitle}",
                  body: "${discussionBody}"
                }) {
                  discussion {
                    id
                    title
                    url
                    category {
                      name
                    }
                  }
                }
              }
            `,
          }),
        });

        const rawGraphQLResponse = await result.json();
        console.log('📊 GitHub GraphQL Response:', JSON.stringify(rawGraphQLResponse, null, 2));

        if (rawGraphQLResponse.errors) {
          console.error('❌ GraphQL Errors:', rawGraphQLResponse.errors);
        }

        result = {
          ok: result.ok && !rawGraphQLResponse.errors,
          json: async () => rawGraphQLResponse
        } as Response;
        break;
      }

      case 'create_pull_request': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        if (!data.title || !data.head || !data.base) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required fields for create_pull_request: title, head, base'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/pulls`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              title: data.title,
              body: data.body || 'No description provided.',
              head: data.head,
              base: data.base || 'main',
              draft: data.draft || false,
            }),
          }
        );
        break;
      }

      case 'commit_file': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        let fileSha = data.sha;
        let isUpdate = false;

        if (!fileSha) {
          try {
            const existingFile = await fetch(
              `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/contents/${data.path}${data.branch ? `?ref=${data.branch}` : ''}`,
              { headers }
            );

            if (existingFile.ok) {
              const existingData = await existingFile.json();
              fileSha = existingData.sha;
              isUpdate = true;
              console.log(`📝 Updating existing file: ${data.path} (SHA: ${fileSha})`);
            } else {
              console.log(`📝 Creating new file: ${data.path}`);
            }
          } catch (e) {
            console.log(`📝 Creating new file: ${data.path} (couldn't check if exists)`);
          }
        }

        const commitBody: { message: string, content: string, branch: string, sha?: string } = {
          message: data.message,
          content: btoa(data.content),
          branch: data.branch || 'main',
        };

        if (fileSha) {
          commitBody.sha = fileSha;
        }

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/contents/${data.path}`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify(commitBody),
          }
        );

        if (result.ok) {
          const commitData = await result.json();
          const contentLines = data.content.split('\n').length;
          const contentSize = (data.content.length / 1024).toFixed(2);

          commitData.userFriendly = {
            summary: `✅ **${isUpdate ? 'Updated' : 'Created'} file successfully**\n\n` +
              `📄 File: \`${data.path}\`\n` +
              `📏 Size: ${contentSize} KB (${contentLines} lines)\n` +
              `🌿 Branch: \`${data.branch || 'main'}\`\n` +
              `💬 Commit: "${data.message}"\n` +
              `🔗 [View commit](${commitData.commit?.html_url || `https://github.com/${GITHUB_OWNER}/${repo}`})`,
            action: isUpdate ? 'updated' : 'created',
            metadata: {
              path: data.path,
              branch: data.branch || 'main',
              lines: contentLines,
              sizeKB: contentSize
            }
          };

          result = { ok: true, json: async () => commitData };
        }
        break;
      }

      case 'update_issue': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        if (!data.issue_number) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required field: issue_number'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const updateBody: any = {};
        if (data.title) updateBody.title = data.title;
        if (data.body !== undefined) updateBody.body = data.body;
        if (data.state) updateBody.state = data.state;
        if (data.labels) updateBody.labels = data.labels;
        if (data.assignees) updateBody.assignees = (data.assignees || []).map((a: string) => resolveGitHubAssignee(a));

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/issues/${data.issue_number}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify(updateBody),
          }
        );
        break;
      }

      case 'close_issue': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        if (!data.issue_number) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required field: issue_number'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/issues/${data.issue_number}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ state: 'closed' }),
          }
        );
        break;
      }

      case 'add_comment': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        if (!data.issue_number || !data.body) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required fields: issue_number, body'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/issues/${data.issue_number}/comments`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ body: data.body }),
          }
        );
        break;
      }

      case 'merge_pull_request': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        if (!data.pull_number) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required field: pull_number'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/pulls/${data.pull_number}/merge`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              commit_title: data.commit_title,
              commit_message: data.commit_message,
              merge_method: data.merge_method || 'merge',
            }),
          }
        );
        break;
      }

      case 'close_pull_request': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        if (!data.pull_number) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required field: pull_number'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/pulls/${data.pull_number}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ state: 'closed' }),
          }
        );
        break;
      }

      case 'delete_file': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        if (!data.path || !data.message) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required fields: path, message'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        let deleteFileSha = data.sha;
        if (!deleteFileSha) {
          const existingFileForDelete = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/contents/${data.path}${data.branch ? `?ref=${data.branch}` : ''}`,
            { headers }
          );

          if (existingFileForDelete.ok) {
            const existingData = await existingFileForDelete.json();
            deleteFileSha = existingData.sha;
          } else {
            return new Response(
              JSON.stringify({
                success: false,
                error: `File not found: ${data.path}`
              }),
              {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            );
          }
        }

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/contents/${data.path}`,
          {
            method: 'DELETE',
            headers,
            body: JSON.stringify({
              message: data.message,
              sha: deleteFileSha,
              branch: data.branch || 'main',
            }),
          }
        );
        break;
      }

      case 'create_branch': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        if (!data.branch_name || !data.from_branch) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required fields: branch_name, from_branch'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const refResult = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/git/refs/heads/${data.from_branch}`,
          { headers }
        );

        if (!refResult.ok) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Source branch not found: ${data.from_branch}`
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const refData = await refResult.json();
        const sha = refData.object.sha;

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/git/refs`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ref: `refs/heads/${data.branch_name}`,
              sha: sha,
            }),
          }
        );
        break;
      }

      case 'create_issue_comment_reply': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        if (!data.issue_number || !data.body) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required fields: issue_number, body'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/issues/${data.issue_number}/comments`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ body: data.body }),
          }
        );
        break;
      }

      case 'create_discussion_comment_reply': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        if (!data.discussion_id || !data.body) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required fields: discussion_id, body'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        result = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `
              mutation {
                addDiscussionComment(input: {
                  discussionId: "${data.discussion_id}",
                  body: "${data.body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
                }) {
                  comment {
                    id
                    body
                    url
                    author { login }
                  }
                }
              }
            `,
          }),
        });
        break;
      }

      case 'reply_to_discussion_comment': {
        const repoValidation = validateRepoForWriteAction(action, data);
        if (repoValidation.error) {
          return new Response(
            JSON.stringify({ success: false, error: repoValidation.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const repo = repoValidation.repo;

        if (!data.comment_id || !data.body) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing required fields: comment_id (GraphQL ID), body'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        result = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: `
              mutation {
                addDiscussionComment(input: {
                  discussionId: "${data.comment_id}",
                  body: "${data.body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}",
                  replyToId: "${data.comment_id}"
                }) {
                  comment {
                    id
                    body
                    url
                    author { login }
                  }
                }
              }
            `,
          }),
        });
        break;
      }

      case 'list_commits': {
        const repo = getRepoName(data);
        const commitsUrl = new URL(`https://api.github.com/repos/${GITHUB_OWNER}/${repo}/commits`);
        if (data?.sha) commitsUrl.searchParams.set('sha', data.sha);
        if (data?.author) commitsUrl.searchParams.set('author', data.author);
        if (data?.since) commitsUrl.searchParams.set('since', data.since);
        if (data?.until) commitsUrl.searchParams.set('until', data.until);
        if (data?.path) commitsUrl.searchParams.set('path', data.path);
        commitsUrl.searchParams.set('per_page', String(data?.per_page || 30));

        result = await fetch(commitsUrl.toString(), { headers });
        break;
      }

      case 'get_commit_details': {
        const repo = getRepoName(data);
        if (!data?.commit_sha) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required field: commit_sha' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/commits/${data.commit_sha}`,
          { headers }
        );
        break;
      }

      case 'list_repo_events': {
        const repo = getRepoName(data);
        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/events?per_page=${data?.per_page || 30}`,
          { headers }
        );
        break;
      }

      case 'list_releases': {
        const repo = getRepoName(data);
        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/releases?per_page=${data?.per_page || 30}`,
          { headers }
        );
        break;
      }

      case 'get_release_details': {
        const repo = getRepoName(data);
        const releaseId = data?.release_id || 'latest';
        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/releases/${releaseId}`,
          { headers }
        );
        break;
      }

      case 'list_contributors': {
        const repo = getRepoName(data);
        result = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/contributors?per_page=${data?.per_page || 30}&anon=${data?.include_anonymous || 'false'}`,
          { headers }
        );
        break;
      }

      case 'list_repositories': {
        const type = data?.type || 'all';
        const sort = data?.sort || 'full_name';
        const direction = data?.direction || 'asc';

        result = await fetch(
          `https://api.github.com/orgs/${GITHUB_OWNER}/repos?type=${type}&sort=${sort}&direction=${direction}&per_page=${data?.per_page || 30}`,
          { headers }
        );
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Process the response
    if (!responseData) {
      if (result.json) {
        responseData = await result.json();
      } else {
        responseData = result;
      }
    }

    // Handle GraphQL errors
    if (responseData.errors && responseData.errors.length > 0) {
      console.error('❌ GitHub GraphQL Error:', responseData.errors);

      return new Response(
        JSON.stringify({
          success: false,
          error: responseData.errors[0]?.message || 'GitHub GraphQL request failed',
          graphql_errors: responseData.errors,
          needsAuth: responseData.errors[0]?.type === 'FORBIDDEN' || responseData.errors[0]?.message?.includes('authentication'),
          details: responseData
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // FIXED: Handle non-ok responses without consuming the body twice
    if (!result.ok) {
      // Use the already parsed responseData instead of calling result.text()
      const errorDetails = responseData ? JSON.stringify(responseData) : 'No error details available';
      console.error('❌ GitHub API Error:', errorDetails);

      return new Response(
        JSON.stringify({
          success: false,
          error: responseData?.message || responseData?.error || 'GitHub API request failed',
          status: result.status,
          needsAuth: result.status === 401,
          details: errorDetails,
          githubApiError: errorDetails
        }),
        {
          status: result.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`✅ GitHub Integration - Success: ${action}`);

    const repo = getRepoName(data);

    let userFriendlyMessage = '';
    switch (action) {
      case 'create_issue':
        userFriendlyMessage = `✅ Created issue #${responseData.number}: "${responseData.title}" in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'create_discussion':
        const discussion = responseData.data?.createDiscussion?.discussion;
        userFriendlyMessage = discussion
          ? `✅ Created discussion: "${discussion.title}" in category ${discussion.category?.name}`
          : `⚠️ Discussion creation returned no data (check permissions and repository settings)`;
        break;
      case 'commit_file':
        userFriendlyMessage = `✅ Successfully committed "${data.path}" to ${data.branch || 'main'} branch in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'create_pull_request':
        userFriendlyMessage = `✅ Created pull request #${responseData.number}: "${responseData.title}" (${responseData.head.ref} → ${responseData.base.ref}) in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'get_repo_info':
        userFriendlyMessage = `📊 Repository: ${responseData.full_name}\n⭐ Stars: ${responseData.stargazers_count} | 🍴 Forks: ${responseData.forks_count} | 🐛 Open Issues: ${responseData.open_issues_count}`;
        break;
      case 'get_file_content':
        userFriendlyMessage = `📄 Retrieved file: ${responseData.path} (${responseData.size} bytes) from ${GITHUB_OWNER}/${repo}`;
        break;
      case 'list_issues':
        userFriendlyMessage = `📋 Found ${responseData.length} issue(s) in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'list_pull_requests':
        userFriendlyMessage = `🔀 Found ${responseData.length} pull request(s) in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'search_code':
        userFriendlyMessage = `🔍 Found ${responseData.total_count} code match(es) in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'get_issue_comments':
        userFriendlyMessage = `💬 Found ${responseData.length} comment(s) on issue #${data.issue_number} in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'get_discussion_comments':
        userFriendlyMessage = `💬 Found ${responseData.data?.repository?.discussion?.comments?.nodes?.length || 0} comment(s) on discussion #${data.discussion_number} in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'create_issue_comment_reply':
        userFriendlyMessage = `✅ Posted comment on issue #${data.issue_number} in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'create_discussion_comment_reply':
        userFriendlyMessage = `✅ Posted comment on discussion in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'reply_to_discussion_comment':
        userFriendlyMessage = `✅ Posted reply to comment in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'comment_on_discussion':
        const discussionComment = responseData.data?.addDiscussionComment?.comment;
        userFriendlyMessage = discussionComment
          ? `✅ Posted comment on discussion #${data.discussion_number} in ${GITHUB_OWNER}/${repo}`
          : `⚠️ Discussion comment creation returned no data (check permissions and discussion ID)`;
        break;
      case 'list_commits':
        userFriendlyMessage = `📝 Found ${responseData.length} commit(s) in ${GITHUB_OWNER}/${repo}${data?.author ? ` by ${data.author}` : ''}${data?.since ? ` since ${data.since}` : ''}`;
        break;
      case 'get_commit_details':
        userFriendlyMessage = `📦 Commit: ${responseData.sha?.slice(0, 7)} by ${responseData.commit?.author?.name}\n📁 ${responseData.stats?.total || 0} changes (+${responseData.stats?.additions || 0}/-${responseData.stats?.deletions || 0}) in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'list_repo_events':
        userFriendlyMessage = `📊 Found ${responseData.length} recent event(s) in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'list_releases':
        userFriendlyMessage = `🏷️ Found ${responseData.length} release(s) in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'get_release_details':
        userFriendlyMessage = `🏷️ Release: ${responseData.tag_name} - ${responseData.name || 'No name'} in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'list_contributors':
        userFriendlyMessage = `👥 Found ${responseData.length} contributor(s) in ${GITHUB_OWNER}/${repo}`;
        break;
      case 'list_repositories':
        userFriendlyMessage = `📚 Found ${responseData.length} repository(s) in organization ${GITHUB_OWNER}`;
        break;
      default:
        userFriendlyMessage = `✅ Successfully completed: ${action} in ${GITHUB_OWNER}/${repo}`;
    }

    let finalData = responseData;
    if (action === 'create_discussion' && responseData.data?.createDiscussion?.discussion) {
      finalData = responseData.data.createDiscussion.discussion;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: finalData,
        userFriendlyMessage,
        action,
        repository: repo
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('GitHub Integration Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
