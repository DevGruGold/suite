import { useState, useEffect, DragEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { 
  MessageSquare, 
  FileText, 
  Play, 
  CheckCircle2, 
  GitMerge,
  User,
  AlertTriangle,
  Clock,
  ChevronRight,
  RefreshCw,
  Bot,
  Cpu,
  ArrowLeft,
  ArrowRight,
  GripVertical
} from 'lucide-react';
import { TaskProgressRing, TaskProgressBar } from './TaskProgressRing';
import { AgentTaskSummary } from './AgentTaskSummary';

interface Task {
  id: string;
  title: string;
  stage: string;
  status: string;
  priority: number;
  category: string | null;
  assignee_agent_id: string | null;
  blocking_reason: string | null;
  updated_at: string;
  stage_started_at: string | null;
  auto_advance_threshold_hours: number | null;
  progress_percentage: number | null;
}

interface Agent {
  id: string;
  name: string;
  status: string;
  role: string;
  current_workload: number | null;
}

const STAGES = [
  { key: 'DISCUSS', label: 'Discuss', icon: MessageSquare },
  { key: 'PLAN', label: 'Plan', icon: FileText },
  { key: 'EXECUTE', label: 'Execute', icon: Play },
  { key: 'VERIFY', label: 'Verify', icon: CheckCircle2 },
  { key: 'INTEGRATE', label: 'Integrate', icon: GitMerge },
] as const;

const STATUS_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  COMPLETED: { border: 'border-green-500/50', bg: 'bg-green-500/10', text: 'text-green-400' },
  DONE: { border: 'border-green-500/50', bg: 'bg-green-500/10', text: 'text-green-400' },
  IN_PROGRESS: { border: 'border-blue-500/50', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  CLAIMED: { border: 'border-blue-500/50', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  PENDING: { border: 'border-yellow-500/50', bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
  BLOCKED: { border: 'border-red-500/50', bg: 'bg-red-500/10', text: 'text-red-400' },
  FAILED: { border: 'border-red-500/50', bg: 'bg-red-500/10', text: 'text-red-400' },
};

const CATEGORY_COLORS: Record<string, string> = {
  code: 'bg-blue-500',
  infrastructure: 'bg-orange-500',
  research: 'bg-purple-500',
  documentation: 'bg-cyan-500',
  testing: 'bg-emerald-500',
};

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getStageIndex(stage: string): number {
  return STAGES.findIndex(s => s.key === stage);
}

interface AgentCardProps {
  agent: Agent;
  taskCount: number;
  assignedTasks: Task[];
}

function AgentCard({ agent, taskCount, assignedTasks }: AgentCardProps) {
  const isActive = agent.status === 'BUSY';
  const shortName = agent.name.split(' - ')[0].split(' ')[0];
  
  // Find most urgent task
  const urgentTask = assignedTasks.reduce<Task | null>((urgent, task) => {
    if (!urgent) return task;
    return (task.progress_percentage || 0) > (urgent.progress_percentage || 0) ? task : urgent;
  }, null);
  const hasUrgent = urgentTask && (urgentTask.progress_percentage || 0) >= 75;
  
  return (
    <div 
      className={`p-2.5 rounded-lg border transition-all hover:scale-[1.02] ${
        hasUrgent
          ? 'border-red-500/50 bg-red-500/10 animate-pulse'
          : isActive 
            ? 'border-green-500/50 bg-green-500/10' 
            : 'border-blue-500/30 bg-blue-500/5'
      }`}
    >
      <div className="flex items-center gap-2">
        <div 
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            hasUrgent ? 'bg-red-500 animate-pulse' : isActive ? 'bg-green-500 animate-pulse' : 'bg-blue-400'
          }`} 
        />
        <span className="text-xs font-medium truncate text-foreground">{shortName}</span>
      </div>
      
      {/* Pipeline position summary */}
      {assignedTasks.length > 0 && (
        <div className="mt-1.5">
          <AgentTaskSummary tasks={assignedTasks} compact />
        </div>
      )}
      
      <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5">
        <span className={hasUrgent ? 'text-red-400' : isActive ? 'text-green-400' : 'text-blue-400'}>
          {hasUrgent ? 'URGENT' : agent.status}
        </span>
        <span>•</span>
        <span>{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  agentName: string | null;
  onDragStart: (e: DragEvent<HTMLDivElement>, task: Task) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

function TaskCard({ task, agentName, onDragStart, onDragEnd, isDragging }: TaskCardProps) {
  const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES.PENDING;
  const categoryColor = task.category ? CATEGORY_COLORS[task.category.toLowerCase()] || 'bg-muted' : 'bg-muted';
  const progressPercentage = task.progress_percentage || 0;
  const isUrgent = progressPercentage >= 75;
  
  return (
    <div 
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      className={`p-3 rounded-lg border ${statusStyle.border} ${statusStyle.bg} backdrop-blur-sm transition-all cursor-grab active:cursor-grabbing group ${
        isDragging ? 'opacity-50 scale-95' : 'hover:scale-[1.02] hover:shadow-lg'
      } ${isUrgent ? 'ring-1 ring-red-500/50' : ''}`}
    >
      {/* Progress bar at top */}
      <TaskProgressBar percentage={progressPercentage} className="mb-2" />
      
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-1">
          <GripVertical className="w-3 h-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          <h4 className="text-xs font-medium text-foreground line-clamp-2">
            {task.title}
          </h4>
        </div>
        <div className={`w-2 h-2 rounded-full ${categoryColor} flex-shrink-0 mt-1`} />
      </div>
      
      <div className="flex items-center gap-2 flex-wrap">
        {agentName && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1">
            <User className="w-2.5 h-2.5" />
            {agentName.split(' - ')[0].split(' ')[0]}
          </Badge>
        )}
        
        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-5 ${statusStyle.text}`}>
          {task.status.replace('_', ' ')}
        </Badge>
        
        {task.priority >= 8 && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5">
            P{task.priority}
          </Badge>
        )}
      </div>
      
      {task.blocking_reason && (
        <div className="mt-2 flex items-start gap-1.5 text-[10px] text-red-400">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span className="line-clamp-2">{task.blocking_reason}</span>
        </div>
      )}
      
      {/* Auto-advance countdown */}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          {getRelativeTime(task.updated_at)}
        </div>
        <TaskProgressRing 
          percentage={progressPercentage}
          stageStartedAt={task.stage_started_at}
          thresholdHours={task.auto_advance_threshold_hours || 4}
          size="sm"
        />
      </div>
    </div>
  );
}

type StageKey = typeof STAGES[number]['key'];

interface StageColumnProps {
  stage: typeof STAGES[number];
  tasks: Task[];
  agents: Map<string, Agent>;
  isLast: boolean;
  dragOverStage: string | null;
  onDragOver: (e: DragEvent<HTMLDivElement>, stageKey: StageKey) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>, stageKey: StageKey) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, task: Task) => void;
  onDragEnd: () => void;
  draggedTask: Task | null;
  isUpdating: boolean;
}

function StageColumn({ 
  stage, 
  tasks, 
  agents,
  isLast,
  dragOverStage,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onDragEnd,
  draggedTask,
  isUpdating
}: StageColumnProps) {
  const Icon = stage.icon;
  const stageTasks = tasks.filter(t => t.stage === stage.key);
  const isDragOver = dragOverStage === stage.key;
  
  // Determine direction indicator
  const showDirection = isDragOver && draggedTask && draggedTask.stage !== stage.key;
  const currentIdx = draggedTask ? getStageIndex(draggedTask.stage) : -1;
  const targetIdx = getStageIndex(stage.key);
  const isMovingForward = currentIdx < targetIdx;
  
  return (
    <div className="flex items-stretch gap-2">
      <div 
        className={`flex flex-col min-w-[180px] max-w-[200px] rounded-lg transition-all duration-200 ${
          isDragOver 
            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5' 
            : ''
        } ${isUpdating ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={(e) => onDragOver(e, stage.key)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, stage.key)}
      >
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/40">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-medium text-foreground">{stage.label}</span>
          <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5">
            {stageTasks.length}
          </Badge>
        </div>
        
        {/* Direction indicator */}
        {showDirection && (
          <div className={`flex items-center justify-center gap-1.5 py-2 mb-2 rounded-md text-[10px] font-medium ${
            isMovingForward 
              ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}>
            {isMovingForward ? (
              <>
                <ArrowRight className="w-3 h-3" />
                <span>Execute</span>
              </>
            ) : (
              <>
                <ArrowLeft className="w-3 h-3" />
                <span>Discuss</span>
              </>
            )}
          </div>
        )}
        
        <div className={`flex flex-col gap-2 flex-1 min-h-[100px] rounded-lg transition-colors ${
          isDragOver ? 'bg-primary/5' : ''
        }`}>
          {stageTasks.length === 0 ? (
            <div className={`flex-1 flex items-center justify-center text-[10px] text-muted-foreground/50 border border-dashed rounded-lg transition-colors ${
              isDragOver ? 'border-primary/50 bg-primary/5' : 'border-border/30'
            }`}>
              {isDragOver ? 'Drop here' : 'No tasks'}
            </div>
          ) : (
            stageTasks.slice(0, 5).map(task => (
              <TaskCard 
                key={task.id} 
                task={task} 
                agentName={task.assignee_agent_id ? agents.get(task.assignee_agent_id)?.name || null : null}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                isDragging={draggedTask?.id === task.id}
              />
            ))
          )}
          {stageTasks.length > 5 && (
            <div className="text-[10px] text-muted-foreground text-center py-1">
              +{stageTasks.length - 5} more
            </div>
          )}
        </div>
      </div>
      
      {!isLast && (
        <div className="flex items-center px-1">
          <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
        </div>
      )}
    </div>
  );
}

export function AgentTaskVisualizer() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentMap, setAgentMap] = useState<Map<string, Agent>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLive, setIsLive] = useState(true);
  
  // Drag and drop state
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleDragStart = (e: DragEvent<HTMLDivElement>, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverStage(null);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, stageKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageKey);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>, targetStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    
    if (!draggedTask || draggedTask.stage === targetStage) {
      setDraggedTask(null);
      return;
    }
    
    const fromIdx = getStageIndex(draggedTask.stage);
    const toIdx = getStageIndex(targetStage);
    const isForward = toIdx > fromIdx;
    const fromLabel = STAGES[fromIdx]?.label || draggedTask.stage;
    const toLabel = STAGES[toIdx]?.label || targetStage;
    
    setIsUpdating(true);
    
    try {
      // Update the task stage in database
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ 
          stage: targetStage as 'DISCUSS' | 'PLAN' | 'EXECUTE' | 'VERIFY' | 'INTEGRATE',
          updated_at: new Date().toISOString()
        })
        .eq('id', draggedTask.id);
      
      if (updateError) throw updateError;
      
      // Log activity to unified activity log (supports nullable text agent_id)
      const activityTitle = isForward 
        ? `Task queued for execution: ${draggedTask.title}`
        : `Task sent back for discussion: ${draggedTask.title}`;
      
      await supabase.from('eliza_activity_log').insert({
        activity_type: 'task_stage_change',
        title: activityTitle,
        description: `Task moved from ${fromLabel} to ${toLabel}`,
        status: 'completed',
        task_id: draggedTask.id,
        agent_id: draggedTask.assignee_agent_id || null,
        metadata: {
          from_stage: draggedTask.stage,
          to_stage: targetStage,
          direction: isForward ? 'forward' : 'backward',
          task_title: draggedTask.title
        }
      });
      
      // Show toast notification
      toast({
        title: isForward ? 'Task moved forward' : 'Task moved back',
        description: `"${draggedTask.title.slice(0, 40)}${draggedTask.title.length > 40 ? '...' : ''}" moved from ${fromLabel} to ${toLabel}`,
        variant: isForward ? 'default' : 'default',
      });
      
      // Optimistically update UI
      setTasks(prev => prev.map(t => 
        t.id === draggedTask.id 
          ? { ...t, stage: targetStage, updated_at: new Date().toISOString() }
          : t
      ));
      
    } catch (err) {
      console.error('[AgentTaskVisualizer] Failed to update task:', err);
      toast({
        title: 'Failed to move task',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
      setDraggedTask(null);
    }
  };

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      
      console.log('[AgentTaskVisualizer] Fetching data...');
      
      const [tasksRes, agentsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, stage, status, priority, category, assignee_agent_id, blocking_reason, updated_at, stage_started_at, auto_advance_threshold_hours, progress_percentage')
          .in('status', ['PENDING', 'IN_PROGRESS', 'CLAIMED', 'BLOCKED'])
          .order('priority', { ascending: false })
          .limit(50),
        supabase
          .from('agents')
          .select('id, name, status, role, current_workload')
          .in('status', ['IDLE', 'BUSY'])
      ]);
      
      console.log('[AgentTaskVisualizer] Results:', {
        tasks: tasksRes.data?.length,
        tasksError: tasksRes.error?.message,
        agents: agentsRes.data?.length,
        agentsError: agentsRes.error?.message
      });
      
      if (tasksRes.error) {
        console.error('[AgentTaskVisualizer] Tasks error:', tasksRes.error);
        setError(`Tasks: ${tasksRes.error.message}`);
      }
      
      if (agentsRes.error) {
        console.error('[AgentTaskVisualizer] Agents error:', agentsRes.error);
        setError(prev => prev ? `${prev}; Agents: ${agentsRes.error.message}` : `Agents: ${agentsRes.error.message}`);
      }
      
      if (tasksRes.data) {
        setTasks(tasksRes.data as Task[]);
      }
      
      if (agentsRes.data) {
        const agentsList = agentsRes.data as Agent[];
        setAgents(agentsList);
        const map = new Map<string, Agent>();
        agentsList.forEach(a => map.set(a.id, a));
        setAgentMap(map);
      }
      
      setIsLoading(false);
    }
    
    fetchData();
    
    // Real-time subscriptions
    const tasksChannel = supabase
      .channel('visualizer-tasks')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks'
      }, (payload) => {
        setIsLive(true);
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newTask = payload.new as Task;
          setTasks(prev => {
            const filtered = prev.filter(t => t.id !== newTask.id);
            if (['PENDING', 'IN_PROGRESS', 'CLAIMED', 'BLOCKED'].includes(newTask.status)) {
              return [...filtered, newTask].sort((a, b) => b.priority - a.priority).slice(0, 50);
            }
            return filtered;
          });
        } else if (payload.eventType === 'DELETE') {
          setTasks(prev => prev.filter(t => t.id !== payload.old.id));
        }
      })
      .subscribe();
    
    const agentsChannel = supabase
      .channel('visualizer-agents')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agents'
      }, (payload) => {
        setIsLive(true);
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const agent = payload.new as Agent;
          if (['IDLE', 'BUSY'].includes(agent.status)) {
            setAgents(prev => {
              const filtered = prev.filter(a => a.id !== agent.id);
              return [...filtered, agent];
            });
            setAgentMap(prev => new Map(prev).set(agent.id, agent));
          }
        }
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(agentsChannel);
    };
  }, [refreshKey]);

  // Calculate task count per agent
  const getAgentTaskCount = (agentId: string) => {
    return tasks.filter(t => t.assignee_agent_id === agentId).length;
  };
  
  // Get assigned tasks for an agent
  const getAgentTasks = (agentId: string): Task[] => {
    return tasks.filter(t => t.assignee_agent_id === agentId);
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-6">
        {/* Agent Grid Skeleton */}
        <div>
          <Skeleton className="h-5 w-32 mb-3" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
        {/* Task Pipeline Skeleton */}
        <div>
          <Skeleton className="h-5 w-32 mb-3" />
          <div className="flex gap-4">
            {STAGES.map((stage) => (
              <div key={stage.key} className="min-w-[180px]">
                <Skeleton className="h-6 w-24 mb-3" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 flex items-center gap-3 text-amber-400 text-sm">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">{error}</span>
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={() => setRefreshKey(k => k + 1)}
          className="h-7 px-2"
        >
          <RefreshCw className="w-3 h-3 mr-1" /> 
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {isLive && (
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-green-400 border-green-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1.5" />
              Live
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">
            Drag tasks between stages to reassign
          </span>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 w-7 p-0" 
          onClick={() => setRefreshKey(k => k + 1)}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Agent Grid Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Active Agents</span>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
            {agents.length}
          </Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {agents.map(agent => (
            <AgentCard 
              key={agent.id} 
              agent={agent} 
              taskCount={getAgentTaskCount(agent.id)}
              assignedTasks={getAgentTasks(agent.id)}
            />
          ))}
          {agents.length === 0 && (
            <div className="col-span-full text-center py-4 text-xs text-muted-foreground">
              No active agents
            </div>
          )}
        </div>
      </div>

      {/* Task Pipeline Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Task Pipeline</span>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
            {tasks.length}
          </Badge>
        </div>
        <ScrollArea className="w-full">
          <div className="flex gap-1 pb-2">
            {STAGES.map((stage, idx) => (
              <StageColumn 
                key={stage.key}
                stage={stage}
                tasks={tasks}
                agents={agentMap}
                isLast={idx === STAGES.length - 1}
                dragOverStage={dragOverStage}
                onDragOver={(e, stageKey) => handleDragOver(e, stageKey)}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                draggedTask={draggedTask}
                isUpdating={isUpdating}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}

export default AgentTaskVisualizer;
