import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  CheckCircle2,
  Zap,
  Brain,
  Wrench,
  Activity,
  Clock,
  ExternalLink,
  User,
  ListTodo,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ActivityItem {
  id: string;
  source: 'eliza_activity_log' | 'agent_activities' | 'autonomous_actions_log' | 'eliza_python_executions' | 'workflow_executions';
  type: string;
  title?: string;
  description: string;
  timestamp: string;
  status?: string;
  metadata?: Record<string, Json>;
  task_id?: string;
  agent_id?: string;
}

const MAX_DESCRIPTION_LENGTH = 70;

type ElizaActivityRow = Database['public']['Tables']['eliza_activity_log']['Row'];
type AgentActivityRow = Database['public']['Tables']['agent_activities']['Row'];
type AutonomousActionRow = Database['public']['Tables']['autonomous_actions_log']['Row'];
type PythonExecutionRow = Database['public']['Tables']['eliza_python_executions']['Row'];
type WorkflowExecutionRow = Database['public']['Tables']['workflow_executions']['Row'];


interface ActivityPulseProps {
  healthScore?: number;
  onTaskClick?: (taskId: string) => void;
  onAgentClick?: (agentId: string) => void;
  compact?: boolean;
  maxItems?: number;
}

export const ActivityPulse = ({
  healthScore = 100,
  onTaskClick,
  onAgentClick,
  compact = false,
  maxItems = 15,
}: ActivityPulseProps) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLive, setIsLive] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate linked activities count once for performance
  const linkedActivitiesCount = useMemo(
    () => activities.filter((a) => a.task_id || a.agent_id).length,
    [activities]
  );

  // Retry state for subscription stability
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const truncate = (value: string, maxLength = MAX_DESCRIPTION_LENGTH) =>
      value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;

    const normalizeElizaActivity = (activity: ElizaActivityRow): ActivityItem => ({
      id: `eliza-${activity.id}`,
      source: 'eliza_activity_log',
      type: activity.activity_type || 'system',
      title: activity.title || undefined,
      description: activity.description || 'Activity completed',
      timestamp: activity.created_at || new Date().toISOString(),
      status: activity.status || undefined,
      metadata: ((activity.metadata as Record<string, Json> | null) || {}),
      task_id: activity.task_id || undefined,
      agent_id: activity.agent_id || undefined,
    });

    const normalizeAgentActivity = (activity: AgentActivityRow): ActivityItem => ({
      id: `agent-${activity.id}`,
      source: 'agent_activities',
      type: 'agent_activity',
      title: activity.level ? `Agent ${activity.level.toLowerCase()}` : 'Agent activity',
      description: activity.activity || 'Agent activity recorded',
      timestamp: activity.created_at || new Date().toISOString(),
      status: activity.level?.toLowerCase() || 'info',
      metadata: { level: activity.level },
      agent_id: activity.agent_id || undefined,
    });

    const normalizeAutonomousAction = (action: AutonomousActionRow): ActivityItem => ({
      id: `autonomous-${action.id}`,
      source: 'autonomous_actions_log',
      type: 'autonomous_action',
      title: action.action_type ? `Autonomous ${action.action_type.replace(/_/g, ' ')}` : 'Autonomous action',
      description: action.trigger_reason || 'Autonomous action recorded',
      timestamp: action.action_timestamp || action.created_at || new Date().toISOString(),
      status: action.outcome || undefined,
      metadata: {
        ...(((action.metadata as Record<string, Json> | null) || {})),
        action_details: action.action_details,
        impact_assessment: action.impact_assessment,
        confidence_score: action.confidence_score,
      },
    });

    const normalizePythonExecution = (execution: PythonExecutionRow): ActivityItem => ({
      id: `python-${execution.id}`,
      source: 'eliza_python_executions',
      type: 'python_execution',
      title: execution.purpose ? truncate(execution.purpose) : 'Python execution',
      description: execution.error_message || execution.purpose || 'Python execution recorded',
      timestamp: execution.started_at || execution.created_at || new Date().toISOString(),
      status: execution.status || undefined,
      metadata: {
        ...(((execution.metadata as Record<string, Json> | null) || {})),
        workflow_id: execution.workflow_id,
        execution_time_ms: execution.execution_time_ms,
        exit_code: execution.exit_code,
        source: execution.source,
      },
    });

    const normalizeWorkflowExecution = (workflow: WorkflowExecutionRow): ActivityItem => ({
      id: `workflow-${workflow.id}`,
      source: 'workflow_executions',
      type: 'workflow_execution',
      title: workflow.name || 'Workflow execution',
      description: workflow.description || `Workflow ${workflow.workflow_id} ${workflow.status || 'updated'}`,
      timestamp: workflow.start_time || workflow.created_at || new Date().toISOString(),
      status: workflow.status || undefined,
      metadata: {
        ...(((workflow.metadata as Record<string, Json> | null) || {})),
        workflow_id: workflow.workflow_id,
        current_step_index: workflow.current_step_index,
        total_steps: workflow.total_steps,
        failed_step: workflow.failed_step,
      },
    });

    const sortActivities = (items: ActivityItem[]) =>
      items
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, maxItems);

    const upsertActivity = (nextActivity: ActivityItem) => {
      setActivities((prev) => {
        const filtered = prev.filter((activity) => activity.id !== nextActivity.id);
        return sortActivities([nextActivity, ...filtered]);
      });
      setIsLive(true);
    };

    // Fetch recent activities across agent and execution sources.
    const fetchRecent = async () => {
      const [elizaActivities, agentActivities, autonomousActions, pythonExecutions, workflowExecutions] = await Promise.all([
        supabase
          .from('eliza_activity_log')
          .select('id, activity_type, title, description, created_at, status, metadata, task_id, agent_id')
          .order('created_at', { ascending: false })
          .limit(maxItems),
        supabase
          .from('agent_activities')
          .select('id, activity, created_at, level, agent_id')
          .order('created_at', { ascending: false })
          .limit(maxItems),
        supabase
          .from('autonomous_actions_log')
          .select('id, action_type, trigger_reason, action_timestamp, created_at, outcome, metadata, action_details, impact_assessment, confidence_score')
          .order('action_timestamp', { ascending: false })
          .limit(maxItems),
        supabase
          .from('eliza_python_executions')
          .select('id, purpose, started_at, created_at, status, error_message, metadata, workflow_id, execution_time_ms, exit_code, source')
          .order('started_at', { ascending: false })
          .limit(maxItems),
        supabase
          .from('workflow_executions')
          .select('id, workflow_id, name, description, start_time, created_at, status, metadata, current_step_index, total_steps, failed_step')
          .order('start_time', { ascending: false })
          .limit(maxItems),
      ]);

      const mergedActivities = sortActivities([
        ...(elizaActivities.data || []).map(normalizeElizaActivity),
        ...(agentActivities.data || []).map(normalizeAgentActivity),
        ...(autonomousActions.data || []).map(normalizeAutonomousAction),
        ...(pythonExecutions.data || []).map(normalizePythonExecution),
        ...(workflowExecutions.data || []).map(normalizeWorkflowExecution),
      ]);

      setActivities(mergedActivities);
    };

    fetchRecent();

    // Setup subscription with retry mechanism
    const setupSubscription = () => {
      // Small delay to prevent race conditions with auth initialization
      const initTimer = setTimeout(() => {
        console.log('🔌 Initializing activity-pulse-live subscription...');

        const channel = supabase
          .channel('activity-pulse-live')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'eliza_activity_log',
            },
            (payload) => {
              upsertActivity(normalizeElizaActivity(payload.new));
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'agent_activities',
            },
            (payload) => {
              upsertActivity(normalizeAgentActivity(payload.new));
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'autonomous_actions_log',
            },
            (payload) => {
              upsertActivity(normalizeAutonomousAction(payload.new));
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'eliza_python_executions',
            },
            (payload) => {
              upsertActivity(normalizePythonExecution(payload.new));
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'workflow_executions',
            },
            (payload) => {
              upsertActivity(normalizeWorkflowExecution(payload.new));
            }
          )
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
                console.log(
                  `🔄 Scheduling retry ${nextRetry}/${MAX_RETRIES} in ${delay}ms...`
                );

                setTimeout(() => {
                  if (channelRef.current) {
                    supabase.removeChannel(channelRef.current);
                  }
                  setRetryCount(nextRetry);
                }, delay);
              } else {
                console.error(
                  '❌ Max retries reached for activity-pulse-live subscription'
                );
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
  }, [retryCount, maxItems]); // Re-run when retryCount changes

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
    return (
      (activity.task_id && onTaskClick) || (activity.agent_id && onAgentClick)
    );
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
      case 'agent_activity':
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
      case 'function_call':
        return <Zap className="w-3.5 h-3.5 text-sky-500" />;
      case 'workflow_execution':
        return <Activity className="w-3.5 h-3.5 text-cyan-500" />;
      case 'autonomous_action':
        return <Brain className="w-3.5 h-3.5 text-fuchsia-500" />;
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
  const getActivityColor = (
    type: string,
    status?: string,
    metadata?: Record<string, Json>
  ) => {
    // Health check coloring based on score
    if (type === 'system_health_check' && metadata?.health_score) {
      const score = metadata.health_score;
      if (score >= 95) return 'text-emerald-400';
      if (score >= 80) return 'text-amber-400';
      return 'text-destructive';
    }

    if (status === 'failed' || status === 'error') return 'text-destructive';
    if (status === 'completed' || status === 'success')
      return 'text-emerald-400';
    if (status === 'pending') return 'text-amber-400';

    switch (type) {
      case 'system_health_check':
        return healthScore >= 95
          ? 'text-emerald-400'
          : healthScore >= 80
            ? 'text-amber-400'
            : 'text-destructive';
      case 'task_update':
        return 'text-blue-400';
      case 'agent_status_change':
      case 'agent_activity':
        return 'text-violet-400';
      case 'auto_task_assignment':
      case 'auto_task_creation':
        return 'text-amber-400';
      case 'python':
      case 'python_execution':
        return 'text-primary';
      case 'learning':
        return 'text-violet-400';
      case 'autonomous_action':
        return 'text-fuchsia-400';
      case 'workflow_execution':
        return 'text-cyan-400';
      case 'function_call':
        return 'text-sky-400';
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
    if (text.length > MAX_DESCRIPTION_LENGTH) {
      return text.slice(0, MAX_DESCRIPTION_LENGTH - 3) + '...';
    }
    return text;
  };

  // Get activity type label
  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      system_health_check: 'Health',
      task_update: 'Task',
      agent_status_change: 'Agent',
      auto_task_assignment: 'Auto-Task',
      auto_task_creation: 'Auto-Task',
      python_execution: 'Python',
      learning_session: 'Learning',
      code_fix: 'Code Fix',
      function_call: 'Function',
      agent_activity: 'Agent',
      autonomous_action: 'Autonomous',
      workflow_execution: 'Workflow',
    };
    return labels[type] || type.replace(/_/g, ' ');
  };

  return (
    <div className="relative w-full overflow-hidden">
      {!compact && (
        <>
          <div className="absolute top-0 left-0 z-20 flex items-center gap-2 rounded-br-lg border-r border-b border-border/50 bg-background/95 px-3 py-1.5 backdrop-blur-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={cn(
                  'absolute inline-flex h-full w-full rounded-full opacity-75',
                  isLive ? 'animate-ping bg-emerald-500' : 'bg-muted-foreground'
                )}
              ></span>
              <span
                className={cn(
                  'relative inline-flex rounded-full h-2.5 w-2.5',
                  isLive ? 'bg-emerald-500' : 'bg-muted-foreground'
                )}
              ></span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Live
            </span>
            <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[10px]">
              {activities.length}
            </Badge>
          </div>

          <div className="mb-3 flex items-center gap-3 px-1">
            <div
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold shadow-sm transition-all',
                healthScore >= 95
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                  : healthScore >= 80
                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-500'
                    : 'border-destructive/20 bg-destructive/10 text-destructive'
              )}
            >
              {healthScore >= 95 ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              System Health:{' '}
              {healthScore >= 95
                ? 'HEALTHY'
                : healthScore >= 80
                  ? 'DEGRADED'
                  : 'CRITICAL'}
            </div>

            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/30">
              <div
                className={cn(
                  'h-full transition-all duration-1000 ease-out',
                  healthScore >= 95
                    ? 'bg-emerald-500'
                    : healthScore >= 80
                      ? 'bg-amber-500'
                      : 'bg-destructive'
                )}
                style={{ width: `${healthScore}%` }}
              />
            </div>

            <span
              className={cn(
                'text-xs font-bold tabular-nums',
                healthScore >= 95
                  ? 'text-emerald-500'
                  : healthScore >= 80
                    ? 'text-amber-500'
                    : 'text-destructive'
              )}
            >
              {healthScore}%
            </span>
          </div>

          <div
            ref={containerRef}
            className={cn(
              'relative min-h-[3rem] overflow-hidden rounded-xl bg-gradient-to-r from-background via-muted/30 to-background border-2 transition-all duration-300',
              healthScore < 80 &&
                'border-destructive/50 shadow-[0_0_20px_hsl(var(--destructive)/0.15)]',
              healthScore >= 80 &&
                healthScore < 95 &&
                'border-amber-500/40 shadow-[0_0_15px_hsl(38_92%_50%/0.1)]',
              healthScore >= 95 &&
                'border-emerald-500/30 shadow-[0_0_10px_hsl(142_76%_36%/0.1)]'
            )}
          >
            <div className="animate-ticker-smooth whitespace-nowrap px-6 py-3">
              {activities.length > 0 ? (
                activities.map((activity, i) => (
                  <span
                    key={activity.id}
                    onClick={() => handleActivityClick(activity)}
                    className={cn(
                      'mx-4 inline-flex items-center gap-2 text-sm transition-all',
                      getActivityColor(
                        activity.type,
                        activity.status,
                        activity.metadata
                      ),
                      isClickable(activity) &&
                        'cursor-pointer hover:scale-105 hover:brightness-125'
                    )}
                  >
                    {getActivityIcon(activity.type, activity.status)}
                    <Badge
                      variant="outline"
                      className={cn(
                        'h-4 border-current/30 px-1.5 py-0 text-[10px] font-semibold',
                        getActivityColor(
                          activity.type,
                          activity.status,
                          activity.metadata
                        )
                      )}
                    >
                      {getTypeLabel(activity.type)}
                    </Badge>
                    <span className="font-medium">
                      {getDisplayText(activity)}
                    </span>
                    {activity.task_id && (
                      <Badge
                        variant="secondary"
                        className="h-3.5 gap-0.5 px-1 py-0 text-[9px]"
                      >
                        <ListTodo className="h-2.5 w-2.5" />
                        task
                      </Badge>
                    )}
                    {activity.agent_id && !activity.task_id && (
                      <Badge
                        variant="secondary"
                        className="h-3.5 gap-0.5 px-1 py-0 text-[9px]"
                      >
                        <User className="h-2.5 w-2.5" />
                        agent
                      </Badge>
                    )}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {formatTime(activity.timestamp)}
                    </span>
                    {isClickable(activity) && (
                      <ExternalLink className="h-3 w-3 text-muted-foreground/50" />
                    )}
                    {i < activities.length - 1 && (
                      <span className="mx-3 text-border/50">│</span>
                    )}
                  </span>
                ))
              ) : (
                <span className="text-sm italic text-muted-foreground">
                  Waiting for system activity...
                </span>
              )}
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent" />
          </div>

          {linkedActivitiesCount > 0 && (
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="text-[10px] text-muted-foreground">
                Click linked items to navigate
              </span>
              <span className="text-[10px] text-muted-foreground">
                {linkedActivitiesCount} linked{' '}
                {linkedActivitiesCount === 1 ? 'activity' : 'activities'}
              </span>
            </div>
          )}
        </>
      )}

      {compact && (
        <div className="flex h-full flex-col">
          <div className="mb-2 flex items-center justify-between rounded-lg border border-border/50 bg-background/70 px-2.5 py-1.5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full rounded-full opacity-75',
                    isLive
                      ? 'animate-ping bg-emerald-500'
                      : 'bg-muted-foreground'
                  )}
                ></span>
                <span
                  className={cn(
                    'relative inline-flex h-2 w-2 rounded-full',
                    isLive ? 'bg-emerald-500' : 'bg-muted-foreground'
                  )}
                ></span>
              </span>
              <span className="text-[11px] font-medium text-foreground">
                Realtime feed
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{activities.length} events</span>
              <span
                className={cn(
                  'font-semibold',
                  healthScore >= 95
                    ? 'text-emerald-500'
                    : healthScore >= 80
                      ? 'text-amber-500'
                      : 'text-destructive'
                )}
              >
                {healthScore}% health
              </span>
            </div>
          </div>

          <div
            ref={containerRef}
            className="min-h-0 flex-1 space-y-1 overflow-auto pr-1"
          >
            {activities.length > 0 ? (
              activities.map((activity) => (
                <button
                  key={activity.id}
                  type="button"
                  onClick={() => handleActivityClick(activity)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-lg border border-border/50 bg-background/50 px-2.5 py-2 text-left transition-colors hover:bg-background/80',
                    !isClickable(activity) && 'cursor-default'
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {getActivityIcon(activity.type, activity.status)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="h-4 px-1.5 py-0 text-[9px]"
                      >
                        {getTypeLabel(activity.type)}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(activity.timestamp)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        'truncate text-xs font-medium',
                        getActivityColor(
                          activity.type,
                          activity.status,
                          activity.metadata
                        )
                      )}
                    >
                      {getDisplayText(activity)}
                    </p>
                  </div>
                  {isClickable(activity) && (
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                </button>
              ))
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/60 px-3 text-center text-xs text-muted-foreground">
                Waiting for system activity...
              </div>
            )}
          </div>

          {linkedActivitiesCount > 0 && (
            <div className="mt-2 text-right text-[10px] text-muted-foreground">
              {linkedActivitiesCount} linked{' '}
              {linkedActivitiesCount === 1 ? 'event' : 'events'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
