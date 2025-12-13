import { useState, useEffect, DragEvent, TouchEvent as ReactTouchEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/useIsMobile';
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
  GripVertical,
  ExternalLink,
  UserPlus,
  Loader2
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TaskProgressRing, TaskProgressBar } from './TaskProgressRing';
import { AgentTaskSummary } from './AgentTaskSummary';
import { TaskDetailSheet } from './TaskDetailSheet';
import { AgentDetailSheet } from './AgentDetailSheet';

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
  description?: string | null;
  completed_checklist_items?: string[] | null;
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
  onAgentClick: (agent: Agent) => void;
  onTaskDropToAgent: (e: DragEvent<HTMLDivElement>, agentId: string) => void;
  isDragOverAgent: boolean;
  hasDraggedTask: boolean;
}

function AgentCard({ agent, taskCount, assignedTasks, onAgentClick, onTaskDropToAgent, isDragOverAgent, hasDraggedTask }: AgentCardProps) {
  const isActive = agent.status === 'BUSY';
  const shortName = agent.name.split(' - ')[0].split(' ')[0];
  
  // Find most urgent task
  const urgentTask = assignedTasks.reduce<Task | null>((urgent, task) => {
    if (!urgent) return task;
    return (task.progress_percentage || 0) > (urgent.progress_percentage || 0) ? task : urgent;
  }, null);
  const hasUrgent = urgentTask && (urgentTask.progress_percentage || 0) >= 75;
  
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  
  return (
    <div 
      onClick={() => onAgentClick(agent)}
      onDragOver={handleDragOver}
      onDrop={(e) => onTaskDropToAgent(e, agent.id)}
      className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
        isDragOverAgent
          ? 'border-primary bg-primary/20 ring-2 ring-primary/50 scale-105'
          : hasUrgent
            ? 'border-amber-500/50 bg-amber-500/10'
            : isActive 
              ? 'border-green-500/50 bg-green-500/10' 
              : 'border-blue-500/30 bg-blue-500/5'
      } ${hasDraggedTask ? 'hover:border-primary hover:bg-primary/10' : 'hover:scale-[1.02]'}`}
    >
      <div className="flex items-center gap-2">
        <div 
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isDragOverAgent ? 'bg-primary' : hasUrgent ? 'bg-amber-500' : isActive ? 'bg-green-500 animate-pulse' : 'bg-blue-400'
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
        <span className={isDragOverAgent ? 'text-primary' : hasUrgent ? 'text-amber-400' : isActive ? 'text-green-400' : 'text-blue-400'}>
          {isDragOverAgent ? 'DROP HERE' : hasUrgent ? 'DUE SOON' : agent.status}
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
  onTaskClick: (task: Task) => void;
}

function TaskCard({ task, agentName, onDragStart, onDragEnd, isDragging, onTaskClick }: TaskCardProps) {
  const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES.PENDING;
  const categoryColor = task.category ? CATEGORY_COLORS[task.category.toLowerCase()] || 'bg-muted' : 'bg-muted';
  const progressPercentage = task.progress_percentage || 0;
  const isUrgent = progressPercentage >= 75;
  
  const handleClick = (e: React.MouseEvent) => {
    // Only trigger click if not dragging
    if (!isDragging) {
      e.stopPropagation();
      onTaskClick(task);
    }
  };
  
  return (
    <div 
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onClick={handleClick}
      className={`p-3 rounded-lg border ${statusStyle.border} ${statusStyle.bg} backdrop-blur-sm transition-all cursor-pointer group ${
        isDragging ? 'opacity-50 scale-95 cursor-grabbing' : 'hover:scale-[1.02] hover:shadow-lg hover:ring-2 hover:ring-primary/30'
      } ${isUrgent ? 'ring-1 ring-red-500/50' : ''}`}
    >
      {/* Progress bar at top */}
      <TaskProgressBar percentage={progressPercentage} className="mb-2" />
      
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-1">
          <GripVertical className="w-3 h-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 cursor-grab" />
          <h4 className="text-xs font-medium text-foreground line-clamp-2">
            {task.title}
          </h4>
        </div>
        <div className="flex items-center gap-1.5">
          <ExternalLink className="w-3 h-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className={`w-2 h-2 rounded-full ${categoryColor} flex-shrink-0`} />
        </div>
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
  onTaskClick: (task: Task) => void;
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
  isUpdating,
  onTaskClick
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
                onTaskClick={onTaskClick}
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
  const isMobile = useIsMobile();
  
  // Drag and drop state
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Task detail sheet state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  
  // Agent detail sheet state
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isAgentSheetOpen, setIsAgentSheetOpen] = useState(false);
  const [dragOverAgentId, setDragOverAgentId] = useState<string | null>(null);
  
  // Mobile reassign dialog state
  const [mobileReassignTask, setMobileReassignTask] = useState<Task | null>(null);
  const [isMobileReassignOpen, setIsMobileReassignOpen] = useState(false);
  const [isGeneratingHandoff, setIsGeneratingHandoff] = useState(false);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setIsDetailSheetOpen(true);
  };

  const handleTaskUpdate = (updatedTask: Task) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
  };
  
  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsAgentSheetOpen(true);
  };
  
  // Mobile reassign handler - tap task to open reassign dialog
  const handleMobileReassign = (task: Task) => {
    if (isMobile) {
      setMobileReassignTask(task);
      setIsMobileReassignOpen(true);
    }
  };
  
  // Handle mobile agent selection for reassignment
  const handleMobileAgentSelect = async (agentId: string) => {
    if (!mobileReassignTask) return;
    
    setIsGeneratingHandoff(true);
    try {
      const newAgent = agentMap.get(agentId);
      const oldAgent = mobileReassignTask.assignee_agent_id 
        ? agentMap.get(mobileReassignTask.assignee_agent_id) 
        : undefined;
      
      const aiConfirmation = newAgent 
        ? await generateHandoffConfirmation(mobileReassignTask, newAgent, oldAgent)
        : 'Task unassigned.';
      
      await handleTaskReassignWithHandoff(mobileReassignTask.id, agentId, aiConfirmation, oldAgent, newAgent);
      setIsMobileReassignOpen(false);
      setMobileReassignTask(null);
    } finally {
      setIsGeneratingHandoff(false);
    }
  };
  
  const handleTaskReassign = async (taskId: string, newAgentId: string | null) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const oldAgentId = task.assignee_agent_id;
    const newAgent = newAgentId ? agentMap.get(newAgentId) : null;
    const oldAgent = oldAgentId ? agentMap.get(oldAgentId) : null;
    
    try {
      // Update task in database
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ 
          assignee_agent_id: newAgentId,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);
      
      if (updateError) throw updateError;
      
      // Update agent workloads
      if (oldAgentId) {
        await supabase
          .from('agents')
          .update({ 
            current_workload: Math.max(0, (oldAgent?.current_workload || 1) - 1),
            status: 'IDLE'
          })
          .eq('id', oldAgentId);
      }
      
      if (newAgentId) {
        await supabase
          .from('agents')
          .update({ 
            current_workload: (newAgent?.current_workload || 0) + 1,
            status: 'BUSY'
          })
          .eq('id', newAgentId);
      }
      
      // Log activity
      await supabase.from('eliza_activity_log').insert({
        activity_type: 'task_reassigned',
        title: newAgentId 
          ? `Task assigned to ${newAgent?.name || 'agent'}`
          : `Task unassigned from ${oldAgent?.name || 'agent'}`,
        description: `"${task.title}" ${newAgentId ? `reassigned to ${newAgent?.name}` : 'unassigned'}`,
        status: 'completed',
        task_id: taskId,
        agent_id: newAgentId || oldAgentId || null,
        metadata: {
          task_title: task.title,
          old_agent_id: oldAgentId,
          new_agent_id: newAgentId,
          old_agent_name: oldAgent?.name,
          new_agent_name: newAgent?.name,
        }
      });
      
      // Update local state
      setTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, assignee_agent_id: newAgentId } : t
      ));
      
      // Update agents state
      setAgents(prev => prev.map(a => {
        if (a.id === oldAgentId) {
          return { ...a, current_workload: Math.max(0, (a.current_workload || 1) - 1), status: 'IDLE' };
        }
        if (a.id === newAgentId) {
          return { ...a, current_workload: (a.current_workload || 0) + 1, status: 'BUSY' };
        }
        return a;
      }));
      
      toast({
        title: newAgentId ? 'Task reassigned' : 'Task unassigned',
        description: newAgentId 
          ? `"${task.title.slice(0, 30)}..." assigned to ${newAgent?.name}`
          : `"${task.title.slice(0, 30)}..." unassigned`,
      });
      
    } catch (err) {
      console.error('[AgentTaskVisualizer] Failed to reassign task:', err);
      toast({
        title: 'Failed to reassign task',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
      throw err;
    }
  };
  
  // Generate AI handoff confirmation
  const generateHandoffConfirmation = async (
    task: Task, 
    newAgent: Agent, 
    oldAgent?: Agent
  ): Promise<string> => {
    try {
      const { data, error } = await supabase.functions.invoke('lovable-chat', {
        body: {
          message: `Generate a brief 1-2 sentence handoff confirmation from agent "${newAgent.name}" (role: ${newAgent.role}) accepting task "${task.title}" at ${task.progress_percentage || 0}% progress in ${task.stage} stage. Make it sound like the agent understands the work context and is ready to continue. Be concise and professional.`,
          quick: true
        }
      });
      
      if (error) throw error;
      return data?.response || data?.content || `${newAgent.name} acknowledges task and is reviewing current progress.`;
    } catch (err) {
      console.error('[AgentTaskVisualizer] Failed to generate handoff confirmation:', err);
      // Fallback to static confirmation
      return `${newAgent.name} acknowledges "${task.title}" at ${task.progress_percentage || 0}% completion and is taking over from the ${task.stage} stage.`;
    }
  };
  
  const handleTaskDropToAgent = async (e: DragEvent<HTMLDivElement>, agentId: string) => {
    e.preventDefault();
    setDragOverAgentId(null);
    
    if (!draggedTask) return;
    if (draggedTask.assignee_agent_id === agentId) {
      setDraggedTask(null);
      return;
    }
    
    setIsUpdating(true);
    try {
      const newAgent = agentMap.get(agentId);
      const oldAgent = draggedTask.assignee_agent_id ? agentMap.get(draggedTask.assignee_agent_id) : undefined;
      
      // Generate AI confirmation for the handoff
      const aiConfirmation = newAgent 
        ? await generateHandoffConfirmation(draggedTask, newAgent, oldAgent)
        : 'Task unassigned.';
      
      // Perform the reassignment
      await handleTaskReassignWithHandoff(draggedTask.id, agentId, aiConfirmation, oldAgent, newAgent);
    } finally {
      setIsUpdating(false);
      setDraggedTask(null);
    }
  };
  
  // Enhanced task reassign with intelligent handoff logging
  const handleTaskReassignWithHandoff = async (
    taskId: string, 
    newAgentId: string | null,
    aiConfirmation: string,
    oldAgent?: Agent,
    newAgent?: Agent
  ) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const oldAgentId = task.assignee_agent_id;
    
    try {
      // Update task in database
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ 
          assignee_agent_id: newAgentId,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);
      
      if (updateError) throw updateError;
      
      // Update agent workloads
      if (oldAgentId) {
        await supabase
          .from('agents')
          .update({ 
            current_workload: Math.max(0, (oldAgent?.current_workload || 1) - 1),
            status: 'IDLE'
          })
          .eq('id', oldAgentId);
      }
      
      if (newAgentId) {
        await supabase
          .from('agents')
          .update({ 
            current_workload: (newAgent?.current_workload || 0) + 1,
            status: 'BUSY'
          })
          .eq('id', newAgentId);
      }
      
      // Log activity with AI handoff confirmation
      await supabase.from('eliza_activity_log').insert({
        activity_type: 'task_handoff',
        title: newAgentId 
          ? `Task handed off: ${oldAgent?.name || 'Unassigned'} → ${newAgent?.name}`
          : `Task unassigned from ${oldAgent?.name || 'agent'}`,
        description: aiConfirmation,
        status: 'completed',
        task_id: taskId,
        agent_id: newAgentId || oldAgentId || null,
        metadata: {
          handoff_type: 'drag_drop',
          from_agent: { id: oldAgentId, name: oldAgent?.name },
          to_agent: { id: newAgentId, name: newAgent?.name },
          task_progress: task.progress_percentage,
          task_stage: task.stage,
          ai_confirmation: aiConfirmation
        }
      });
      
      // Update local state
      setTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, assignee_agent_id: newAgentId } : t
      ));
      
      // Update agents state
      setAgents(prev => prev.map(a => {
        if (a.id === oldAgentId) {
          return { ...a, current_workload: Math.max(0, (a.current_workload || 1) - 1), status: 'IDLE' };
        }
        if (a.id === newAgentId) {
          return { ...a, current_workload: (a.current_workload || 0) + 1, status: 'BUSY' };
        }
        return a;
      }));
      
      // Show toast with AI confirmation
      toast({
        title: newAgentId ? `🤝 Handoff to ${newAgent?.name}` : 'Task unassigned',
        description: aiConfirmation,
        duration: 5000,
      });
      
    } catch (err) {
      console.error('[AgentTaskVisualizer] Failed to reassign task:', err);
      toast({
        title: 'Failed to reassign task',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
      throw err;
    }
  };

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
              onAgentClick={handleAgentClick}
              onTaskDropToAgent={handleTaskDropToAgent}
              isDragOverAgent={dragOverAgentId === agent.id}
              hasDraggedTask={!!draggedTask}
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
                onTaskClick={handleTaskClick}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Task Detail Sheet */}
      <TaskDetailSheet
        task={selectedTask}
        isOpen={isDetailSheetOpen}
        onOpenChange={setIsDetailSheetOpen}
        agentName={selectedTask?.assignee_agent_id ? agentMap.get(selectedTask.assignee_agent_id)?.name || null : null}
        onTaskUpdate={handleTaskUpdate}
      />
      
      {/* Agent Detail Sheet */}
      <AgentDetailSheet
        agent={selectedAgent}
        isOpen={isAgentSheetOpen}
        onClose={() => setIsAgentSheetOpen(false)}
        onTaskReassign={handleTaskReassign}
        onTaskDrop={(taskId) => handleTaskReassign(taskId, selectedAgent?.id || null)}
        draggedTaskId={draggedTask?.id || null}
      />
      
      {/* Mobile Reassign Dialog */}
      <Dialog open={isMobileReassignOpen} onOpenChange={setIsMobileReassignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Reassign Task
            </DialogTitle>
            <DialogDescription>
              {mobileReassignTask?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {isGeneratingHandoff ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Generating handoff...</span>
              </div>
            ) : (
              agents.map((agent) => {
                const isCurrentAgent = mobileReassignTask?.assignee_agent_id === agent.id;
                return (
                  <Button
                    key={agent.id}
                    variant={isCurrentAgent ? "secondary" : "outline"}
                    className="w-full justify-start h-auto py-3 px-4"
                    onClick={() => handleMobileAgentSelect(agent.id)}
                    disabled={isCurrentAgent}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        agent.status === 'BUSY' ? 'bg-green-500' : 'bg-blue-400'
                      }`} />
                      <div className="flex-1 text-left">
                        <div className="font-medium text-sm">{agent.name.split(' - ')[0]}</div>
                        <div className="text-xs text-muted-foreground">
                          {agent.status} • {getAgentTaskCount(agent.id)} tasks
                        </div>
                      </div>
                      {isCurrentAgent && (
                        <Badge variant="secondary" className="text-xs">Current</Badge>
                      )}
                    </div>
                  </Button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AgentTaskVisualizer;
