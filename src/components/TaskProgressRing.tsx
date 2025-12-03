import { cn } from '@/lib/utils';
import { Clock, Zap } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TaskProgressRingProps {
  percentage: number;
  stageStartedAt: string | null;
  thresholdHours: number;
  size?: 'sm' | 'md';
  showCountdown?: boolean;
}

function getProgressColor(percentage: number): string {
  if (percentage < 50) return 'text-green-500';
  if (percentage < 75) return 'text-yellow-500';
  if (percentage < 90) return 'text-orange-500';
  return 'text-red-500';
}

function getProgressGradient(percentage: number): string {
  if (percentage < 50) return 'stroke-green-500';
  if (percentage < 75) return 'stroke-yellow-500';
  if (percentage < 90) return 'stroke-orange-500';
  return 'stroke-red-500';
}

function formatTimeInStage(stageStartedAt: string | null): string {
  if (!stageStartedAt) return '0m';
  const start = new Date(stageStartedAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  if (diffHours < 24) return `${diffHours}h ${remainingMins}m`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ${diffHours % 24}h`;
}

function formatTimeRemaining(stageStartedAt: string | null, thresholdHours: number): string {
  if (!stageStartedAt || thresholdHours <= 0) return 'N/A';
  const start = new Date(stageStartedAt);
  const now = new Date();
  const elapsedHours = (now.getTime() - start.getTime()) / 3600000;
  const remainingHours = Math.max(0, thresholdHours - elapsedHours);
  
  if (remainingHours <= 0) return 'Due now';
  if (remainingHours < 1) return `${Math.ceil(remainingHours * 60)}m`;
  if (remainingHours < 24) return `${Math.floor(remainingHours)}h ${Math.ceil((remainingHours % 1) * 60)}m`;
  return `${Math.floor(remainingHours / 24)}d`;
}

export function TaskProgressRing({ 
  percentage, 
  stageStartedAt, 
  thresholdHours,
  size = 'sm',
  showCountdown = true
}: TaskProgressRingProps) {
  const safePercentage = Math.min(100, Math.max(0, percentage || 0));
  const isUrgent = safePercentage >= 90;
  const isDue = safePercentage >= 100;
  
  const dimensions = size === 'sm' ? { width: 24, stroke: 2.5 } : { width: 32, stroke: 3 };
  const radius = (dimensions.width - dimensions.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (safePercentage / 100) * circumference;
  
  const timeInStage = formatTimeInStage(stageStartedAt);
  const timeRemaining = formatTimeRemaining(stageStartedAt, thresholdHours);
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            {/* Progress Ring */}
            <div className={cn(
              "relative flex-shrink-0",
              isUrgent && "animate-pulse"
            )}>
              <svg 
                width={dimensions.width} 
                height={dimensions.width} 
                className="transform -rotate-90"
              >
                {/* Background circle */}
                <circle
                  cx={dimensions.width / 2}
                  cy={dimensions.width / 2}
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={dimensions.stroke}
                  className="text-muted/30"
                />
                {/* Progress circle */}
                <circle
                  cx={dimensions.width / 2}
                  cy={dimensions.width / 2}
                  r={radius}
                  fill="none"
                  strokeWidth={dimensions.stroke}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className={cn(
                    "transition-all duration-500",
                    getProgressGradient(safePercentage)
                  )}
                />
              </svg>
              {/* Center indicator */}
              {isDue && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Zap className="w-2.5 h-2.5 text-red-500 animate-pulse" />
                </div>
              )}
            </div>
            
            {/* Countdown text */}
            {showCountdown && (
              <span className={cn(
                "text-[10px] font-medium tabular-nums",
                getProgressColor(safePercentage)
              )}>
                {isDue ? 'Due!' : timeRemaining}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              <span>In stage: {timeInStage}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-3 h-3" />
              <span>Auto-advance: {timeRemaining}</span>
            </div>
            <div className="text-muted-foreground">
              {safePercentage}% toward threshold ({thresholdHours}h)
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function TaskProgressBar({ 
  percentage, 
  className 
}: { 
  percentage: number; 
  className?: string;
}) {
  const safePercentage = Math.min(100, Math.max(0, percentage || 0));
  
  return (
    <div className={cn("w-full h-1 bg-muted/30 rounded-full overflow-hidden", className)}>
      <div 
        className={cn(
          "h-full rounded-full transition-all duration-500",
          safePercentage < 50 && "bg-green-500",
          safePercentage >= 50 && safePercentage < 75 && "bg-yellow-500",
          safePercentage >= 75 && safePercentage < 90 && "bg-orange-500",
          safePercentage >= 90 && "bg-red-500 animate-pulse"
        )}
        style={{ width: `${safePercentage}%` }}
      />
    </div>
  );
}
