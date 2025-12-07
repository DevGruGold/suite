import UnifiedChat from "@/components/UnifiedChat";
import PythonShell from "@/components/PythonShell";
import AgentTaskVisualizer from "@/components/AgentTaskVisualizer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Bot } from "lucide-react";
import { HeroSection } from "@/components/HeroSection";

const Index = () => {
  return (
    <>
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

          {/* System Activity */}
          <Card className="glass-card overflow-hidden">
            <CardHeader className="border-b border-border/60 py-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  System Activity
                </CardTitle>
                <Badge variant="outline" className="text-xs font-normal">
                  Live
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <PythonShell />
            </CardContent>
          </Card>

          {/* Agent & Task Visualizer */}
          <Card className="glass-card overflow-hidden">
            <CardHeader className="border-b border-border/60 py-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" />
                  Agent & Task Visualizer
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <AgentTaskVisualizer />
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <footer className="text-center py-6 border-t border-border/60">
          <p className="text-xs text-muted-foreground">
            Powered by autonomous learning • Real-time monitoring • Enterprise AI
          </p>
        </footer>
      </div>
    </>
  );
};

export default Index;
