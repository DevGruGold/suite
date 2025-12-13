import { Button } from './ui/button';

interface ButtonConfig {
  label: string;
  emoji: string;
}

interface QuickResponseButtonsProps {
  onQuickResponse: (message: string) => void;
  disabled?: boolean;
  lastMessageRole?: 'user' | 'assistant' | null;
  hasUserEngaged?: boolean;
  lastMessageContent?: string;
  lastExecutive?: string;
}

// Number emoji mapping for detected options
const numberEmojis: Record<number, string> = {
  1: '1️⃣',
  2: '2️⃣',
  3: '3️⃣',
  4: '4️⃣',
  5: '5️⃣',
  6: '6️⃣',
  7: '7️⃣',
  8: '8️⃣',
  9: '9️⃣',
};

// Extract numbered options from AI response (e.g., "1. Option" "2) Choice" "(3) Action")
const extractNumberedOptions = (content: string): ButtonConfig[] | null => {
  if (!content) return null;
  
  const options: ButtonConfig[] = [];
  const seenNumbers = new Set<number>();
  
  // Pattern matches: "1. text", "1) text", "(1) text", "**1.** text"
  const patterns = [
    /(?:^|\n)\s*\*?\*?(\d+)[.)\]]\*?\*?\s+([^\n]+)/gm,
    /(?:^|\n)\s*\((\d+)\)\s+([^\n]+)/gm,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const num = parseInt(match[1], 10);
      let label = match[2].trim();
      
      // Skip if we've seen this number or it's out of range
      if (seenNumbers.has(num) || num < 1 || num > 9) continue;
      seenNumbers.add(num);
      
      // Clean up the label
      label = label
        .replace(/\*\*/g, '') // Remove markdown bold
        .replace(/\*([^*]+)\*/g, '$1') // Remove markdown italic
        .replace(/`([^`]+)`/g, '$1') // Remove code backticks
        .replace(/\s*[-–—]\s*.*$/, '') // Remove dash explanations
        .trim();
      
      // Truncate long labels
      if (label.length > 50) {
        label = label.substring(0, 47) + '...';
      }
      
      // Skip empty or too short labels
      if (label.length < 3) continue;
      
      options.push({
        label,
        emoji: numberEmojis[num] || `${num}.`,
      });
    }
  }
  
  // Sort by number and return if we found at least 2 options
  options.sort((a, b) => {
    const numA = Object.entries(numberEmojis).find(([, e]) => e === a.emoji)?.[0] || '0';
    const numB = Object.entries(numberEmojis).find(([, e]) => e === b.emoji)?.[0] || '0';
    return parseInt(numA) - parseInt(numB);
  });
  
  return options.length >= 2 ? options.slice(0, 5) : null;
};

// Buttons shown when conversation is empty
const emptyConversationResponses: ButtonConfig[] = [
  { label: "Hello! What can you do?", emoji: "👋" },
  { label: "Show me system status", emoji: "📊" },
  { label: "Help me get started", emoji: "🎯" }
];

// Buttons shown after user sends (while waiting for AI)
const afterUserResponses: ButtonConfig[] = [
  { label: "List available tools", emoji: "🛠️" },
  { label: "Check system health", emoji: "💚" },
  { label: "What's new?", emoji: "✨" }
];

// Executive-specific button configurations
const executiveButtonSets: Record<string, {
  feedbackButton: ButtonConfig;
  contextualButtons: ButtonConfig[];
}> = {
  'deepseek-chat': { // CTO - Technical focus
    feedbackButton: { label: "Great work, proceed with the fix", emoji: "✅" },
    contextualButtons: [
      { label: "Show me the code", emoji: "📝" },
      { label: "Run the tests", emoji: "🧪" },
      { label: "Check for security issues", emoji: "🔒" }
    ]
  },
  'gemini-chat': { // CIO - Vision/Information focus
    feedbackButton: { label: "Good analysis, continue", emoji: "✅" },
    contextualButtons: [
      { label: "Analyze another image", emoji: "🖼️" },
      { label: "Extract text from this", emoji: "📄" },
      { label: "What patterns do you see?", emoji: "🔍" }
    ]
  },
  'openai-chat': { // CAO - Analytics focus
    feedbackButton: { label: "Solid analysis, proceed", emoji: "✅" },
    contextualButtons: [
      { label: "Give me more data", emoji: "📈" },
      { label: "What are the risks?", emoji: "⚠️" },
      { label: "Recommend next steps", emoji: "🎯" }
    ]
  },
  'vercel-ai-chat': { // CSO - Strategy focus
    feedbackButton: { label: "Good strategy, please proceed", emoji: "✅" },
    contextualButtons: [
      { label: "What should I do next?", emoji: "🚀" },
      { label: "Coordinate with the council", emoji: "👥" },
      { label: "Help me plan this out", emoji: "📋" }
    ]
  },
  'lovable-chat': { // Default Eliza
    feedbackButton: { label: "Good job, please proceed", emoji: "✅" },
    contextualButtons: [
      { label: "Tell me more", emoji: "🔄" },
      { label: "What else can you help with?", emoji: "❓" },
      { label: "Show me system status", emoji: "📊" }
    ]
  }
};

// Action intent detection - when Eliza is offering to do something
const detectActionIntent = (content: string): boolean => {
  const lowerContent = content.toLowerCase();
  
  const actionPatterns = [
    /i('m going to|'ll|'m about to|can|will|shall)\s/,
    /let me\s/,
    /would you like me to/,
    /i('d| would) recommend/,
    /should i\s/,
    /i('m| am) ready to/,
    /proceed with/,
    /i can (fix|check|run|deploy|create|analyze|generate|start)/,
    /run (the|a|this)/,
    /check (the|this|your)/,
    /create (a|the|this)/,
    /generate (a|the|this)/,
    /start (the|a)/,
  ];
  
  return actionPatterns.some(pattern => pattern.test(lowerContent));
};

// Topic detection patterns
const detectConversationTopics = (content: string): string[] => {
  const topics: string[] = [];
  const lowerContent = content.toLowerCase();
  
  if (/error|bug|fix|code|function|deploy|build|crash|fail/.test(lowerContent)) {
    topics.push('technical');
  }
  if (/status|health|running|active|system|online/.test(lowerContent)) {
    topics.push('status');
  }
  if (/task|workflow|pipeline|agent|assign|progress/.test(lowerContent)) {
    topics.push('tasks');
  }
  if (/proposal|vote|governance|council|decision|approve/.test(lowerContent)) {
    topics.push('governance');
  }
  if (/mining|xmrt|hash|worker|reward|charger/.test(lowerContent)) {
    topics.push('mining');
  }
  if (/data|analytics|metrics|report|chart|trend/.test(lowerContent)) {
    topics.push('analytics');
  }
  
  return topics;
};

// Topic-specific contextual buttons
const topicButtons: Record<string, ButtonConfig[]> = {
  technical: [
    { label: "Show me the error logs", emoji: "📋" },
    { label: "Deploy the fix", emoji: "🚀" },
    { label: "Run diagnostics", emoji: "🔧" }
  ],
  status: [
    { label: "Check all systems", emoji: "💚" },
    { label: "Show agent status", emoji: "🤖" },
    { label: "Any issues to address?", emoji: "⚠️" }
  ],
  tasks: [
    { label: "Show task pipeline", emoji: "📊" },
    { label: "Assign to an agent", emoji: "🤖" },
    { label: "What's blocking progress?", emoji: "🚧" }
  ],
  governance: [
    { label: "Show pending proposals", emoji: "📜" },
    { label: "How did executives vote?", emoji: "🗳️" },
    { label: "Submit my vote", emoji: "✋" }
  ],
  mining: [
    { label: "Check my mining stats", emoji: "⛏️" },
    { label: "Show hashrate trends", emoji: "📈" },
    { label: "Optimize my setup", emoji: "⚡" }
  ],
  analytics: [
    { label: "Deeper analysis please", emoji: "🔬" },
    { label: "Compare with last week", emoji: "📅" },
    { label: "Export this data", emoji: "💾" }
  ]
};

const getContextualButtons = (
  lastMessageContent: string | undefined,
  lastExecutive: string | undefined,
  hasUserEngaged: boolean,
  lastMessageRole: 'user' | 'assistant' | null | undefined
): ButtonConfig[] => {
  // Welcome state - show intro buttons
  if (!hasUserEngaged) {
    return emptyConversationResponses;
  }
  
  // While waiting for AI response
  if (lastMessageRole === 'user') {
    return afterUserResponses;
  }
  
  // NEW: Check for numbered options FIRST (e.g., "1. Option 2. Choice 3. Action")
  const numberedOptions = extractNumberedOptions(lastMessageContent || '');
  if (numberedOptions) {
    return numberedOptions;
  }
  
  // After AI response - build dynamic buttons
  const buttons: ButtonConfig[] = [];
  
  // Get executive config or default to lovable-chat
  const execConfig = executiveButtonSets[lastExecutive || 'lovable-chat'] || executiveButtonSets['lovable-chat'];
  
  // Check if AI is offering to do something
  const hasActionIntent = detectActionIntent(lastMessageContent || '');
  
  // 1. Add action confirmation or feedback button first
  if (hasActionIntent) {
    buttons.push({ label: "Ok, do it!", emoji: "👍" });
  } else {
    buttons.push(execConfig.feedbackButton);
  }
  
  // 2. Detect topics and add relevant buttons
  const topics = detectConversationTopics(lastMessageContent || '');
  const addedLabels = new Set([buttons[0].label]);
  
  for (const topic of topics.slice(0, 2)) {
    const topicBtns = topicButtons[topic];
    if (topicBtns && topicBtns[0] && !addedLabels.has(topicBtns[0].label)) {
      buttons.push(topicBtns[0]);
      addedLabels.add(topicBtns[0].label);
    }
  }
  
  // 3. Fill remaining with executive-contextual buttons (up to 4 total)
  for (const btn of execConfig.contextualButtons) {
    if (buttons.length >= 4) break;
    if (!addedLabels.has(btn.label)) {
      buttons.push(btn);
      addedLabels.add(btn.label);
    }
  }
  
  return buttons;
};

export const QuickResponseButtons = ({ 
  onQuickResponse, 
  disabled,
  lastMessageRole,
  hasUserEngaged = false,
  lastMessageContent,
  lastExecutive
}: QuickResponseButtonsProps) => {
  const responses = getContextualButtons(
    lastMessageContent,
    lastExecutive,
    hasUserEngaged,
    lastMessageRole
  );

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {responses.map((response) => (
        <Button
          key={response.label}
          variant="outline"
          size="sm"
          onClick={() => onQuickResponse(response.label)}
          disabled={disabled}
          className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          {response.emoji} {response.label}
        </Button>
      ))}
    </div>
  );
};

export default QuickResponseButtons;
