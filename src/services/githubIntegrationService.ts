import { supabase } from "@/integrations/supabase/client";

/**
 * GitHub Integration Service
 * 
 * Provides type-safe wrapper functions for all GitHub OAuth operations.
 * Uses GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET for authentication (handled server-side).
 * 
 * All operations are proxied through the github-integration edge function which handles
 * OAuth token management automatically.
 */

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  created_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
}

export interface GitHubRepoInfo {
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
}

export interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string; // base64 encoded
  encoding: string;
}

class GitHubIntegrationService {
  private async callGitHubFunction(action: string, data?: any, sessionCredentials?: any) {
    const { data: result, error } = await supabase.functions.invoke('github-integration', {
      body: { 
        action, 
        data,
        session_credentials: sessionCredentials 
      }
    });

    if (error) {
      console.error(`GitHub ${action} error:`, error);
      throw new Error(`GitHub operation failed: ${error.message}`);
    }

    return result;
  }

  /**
   * List GitHub issues from a repository
   * @param repo - Repository name (defaults to GITHUB_REPO from env)
   * @param state - Filter by state: 'open', 'closed', or 'all' (default: 'open')
   * @param perPage - Number of results per page (default: 30)
   */
  async listIssues(repo?: string, state: 'open' | 'closed' | 'all' = 'open', perPage = 30, sessionCredentials?: any): Promise<GitHubIssue[]> {
    return this.callGitHubFunction('list_issues', { repo, state, per_page: perPage }, sessionCredentials);
  }

  /**
   * Create a new GitHub issue
   * @param title - Issue title (required)
   * @param body - Issue description
   * @param repo - Repository name (optional, uses env default)
   * @param labels - Array of label names
   * @param assignees - Array of GitHub usernames to assign
   * @param executive - Executive authoring this content (cso, cto, cio, cao, eliza, council)
   */
  async createIssue(
    title: string,
    body: string,
    repo?: string,
    labels?: string[],
    assignees?: string[],
    sessionCredentials?: any,
    executive?: string
  ): Promise<GitHubIssue> {
    return this.callGitHubFunction('create_issue', {
      repo,
      title,
      body,
      labels,
      assignees,
      executive: executive || 'eliza'
    }, sessionCredentials);
  }

  /**
   * Add a comment to an existing GitHub issue
   * @param issueNumber - Issue number
   * @param comment - Comment text
   * @param repo - Repository name (optional)
   * @param executive - Executive authoring this content (cso, cto, cio, cao, eliza, council)
   */
  async commentOnIssue(issueNumber: number, comment: string, repo?: string, sessionCredentials?: any, executive?: string): Promise<any> {
    return this.callGitHubFunction('comment_on_issue', {
      repo,
      issue_number: issueNumber,
      body: comment,
      executive: executive || 'eliza'
    }, sessionCredentials);
  }

  /**
   * List GitHub discussions (requires GraphQL API)
   * @param repo - Repository name (optional)
   * @param first - Number of discussions to fetch (default: 20)
   */
  async listDiscussions(repo?: string, first = 20, sessionCredentials?: any): Promise<any[]> {
    return this.callGitHubFunction('list_discussions', { repo, first }, sessionCredentials);
  }

  /**
   * Create a new GitHub discussion (requires GraphQL API)
   * @param repositoryId - GitHub repository ID (GraphQL node ID)
   * @param categoryId - Discussion category ID
   * @param title - Discussion title
   * @param body - Discussion content
   * @param executive - Executive authoring this content (cso, cto, cio, cao, eliza, council)
   */
  async createDiscussion(
    repositoryId: string,
    categoryId: string,
    title: string,
    body: string,
    sessionCredentials?: any,
    executive?: string
  ): Promise<any> {
    return this.callGitHubFunction('create_discussion', {
      repositoryId,
      categoryId,
      title,
      body,
      executive: executive || 'eliza'
    }, sessionCredentials);
  }

  /**
   * Get repository information
   * @param repo - Repository name (optional, uses env default)
   */
  async getRepoInfo(repo?: string, sessionCredentials?: any): Promise<GitHubRepoInfo> {
    return this.callGitHubFunction('get_repo_info', { repo }, sessionCredentials);
  }

  /**
   * List pull requests in a repository
   * @param repo - Repository name (optional)
   * @param state - Filter by state: 'open', 'closed', or 'all' (default: 'open')
   */
  async listPullRequests(repo?: string, state: 'open' | 'closed' | 'all' = 'open', sessionCredentials?: any): Promise<GitHubPullRequest[]> {
    return this.callGitHubFunction('list_pull_requests', { repo, state }, sessionCredentials);
  }

  /**
   * Create a new pull request
   * @param title - PR title
   * @param body - PR description
   * @param head - Branch name containing changes
   * @param base - Branch name to merge into (default: main/master)
   * @param repo - Repository name (optional)
   */
  async createPullRequest(
    title: string,
    body: string,
    head: string,
    base = 'main',
    repo?: string,
    sessionCredentials?: any
  ): Promise<GitHubPullRequest> {
    return this.callGitHubFunction('create_pull_request', {
      repo,
      title,
      body,
      head,
      base
    }, sessionCredentials);
  }

  /**
   * Get file content from repository
   * @param path - File path in repository
   * @param repo - Repository name (optional)
   * @returns File content with user-friendly summary
   */
  async getFileContent(path: string, repo?: string, sessionCredentials?: any): Promise<GitHubFileContent & { userFriendly?: any }> {
    const result = await this.callGitHubFunction('get_file_content', { repo, path }, sessionCredentials);
    
    // The edge function already handles decoding and formatting
    // Return the formatted result directly
    return result;
  }

  /**
   * Commit a file to repository (create or update)
   * @param path - File path in repository
   * @param message - Commit message
   * @param content - File content (will be base64 encoded by edge function)
   * @param branch - Branch name (default: main)
   * @param sha - File SHA for updates (required when updating existing file)
   * @param repo - Repository name (optional)
   */
  async commitFile(
    path: string,
    message: string,
    content: string,
    branch = 'main',
    sha?: string,
    repo?: string,
    sessionCredentials?: any
  ): Promise<any> {
    // Edge function handles encoding and formatting
    return this.callGitHubFunction('commit_file', {
      repo,
      path,
      message,
      content, // Send raw content, edge function will encode
      branch,
      sha
    }, sessionCredentials);
  }

  /**
   * Search code in repository
   * @param query - Search query
   * @param repo - Repository name (optional, uses env default)
   * @returns Search results with file matches
   */
  async searchCode(query: string, repo?: string, sessionCredentials?: any): Promise<any> {
    return this.callGitHubFunction('search_code', { repo, query }, sessionCredentials);
  }

  /**
   * Get comments on an issue
   * @param issueNumber - Issue number
   * @param repo - Repository name (optional)
   * @param perPage - Number of comments per page (default: 30)
   * @returns Array of comments
   */
  async getIssueComments(issueNumber: number, repo?: string, perPage = 30, sessionCredentials?: any): Promise<any[]> {
    return this.callGitHubFunction('get_issue_comments', { repo, issue_number: issueNumber, per_page: perPage }, sessionCredentials);
  }

  /**
   * Get comments on a discussion (via GraphQL)
   * @param discussionNumber - Discussion number
   * @param repo - Repository name (optional)
   * @param first - Number of comments to fetch (default: 30)
   * @returns Discussion with comments
   */
  async getDiscussionComments(discussionNumber: number, repo?: string, first = 30, sessionCredentials?: any): Promise<any> {
    return this.callGitHubFunction('get_discussion_comments', { repo, discussion_number: discussionNumber, first }, sessionCredentials);
  }

  /**
   * Reply to an issue comment
   * @param issueNumber - Issue number
   * @param body - Comment body (Markdown supported)
   * @param repo - Repository name (optional)
   * @returns Created comment data
   */
  async createIssueCommentReply(issueNumber: number, body: string, repo?: string, sessionCredentials?: any): Promise<any> {
    return this.callGitHubFunction('create_issue_comment_reply', { repo, issue_number: issueNumber, body }, sessionCredentials);
  }

  /**
   * Reply to a discussion (create top-level comment)
   * @param discussionId - Discussion GraphQL ID (e.g., "D_kwDOAbc123")
   * @param body - Comment body (Markdown supported)
   * @param repo - Repository name (optional)
   * @returns Created comment data
   */
  async createDiscussionCommentReply(discussionId: string, body: string, repo?: string, sessionCredentials?: any): Promise<any> {
    return this.callGitHubFunction('create_discussion_comment_reply', { repo, discussion_id: discussionId, body }, sessionCredentials);
  }

  /**
   * Reply to a specific discussion comment (nested reply)
   * @param commentId - Comment GraphQL ID to reply to
   * @param body - Reply body (Markdown supported)
   * @param repo - Repository name (optional)
   * @returns Created reply data
   */
  async replyToDiscussionComment(commentId: string, body: string, repo?: string, sessionCredentials?: any): Promise<any> {
    return this.callGitHubFunction('reply_to_discussion_comment', { repo, comment_id: commentId, body }, sessionCredentials);
  }

  /**
   * Get authentication status and available actions
   * @returns Information about GitHub OAuth setup
   */
  getAuthInfo() {
    return {
      authMethod: 'OAuth App (GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET)',
      authLocation: 'Server-side in github-integration edge function',
      availableActions: [
        'list_issues',
        'create_issue',
        'comment_on_issue',
        'list_discussions',
        'create_discussion',
        'get_repo_info',
        'list_pull_requests',
        'create_pull_request',
        'get_file_content',
        'commit_file',
        'search_code',
        'get_issue_comments',
        'get_discussion_comments',
        'create_issue_comment_reply',
        'create_discussion_comment_reply',
        'reply_to_discussion_comment'
      ],
      note: 'All GitHub operations use OAuth tokens managed server-side. No user tokens needed.'
    };
  }
}

export const githubIntegrationService = new GitHubIntegrationService();
