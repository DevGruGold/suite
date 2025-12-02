import React, { useState, useEffect } from 'react';
import { Clock, Users, UserCheck, Calculator, CheckCircle2 } from 'lucide-react';
import { Badge } from './ui/badge';

interface VotingPhaseIndicatorProps {
  phase: string;
  executiveDeadline?: string | null;
  communityDeadline?: string | null;
  status: string;
}

export const VotingPhaseIndicator: React.FC<VotingPhaseIndicatorProps> = ({
  phase,
  executiveDeadline,
  communityDeadline,
  status
}) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  
  useEffect(() => {
    const updateCountdown = () => {
      let deadline: Date | null = null;
      
      if (phase === 'executive' && executiveDeadline) {
        deadline = new Date(executiveDeadline);
      } else if (phase === 'community' && communityDeadline) {
        deadline = new Date(communityDeadline);
      }
      
      if (!deadline) {
        setTimeLeft('');
        return;
      }
      
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeLeft('Ending soon...');
        return;
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [phase, executiveDeadline, communityDeadline]);

  if (status !== 'voting') {
    return null;
  }

  const phaseConfig = {
    executive: {
      icon: UserCheck,
      label: 'Executive Review',
      color: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
      description: 'AI executives are deliberating'
    },
    community: {
      icon: Users,
      label: 'Community Voting',
      color: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
      description: 'Open for community votes'
    },
    final_count: {
      icon: Calculator,
      label: 'Counting Votes',
      color: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
      description: 'Tallying final results'
    },
    closed: {
      icon: CheckCircle2,
      label: 'Voting Closed',
      color: 'bg-muted text-muted-foreground border-border',
      description: 'Voting has ended'
    }
  };

  const config = phaseConfig[phase as keyof typeof phaseConfig] || phaseConfig.executive;
  const Icon = config.icon;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 sm:p-3 rounded-lg bg-muted/50 border border-border">
      <div className="flex items-center gap-2 flex-1">
        <Icon className="h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <Badge variant="outline" className={`${config.color} text-xs`}>
            {config.label}
          </Badge>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {config.description}
          </p>
        </div>
      </div>
      
      {timeLeft && (
        <div className="flex items-center gap-1.5 text-sm font-medium bg-background/80 px-2 py-1 rounded border border-border">
          <Clock className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-amber-600 tabular-nums">{timeLeft}</span>
        </div>
      )}
    </div>
  );
};