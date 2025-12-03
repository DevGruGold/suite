import { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { formatTime } from '@/utils/dateFormatter';
import { realtimeManager } from '@/services/realtimeSubscriptionManager';

interface ActivityLog {
  id: string;
  activity_type: string;
  title: string;
  description: string;
  metadata: any;
  status: string;
  created_at: string;
}

const PythonShell = () => {
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('eliza_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setActivityLogs(data);
      }
      setIsLoading(false);
    };

    fetchActivity();

    const unsubscribe = realtimeManager.subscribe(
      'eliza_activity_log',
      (payload) => {
        console.log('Activity update:', payload);
        setActivityLogs(prev => [payload.new as ActivityLog, ...prev].slice(0, 50));
      },
      {
        event: 'INSERT',
        schema: 'public'
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'python_execution':
        return '⚡';
      case 'python_fix_execution':
        return '🔧';
      case 'agent_management':
        return '🤖';
      case 'github_integration':
        return '📦';
      case 'task_assignment':
        return '📋';
      case 'batch_vectorization':
        return '🧠';
      default:
        return '○';
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-suite-success/10 text-suite-success border-suite-success/30';
      case 'failed':
        return 'bg-destructive/10 text-destructive border-destructive/30';
      case 'in_progress':
        return 'bg-suite-info/10 text-suite-info border-suite-info/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getExecutionBadge = (activity: ActivityLog) => {
    if (activity.activity_type === 'python_fix_execution' || activity.metadata?.was_auto_fixed) {
      return (
        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
          Auto-fixed
        </Badge>
      );
    }
    if (activity.metadata?.source === 'autonomous_agent') {
      return (
        <Badge variant="outline" className="text-[10px] bg-suite-warning/10 text-suite-warning border-suite-warning/30">
          Autonomous
        </Badge>
      );
    }
    return null;
  };

  return (
    <ScrollArea className="h-[400px]">
      <div className="p-4 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : activityLogs.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">
              Waiting for system activity...
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activityLogs.map((activity) => (
              <div
                key={activity.id}
                className="p-3 rounded-lg border border-border/60 bg-card/50 space-y-2 animate-fade-in"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm">{getActivityIcon(activity.activity_type)}</span>
                    <Badge variant="outline" className={`text-[10px] ${getStatusStyles(activity.status)}`}>
                      {activity.status}
                    </Badge>
                    {getExecutionBadge(activity)}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {formatTime(activity.created_at)}
                  </span>
                </div>
                
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{activity.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{activity.description}</p>
                </div>
                
                {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                  <details className="group">
                    <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                      View details
                    </summary>
                    <pre className="mt-2 p-2 rounded bg-muted/50 text-[10px] text-muted-foreground overflow-x-auto">
                      {JSON.stringify(activity.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default PythonShell;