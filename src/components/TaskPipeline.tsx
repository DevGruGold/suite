import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  MessageSquare, 
  FileText, 
  Play, 
  CheckCircle2, 
  GitMerge,
  User,
  AlertTriangle,
  Clock,
  ChevronRight
} from 'lucide-react';

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
}

interface Agent {
  id: string;
  name: string;
  status: string;
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

function TaskCard({ task, agentName }: { task: Task; agentName: string | null }) {
  const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES.PENDING;
  const categoryColor = task.category ? CATEGORY_COLORS[task.category.toLowerCase()] || 'bg-muted' : 'bg-muted';
  
  return (
    <div 
      className={`p-3 rounded-lg border ${statusStyle.border} ${statusStyle.bg} backdrop-blur-sm transition-all hover:scale-[1.02] hover:shadow-lg`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-xs font-medium text-foreground line-clamp-2 flex-1">
          {task.title}
        </h4>
        <div className={`w-2 h-2 rounded-full ${categoryColor} flex-shrink-0 mt-1`} />
      </div>
      
      <div className="flex items-center gap-2 flex-wrap">
        {agentName && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1">
            <User className="w-2.5 h-2.5" />
            {agentName}
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
      
      <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Clock className="w-3 h-3" />
        {getRelativeTime(task.updated_at)}
      </div>
    </div>
  );
}

function StageColumn({ 
  stage, 
  tasks, 
  agents,
  isLast 
}: { 
  stage: typeof STAGES[number];
  tasks: Task[];
  agents: Map<string, Agent>;
  isLast: boolean;
}) {
  const Icon = stage.icon;
  const stageTasks = tasks.filter(t => t.stage === stage.key);
  
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex flex-col min-w-[180px] max-w-[200px]">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/40">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-medium text-foreground">{stage.label}</span>
          <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5">
            {stageTasks.length}
          </Badge>
        </div>
        
        <div className="flex flex-col gap-2 flex-1 min-h-[100px]">
          {stageTasks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[10px] text-muted-foreground/50 border border-dashed border-border/30 rounded-lg">
              No tasks
            </div>
          ) : (
            stageTasks.slice(0, 5).map(task => (
              <TaskCard 
                key={task.id} 
                task={task} 
                agentName={task.assignee_agent_id ? agents.get(task.assignee_agent_id)?.name || null : null}
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

export function TaskPipeline() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      
      const [tasksRes, agentsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, stage, status, priority, category, assignee_agent_id, blocking_reason, updated_at')
          .in('status', ['PENDING', 'CLAIMED', 'IN_PROGRESS', 'BLOCKED'])
          .order('priority', { ascending: false })
          .limit(50),
        supabase
          .from('agents')
          .select('id, name, status')
          .in('status', ['IDLE', 'BUSY'])
      ]);
      
      if (tasksRes.data) {
        setTasks(tasksRes.data as Task[]);
      }
      
      if (agentsRes.data) {
        const agentMap = new Map<string, Agent>();
        agentsRes.data.forEach((a: Agent) => agentMap.set(a.id, a));
        setAgents(agentMap);
      }
      
      setIsLoading(false);
    }
    
    fetchData();
    
    // Real-time subscriptions
    const tasksChannel = supabase
      .channel('pipeline-tasks')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks'
      }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newTask = payload.new as Task;
          setTasks(prev => {
            const filtered = prev.filter(t => t.id !== newTask.id);
            if (['PENDING', 'CLAIMED', 'IN_PROGRESS', 'BLOCKED'].includes(newTask.status)) {
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
      .channel('pipeline-agents')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agents'
      }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const agent = payload.new as Agent;
          setAgents(prev => new Map(prev).set(agent.id, agent));
        }
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(agentsChannel);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="flex gap-4">
          {STAGES.map((stage) => (
            <div key={stage.key} className="min-w-[180px]">
              <Skeleton className="h-6 w-24 mb-3" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="w-full">
      <div className="p-4 flex gap-1">
        {STAGES.map((stage, idx) => (
          <StageColumn 
            key={stage.key}
            stage={stage}
            tasks={tasks}
            agents={agents}
            isLast={idx === STAGES.length - 1}
          />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

export default TaskPipeline;
