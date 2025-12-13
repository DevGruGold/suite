import { Button } from './ui/button';

interface QuickResponseButtonsProps {
  onQuickResponse: (message: string) => void;
  disabled?: boolean;
}

const quickResponses = [
  { label: "Great work! Please proceed.", emoji: "✅" },
  { label: "That's not what I asked", emoji: "❌" }
];

export const QuickResponseButtons = ({ onQuickResponse, disabled }: QuickResponseButtonsProps) => {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {quickResponses.map((response) => (
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
