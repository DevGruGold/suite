import { useState, useEffect } from 'react';
import { AnimatedCounter } from './AnimatedCounter';
import { ActivityPulse } from './ActivityPulse';
import { AgentHierarchy } from '@/components/AgentHierarchy';
import { SystemStatusMonitor } from '@/components/SystemStatusMonitor';
import { supabase } from '@/integrations/supabase/client';
import { Zap, Bot, Activity, CheckCircle2, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';




export interface Stats {
  totalExecutions: number;
  activeAgents: number;
  activeTasks: number;
  healthScore: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
  healthIssues: string[];
}

interface HeroSectionProps {
  stats: Stats;
}

export const HeroSection = ({ stats }: HeroSectionProps) => {
  const { t } = useLanguage();
  const [currentBanner, setCurrentBanner] = useState(0);

  const marketingBanners = [
    {
      title: t('hero.banner.enterprise.title'),
      subtitle: t('hero.banner.enterprise.subtitle'),
      gradient: "from-primary/20 to-primary/5"
    },
    {
      title: t('hero.banner.functions.title'),
      subtitle: t('hero.banner.functions.subtitle'),
      gradient: "from-emerald-500/20 to-emerald-500/5"
    },
    {
      title: t('hero.banner.monitoring.title'),
      subtitle: t('hero.banner.monitoring.subtitle'),
      gradient: "from-violet-500/20 to-violet-500/5"
    },
    {
      title: t('hero.banner.council.title'),
      subtitle: t('hero.banner.council.subtitle'),
      gradient: "from-amber-500/20 to-amber-500/5"
    }
  ];
  const [isPaused, setIsPaused] = useState(false);

  // Auto-rotate banners
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setCurrentBanner(prev => (prev + 1) % marketingBanners.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isPaused]);

  const banner = marketingBanners[currentBanner];

  return (
    <section className="relative w-full py-4 px-4 overflow-hidden">
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${banner.gradient} transition-all duration-1000`} />

      <div className="relative max-w-6xl mx-auto space-y-4">
        {/* Compact Marketing Banner */}
        <div
          className="relative flex items-center justify-center gap-4 py-2"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Left arrow */}
          <button
            onClick={() => setCurrentBanner(prev => (prev - 1 + marketingBanners.length) % marketingBanners.length)}
            className="p-1.5 rounded-full bg-background/50 hover:bg-background/80 transition-colors shrink-0"
            aria-label="Previous banner"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Banner content - single line */}
          <div className="flex-1 text-center min-w-0" key={currentBanner}>
            <p className="text-sm md:text-base font-medium text-foreground truncate">
              <span className="font-semibold">{banner.title}</span>
              <span className="text-muted-foreground mx-2">—</span>
              <span className="text-muted-foreground">{banner.subtitle}</span>
            </p>
          </div>

          {/* Right arrow */}
          <button
            onClick={() => setCurrentBanner(prev => (prev + 1) % marketingBanners.length)}
            className="p-1.5 rounded-full bg-background/50 hover:bg-background/80 transition-colors shrink-0"
            aria-label="Next banner"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Dot indicators - inline */}
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            {marketingBanners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentBanner(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === currentBanner
                  ? 'bg-primary w-4'
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
            label={t('hero.stats.executions')}
            value={stats.totalExecutions}
            suffix="+"
          />
          <StatCard
            icon={<Bot className="w-5 h-5 text-emerald-500" />}
            label={t('hero.stats.agents')}
            value={stats.activeAgents}
          />
          <HealthStatCard
            healthScore={stats.healthScore}
            healthStatus={stats.healthStatus}
            healthIssues={stats.healthIssues}
            label={t('hero.stats.health')}
          />
          <StatCard
            icon={<Activity className="w-5 h-5 text-amber-500" />}
            label={t('hero.stats.tasks')}
            value={stats.activeTasks}
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
  label: string;
}

const HealthStatCard = ({ healthScore, healthStatus, healthIssues, label }: HealthStatCardProps) => {
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
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      {healthIssues.length > 0 && (
        <p className="text-[10px] text-amber-500 mt-1 truncate">{healthIssues[0]}</p>
      )}
    </div>
  );
};