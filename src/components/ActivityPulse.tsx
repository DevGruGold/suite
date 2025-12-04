import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Zap, Brain, Wrench, Activity, Clock } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  status?: string;
  metadata?: Record<string, any>;
}

interface ActivityPulseProps {
  healthScore?: number;
}

export const ActivityPulse = ({ healthScore = 100 }: ActivityPulseProps) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLive, setIsLive] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch recent activities - REAL DATA ONLY
    const fetchRecent = async () => {
      const { data } = await supabase
        .from('eliza_activity_log')
        .select('id, activity_type, description, created_at, status, metadata')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (data) {
        setActivities(data.map(a => ({
          id: a.id,
          type: a.activity_type,
          description: a.description || 'Activity completed',
          timestamp: a.created_at,
          status: a.status,
          metadata: a.metadata as Record<string, any>
        })));
      }
    };

    fetchRecent();

    // Subscribe to new activities - REAL-TIME
    const channel = supabase
      .channel('activity-pulse-live')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'eliza_activity_log'
      }, (payload) => {
        const newActivity: ActivityItem = {
          id: payload.new.id,
          type: payload.new.activity_type || 'system',
          description: payload.new.description || 'Activity completed',
          timestamp: payload.new.created_at,
          status: payload.new.status,
          metadata: payload.new.metadata
        };
        
        setActivities(prev => [newActivity, ...prev.slice(0, 9)]);
        setIsLive(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Get icon based on activity type
  const getActivityIcon = (type: string, status?: string) => {
    if (status === 'failed' || status === 'error') {
      return <AlertCircle className="w-3 h-3 text-destructive" />;
    }
    
    switch (type) {
      case 'system_health_check':
        return <Activity className="w-3 h-3" />;
      case 'python':
      case 'python_execution':
        return <Zap className="w-3 h-3 text-primary" />;
      case 'learning':
      case 'learning_session':
        return <Brain className="w-3 h-3 text-violet-500" />;
      case 'auto_fix':
      case 'code_fix':
        return <Wrench className="w-3 h-3 text-amber-500" />;
      case 'success':
      case 'completed':
        return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
      default:
        return <Clock className="w-3 h-3 text-muted-foreground" />;
    }
  };

  // Get text color based on activity type and status
  const getActivityColor = (type: string, status?: string, metadata?: Record<string, any>) => {
    // Health check coloring based on score
    if (type === 'system_health_check' && metadata?.health_score) {
      const score = metadata.health_score;
      if (score >= 95) return 'text-emerald-400';
      if (score >= 80) return 'text-amber-400';
      return 'text-destructive';
    }
    
    if (status === 'failed' || status === 'error') return 'text-destructive';
    if (status === 'completed' || status === 'success') return 'text-emerald-400';
    
    switch (type) {
      case 'system_health_check':
        return healthScore >= 95 ? 'text-emerald-400' : 
               healthScore >= 80 ? 'text-amber-400' : 'text-destructive';
      case 'python':
      case 'python_execution':
        return 'text-primary';
      case 'learning':
        return 'text-violet-400';
      case 'auto_fix':
        return 'text-amber-400';
      default:
        return 'text-foreground/80';
    }
  };

  // Format timestamp to relative time
  const formatTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  // Format description for display
  const formatDescription = (activity: ActivityItem) => {
    let desc = activity.description;
    
    // Truncate long descriptions
    if (desc.length > 60) {
      desc = desc.slice(0, 57) + '...';
    }
    
    return desc;
  };

  return (
    <div className="relative w-full overflow-hidden">
      {/* LIVE indicator */}
      <div className="absolute top-0 left-0 z-20 flex items-center gap-1.5 bg-background/90 px-2 py-1 rounded-br-lg">
        <span className="relative flex h-2 w-2">
          <span className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75",
            isLive ? "animate-ping bg-emerald-500" : "bg-muted-foreground"
          )}></span>
          <span className={cn(
            "relative inline-flex rounded-full h-2 w-2",
            isLive ? "bg-emerald-500" : "bg-muted-foreground"
          )}></span>
        </span>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Live</span>
      </div>

      {/* Visual pulse bar - color changes with health */}
      <div className="relative h-1.5 w-full mb-3 rounded-full overflow-hidden bg-muted/30">
        <div 
          className={cn(
            "absolute inset-0 rounded-full animate-pulse-bar",
            healthScore >= 95 ? "bg-gradient-to-r from-emerald-500/50 via-emerald-400 to-emerald-500/50" :
            healthScore >= 80 ? "bg-gradient-to-r from-amber-500/50 via-amber-400 to-amber-500/50" :
            "bg-gradient-to-r from-destructive/50 via-destructive to-destructive/50"
          )}
          style={{ width: `${healthScore}%` }}
        />
      </div>

      {/* Activity ticker - ENHANCED */}
      <div 
        ref={containerRef}
        className={cn(
          "relative h-auto min-h-[2.5rem] overflow-hidden rounded-lg",
          "bg-gradient-to-r from-background via-muted/20 to-background",
          "border border-border/50",
          healthScore < 80 && "border-destructive/30 shadow-[0_0_10px_hsl(var(--destructive)/0.1)]",
          healthScore >= 80 && healthScore < 95 && "border-amber-500/30 shadow-[0_0_10px_hsl(38_92%_50%/0.1)]"
        )}
      >
        {/* Scrolling ticker content */}
        <div className="animate-ticker-smooth whitespace-nowrap py-2 px-4">
          {activities.length > 0 ? (
            activities.map((activity, i) => (
              <span 
                key={activity.id} 
                className={cn(
                  "inline-flex items-center gap-2 mx-6 text-sm font-medium transition-colors",
                  getActivityColor(activity.type, activity.status, activity.metadata)
                )}
              >
                {getActivityIcon(activity.type, activity.status)}
                <span className="font-semibold">{activity.type.replace(/_/g, ' ')}:</span>
                <span className="font-normal opacity-90">{formatDescription(activity)}</span>
                <span className="text-xs text-muted-foreground ml-1">({formatTime(activity.timestamp)})</span>
                {i < activities.length - 1 && (
                  <span className="mx-4 text-border">•</span>
                )}
              </span>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">
              Waiting for activity...
            </span>
          )}
        </div>

        {/* Gradient overlays for smooth edges */}
        <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      </div>

      {/* Recent activity count badge */}
      <div className="flex justify-end mt-2">
        <span className="text-[10px] text-muted-foreground">
          {activities.length} recent activities
        </span>
      </div>
    </div>
  );
};