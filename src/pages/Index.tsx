import UnifiedChat from "@/components/UnifiedChat";
import PythonShell from "@/components/PythonShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { MobileNav } from "@/components/MobileNav";
import { HeroSection } from "@/components/HeroSection";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <MobileNav />
      
      {/* Header */}
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Suite
              </h1>
              <Badge variant="secondary" className="text-xs font-medium">
                Enterprise
              </Badge>
            </div>
            
            {/* Status Indicators */}
            <div className="hidden md:flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-suite-success animate-pulse" />
                <span>System Active</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="w-3 h-3" />
                <span>120+ Functions</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section with Marketing Banners */}
      <HeroSection />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

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
        </div>

        {/* Footer */}
        <footer className="text-center py-6 border-t border-border/60">
          <p className="text-xs text-muted-foreground">
            Powered by autonomous learning • Real-time monitoring • Enterprise AI
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Index;