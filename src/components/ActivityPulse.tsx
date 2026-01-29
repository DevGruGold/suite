import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Zap, Brain, Wrench, Activity, Clock, ExternalLink, User, ListTodo, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ActivityItem {
  id: string;
  type: string;
  title?: string;
  description: string;
  timestamp: string;
  status?: string;
  metadata?: Record<string, any>;
  task_id?: string;
  agent_id?: string;
}

interface ActivityPulseProps {
  healthScore?: number;
  onTaskClick?: (taskId: string) => void;
  onAgentClick?: (agentId: string) => void;
}

export const ActivityPulse = ({ 
  healthScore = 100, 
  onTaskClick,
  onAgentClick 
}: ActivityPulseProps) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLive, setIsLive] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate linked activities count once for performance
  const linkedActivitiesCount = useMemo(() => 
    activities.filter(a => a.task_id || a.agent_id).length,
    [activities]
  );

  // Retry state for subscription stability
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // Fetch recent activities - REAL DATA ONLY with task_id and agent_id
    const fetchRecent = async () => {
      const { data } = await supabase
        .from('eliza_activity_log')
        .select('id, activity_type, title, description, created_at, status, metadata, task_id, agent_id')
        .order('created_at', { ascending: false })
        .limit(15);
      
      if (data) {
        setActivities(data.map(a => ({
          id: a.id,
          type: a.activity_type,
          title: a.title,
          description: a.description || 'Activity completed',
          timestamp: a.created_at,
          status: a.status,
          metadata: a.metadata as Record<string, any>,
          task_id: a.task_id,
          agent_id: a.agent_id
        })));
      }
    };

    fetchRecent();

    // Setup subscription with retry mechanism
    const setupSubscription = () => {
      // Small delay to prevent race conditions with auth initialization
      const initTimer = setTimeout(() => {
        console.log('🔌 Initializing activity-pulse-live subscription...');
        
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
              title: payload.new.title,
              description: payload.new.description || 'Activity completed',
              timestamp: payload.new.created_at,
              status: payload.new.status,
              metadata: payload.new.metadata,
              task_id: payload.new.task_id,
              agent_id: payload.new.agent_id
            };
            
            setActivities(prev => [newActivity, ...prev.slice(0, 14)]);
            setIsLive(true);
          })
          .subscribe((status, err) => {
            console.log(`📡 Subscription status: ${status}`, err || '');
            
            if (status === 'SUBSCRIBED') {
              console.log('✅ Successfully subscribed to activity-pulse-live');
              setIsLive(true);
              setRetryCount(0); // Reset retry count on success
            } else if (status === 'CHANNEL_ERROR') {
              console.error('⚠️ Channel error:', err);
              setIsLive(false);
              
              // Retry logic
              if (retryCount < MAX_RETRIES) {
                const nextRetry = retryCount + 1;
                const delay = RETRY_DELAY_MS * Math.pow(2, retryCount); // Exponential backoff
                console.log(`🔄 Scheduling retry ${nextRetry}/${MAX_RETRIES} in ${delay}ms...`);
                
                setTimeout(() => {
                  if (channelRef.current) {
                    supabase.removeChannel(channelRef.current);
                  }
                  setRetryCount(nextRetry);
                }, delay);
              } else {
                console.error('❌ Max retries reached for activity-pulse-live subscription');
              }
            } else if (status === 'CLOSED') {
              console.warn('⚠️ Channel closed');
              setIsLive(false);
            } else if (status === 'TIMED_OUT') {
              console.error('⏱️ Subscription timed out');
              setIsLive(false);
            }
          });

        channelRef.current = channel;
      }, 500); // 500ms delay to allow auth to initialize

      return initTimer;
    };

    const timer = setupSubscription();

    return () => {
      clearTimeout(timer);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [retryCount]); // Re-run when retryCount changes

  // Handle activity click - navigate to task or agent
  const handleActivityClick = (activity: ActivityItem) => {
    if (activity.task_id && onTaskClick) {
      onTaskClick(activity.task_id);
    } else if (activity.agent_id && onAgentClick) {
      onAgentClick(activity.agent_id);
    }
  };

  // Check if activity is clickable
  const isClickable = (activity: ActivityItem) => {
    return (activity.task_id && onTaskClick) || (activity.agent_id && onAgentClick);
  };

  // Get icon based on activity type
  const getActivityIcon = (type: string, status?: string) => {
    if (status === 'failed' || status === 'error') {
      return <AlertCircle className="w-3.5 h-3.5 text-destructive" />;
    }
    
    switch (type) {
      case 'system_health_check':
        return <Activity className="w-3.5 h-3.5" />;
      case 'task_update':
        return <ListTodo className="w-3.5 h-3.5 text-blue-500" />;
      case 'agent_status_change':
        return <User className="w-3.5 h-3.5 text-violet-500" />;
      case 'auto_task_assignment':
      case 'auto_task_creation':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-500" />;
      case 'python':
      case 'python_execution':
        return <Zap className="w-3.5 h-3.5 text-primary" />;
      case 'learning':
      case 'learning_session':
        return <Brain className="w-3.5 h-3.5 text-violet-500" />;
      case 'auto_fix':
      case 'code_fix':
        return <Wrench className="w-3.5 h-3.5 text-amber-500" />;
      case 'success':
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
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
    if (status === 'pending') return 'text-amber-400';
    
    switch (type) {
      case 'system_health_check':
        return healthScore >= 95 ? 'text-emerald-400' : 
               healthScore >= 80 ? 'text-amber-400' : 'text-destructive';
      case 'task_update':
        return 'text-blue-400';
      case 'agent_status_change':
        return 'text-violet-400';
      case 'auto_task_assignment':
      case 'auto_task_creation':
        return 'text-amber-400';
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

  // Get display text - prefer title over description
  const getDisplayText = (activity: ActivityItem) => {
    const text = activity.title || activity.description;
    if (text.length > 70) {
      return text.slice(0, 67) + '...';
    }
    return text;
  };

  // Get activity type label
  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'system_health_check': 'Health',
      'task_update': 'Task',
      'agent_status_change': 'Agent',
      'auto_task_assignment': 'Auto-Task',
      'auto_task_creation': 'Auto-Task',
      'python_execution': 'Python',
      'learning_session': 'Learning',
      'code_fix': 'Code Fix'
    };
    return labels[type] || type.replace(/_/g, ' ');
  };

  return (
    <div className="relative w-full overflow-hidden">
      {/* LIVE indicator with activity count */}
      <div className="absolute top-0 left-0 z-20 flex items-center gap-2 bg-background/95 backdrop-blur-sm px-3 py-1.5 rounded-br-lg border-r border-b border-border/50">
        <span className="relative flex h-2.5 w-2.5">
          <span className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75",
            isLive ? "animate-ping bg-emerald-500" : "bg-muted-foreground"
          )}></span>
          <span className={cn(
            "relative inline-flex rounded-full h-2.5 w-2.5",
            isLive ? "bg-emerald-500" : "bg-muted-foreground"
          )}></span>
        </span>
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Live</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
          {activities.length}
        </Badge>
      </div>

      {/* System Health Status Line - REPLACED abstract pulse bar */}
      <div className="flex items-center gap-3 mb-3 px-1">
        <div className={cn(
          "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border shadow-sm transition-all",
          healthScore >= 95 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
          healthScore >= 80 ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
          "bg-destructive/10 text-destructive border-destructive/20"
        )}>
          {healthScore >= 95 ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          System Health: {healthScore >= 95 ? 'HEALTHY' : healthScore >= 80 ? 'DEGRADED' : 'CRITICAL'}
        </div>
        
        <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
          <div 
            className={cn(
              "h-full transition-all duration-1000 ease-out",
              healthScore >= 95 ? "bg-emerald-500" :
              healthScore >= 80 ? "bg-amber-500" :
              "bg-destructive"
            )}
            style={{ width: `${healthScore}%` }}
          />
        </div>
        
        <span className={cn(
          "text-xs font-bold tabular-nums",
          healthScore >= 95 ? "text-emerald-500" :
          healthScore >= 80 ? "text-amber-500" :
          "text-destructive"
        )}>
          {healthScore}%
        </span>
      </div>

      {/* Activity ticker - ENHANCED with click functionality */}
      <div 
        ref={containerRef}
        className={cn(
          "relative min-h-[3rem] overflow-hidden rounded-xl",
          "bg-gradient-to-r from-background via-muted/30 to-background",
          "border-2 transition-all duration-300",
          healthScore < 80 && "border-destructive/50 shadow-[0_0_20px_hsl(var(--destructive)/0.15)]",
          healthScore >= 80 && healthScore < 95 && "border-amber-500/40 shadow-[0_0_15px_hsl(38_92%_50%/0.1)]",
          healthScore >= 95 && "border-emerald-500/30 shadow-[0_0_10px_hsl(142_76%_36%/0.1)]"
        )}
      >
        {/* Scrolling ticker content */}
        <div className="animate-ticker-smooth whitespace-nowrap py-3 px-6">
          {activities.length > 0 ? (
            activities.map((activity, i) => (
              <span 
                key={activity.id} 
                onClick={() => handleActivityClick(activity)}
                className={cn(
                  "inline-flex items-center gap-2 mx-4 text-sm transition-all",
                  getActivityColor(activity.type, activity.status, activity.metadata),
                  isClickable(activity) && "cursor-pointer hover:scale-105 hover:brightness-125"
                )}
              >
                {/* Activity icon */}
                {getActivityIcon(activity.type, activity.status)}
                
                {/* Type badge */}
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-4 font-semibold border-current/30",
                    getActivityColor(activity.type, activity.status, activity.metadata)
                  )}
                >
                  {getTypeLabel(activity.type)}
                </Badge>
                
                {/* Activity text */}
                <span className="font-medium">{getDisplayText(activity)}</span>
                
                {/* Link indicators for clickable items */}
                {activity.task_id && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 gap-0.5">
                    <ListTodo className="w-2.5 h-2.5" />
                    task
                  </Badge>
                )}
                {activity.agent_id && !activity.task_id && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 gap-0.5">
                    <User className="w-2.5 h-2.5" />
                    agent
                  </Badge>
                )}
                
                {/* Timestamp */}
                <span className="text-xs text-muted-foreground ml-1">
                  {formatTime(activity.timestamp)}
                </span>
                
                {/* Clickable indicator */}
                {isClickable(activity) && (
                  <ExternalLink className="w-3 h-3 text-muted-foreground/50" />
                )}
                
                {/* Separator */}
                {i < activities.length - 1 && (
                  <span className="mx-3 text-border/50">│</span>
                )}
              </span>
            ))
          ) : (
            <span className="text-sm text-muted-foreground italic">
              Waiting for system activity...
            </span>
          )}
        </div>

        {/* Gradient overlays for smooth edges */}
        <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      </div>

      {/* Linked items indicator - only show if there are linked items */}
      {linkedActivitiesCount > 0 && (
        <div className="flex justify-between items-center mt-2 px-1">
          <span className="text-[10px] text-muted-foreground">
            Click linked items to navigate
          </span>
          <span className="text-[10px] text-muted-foreground">
            {linkedActivitiesCount} linked {linkedActivitiesCount === 1 ? 'activity' : 'activities'}
          </span>
        </div>
      )}
    </div>
  );
};
