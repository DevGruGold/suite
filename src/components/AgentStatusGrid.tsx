import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {agents.map((agent) => (
          <Tooltip key={agent.id}>
            <TooltipTrigger asChild>
              <div 
                className={`w-3 h-3 rounded-full ${getStatusColor(agent.status)} shadow-lg animate-pulse cursor-pointer transition-transform hover:scale-125`}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p className="font-medium">{agent.name}</p>
              <p className="text-muted-foreground capitalize">{agent.status}</p>
            </TooltipContent>
          </Tooltip>
        ))}
        {agents.length === 0 && (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-3 h-3 rounded-full bg-muted animate-pulse" />
          ))
        )}
      </div>
    </TooltipProvider>
  );
};
