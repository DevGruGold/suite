// GitHub Persona Mapping for AI Agents
// Maps internal Agent Names to actual GitHub Usernames for issue assignment
// Update this file when adding new agents or changing their GitHub accounts

export const GITHUB_PERSONAS: Record<string, string> = {
    // Core Executives
    'Antigravity': 'AntigravityAgent', // Placeholder - User to update
    'Hermes': 'HermesMessenger',      // Placeholder - User to update
    'Eliza': 'ElizaOS',
    'CSO': 'devgru-cso',
    'CTO': 'devgru-cto',
    'CIO': 'devgru-cio',
    'COO': 'devgru-coo',

    // Tactical Agents
    'CodeArchitect': 'code-architect-bot',
    'Reviewer': 'code-reviewer-bot'
};

export function resolveGitHubAssignee(agentName: string): string {
    // Case-insensitive lookup
    const normalizedName = agentName.trim();
    const key = Object.keys(GITHUB_PERSONAS).find(k => k.toLowerCase() === normalizedName.toLowerCase());

    if (key) {
        return GITHUB_PERSONAS[key];
    }

    // Return original if no mapping found (assumes it might be a real username)
    return agentName;
}
