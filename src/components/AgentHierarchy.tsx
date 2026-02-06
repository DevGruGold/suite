import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
    Users,
    Briefcase,
    Cpu,
    Shield,
    Network
} from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { cn } from '@/lib/utils';

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
            match: (a: Agent) => {
                const name = (a.name || '').toLowerCase();
                const role = (a.role || '').toLowerCase();
                return ['chief', 'president', 'executive', 'head of', 'vp'].some(t => name.includes(t)) ||
                    ['director'].some(t => role.includes(t));
            },
            color: "border-purple-500/50 bg-purple-100/50 dark:bg-purple-500/10 shadow-[0_0_15px_-3px_rgba(168,85,247,0.2)]",
            text: "text-purple-700 dark:text-purple-300",
            icon: Shield
        },
        STRATEGIC: {
            title: "Strategic Intelligence",
            match: (a: Agent) => {
                const role = (a.role || '').toLowerCase();
                const name = (a.name || '').toLowerCase();
                if (['chief', 'president', 'executive', 'vp'].some(t => name.includes(t))) return false;
                return ['manager', 'analyst', 'integrator', 'architect'].some(r => role.includes(r)) ||
                    ['gemmy', 'michael', 'aetherion', 'hephaestus', 'hermes'].some(n => name.includes(n));
            },
            color: "border-blue-500/40 bg-blue-100/50 dark:bg-blue-500/10",
            text: "text-blue-700 dark:text-blue-300",
            icon: Network
        },
        OPERATIONS: {
            title: "Operations Field",
            match: (a: Agent) => true,
            color: "border-emerald-500/30 bg-emerald-100/50 dark:bg-emerald-500/5",
            text: "text-emerald-700 dark:text-emerald-300",
            icon: Cpu
        }
    };

    const executives = agents.filter(GROUPS.EXECUTIVE.match);
    const strategic = agents.filter(a => !GROUPS.EXECUTIVE.match(a) && GROUPS.STRATEGIC.match(a));
    const operations = agents.filter(a => !GROUPS.EXECUTIVE.match(a) && !GROUPS.STRATEGIC.match(a));

    return (
    return (
        <div className="w-full h-full flex flex-col border rounded-xl bg-card border-border overflow-hidden relative shadow-sm">
            {/* Header */}
            <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-muted/20 shrink-0 z-10">
                <h3 className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                    <Users className="w-3.5 h-3.5" />
                    Agent Neural Network
                </h3>
                <Badge variant="outline" className="h-5 px-1.5 gap-1 text-[10px] font-normal border-white/10 bg-black/20">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    Active Matrix
                </Badge>
            </div>

            {/* Org Chart Container */}
            <div className="flex-1 flex flex-col items-center justify-start p-4 relative min-h-0 overflow-hidden">

                {/* Level 1: Executive Council */}
                <div className="flex flex-col items-center z-10 shrink-0">
                    <div className="mb-2 text-[10px] uppercase tracking-widest text-purple-500/70 font-bold flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Core Command
                    </div>
                    <div className="flex gap-4 flex-wrap justify-center px-4">
                        {executives.map(agent => (
                            <AgentNode key={agent.id} agent={agent} styles={GROUPS.EXECUTIVE} />
                        ))}
                    </div>
                    {/* Connector Down */}
                    <div className="h-6 w-px bg-gradient-to-b from-purple-500/50 to-blue-500/50 my-1"></div>
                </div>

                {/* Level 2: Strategic */}
                <div className="flex flex-col items-center z-10 shrink-0 w-full">
                    <div className="h-px w-3/4 max-w-[400px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent mb-3" />

                    <div className="flex gap-2 flex-wrap justify-center w-full px-2">
                        {strategic.map(agent => (
                            <AgentNode key={agent.id} agent={agent} styles={GROUPS.STRATEGIC} compact />
                        ))}
                    </div>
                    {/* Connector Down */}
                    <div className="h-6 w-px bg-gradient-to-b from-blue-500/50 to-emerald-500/30 my-2"></div>
                </div>

                {/* Level 3: Operations (Auto Grid) */}
                <div className="flex-1 w-full min-h-0 relative flex flex-col items-center">
                    <div className="h-px w-full max-w-[600px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent mb-3" />

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-1.5 md:gap-2 w-full max-w-5xl content-start justify-center overflow-hidden px-2">
                        {operations.map(agent => (
                            <AgentNode key={agent.id} agent={agent} styles={GROUPS.OPERATIONS} compact mini />
                        ))}
                    </div>
                </div>

                {/* Background Grid Effect */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
            </div>
        </div>
    );
};

const AgentNode = ({ agent, styles, compact = false, mini = false }: { agent: Agent, styles: any, compact?: boolean, mini?: boolean }) => {
    const getStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'idle': return 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]';
            case 'busy': return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]';
            case 'offline': return 'bg-slate-500';
            default: return 'bg-slate-500';
        }
    };

    // Parse name to remove descriptions (anything after " - " or long text)
    const displayName = agent.name.split(' - ')[0];

    return (
        <div className={cn(
            "relative group transition-all duration-300 hover:scale-105 hover:z-20 cursor-default",
            "border backdrop-blur-md",
            styles.color,
            compact ? "rounded-lg" : "rounded-xl",
            mini ? "px-1.5 py-1 max-w-[110px]" : compact ? "px-2.5 py-1.5 max-w-[150px]" : "px-4 py-2.5 min-w-[140px] max-w-[200px]"
        )}>
            {/* Connecting Lines for Tree Effect (Pseudo-visuals only for nodes) */}

            <div className="flex items-center gap-2">
                {/* Active Indicator */}
                <div className={cn(
                    "relative rounded-full shrink-0 animate-pulse-slow",
                    mini ? "w-1.5 h-1.5" : compact ? "w-2 h-2" : "w-2.5 h-2.5",
                    getStatusColor(agent.status)
                )} />

                <div className="flex flex-col min-w-0">
                    <h4 className={cn(
                        "font-bold truncate tracking-tight text-foreground",
                        mini ? "text-[10px]" : compact ? "text-[11px]" : "text-xs mb-0.5"
                    )} title={agent.name}>
                        {displayName}
                    </h4>
                    {!mini && (
                        <p className={cn(
                            "truncate font-mono opacity-60",
                            styles.text,
                            compact ? "text-[9px]" : "text-[10px]"
                        )}>
                            {agent.role}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

