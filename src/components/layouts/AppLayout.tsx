import { Outlet, useLocation } from "react-router-dom";
import { MobileNav } from "@/components/MobileNav";
import { DesktopNav } from "@/components/DesktopNav";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { useEffect, useRef } from "react";

export const AppLayout = () => {
  const location = useLocation();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Audio autoplay on first load (only on home)
  useEffect(() => {
    if (location.pathname !== '/') return;
    
    const audio = new Audio('/audio/sweet.mp3');
    audioRef.current = audio;

    const playAudio = () => {
      audio.play().catch(console.log);
      document.removeEventListener('click', playAudio);
    };

    audio.play().catch(() => {
      document.addEventListener('click', playAudio);
    });

    return () => {
      audio.pause();
      document.removeEventListener('click', playAudio);
    };
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <MobileNav />
      
      {/* Persistent Header */}
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Suite
              </h1>
              <Badge variant="secondary" className="text-xs font-medium">
                Enterprise
              </Badge>
            </div>
            
            {/* Desktop Navigation */}
            <DesktopNav />
            
            {/* Status Indicators */}
            <div className="hidden md:flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-suite-success animate-pulse" />
                <span>Active</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="w-3 h-3" />
                <span>120+</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Transitions smoothly */}
      <main 
        id="main-content" 
        className="transition-opacity duration-200 ease-in-out"
      >
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
