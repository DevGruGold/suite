import { useState, useEffect } from 'react';
import { AnimatedCounter } from './AnimatedCounter';
import { ActivityPulse } from './ActivityPulse';
import { supabase } from '@/integrations/supabase/client';
import {
  Zap,
  Bot,
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Workflow,
  BrainCircuit,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

export interface Stats {
  totalExecutions: number;
  activeAgents: number;
  activeTasks: number;
  healthScore: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
  healthIssues: string[];
  knowledgeEntities: number;
  registeredEdgeFunctions: number;
}

interface HeroSectionProps {
  stats: Stats;
}

export const HeroSection = ({ stats }: HeroSectionProps) => {
  const { t } = useLanguage();
  const [currentBanner, setCurrentBanner] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [recentActivityCount, setRecentActivityCount] = useState(0);

  const marketingBanners = [
    {
      title: t('hero.banner.enterprise.title'),
      subtitle: t('hero.banner.enterprise.subtitle'),
      gradient: 'from-primary/20 to-primary/5',
    },
    {
      title: t('hero.banner.functions.title'),
      subtitle: t('hero.banner.functions.subtitle'),
      gradient: 'from-emerald-500/20 to-emerald-500/5',
    },
    {
      title: t('hero.banner.monitoring.title'),
      subtitle: t('hero.banner.monitoring.subtitle'),
      gradient: 'from-violet-500/20 to-violet-500/5',
    },
    {
      title: t('hero.banner.council.title'),
      subtitle: t('hero.banner.council.subtitle'),
      gradient: 'from-amber-500/20 to-amber-500/5',
    },
  ];

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % marketingBanners.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isPaused, marketingBanners.length]);

  useEffect(() => {
    const fetchActivityCount = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('eliza_activity_log')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since);

      setRecentActivityCount(count || 0);
    };

    fetchActivityCount();

    const channel = supabase
      .channel('hero-activity-count')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'eliza_activity_log' },
        () => {
          setRecentActivityCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const banner = marketingBanners[currentBanner];
  const registeredEdgeFunctions = stats.registeredEdgeFunctions;

  return (
    <section className="relative w-full overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-sm">
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-br transition-all duration-1000',
          banner.gradient
        )}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.12),transparent_35%),linear-gradient(hsl(var(--background)/0.45),hsl(var(--background)/0.7))]" />

      <div className="relative p-4 md:p-5 space-y-4">
        <div
          className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/55 px-3 py-2 backdrop-blur"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <button
            onClick={() =>
              setCurrentBanner(
                (prev) =>
                  (prev - 1 + marketingBanners.length) % marketingBanners.length
              )
            }
            className="rounded-full bg-background/70 p-1.5 transition-colors hover:bg-background"
            aria-label="Previous banner"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p
              className="truncate text-sm md:text-base font-medium text-foreground"
              key={currentBanner}
            >
              <span className="font-semibold">{banner.title}</span>
              <span className="mx-2 text-muted-foreground">—</span>
              <span className="text-muted-foreground">{banner.subtitle}</span>
            </p>
          </div>

          <div className="hidden items-center gap-1 sm:flex">
            {marketingBanners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentBanner(i)}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-all duration-300',
                  i === currentBanner
                    ? 'w-4 bg-primary'
                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                )}
                aria-label={`Go to banner ${i + 1}`}
              />
            ))}
          </div>

          <button
            onClick={() =>
              setCurrentBanner((prev) => (prev + 1) % marketingBanners.length)
            }
            className="rounded-full bg-background/70 p-1.5 transition-colors hover:bg-background"
            aria-label="Next banner"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard
              icon={<Zap className="h-4 w-4 text-primary" />}
              label={t('hero.stats.executions')}
              value={stats.totalExecutions}
              suffix="+"
            />
            <StatCard
              icon={<Bot className="h-4 w-4 text-emerald-500" />}
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
              icon={<Activity className="h-4 w-4 text-amber-500" />}
              label={t('hero.stats.tasks')}
              value={stats.activeTasks}
            />
            <StatCard
              icon={<Workflow className="h-4 w-4 text-sky-500" />}
              label="Edge functions (system)"
              value={registeredEdgeFunctions}
            />
            <StatCard
              icon={<BrainCircuit className="h-4 w-4 text-violet-500" />}
              label="Knowledge entities"
              value={stats.knowledgeEntities}
            />
          </div>

          <div className="glass-card flex min-h-[260px] flex-col rounded-2xl border border-primary/15 bg-background/65 p-3 shadow-lg shadow-primary/5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                  </span>
                  Eliza activity
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Live operations, health checks, and agent events without
                  pushing chat below the fold.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2 text-[10px]">
                <MetricPill
                  icon={<Radio className="h-3 w-3" />}
                  label="Live 24h"
                  value={recentActivityCount}
                />
                <MetricPill
                  icon={<Workflow className="h-3 w-3" />}
                  label="System count"
                  value={registeredEdgeFunctions}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/50 bg-background/40 p-1">
              <ActivityPulse
                healthScore={stats.healthScore}
                compact
                maxItems={5}
              />
            </div>
          </div>
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
  <div className="glass-card rounded-2xl border border-border/50 bg-background/60 p-3 text-center backdrop-blur-sm transition-transform hover:-translate-y-0.5">
    <div className="mb-2 flex justify-center">{icon}</div>
    <div className="text-xl font-bold text-foreground md:text-2xl">
      <AnimatedCounter end={value} suffix={suffix} />
    </div>
    <p className="mt-1 text-[11px] text-muted-foreground md:text-xs">{label}</p>
  </div>
);

const MetricPill = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) => (
  <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/75 px-2 py-1 text-muted-foreground">
    {icon}
    <span>{label}</span>
    <span className="font-semibold text-foreground">{value}</span>
  </div>
);

interface HealthStatCardProps {
  healthScore: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
  healthIssues: string[];
  label: string;
}

const HealthStatCard = ({
  healthScore,
  healthIssues,
  label,
}: HealthStatCardProps) => {
  const getHealthColor = () => {
    if (healthScore >= 95) return 'text-emerald-500';
    if (healthScore >= 80) return 'text-amber-500';
    return 'text-destructive';
  };

  const getHealthIcon = () => {
    if (healthScore >= 95)
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (healthScore >= 80)
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    return <AlertTriangle className="h-4 w-4 text-destructive" />;
  };

  const getBorderClass = () => {
    if (healthScore >= 95) return '';
    if (healthScore >= 80) return 'ring-1 ring-amber-500/40';
    return 'ring-1 ring-destructive/50';
  };

  return (
    <div
      className={cn(
        'glass-card rounded-2xl border border-border/50 bg-background/60 p-3 text-center backdrop-blur-sm transition-transform hover:-translate-y-0.5',
        getBorderClass()
      )}
    >
      <div className="mb-2 flex justify-center">{getHealthIcon()}</div>
      <div className={cn('text-xl font-bold md:text-2xl', getHealthColor())}>
        <AnimatedCounter end={healthScore} suffix="%" />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground md:text-xs">
        {label}
      </p>
      {healthIssues.length > 0 && (
        <p className="mt-1 truncate text-[10px] text-amber-500">
          {healthIssues[0]}
        </p>
      )}
    </div>
  );
};
