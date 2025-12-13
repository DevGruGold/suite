import React, { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  User,
  Briefcase,
  Clock,
  Target,
  TrendingUp,
  GripVertical,
  XCircle,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Task {
  id: string;
  title: string;
  stage: string;
  status: string;
  priority: number;
  progress_percentage: number;
  category?: string;
  created_at?: string;
}

interface Agent {
  id: string;
  name: string;
  status: string;
  role: string;
  current_workload: number;
  max_concurrent_tasks?: number;
  skills?: string[];
  last_seen?: string;
}

interface AgentPerformance {
  tasks_completed: number;
  success_rate: number;
  avg_completion_time: string;
  current_streak: number;
}

interface AgentDetailSheetProps {
  agent: Agent | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskReassign: (taskId: string, newAgentId: string | null) => Promise<void>;
  onTaskDrop: (taskId: string) => void;
  draggedTaskId: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  IDLE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  BUSY: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  OFFLINE: 'bg-muted text-muted-foreground border-muted',
  ERROR: 'bg-destructive/20 text-destructive border-destructive/30',
  ARCHIVED: 'bg-muted text-muted-foreground border-muted',
};

const STAGE_ORDER = ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE'];

export const AgentDetailSheet: React.FC<AgentDetailSheetProps> = ({
  agent,
  isOpen,
  onClose,
  onTaskReassign,
  onTaskDrop,
  draggedTaskId,
}) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [performance, setPerformance] = useState<AgentPerformance | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (agent && isOpen) {
      fetchAgentTasks();
      fetchAgentPerformance();
    }
  }, [agent, isOpen]);

  const fetchAgentTasks = async () => {
    if (!agent) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, stage, status, priority, progress_percentage, category, created_at')
        .eq('assignee_agent_id', agent.id)
        .in('status', ['PENDING', 'CLAIMED', 'IN_PROGRESS', 'BLOCKED'])
        .order('priority', { ascending: true });

      if (error) throw error;
      setTasks((data as Task[]) || []);
    } catch (err) {
      console.error('Error fetching agent tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgentPerformance = async () => {
    if (!agent) return;
    try {
      const { data, error } = await supabase.rpc('calculate_agent_performance', {
        p_agent_id: agent.id,
      });

      if (!error && data && typeof data === 'object') {
        const perfData = data as Record<string, unknown>;
        setPerformance({
          tasks_completed: Number(perfData.tasks_completed) || 0,
          success_rate: Number(perfData.success_rate) || 0,
          avg_completion_time: String(perfData.avg_completion_time || '0h'),
          current_streak: Number(perfData.current_streak) || 0,
        });
      }
    } catch (err) {
      console.error('Error fetching performance:', err);
    }
  };

  const handleUnassignTask = async (taskId: string) => {
    try {
      await onTaskReassign(taskId, null);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      toast.success('Task unassigned');
    } catch (err) {
      toast.error('Failed to unassign task');
    }
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.setData('sourceAgentId', agent?.id || '');
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const taskId = e.dataTransfer.getData('taskId');
    const sourceAgentId = e.dataTransfer.getData('sourceAgentId');

    if (taskId && sourceAgentId !== agent?.id) {
      onTaskDrop(taskId);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS':
        return <Clock className="h-3 w-3" />;
      case 'BLOCKED':
        return <AlertCircle className="h-3 w-3" />;
      case 'COMPLETED':
        return <CheckCircle className="h-3 w-3" />;
      default:
        return <Target className="h-3 w-3" />;
    }
  };

  if (!agent) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px] bg-background border-border">
        <SheetHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <SheetTitle className="text-foreground">{agent.name}</SheetTitle>
              <SheetDescription className="text-muted-foreground">
                {agent.role}
              </SheetDescription>
            </div>
            <Badge className={STATUS_COLORS[agent.status] || STATUS_COLORS.IDLE}>
              {agent.status}
            </Badge>
          </div>

          {/* Workload Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Workload</span>
              <span>
                {agent.current_workload} / {agent.max_concurrent_tasks || 5} tasks
              </span>
            </div>
            <Progress
              value={
                ((agent.current_workload || 0) / (agent.max_concurrent_tasks || 5)) * 100
              }
              className="h-2"
            />
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Performance Metrics */}
          {performance && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <CheckCircle className="h-3 w-3" />
                  Completed
                </div>
                <div className="text-lg font-semibold text-foreground">
                  {performance.tasks_completed}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <TrendingUp className="h-3 w-3" />
                  Success Rate
                </div>
                <div className="text-lg font-semibold text-foreground">
                  {performance.success_rate.toFixed(0)}%
                </div>
              </div>
            </div>
          )}

          {/* Assigned Tasks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Assigned Tasks ({tasks.length})
              </h3>
            </div>

            <ScrollArea className="h-[280px]">
              <div className="space-y-2 pr-4">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No active tasks assigned
                  </div>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      className="p-3 rounded-lg bg-card border border-border hover:border-primary/50 cursor-grab active:cursor-grabbing transition-colors group"
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 opacity-50 group-hover:opacity-100" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-foreground truncate">
                            {task.title}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {task.stage}
                            </Badge>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              {getStatusIcon(task.status)}
                              {task.status}
                            </span>
                          </div>
                          <Progress
                            value={task.progress_percentage || 0}
                            className="h-1 mt-2"
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                          onClick={() => handleUnassignTask(task.id)}
                        >
                          <XCircle className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Drop Zone for Reassignment */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              p-4 rounded-lg border-2 border-dashed transition-colors text-center
              ${
                isDragOver
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-muted text-muted-foreground'
              }
              ${draggedTaskId ? 'opacity-100' : 'opacity-50'}
            `}
          >
            <Target className="h-6 w-6 mx-auto mb-2" />
            <p className="text-sm">
              {isDragOver ? 'Release to assign task' : 'Drop task here to assign'}
            </p>
          </div>

          {/* Last Seen */}
          {agent.last_seen && (
            <div className="text-xs text-muted-foreground text-center">
              Last active {formatDistanceToNow(new Date(agent.last_seen))} ago
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AgentDetailSheet;
