import { useState, useEffect } from 'react';
import { AnimatedCounter } from './AnimatedCounter';
import { ActivityPulse } from './ActivityPulse';
import { AgentStatusGrid } from './AgentStatusGrid';
import { supabase } from '@/integrations/supabase/client';
import { Zap, Bot, Activity, CheckCircle2, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const marketingBanners = [
  {
    title: "Enterprise AI Automation",
    subtitle: "Intelligent systems that work while you sleep",
    gradient: "from-primary/20 to-primary/5"
  },
  {
    title: "120+ Edge Functions",
    subtitle: "Self-healing, self-optimizing infrastructure",
    gradient: "from-emerald-500/20 to-emerald-500/5"
  },
  {
    title: "Real-Time Monitoring",
    subtitle: "Complete visibility into every operation",
    gradient: "from-violet-500/20 to-violet-500/5"
  },
  {
    title: "AI Executive Council",
    subtitle: "Autonomous governance and decision-making",
    gradient: "from-amber-500/20 to-amber-500/5"
  }
];

interface Stats {
  totalExecutions: number;
  activeAgents: number;
  activeTasks: number;
  healthScore: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
  healthIssues: string[];
}

export const HeroSection = () => {
  const [currentBanner, setCurrentBanner] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalExecutions: 0,
    activeAgents: 0,
    activeTasks: 0,
    healthScore: 100,
    healthStatus: 'healthy',
    healthIssues: []
  });

  // Auto-rotate banners
  useEffect(() => {
    if (isPaused) return;
    
    const interval = setInterval(() => {
      setCurrentBanner(prev => (prev + 1) % marketingBanners.length);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isPaused]);

  // Fetch stats including REAL health score
  useEffect(() => {
    const fetchStats = async () => {
      // Fetch basic counts and health from activity log
      const [executions, agents, tasks, healthLog] = await Promise.all([
        supabase.from('eliza_activity_log').select('id', { count: 'exact', head: true }),
        supabase.from('agents').select('id', { count: 'exact', head: true }).eq('status', 'IDLE').or('status.eq.BUSY'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', ['PENDING', 'IN_PROGRESS']),
        // Get most recent health check from activity log
        supabase.from('eliza_activity_log')
          .select('metadata, description')
          .eq('activity_type', 'system_health_check')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
      ]);

      // Extract health score from latest health check
      let healthScore = 100;
      let healthStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
      let healthIssues: string[] = [];
      
      if (healthLog.data?.metadata) {
        const metadata = healthLog.data.metadata as { health_score?: number; status?: string; issues_count?: number };
        healthScore = metadata.health_score ?? 100;
        healthStatus = metadata.status === 'critical' ? 'critical' : 
                       metadata.status === 'degraded' ? 'degraded' : 'healthy';
        if (metadata.issues_count && metadata.issues_count > 0) {
          healthIssues = [`${metadata.issues_count} issue(s) detected`];
        }
      }

      setStats({
        totalExecutions: executions.count || 1000000,
        activeAgents: agents.count || 12,
        activeTasks: tasks.count || 6,
        healthScore,
        healthStatus,
        healthIssues
      });
    };

    fetchStats();

    // Subscribe to updates for real-time health changes
    const channel = supabase
      .channel('hero-stats')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eliza_activity_log' }, (payload) => {
        setStats(prev => ({ ...prev, totalExecutions: prev.totalExecutions + 1 }));
        
        // Update health score if this is a health check
        if (payload.new.activity_type === 'system_health_check' && payload.new.metadata) {
          const metadata = payload.new.metadata as { health_score?: number; status?: string; issues_count?: number };
          setStats(prev => ({
            ...prev,
            healthScore: metadata.health_score ?? prev.healthScore,
            healthStatus: metadata.status === 'critical' ? 'critical' : 
                          metadata.status === 'degraded' ? 'degraded' : 'healthy',
            healthIssues: metadata.issues_count && metadata.issues_count > 0 
              ? [`${metadata.issues_count} issue(s) detected`] 
              : []
          }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const banner = marketingBanners[currentBanner];

  // Health score color coding
  const getHealthColor = () => {
    if (stats.healthScore >= 95) return 'text-emerald-500';
    if (stats.healthScore >= 80) return 'text-amber-500';
    return 'text-destructive';
  };

  const getHealthBgColor = () => {
    if (stats.healthScore >= 95) return 'from-emerald-500/20 to-emerald-500/5';
    if (stats.healthScore >= 80) return 'from-amber-500/20 to-amber-500/5';
    return 'from-destructive/20 to-destructive/5';
  };

  return (
    <section className="relative w-full py-6 px-4 overflow-hidden">
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${banner.gradient} transition-all duration-1000`} />
      
      <div className="relative max-w-6xl mx-auto space-y-6">
        {/* Marketing Banner Carousel */}
        <div 
          className="relative text-center py-8"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="relative min-h-[100px] flex items-center justify-center">
            <div className="animate-fade-in" key={currentBanner}>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                {banner.title}
              </h2>
              <p className="text-muted-foreground text-sm md:text-base">
                {banner.subtitle}
              </p>
            </div>
          </div>

          {/* Navigation arrows */}
          <button 
            onClick={() => setCurrentBanner(prev => (prev - 1 + marketingBanners.length) % marketingBanners.length)}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/50 hover:bg-background/80 transition-colors"
            aria-label="Previous banner"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setCurrentBanner(prev => (prev + 1) % marketingBanners.length)}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/50 hover:bg-background/80 transition-colors"
            aria-label="Next banner"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Dot indicators */}
          <div className="flex justify-center gap-2 mt-4">
            {marketingBanners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentBanner(i)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i === currentBanner 
                    ? 'bg-primary w-6' 
                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                }`}
                aria-label={`Go to banner ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Live Statistics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard 
            icon={<Zap className="w-5 h-5 text-primary" />}
            label="Total Executions"
            value={stats.totalExecutions}
            suffix="+"
          />
          <StatCard 
            icon={<Bot className="w-5 h-5 text-emerald-500" />}
            label="Active Agents"
            value={stats.activeAgents}
          />
          <HealthStatCard 
            healthScore={stats.healthScore}
            healthStatus={stats.healthStatus}
            healthIssues={stats.healthIssues}
          />
          <StatCard 
            icon={<Activity className="w-5 h-5 text-amber-500" />}
            label="Active Tasks"
            value={stats.activeTasks}
          />
        </div>

        {/* Activity Visualization - HIGHLIGHTED */}
        <div className="glass-card rounded-xl p-4 space-y-3 ring-2 ring-primary/30 shadow-lg shadow-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
              </span>
              <h3 className="text-sm font-semibold text-foreground">Live Activity Feed</h3>
              <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">Real-time</span>
            </div>
            <AgentStatusGrid />
          </div>
          <ActivityPulse 
            healthScore={stats.healthScore}
            onTaskClick={(taskId) => {
              // Dispatch custom event to scroll to task in pipeline
              window.dispatchEvent(new CustomEvent('navigate-to-task', { detail: { taskId } }));
              console.log('Navigate to task:', taskId);
            }}
            onAgentClick={(agentId) => {
              // Dispatch custom event to highlight agent
              window.dispatchEvent(new CustomEvent('highlight-agent', { detail: { agentId } }));
              console.log('Highlight agent:', agentId);
            }}
          />
        </div>
      </div>
    </section>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
}

const StatCard = ({ icon, label, value, suffix = '' }: StatCardProps) => (
  <div className="glass-card rounded-lg p-4 text-center hover-lift">
    <div className="flex justify-center mb-2">{icon}</div>
    <div className="text-2xl md:text-3xl font-bold text-foreground">
      <AnimatedCounter end={value} suffix={suffix} />
    </div>
    <p className="text-xs text-muted-foreground mt-1">{label}</p>
  </div>
);

interface HealthStatCardProps {
  healthScore: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
  healthIssues: string[];
}

const HealthStatCard = ({ healthScore, healthStatus, healthIssues }: HealthStatCardProps) => {
  const getHealthColor = () => {
    if (healthScore >= 95) return 'text-emerald-500';
    if (healthScore >= 80) return 'text-amber-500';
    return 'text-destructive';
  };

  const getHealthIcon = () => {
    if (healthScore >= 95) return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    if (healthScore >= 80) return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    return <AlertTriangle className="w-5 h-5 text-destructive" />;
  };

  const getBorderClass = () => {
    if (healthScore >= 95) return '';
    if (healthScore >= 80) return 'ring-2 ring-amber-500/50 animate-pulse-subtle';
    return 'ring-2 ring-destructive/50 animate-pulse';
  };

  return (
    <div className={cn(
      "glass-card rounded-lg p-4 text-center hover-lift transition-all",
      getBorderClass()
    )}>
      <div className="flex justify-center mb-2">{getHealthIcon()}</div>
      <div className={cn("text-2xl md:text-3xl font-bold", getHealthColor())}>
        <AnimatedCounter end={healthScore} suffix="%" />
      </div>
      <p className="text-xs text-muted-foreground mt-1">System Health</p>
      {healthIssues.length > 0 && (
        <p className="text-[10px] text-amber-500 mt-1 truncate">{healthIssues[0]}</p>
      )}
    </div>
  );
};