import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
    Users,
    Briefcase,
    Cpu,
    Shield,
    Zap,
    MessageSquare,
    BarChart,
    Code,
    Globe,
    Video,
    PenTool,
    GraduationCap
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

interface HierarchyNode {
    title: string;
    color: string;
    icon: any;
    agents: Agent[];
    children?: HierarchyNode[];
}

export const AgentHierarchy = () => {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAgents = async () => {
            // Fetch ALL agents, no limit
            const { data } = await supabase
                .from('agents')
                .select('*')
                .order('name');

            if (data) setAgents(data);
            setLoading(false);
        };

        fetchAgents();

        // Real-time updates
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
            match: (a: Agent) => ['chief', 'head of', 'director', 'vp'].some(r => a.role.toLowerCase().includes(r)),
            color: "border-purple-500/50 bg-purple-500/10",
            text: "text-purple-400",
            icon: Shield
        },
        STRATEGIC: {
            title: "Strategic Departments",
            match: (a: Agent) => a.role.toLowerCase().includes('manager') || a.role.toLowerCase().includes('lead'),
            color: "border-blue-500/50 bg-blue-500/10",
            text: "text-blue-400",
            icon: Briefcase
        },
        OPERATIONS: {
            title: "Operations & Specialists",
            match: (a: Agent) => !['chief', 'head of', 'director', 'vp', 'manager', 'lead'].some(r => a.role.toLowerCase().includes(r)),
            color: "border-emerald-500/50 bg-emerald-500/10",
            text: "text-emerald-400",
            icon: Cpu
        }
    };

    const getStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'idle': return 'bg-emerald-500 shadow-emerald-500/50';
            case 'busy': return 'bg-primary shadow-primary/50';
            case 'offline': return 'bg-muted-foreground/30';
            default: return 'bg-muted-foreground/50';
        }
    };

    const getAgentInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    // Group agents dynamically
    const executives = agents.filter(GROUPS.EXECUTIVE.match);
    const strategic = agents.filter(a => !GROUPS.EXECUTIVE.match(a) && GROUPS.STRATEGIC.match(a));
    const operations = agents.filter(a => !GROUPS.EXECUTIVE.match(a) && !GROUPS.STRATEGIC.match(a));

    return (
        <div className="w-full h-full border rounded-xl bg-card">
            <div className="p-4 border-b flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Agent Neural Network
                </h3>
                <Badge variant="outline" className="gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    {agents.length} Active Nodes
                </Badge>
            </div>

            <ScrollArea className="h-[400px] p-4">
                <div className="space-y-6">

                    {/* Level 1: Executive Council */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            <Shield className="w-3 h-3" /> Executive Layer
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {executives.map(agent => (
                                <AgentNode key={agent.id} agent={agent} styles={GROUPS.EXECUTIVE} />
                            ))}
                        </div>
                    </section>

                    {/* Level 2: Strategic */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            <Briefcase className="w-3 h-3" /> Management Layer
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {strategic.map(agent => (
                                <AgentNode key={agent.id} agent={agent} styles={GROUPS.STRATEGIC} />
                            ))}
                        </div>
                    </section>

                    {/* Level 3: Operations */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            <Cpu className="w-3 h-3" /> Operational Layer
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            {operations.map(agent => (
                                <AgentNode key={agent.id} agent={agent} styles={GROUPS.OPERATIONS} compact />
                            ))}
                        </div>
                    </section>

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
            "border rounded-lg p-3",
            styles.color
        )}>

            {/* Background Pulse for Busy Agents */}
            {agent.status?.toLowerCase() === 'busy' && (
                <div className="absolute inset-0 bg-primary/5 animate-pulse" />
            )}

            <div className="relative flex items-center gap-3">
                <div className={cn(
                    "relative flex items-center justify-center rounded-lg font-bold text-white shadow-sm transition-all",
                    compact ? "w-8 h-8 text-[10px]" : "w-10 h-10 text-xs",
                    getStatusColor(agent.status),
                    agent.status?.toLowerCase() === 'busy' && "animate-pulse"
                )}>
                    {agent.name.slice(0, 2).toUpperCase()}

                    <div className={cn(
                        "absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background",
                        compact ? "w-2.5 h-2.5" : "w-3 h-3",
                        getStatusColor(agent.status)
                    )} />
                </div>

                <div className="min-w-0 flex-1">
                    <h4 className={cn("font-semibold truncate", styles.text, compact ? "text-xs" : "text-sm")}>
                        {agent.name}
                    </h4>
                    <p className="text-[10px] text-muted-foreground truncate">
                        {agent.role}
                    </p>
                    {agent.status === 'BUSY' && (
                        <span className="text-[9px] text-primary flex items-center gap-1 mt-0.5">
                            <Zap className="w-2.5 h-2.5" /> Processing Task
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
