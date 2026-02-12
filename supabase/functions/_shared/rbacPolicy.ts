/**
 * RBAC Policy for Eliza Tools
 * Defines membership tiers and tool access permissions.
 */

export enum MembershipTier {
    USER = 'user',
    CONTRIBUTOR = 'contributor',
    MODERATOR = 'moderator',
    ADMIN = 'admin',
    SUPER_ADMIN = 'super_admin'
}

// Hierarchy: SUPER_ADMIN > ADMIN > MODERATOR > CONTRIBUTOR > USER
const TIER_LEVELS: Record<MembershipTier, number> = {
    [MembershipTier.USER]: 0,
    [MembershipTier.CONTRIBUTOR]: 1,
    [MembershipTier.MODERATOR]: 2,
    [MembershipTier.ADMIN]: 3,
    [MembershipTier.SUPER_ADMIN]: 4
};

// Map tools to the MINIMUM required tier.
// If a tool is not listed, it defaults to USER (accessible by everyone).
export const TOOL_PERMISSIONS: Record<string, MembershipTier> = {
    // System & Admin Tools
    'get_system_status': MembershipTier.USER, // Public info
    'get_ecosystem_metrics': MembershipTier.CONTRIBUTOR,
    'get_mining_stats': MembershipTier.CONTRIBUTOR,
    'get_agent_status': MembershipTier.MODERATOR,
    'list_agents': MembershipTier.MODERATOR,
    'get_edge_function_logs': MembershipTier.ADMIN,

    // Task Management
    'list_tasks': MembershipTier.CONTRIBUTOR,
    'assign_task': MembershipTier.MODERATOR,
    'update_task_status': MembershipTier.MODERATOR,
    'delete_task': MembershipTier.ADMIN,

    // Knowledge & Memory
    'search_knowledge': MembershipTier.USER,
    'recall_entity': MembershipTier.USER,
    'store_knowledge': MembershipTier.CONTRIBUTOR,

    // GitHub Integration
    'searchGitHubCode': MembershipTier.CONTRIBUTOR,
    'listGitHubIssues': MembershipTier.USER,
    'listGitHubPullRequests': MembershipTier.USER,
    'createGitHubIssue': MembershipTier.CONTRIBUTOR,
    'createGitHubDiscussion': MembershipTier.CONTRIBUTOR,
    'commentOnGitHubIssue': MembershipTier.CONTRIBUTOR, // Anti-spam
    'commentOnGitHubDiscussion': MembershipTier.CONTRIBUTOR,
    'createGitHubPullRequest': MembershipTier.CONTRIBUTOR,

    // Content & Generation
    'vertex_generate_image': MembershipTier.USER, // Cost control? Maybe Contributor?
    'vertex_generate_video': MembershipTier.CONTRIBUTOR, // Higher cost
    'vertex_check_video_status': MembershipTier.CONTRIBUTOR,

    // Advanced / Dangerous
    'invoke_edge_function': MembershipTier.SUPER_ADMIN, // Raw invocation
    'execute_workflow_template': MembershipTier.ADMIN,
    'google_gmail': MembershipTier.ADMIN, // Privacy sensitive
    'browse_web': MembershipTier.USER,
    'analyze_attachment': MembershipTier.USER
};

/**
 * Checks if a user with the given tier can access the specified tool.
 */
export function checkToolAccess(toolName: string, userTier: string = 'user'): { allowed: boolean; requiredTier: MembershipTier; currentTier: MembershipTier } {
    // Normalize user tier string to enum, default to USER if invalid
    const tierKey = Object.values(MembershipTier).find(t => t === userTier) || MembershipTier.USER;
    const currentLevel = TIER_LEVELS[tierKey];

    // Get required tier, default to USER
    const requiredTier = TOOL_PERMISSIONS[toolName] || MembershipTier.USER;
    const requiredLevel = TIER_LEVELS[requiredTier];

    return {
        allowed: currentLevel >= requiredLevel,
        requiredTier,
        currentTier: tierKey
    };
}
