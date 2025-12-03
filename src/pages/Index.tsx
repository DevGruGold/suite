import { useState } from "react";
import UnifiedChat from "@/components/UnifiedChat";
import PythonShell from "@/components/PythonShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info, Activity, Zap, Eye, Code, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/MobileNav";

const Index = () => {
  const [showInfo, setShowInfo] = useState(false);

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
                <div className="w-1.5 h-1.5 rounded-full bg-suite-success animate-pulse-subtle" />
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Hero Section */}
        <div className="text-center space-y-3 py-4">
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Enterprise AI automation with intelligent assistants and real-time monitoring
          </p>
          
          {/* System Info Collapsible */}
          <Collapsible open={showInfo} onOpenChange={setShowInfo}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                <Info className="w-4 h-4" />
                <span className="text-xs">{showInfo ? "Hide" : "System"} Details</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showInfo ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mt-4 border-border bg-card text-left max-w-3xl mx-auto">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    Autonomous Learning System
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                      <h4 className="font-medium text-foreground flex items-center gap-2">
                        <Eye className="w-3.5 h-3.5 text-primary" />
                        Real-Time Monitoring
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Watch all system activity including executions, scans, auto-fixes, and learning events in real-time.
                      </p>
                    </div>
                    <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                      <h4 className="font-medium text-foreground flex items-center gap-2">
                        <Code className="w-3.5 h-3.5 text-primary" />
                        Self-Healing Code
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Autonomous error detection and correction with continuous improvement from each fix.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>

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