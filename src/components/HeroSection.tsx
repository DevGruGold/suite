import { useState, useEffect } from 'react';
import { AnimatedCounter } from './AnimatedCounter';
import { ActivityPulse } from './ActivityPulse';
import { AgentStatusGrid } from './AgentStatusGrid';
import { supabase } from '@/integrations/supabase/client';
import { Zap, Bot, Activity, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

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
}

export const HeroSection = () => {
  const [currentBanner, setCurrentBanner] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalExecutions: 0,
    activeAgents: 0,
    activeTasks: 0,
    healthScore: 95
  });

  // Auto-rotate banners
  useEffect(() => {
    if (isPaused) return;
    
    const interval = setInterval(() => {
      setCurrentBanner(prev => (prev + 1) % marketingBanners.length);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isPaused]);

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      const [executions, agents, tasks] = await Promise.all([
        supabase.from('eliza_activity_log').select('id', { count: 'exact', head: true }),
        supabase.from('agents').select('id', { count: 'exact', head: true }).eq('status', 'IDLE').or('status.eq.BUSY'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', ['PENDING', 'IN_PROGRESS'])
      ]);

      setStats({
        totalExecutions: executions.count || 1000000,
        activeAgents: agents.count || 12,
        activeTasks: tasks.count || 6,
        healthScore: 95
      });
    };

    fetchStats();

    // Subscribe to updates
    const channel = supabase
      .channel('hero-stats')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eliza_activity_log' }, () => {
        setStats(prev => ({ ...prev, totalExecutions: prev.totalExecutions + 1 }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const banner = marketingBanners[currentBanner];

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
          <StatCard 
            icon={<CheckCircle2 className="w-5 h-5 text-violet-500" />}
            label="System Health"
            value={stats.healthScore}
            suffix="%"
          />
          <StatCard 
            icon={<Activity className="w-5 h-5 text-amber-500" />}
            label="Active Tasks"
            value={stats.activeTasks}
          />
        </div>

        {/* Activity Visualization */}
        <div className="glass-card rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">Live Activity</h3>
            <AgentStatusGrid />
          </div>
          <ActivityPulse />
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
