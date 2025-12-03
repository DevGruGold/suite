import { Badge } from '@/components/ui/badge';
import { 
  MessageSquare, 
  FileText, 
  Play, 
  CheckCircle2, 
  GitMerge,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  stage: string;
  progress_percentage?: number;
}

interface AgentTaskSummaryProps {
  tasks: Task[];
  compact?: boolean;
}

const STAGE_CONFIG = {
  DISCUSS: { icon: MessageSquare, color: 'text-purple-400', bg: 'bg-purple-500/20' },
  PLAN: { icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  EXECUTE: { icon: Play, color: 'text-green-400', bg: 'bg-green-500/20' },
  VERIFY: { icon: CheckCircle2, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  INTEGRATE: { icon: GitMerge, color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
} as const;

type StageKey = keyof typeof STAGE_CONFIG;

export function AgentTaskSummary({ tasks, compact = false }: AgentTaskSummaryProps) {
  // Group tasks by stage
  const tasksByStage = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const stage = task.stage || 'DISCUSS';
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(task);
    return acc;
  }, {});
  
  // Find most urgent task (highest progress percentage)
  const urgentTask = tasks.reduce<Task | null>((urgent, task) => {
    if (!urgent) return task;
    return (task.progress_percentage || 0) > (urgent.progress_percentage || 0) ? task : urgent;
  }, null);
  
  const hasUrgent = urgentTask && (urgentTask.progress_percentage || 0) >= 75;
  
  if (tasks.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground/50 italic">
        No assigned tasks
      </div>
    );
  }
  
  if (compact) {
    // Compact view: Just show stage badges
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {Object.entries(tasksByStage).map(([stage, stageTasks]) => {
          const config = STAGE_CONFIG[stage as StageKey] || STAGE_CONFIG.DISCUSS;
          const Icon = config.icon;
          const hasUrgentInStage = stageTasks.some(t => (t.progress_percentage || 0) >= 75);
          
          return (
            <Badge 
              key={stage} 
              variant="outline" 
              className={cn(
                "text-[9px] px-1 py-0 h-4 gap-0.5",
                config.color,
                hasUrgentInStage && "border-red-500/50 animate-pulse"
              )}
            >
              <Icon className="w-2 h-2" />
              {stageTasks.length}
            </Badge>
          );
        })}
      </div>
    );
  }
  
  // Full view: Show stage breakdown with progress
  return (
    <div className="space-y-1.5">
      {/* Urgent indicator */}
      {hasUrgent && (
        <div className="flex items-center gap-1 text-[10px] text-red-400 animate-pulse">
          <AlertCircle className="w-3 h-3" />
          <span>Task due soon</span>
        </div>
      )}
      
      {/* Stage breakdown */}
      <div className="flex flex-wrap gap-1">
        {Object.entries(tasksByStage).map(([stage, stageTasks]) => {
          const config = STAGE_CONFIG[stage as StageKey] || STAGE_CONFIG.DISCUSS;
          const Icon = config.icon;
          const maxProgress = Math.max(...stageTasks.map(t => t.progress_percentage || 0));
          
          return (
            <div 
              key={stage}
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]",
                config.bg,
                maxProgress >= 90 && "ring-1 ring-red-500/50 animate-pulse"
              )}
            >
              <Icon className={cn("w-2.5 h-2.5", config.color)} />
              <span className={config.color}>{stageTasks.length}</span>
              {maxProgress >= 75 && (
                <span className="text-red-400 font-medium">!</span>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Total tasks */}
      <div className="text-[9px] text-muted-foreground">
        {tasks.length} total task{tasks.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

export function PipelinePositionIndicator({ 
  stage, 
  totalStages = 5 
}: { 
  stage: string; 
  totalStages?: number;
}) {
  const stageOrder = ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE'];
  const currentIndex = stageOrder.indexOf(stage);
  const position = currentIndex >= 0 ? currentIndex + 1 : 1;
  
  return (
    <div className="flex items-center gap-0.5">
      {stageOrder.map((s, i) => {
        const config = STAGE_CONFIG[s as StageKey];
        const isActive = i === currentIndex;
        const isPast = i < currentIndex;
        
        return (
          <div 
            key={s}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-all",
              isActive && cn(config.bg, "ring-1 ring-offset-1 ring-offset-background", config.color.replace('text-', 'ring-')),
              isPast && "bg-muted-foreground/50",
              !isActive && !isPast && "bg-muted/30"
            )}
          />
        );
      })}
      <span className="text-[9px] text-muted-foreground ml-1">
        {position}/{totalStages}
      </span>
    </div>
  );
}
