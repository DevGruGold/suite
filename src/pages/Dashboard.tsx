import { useEffect, useState } from "react";
import UnifiedChat from "@/components/UnifiedChat";
import PythonShell from "@/components/PythonShell";
import AgentTaskVisualizer from "@/components/AgentTaskVisualizer";
import { DashboardNeuralNetwork } from "@/components/DashboardNeuralNetwork";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Bot } from "lucide-react";
import { HeroSection, Stats } from "@/components/HeroSection";
import { SEOHead } from "@/components/SEOHead";
import { useAudio } from "@/contexts/AudioContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const { playWelcomeOnce } = useAudio();
  const { t } = useLanguage();
  const [stats, setStats] = useState<Stats>({
    totalExecutions: 0,
    activeAgents: 0,
    activeTasks: 0,
    healthScore: 100,
    healthStatus: 'healthy',
    healthIssues: []
  });

  // Play welcome audio once per session when dashboard loads (handles post-login)
  useEffect(() => {
    playWelcomeOnce();
  }, [playWelcomeOnce]);

  // Fetch stats from database directly (lifted from HeroSection)
  useEffect(() => {
    const fetchStats = async () => {
      // Fetch basic counts directly from database
      const [functionLogs, superduperLogs, agents, tasks, latestHealth] = await Promise.all([
        supabase.from('function_usage_logs').select('*', { count: 'estimated', head: true }),
        supabase.from('superduper_execution_log').select('*', { count: 'estimated', head: true }),
        supabase.from('agents').select('*', { count: 'exact', head: true }).in('status', ['IDLE', 'BUSY']),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['PENDING', 'IN_PROGRESS', 'CLAIMED', 'BLOCKED']),
        // Get cached health from latest system_health_check activity log entry
        supabase
          .from('eliza_activity_log')
          .select('metadata')
          .eq('activity_type', 'system_health_check')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      // Extract health score from cached activity log entry
      let healthScore = 100;
      let healthStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
      let healthIssues: string[] = [];

      if (latestHealth.data?.metadata) {
        const metadata = latestHealth.data.metadata as { health_score?: number; status?: string; issues_count?: number };
        healthScore = metadata.health_score ?? 100;
        healthStatus = metadata.status === 'critical' ? 'critical' :
          metadata.status === 'degraded' ? 'degraded' : 'healthy';
        if (metadata.issues_count && metadata.issues_count > 0) {
          healthIssues = [`${metadata.issues_count} issue(s) detected`];
        }
      }

      setStats({
        totalExecutions: (functionLogs.count || 0) + (superduperLogs.count || 0),
        activeAgents: agents.count || 0,
        activeTasks: tasks.count || 0,
        healthScore,
        healthStatus,
        healthIssues
      });
    };

    fetchStats();

    // Subscribe to updates for real-time health changes
    const channel = supabase
      .channel('dashboard-stats')
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

  return (
    <>
      <SEOHead
        title="AI Council of Executives at Your Fingertips | Suite"
        description="120+ functions, 5 AI executives, real-time orchestration. Chat with CSO, CTO, CIO, CAO, COO - get multi-angle analysis on any decision instantly."
        image="/og-image-home.svg"
        url="/"
        keywords="AI executives, AI council, autonomous AI, real-time orchestration, multi-agent system"
        twitterLabel1="🤖 AI Executives"
        twitterData1="4"
        twitterLabel2="⚡ Functions"
        twitterData2="120+"
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-6">

          {/* 1. Hero Section with Marketing Banners (Carousel) - Now at TOP */}
          <HeroSection stats={stats} />

          {/* 2. Chat Interface */}
          <Card className="glass-card overflow-hidden">
            <CardContent className="p-0">
              <UnifiedChat />
            </CardContent>
          </Card>

          {/* 3. Agent & Task Visualizer */}
          <Card className="glass-card overflow-hidden">
            <CardHeader className="border-b border-border/60 py-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" />
                  {t('dashboard.visualizer.title')}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <AgentTaskVisualizer />
            </CardContent>
          </Card>

          {/* 4. Neural Network (Activity Visualization) - Now separate and below Visualizer */}
          <DashboardNeuralNetwork healthScore={stats.healthScore} />

          {/* 5. System Activity Logs */}
          <Card className="glass-card overflow-hidden">
            <CardHeader className="border-b border-border/60 py-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  {t('dashboard.activity.title')}
                </CardTitle>
                <Badge variant="outline" className="text-xs font-normal">
                  {t('dashboard.activity.live')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <PythonShell />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default Index;
