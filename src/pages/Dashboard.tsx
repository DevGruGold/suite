import { useEffect } from "react";
import UnifiedChat from "@/components/UnifiedChat";
import PythonShell from "@/components/PythonShell";
import AgentTaskVisualizer from "@/components/AgentTaskVisualizer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Bot } from "lucide-react";
import { HeroSection } from "@/components/HeroSection";
import { SEOHead } from "@/components/SEOHead";
import { useAudio } from "@/contexts/AudioContext";
import { useLanguage } from "@/contexts/LanguageContext";

const Index = () => {
  const { playWelcomeOnce } = useAudio();
  const { t } = useLanguage();

  // Play welcome audio once per session when dashboard loads (handles post-login)
  useEffect(() => {
    playWelcomeOnce();
  }, [playWelcomeOnce]);

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
      {/* Hero Section with Marketing Banners */}
      <HeroSection />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-6">
        {/* Chat Interface */}
        <Card className="glass-card overflow-hidden">
          <CardContent className="p-0">
            <UnifiedChat />
          </CardContent>
        </Card>

        {/* Agent & Task Visualizer - Above System Activity */}
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

        {/* System Activity */}
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
