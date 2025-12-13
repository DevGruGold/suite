import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useIsMobile } from '@/hooks/useIsMobile';
import { 
  User, 
  Clock, 
  AlertTriangle, 
  ChevronDown,
  CheckCircle2,
  Circle,
  ArrowRight,
  MessageSquare,
  FileText,
  Play,
  GitMerge,
  Loader2,
  ListChecks,
  ArrowUpRight
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

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

interface ActivityLogEntry {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  agent_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface TaskDetailSheetProps {
  task: Task | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  agentName: string | null;
  onTaskUpdate?: (task: Task) => void;
}

const DEFAULT_CHECKLIST: Record<string, string[]> = {
  code: ['Analyze requirements', 'Review existing code', 'Implement changes', 'Write tests', 'Code review'],
  infrastructure: ['Assess current state', 'Plan changes', 'Execute deployment', 'Verify functionality', 'Monitor stability'],
  research: ['Define scope', 'Gather data', 'Analyze findings', 'Document insights', 'Present conclusions'],
  documentation: ['Outline structure', 'Draft content', 'Review accuracy', 'Format and polish', 'Publish'],
  testing: ['Create test plan', 'Setup environment', 'Execute tests', 'Document results', 'Report issues'],
  default: ['Analyze requirements', 'Plan approach', 'Execute work', 'Verify results', 'Document completion']
};

const STAGE_ICONS: Record<string, typeof MessageSquare> = {
  DISCUSS: MessageSquare,
  PLAN: FileText,
  EXECUTE: Play,
  VERIFY: CheckCircle2,
  INTEGRATE: GitMerge,
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  COMPLETED: { bg: 'bg-green-500/20', text: 'text-green-400' },
  DONE: { bg: 'bg-green-500/20', text: 'text-green-400' },
  IN_PROGRESS: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  CLAIMED: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  PENDING: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  BLOCKED: { bg: 'bg-red-500/20', text: 'text-red-400' },
  FAILED: { bg: 'bg-red-500/20', text: 'text-red-400' },
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

function getActivityIcon(activityType: string) {
  switch (activityType) {
    case 'task_stage_change':
      return <ArrowRight className="w-3.5 h-3.5 text-blue-400" />;
    case 'checklist_update':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
    case 'task_assigned':
    case 'task_handoff':
      return <User className="w-3.5 h-3.5 text-purple-400" />;
    case 'task_blocked':
      return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
    default:
      return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

export function TaskDetailSheet({ 
  task, 
  isOpen, 
  onOpenChange, 
  agentName,
  onTaskUpdate 
}: TaskDetailSheetProps) {
  const [fullTask, setFullTask] = useState<Task | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [completedItems, setCompletedItems] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const isMobile = useIsMobile();

  // Fetch full task details and activity log when sheet opens
  useEffect(() => {
    if (!isOpen || !task) {
      setFullTask(null);
      setActivityLog([]);
      return;
    }

    async function fetchDetails() {
      setIsLoading(true);
      
      try {
        // Fetch full task details including description
        const { data: taskData, error: taskError } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', task.id)
          .single();
        
        if (taskError) throw taskError;
        
        setFullTask(taskData as Task);
        
        // Set completed items from task data
        const savedCompleted = (taskData as Task).completed_checklist_items || [];
        setCompletedItems(Array.isArray(savedCompleted) ? savedCompleted : []);
        
        // Get checklist - prefer task's metadata checklist over category defaults
        const taskMetadata = (taskData as Record<string, unknown>).metadata as Record<string, unknown> | null;
        const taskChecklist = taskMetadata?.checklist as string[] | undefined;
        const category = (taskData as Task).category?.toLowerCase() || 'default';
        const templateChecklist = Array.isArray(taskChecklist) && taskChecklist.length > 0
          ? taskChecklist
          : (DEFAULT_CHECKLIST[category] || DEFAULT_CHECKLIST.default);
        setChecklist(templateChecklist);
        
        // Fetch activity log for this task
        const { data: activityData, error: activityError } = await supabase
          .from('eliza_activity_log')
          .select('id, activity_type, title, description, status, created_at, agent_id, metadata')
          .eq('task_id', task.id)
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (activityError) {
          console.error('[TaskDetailSheet] Activity log error:', activityError);
        } else {
          setActivityLog((activityData || []) as ActivityLogEntry[]);
        }
        
      } catch (err) {
        console.error('[TaskDetailSheet] Error fetching details:', err);
        toast({
          title: 'Error loading task details',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive'
        });
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchDetails();
  }, [isOpen, task?.id]);

  // Handle checklist item toggle
  const handleChecklistToggle = async (item: string) => {
    if (!fullTask || isUpdating) return;
    
    setIsUpdating(true);
    
    const isCurrentlyCompleted = completedItems.includes(item);
    const newCompletedItems = isCurrentlyCompleted
      ? completedItems.filter(i => i !== item)
      : [...completedItems, item];
    
    // Calculate new progress
    const newProgress = Math.round((newCompletedItems.length / checklist.length) * 100);
    
    try {
      // Update task in database
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ 
          completed_checklist_items: newCompletedItems,
          progress_percentage: newProgress,
          updated_at: new Date().toISOString()
        })
        .eq('id', fullTask.id);
      
      if (updateError) throw updateError;
      
      // Log activity
      await supabase.from('eliza_activity_log').insert({
        activity_type: 'checklist_update',
        title: isCurrentlyCompleted 
          ? `Unchecked: ${item}`
          : `Completed: ${item}`,
        description: `Checklist progress: ${newProgress}% (${newCompletedItems.length}/${checklist.length})`,
        status: 'completed',
        task_id: fullTask.id,
        agent_id: fullTask.assignee_agent_id || null,
        metadata: {
          item,
          action: isCurrentlyCompleted ? 'unchecked' : 'checked',
          progress: newProgress
        }
      });
      
      // Update local state
      setCompletedItems(newCompletedItems);
      setFullTask(prev => prev ? { 
        ...prev, 
        completed_checklist_items: newCompletedItems,
        progress_percentage: newProgress 
      } : null);
      
      // Notify parent
      if (onTaskUpdate && fullTask) {
        onTaskUpdate({
          ...fullTask,
          completed_checklist_items: newCompletedItems,
          progress_percentage: newProgress
        });
      }
      
      // Refresh activity log
      const { data: activityData } = await supabase
        .from('eliza_activity_log')
        .select('id, activity_type, title, description, status, created_at, agent_id, metadata')
        .eq('task_id', fullTask.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (activityData) {
        setActivityLog(activityData as ActivityLogEntry[]);
      }
      
    } catch (err) {
      console.error('[TaskDetailSheet] Error updating checklist:', err);
      toast({
        title: 'Failed to update checklist',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (!task) return null;

  const displayTask = fullTask || task;
  const statusStyle = STATUS_STYLES[displayTask.status] || STATUS_STYLES.PENDING;
  const StageIcon = STAGE_ICONS[displayTask.stage] || Circle;
  const timeProgress = displayTask.progress_percentage || 0;
  const workProgress = checklist.length > 0 ? Math.round((completedItems.length / checklist.length) * 100) : 0;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent 
        side={isMobile ? "bottom" : "right"}
        className={`
          ${isMobile 
            ? 'h-[90vh] rounded-t-2xl pb-safe-area-inset-bottom' 
            : 'w-full sm:max-w-md'
          }
          overflow-hidden flex flex-col
        `}
      >
        {/* Mobile drag handle */}
        {isMobile && (
          <div className="flex justify-center pt-2 pb-3">
            <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
          </div>
        )}
        
        <SheetHeader className={`pb-4 border-b border-border ${isMobile ? 'px-1' : ''}`}>
          <SheetTitle className="text-lg leading-tight pr-6">
            {displayTask.title}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge className={`${statusStyle.bg} ${statusStyle.text} border-0`}>
                {displayTask.status.replace('_', ' ')}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <StageIcon className="w-3 h-3" />
                {displayTask.stage}
              </Badge>
              {displayTask.priority >= 8 && (
                <Badge variant="destructive">P{displayTask.priority}</Badge>
              )}
              {displayTask.category && (
                <Badge variant="secondary">{displayTask.category}</Badge>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className={`flex-1 ${isMobile ? '-mx-4 px-4' : '-mx-6 px-6'}`}>
          <div className="space-y-5 py-4">
            {/* Agent & Time Info */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-4 h-4" />
                <span>{agentName || 'Unassigned'}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>{getRelativeTime(displayTask.updated_at)}</span>
              </div>
            </div>

            {/* Dual Progress Indicators */}
            <div className="space-y-3">
              {/* Time Progress */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Time in Stage
                  </span>
                  <span className="font-medium text-amber-400">{timeProgress}%</span>
                </div>
                <Progress value={timeProgress} className="h-2.5 [&>div]:bg-amber-500" />
              </div>
              
              {/* Work Progress */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Work Complete
                  </span>
                  <span className="font-medium text-green-400">{workProgress}%</span>
                </div>
                <Progress value={workProgress} className="h-2.5 [&>div]:bg-green-500" />
              </div>
            </div>

            {/* Blocking Reason */}
            {displayTask.blocking_reason && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Blocked</p>
                    <p className="text-xs text-red-400/80 mt-1">{displayTask.blocking_reason}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Checklist Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Checklist</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {completedItems.length}/{checklist.length} done
                </span>
              </div>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {checklist.map((item, idx) => {
                    const isCompleted = completedItems.includes(item);
                    return (
                      <div 
                        key={idx}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors touch-manipulation ${
                          isCompleted 
                            ? 'bg-green-500/10 border-green-500/30' 
                            : 'bg-muted/30 border-border hover:border-primary/50 active:border-primary'
                        }`}
                        onClick={() => handleChecklistToggle(item)}
                      >
                        <Checkbox
                          id={`checklist-${idx}`}
                          checked={isCompleted}
                          onCheckedChange={() => handleChecklistToggle(item)}
                          disabled={isUpdating}
                          className="data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500 h-5 w-5"
                        />
                        <label 
                          htmlFor={`checklist-${idx}`}
                          className={`text-sm flex-1 cursor-pointer select-none ${
                            isCompleted ? 'line-through text-muted-foreground' : ''
                          }`}
                        >
                          {item}
                        </label>
                        {isCompleted && (
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Work History Timeline - Collapsible */}
            <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Work History</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isHistoryOpen ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              
              <CollapsibleContent className="pt-2">
                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : activityLog.length === 0 ? (
                  <div className="text-center py-4 text-xs text-muted-foreground">
                    No activity recorded yet
                  </div>
                ) : (
                  <div className="relative space-y-0">
                    {/* Timeline line */}
                    <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border" />
                    
                    {activityLog.slice(0, isMobile ? 5 : 10).map((activity) => (
                      <div key={activity.id} className="relative flex gap-3 pb-4">
                        {/* Timeline dot */}
                        <div className="relative z-10 flex items-center justify-center w-6 h-6 rounded-full bg-background border border-border flex-shrink-0">
                          {getActivityIcon(activity.activity_type)}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-xs font-medium text-foreground line-clamp-2">
                            {activity.title}
                          </p>
                          {activity.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                              {activity.description}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground/60 mt-1">
                            {getRelativeTime(activity.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                    
                    {activityLog.length > (isMobile ? 5 : 10) && (
                      <div className="text-center pt-2">
                        <span className="text-xs text-muted-foreground">
                          +{activityLog.length - (isMobile ? 5 : 10)} more entries
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Description Section - Collapsible */}
            {displayTask.description && (
              <Collapsible open={isDescriptionOpen} onOpenChange={setIsDescriptionOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Description</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isDescriptionOpen ? 'rotate-180' : ''}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="p-3 rounded-xl bg-muted/30 border border-border">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {displayTask.description}
                    </p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </ScrollArea>
        
        {/* Mobile bottom action bar */}
        {isMobile && (
          <div className="border-t border-border pt-4 pb-2 mt-auto">
            <Button 
              variant="outline" 
              className="w-full h-12 text-sm gap-2"
              onClick={() => onOpenChange(false)}
            >
              <ArrowUpRight className="w-4 h-4" />
              Close Task Details
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default TaskDetailSheet;
