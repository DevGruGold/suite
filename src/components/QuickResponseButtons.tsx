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
  
  // After AI response - build dynamic buttons
  const buttons: ButtonConfig[] = [];
  
  // Get executive config or default to lovable-chat
  const execConfig = executiveButtonSets[lastExecutive || 'lovable-chat'] || executiveButtonSets['lovable-chat'];
  
  // 1. Always add the feedback button first
  buttons.push(execConfig.feedbackButton);
  
  // 2. Detect topics and add relevant buttons
  const topics = detectConversationTopics(lastMessageContent || '');
  const addedLabels = new Set([execConfig.feedbackButton.label]);
  
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
