import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Agent {
  id: string;
  name: string;
  status: string;
  role: string;
}

export const AgentStatusGrid = () => {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    const fetchAgents = async () => {
      const { data } = await supabase
        .from('agents')
        .select('id, name, status, role')
        .order('name')
        .limit(12);
      
      if (data) setAgents(data);
    };

    fetchAgents();

    const channel = supabase
      .channel('agents-status')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agents'
      }, (payload) => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          setAgents(prev => prev.map(a => 
            a.id === payload.new.id ? { ...a, ...payload.new } : a
          ));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'idle': return 'bg-emerald-500 shadow-emerald-500/50';
      case 'busy': return 'bg-primary shadow-primary/50';
      case 'offline': return 'bg-muted-foreground/30';
      default: return 'bg-muted-foreground/50';
    }
  };

  const getAgentInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-2 justify-end">
        {agents.map((agent) => (
          <Tooltip key={agent.id}>
            <TooltipTrigger asChild>
              <div className="relative group cursor-pointer transition-all hover:scale-110">
                <div className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shadow-sm transition-all",
                  getStatusColor(agent.status),
                  agent.status?.toLowerCase() === 'busy' && "animate-pulse"
                )}>
                  {getAgentInitials(agent.name)}
                </div>
                <div className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background",
                  getStatusColor(agent.status)
                )} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs p-2">
              <div className="space-y-1">
                <p className="font-bold">{agent.name}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{agent.role}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className={cn("w-1.5 h-1.5 rounded-full", getStatusColor(agent.status))} />
                  <span className="text-[10px] font-medium capitalize">{agent.status}</span>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
        {agents.length === 0 && (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-7 h-7 rounded-lg bg-muted animate-pulse" />
          ))
        )}
      </div>
    </TooltipProvider>
  );
};
