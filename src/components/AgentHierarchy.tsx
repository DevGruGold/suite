import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
    Users,
    Briefcase,
    Cpu,
    Shield,
    Zap
} from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Agent {
    id: string;
    name: string;
    status: string;
    role: string;
    current_workload: number;
    category?: string;
}

export const AgentHierarchy = () => {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAgents = async () => {
            const { data } = await supabase
                .from('agents')
                .select('*')
                .order('name');

            if (data) setAgents(data);
            setLoading(false);
        };

        fetchAgents();

        const channel = supabase
            .channel('agents-hierarchy-status')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'agents'
            }, (payload) => {
                if (payload.eventType === 'UPDATE' && payload.new) {
                    setAgents(prev => prev.map(a =>
                        a.id === payload.new.id ? { ...a, ...payload.new } : a
                    ));
                } else if (payload.eventType === 'INSERT' && payload.new) {
                    setAgents(prev => [...prev, payload.new as Agent]);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Hierarchy Definitions
    const GROUPS = {
        EXECUTIVE: {
            title: "Executive Council",
            // Match explicitly by Name title OR specific high-level roles
            match: (a: Agent) => {
                const name = (a.name || '').toLowerCase();
                const role = (a.role || '').toLowerCase();
                return ['chief', 'president', 'executive', 'head of', 'vp'].some(t => name.includes(t)) ||
                    ['director'].some(t => role.includes(t));
            },
            color: "border-purple-500/30 bg-purple-500/5",
            text: "text-purple-400",
            icon: Shield
        },
        STRATEGIC: {
            title: "Strategic & Analysis",
            // Match Managers, Analysts, Integrators, or known high-level agents
            match: (a: Agent) => {
                const role = (a.role || '').toLowerCase();
                const name = (a.name || '').toLowerCase();
                if (['chief', 'president', 'executive', 'vp'].some(t => name.includes(t))) return false; // Exclude Execs
                return ['manager', 'analyst', 'integrator', 'architect'].some(r => role.includes(r)) ||
                    ['gemmy', 'michael', 'aetherion', 'hephaestus', 'hermes'].some(n => name.includes(n));
            },
            color: "border-blue-500/30 bg-blue-500/5",
            text: "text-blue-400",
            icon: Briefcase
        },
        OPERATIONS: {
            title: "Operations Grid",
            match: (a: Agent) => true, // Fallback for everything else
            color: "border-emerald-500/30 bg-emerald-500/5",
            text: "text-emerald-400",
            icon: Cpu
        }
    };

    // Group agents dynamically
    const executives = agents.filter(GROUPS.EXECUTIVE.match);
    const strategic = agents.filter(a => !GROUPS.EXECUTIVE.match(a) && GROUPS.STRATEGIC.match(a));
    const operations = agents.filter(a => !GROUPS.EXECUTIVE.match(a) && !GROUPS.STRATEGIC.match(a));

    return (
        <div className="w-full border rounded-xl bg-card overflow-hidden">
            <div className="px-3 py-2 border-b flex items-center justify-between bg-muted/20">
                <h3 className="text-xs font-semibold flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    Agent Neural Network
                </h3>
                <Badge variant="outline" className="h-5 px-1.5 gap-1 text-[10px] font-normal">
                    <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                    {agents.length} Nodes
                </Badge>
            </div>

            <ScrollArea className="h-[280px]">
                <div className="p-3 space-y-4">

                    {/* Level 1: Executive Council */}
                    {executives.length > 0 && (
                        <div className="space-y-1.5">
                            <div className="text-[10px] font-medium text-purple-400/80 uppercase tracking-wider flex items-center gap-1">
                                <Shield className="w-2.5 h-2.5" /> Executive Cluster
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                {executives.map(agent => (
                                    <AgentNode key={agent.id} agent={agent} styles={GROUPS.EXECUTIVE} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Level 2: Strategic */}
                    {strategic.length > 0 && (
                        <div className="space-y-1.5">
                            <div className="text-[10px] font-medium text-blue-400/80 uppercase tracking-wider flex items-center gap-1">
                                <Briefcase className="w-2.5 h-2.5" /> Intelligence Hub
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                                {strategic.map(agent => (
                                    <AgentNode key={agent.id} agent={agent} styles={GROUPS.STRATEGIC} compact />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Level 3: Operations */}
                    {operations.length > 0 && (
                        <div className="space-y-1.5">
                            <div className="text-[10px] font-medium text-emerald-400/80 uppercase tracking-wider flex items-center gap-1">
                                <Cpu className="w-2.5 h-2.5" /> Operations Matrix
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                                {operations.map(agent => (
                                    <AgentNode key={agent.id} agent={agent} styles={GROUPS.OPERATIONS} compact />
                                ))}
                            </div>
                        </div>
                    )}

                </div>
            </ScrollArea>
        </div>
    );
};

const AgentNode = ({ agent, styles, compact = false }: { agent: Agent, styles: any, compact?: boolean }) => {
    const getStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'idle': return 'bg-emerald-500';
            case 'busy': return 'bg-primary';
            case 'offline': return 'bg-muted-foreground/30';
            default: return 'bg-muted-foreground/50';
        }
    };

    return (
        <div className={cn(
            "relative group overflow-hidden transition-all hover:scale-[1.02] cursor-pointer",
            "border rounded-md",
            compact ? "p-1.5" : "p-2",
            styles.color
        )}>
            {/* Busy Animation */}
            {agent.status?.toLowerCase() === 'busy' && (
                <div className="absolute inset-0 bg-primary/5 animate-pulse" />
            )}

            <div className="flex items-center gap-2">
                {/* Status Dot / Avatar */}
                <div className={cn(
                    "relative flex items-center justify-center rounded font-bold text-white shadow-sm shrink-0",
                    compact ? "w-6 h-6 text-[9px]" : "w-8 h-8 text-[10px]",
                    getStatusColor(agent.status)
                )}>
                    {agent.name.slice(0, 2).toUpperCase()}
                    <div className={cn(
                        "absolute -bottom-0.5 -right-0.5 rounded-full border border-background",
                        compact ? "w-2 h-2" : "w-2.5 h-2.5",
                        getStatusColor(agent.status)
                    )} />
                </div>

                <div className="min-w-0 flex-1">
                    <h4 className={cn("font-medium truncate leading-none", styles.text, compact ? "text-[10px]" : "text-xs")}>
                        {agent.name}
                    </h4>
                    {!compact && (
                        <p className="text-[9px] text-muted-foreground truncate mt-0.5 opacity-80">
                            {agent.role}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
