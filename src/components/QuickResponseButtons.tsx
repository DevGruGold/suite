import { Button } from './ui/button';

interface QuickResponseButtonsProps {
  onQuickResponse: (message: string) => void;
  disabled?: boolean;
  lastMessageRole?: 'user' | 'assistant' | null;
}

// Buttons shown after AI responds (user needs to give feedback)
const afterAIResponses = [
  { label: "Great work! Please proceed.", emoji: "✅" },
  { label: "That's not what I asked", emoji: "❌" },
  { label: "Please try again", emoji: "🔄" },
  { label: "Give me more details", emoji: "📝" }
];

// Buttons shown after user message (discovery prompts)
const afterUserResponses = [
  { label: "What can you help me with?", emoji: "❓" },
  { label: "Show me system status", emoji: "📊" },
  { label: "List available tools", emoji: "🛠️" }
];

// Buttons shown when conversation is empty
const emptyConversationResponses = [
  { label: "Hello! What can you do?", emoji: "👋" },
  { label: "Show me system status", emoji: "📊" },
  { label: "Help me get started", emoji: "🎯" }
];

export const QuickResponseButtons = ({ 
  onQuickResponse, 
  disabled,
  lastMessageRole 
}: QuickResponseButtonsProps) => {
  // Select appropriate button set based on context
  const responses = lastMessageRole === 'assistant' 
    ? afterAIResponses 
    : lastMessageRole === 'user' 
      ? afterUserResponses 
      : emptyConversationResponses;

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
