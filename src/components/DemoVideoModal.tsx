import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, X, MessageSquare, Users, Workflow, BarChart3, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

interface DemoVideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCENE_DURATION = 4000; // 4 seconds per scene

const scenes = [
  {
    id: 1,
    title: "Chat with Eliza",
    icon: MessageSquare,
    description: "Your AI Chief of Staff coordinates everything"
  },
  {
    id: 2,
    title: "AI Executive Council",
    icon: Users,
    description: "4 specialized executives analyze in parallel"
  },
  {
    id: 3,
    title: "Autonomous Task Pipeline",
    icon: Workflow,
    description: "Tasks flow through stages automatically"
  },
  {
    id: 4,
    title: "Real-Time Intelligence",
    icon: BarChart3,
    description: "Live metrics and continuous optimization"
  },
  {
    id: 5,
    title: "Transform Your Enterprise",
    icon: Rocket,
    description: "Ready to replace your C-Suite?"
  }
];

export function DemoVideoModal({ open, onOpenChange }: DemoVideoModalProps) {
  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  const totalDuration = scenes.length * SCENE_DURATION;

  const restart = useCallback(() => {
    setCurrentScene(0);
    setProgress(0);
    setIsPlaying(true);
  }, []);

  useEffect(() => {
    if (!open) {
      restart();
      return;
    }
  }, [open, restart]);

  useEffect(() => {
    if (!isPlaying || !open) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev + (100 / (totalDuration / 50));
        if (newProgress >= 100) {
          setIsPlaying(false);
          return 100;
        }
        return newProgress;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, open, totalDuration]);

  useEffect(() => {
    const sceneIndex = Math.min(
      Math.floor((progress / 100) * scenes.length),
      scenes.length - 1
    );
    setCurrentScene(sceneIndex);
  }, [progress]);

  const scene = scenes[currentScene];
  const SceneIcon = scene.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-primary/20">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-display flex items-center gap-2">
              <Play className="w-5 h-5 text-primary" />
              Suite AI Demo
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Demo Stage */}
        <div className="relative h-[400px] bg-gradient-to-br from-muted/50 via-background to-muted/30 overflow-hidden">
          {/* Animated background grid */}
          <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--primary)/0.03)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black,transparent)]" />
          
          {/* Floating orbs */}
          <div className="absolute top-10 left-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-10 right-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl animate-float" style={{ animationDelay: "-2s" }} />

          {/* Scene content */}
          <div className="relative h-full flex flex-col items-center justify-center p-8">
            {/* Scene indicator */}
            <div className="absolute top-4 left-4 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">{currentScene + 1}/{scenes.length}</span>
              <span className="text-primary">{scene.title}</span>
            </div>

            {/* Main scene visualization */}
            <div className="animate-scale-in" key={currentScene}>
              <div className="relative">
                {/* Icon container with glow */}
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse-subtle" />
                <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center">
                  <SceneIcon className="w-12 h-12 text-primary" />
                </div>
              </div>
            </div>

            {/* Scene title and description */}
            <div className="mt-8 text-center animate-slide-up" key={`text-${currentScene}`}>
              <h3 className="text-2xl font-display font-bold mb-2">{scene.title}</h3>
              <p className="text-muted-foreground max-w-md">{scene.description}</p>
            </div>

            {/* Scene-specific animated content */}
            <div className="mt-8 animate-fade-in" key={`content-${currentScene}`}>
              {currentScene === 0 && <ChatScene />}
              {currentScene === 1 && <CouncilScene />}
              {currentScene === 2 && <PipelineScene />}
              {currentScene === 3 && <MetricsScene />}
              {currentScene === 4 && <CTAScene onClose={() => onOpenChange(false)} />}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 border-t border-border/50">
          {/* Progress bar */}
          <div className="relative h-1 bg-muted rounded-full overflow-hidden mb-4">
            <div 
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
            {/* Scene markers */}
            {scenes.map((_, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-0.5 bg-background"
                style={{ left: `${((i + 1) / scenes.length) * 100}%` }}
              />
            ))}
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={restart}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Restart
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsPlaying(!isPlaying)}
              className="gap-2 min-w-[100px]"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Play
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Scene Components
function ChatScene() {
  const [showResponse, setShowResponse] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setShowResponse(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full max-w-sm space-y-3">
      <div className="flex justify-end animate-slide-in-right">
        <div className="bg-primary text-primary-foreground px-4 py-2 rounded-2xl rounded-br-sm text-sm">
          Analyze our Q3 performance
        </div>
      </div>
      {showResponse && (
        <div className="flex justify-start animate-slide-in-left">
          <div className="bg-muted px-4 py-2 rounded-2xl rounded-bl-sm text-sm">
            I'll coordinate with CIO and CAO for a comprehensive analysis...
          </div>
        </div>
      )}
    </div>
  );
}

function CouncilScene() {
  const executives = [
    { name: "CSO", color: "from-blue-500/20 to-blue-500/5" },
    { name: "CTO", color: "from-green-500/20 to-green-500/5" },
    { name: "CIO", color: "from-purple-500/20 to-purple-500/5" },
    { name: "CAO", color: "from-orange-500/20 to-orange-500/5" },
  ];

  return (
    <div className="flex items-center gap-4">
      {executives.map((exec, i) => (
        <div
          key={exec.name}
          className={cn(
            "w-16 h-16 rounded-full bg-gradient-to-br border border-primary/20 flex items-center justify-center text-sm font-bold animate-scale-in",
            exec.color
          )}
          style={{ animationDelay: `${i * 150}ms` }}
        >
          {exec.name}
        </div>
      ))}
    </div>
  );
}

function PipelineScene() {
  const stages = ["PLAN", "EXECUTE", "VERIFY", "INTEGRATE"];
  
  return (
    <div className="flex items-center gap-2">
      {stages.map((stage, i) => (
        <div key={stage} className="flex items-center">
          <div
            className="px-3 py-1.5 bg-primary/10 border border-primary/20 rounded text-xs font-mono animate-slide-in-right"
            style={{ animationDelay: `${i * 200}ms` }}
          >
            {stage}
          </div>
          {i < stages.length - 1 && (
            <div className="w-4 h-0.5 bg-primary/30 animate-fade-in" style={{ animationDelay: `${i * 200 + 100}ms` }} />
          )}
        </div>
      ))}
    </div>
  );
}

function MetricsScene() {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCount((prev) => Math.min(prev + 5, 98));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-8">
      <div className="text-center">
        <div className="text-3xl font-bold font-mono text-primary">{count}%</div>
        <div className="text-xs text-muted-foreground">Efficiency</div>
      </div>
      <div className="text-center">
        <div className="text-3xl font-bold font-mono text-primary">24/7</div>
        <div className="text-xs text-muted-foreground">Uptime</div>
      </div>
      <div className="text-center">
        <div className="text-3xl font-bold font-mono text-primary">$12.4M</div>
        <div className="text-xs text-muted-foreground">Saved</div>
      </div>
    </div>
  );
}

function CTAScene({ onClose }: { onClose: () => void }) {
  return (
    <Button 
      size="lg" 
      className="gap-2 animate-bounce-subtle"
      onClick={onClose}
    >
      <Rocket className="w-5 h-5" />
      Start Your Free Trial
    </Button>
  );
}
