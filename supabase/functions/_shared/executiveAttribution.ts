/**
 * Executive Attribution System for GitHub
 * 
 * Provides rich Markdown headers and footers showing which executive
 * (CSO, CTO, CIO, CAO, Eliza) authored each GitHub post.
 */

export interface ExecutiveProfile {
  icon: string;
  name: string;
  fullTitle: string;
  model: string;
  specialty: string;
  color: string;
}

export const EXECUTIVE_PROFILES: Record<string, ExecutiveProfile> = {
  cso: {
    icon: '🎯',
    name: 'CSO',
    fullTitle: 'Chief Strategy Officer',
    model: 'Google Gemini 2.5 Flash',
    specialty: 'General Strategy & Coordination',
    color: 'blue'
  },
  cto: {
    icon: '💻',
    name: 'CTO',
    fullTitle: 'Chief Technology Officer',
    model: 'DeepSeek R1',
    specialty: 'Code & Technical Architecture',
    color: 'purple'
  },
  cio: {
    icon: '👁️',
    name: 'CIO',
    fullTitle: 'Chief Information Officer',
    model: 'Google Gemini 2.5 Pro',
    specialty: 'Vision & Multimodal Intelligence',
    color: 'green'
  },
  cao: {
    icon: '📊',
    name: 'CAO',
    fullTitle: 'Chief Analytics Officer',
    model: 'OpenAI GPT-5',
    specialty: 'Complex Analytics & Reasoning',
    color: 'orange'
  },
  eliza: {
    icon: '🤖',
    name: 'Eliza',
    fullTitle: 'XMRT AI Assistant',
    model: 'Multi-Model Orchestration',
    specialty: 'Full-Stack AI Assistance',
    color: 'cyan'
  },
  council: {
    icon: '👥',
    name: 'Executive Council',
    fullTitle: 'XMRT Executive Council',
    model: 'Collective Intelligence',
    specialty: 'Governance & Consensus Decisions',
    color: 'gold'
  }
};

/**
 * Generate a rich header for GitHub content showing executive attribution
 */
export function formatExecutiveHeader(
  executive: string,
  contentType: 'issue' | 'discussion' | 'comment' | 'pr' = 'comment'
): string {
  const profile = EXECUTIVE_PROFILES[executive.toLowerCase()];
  
  if (!profile) {
    // Default to Eliza if unknown executive
    return formatExecutiveHeader('eliza', contentType);
  }

  const typeLabels: Record<string, string> = {
    issue: 'Issue',
    discussion: 'Discussion',
    comment: 'Analysis',
    pr: 'Pull Request'
  };

  return `## ${profile.icon} ${profile.name} ${typeLabels[contentType]}

`;
}

/**
 * Generate a rich footer signature for GitHub content
 */
export function formatExecutiveFooter(
  executive: string,
  includeTimestamp: boolean = true
): string {
  const profile = EXECUTIVE_PROFILES[executive.toLowerCase()];
  
  if (!profile) {
    return formatExecutiveFooter('eliza', includeTimestamp);
  }

  const timestamp = includeTimestamp 
    ? ` • ${new Date().toISOString().split('T')[0]}`
    : '';

  return `

---
<sub>
${profile.icon} **XMRT Executive Council** • **${profile.name}** (${profile.fullTitle})  
🤖 Powered by ${profile.model} • Specialty: ${profile.specialty}${timestamp}
</sub>`;
}

/**
 * Apply executive attribution to content (header + content + footer)
 */
export function applyExecutiveAttribution(
  content: string,
  executive: string,
  contentType: 'issue' | 'discussion' | 'comment' | 'pr' = 'comment',
  options: {
    includeHeader?: boolean;
    includeFooter?: boolean;
    includeTimestamp?: boolean;
  } = {}
): string {
  const {
    includeHeader = true,
    includeFooter = true,
    includeTimestamp = true
  } = options;

  let attributedContent = content;

  if (includeHeader) {
    attributedContent = formatExecutiveHeader(executive, contentType) + attributedContent;
  }

  if (includeFooter) {
    attributedContent = attributedContent + formatExecutiveFooter(executive, includeTimestamp);
  }

  return attributedContent;
}

/**
 * Get executive profile by name (case-insensitive)
 */
export function getExecutiveProfile(executive: string): ExecutiveProfile | null {
  return EXECUTIVE_PROFILES[executive.toLowerCase()] || null;
}

/**
 * Validate if an executive name is valid
 */
export function isValidExecutive(executive: string): boolean {
  return executive.toLowerCase() in EXECUTIVE_PROFILES;
}

/**
 * Get all available executive names
 */
export function getAvailableExecutives(): string[] {
  return Object.keys(EXECUTIVE_PROFILES);
}
