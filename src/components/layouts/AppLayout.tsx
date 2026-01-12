import { Outlet } from "react-router-dom";
import { MobileNavTrigger, MobileNavOverlay } from "@/components/MobileNav";
import { DesktopNav } from "@/components/DesktopNav";
import { Footer } from "@/components/Footer";
import { UserMenu } from "@/components/UserMenu";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Activity } from "lucide-react";
import { useState } from "react";

export const AppLayout = () => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <MobileNavOverlay isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      
      {/* Persistent Header */}
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Suite</h1>
              <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest">
                beta
              </span>
            </div>
            
            {/* Desktop Navigation */}
            <DesktopNav />
            
            {/* Status Indicators & User Menu */}
            <div className="hidden md:flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-suite-success animate-pulse" />
                <span>Active</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="w-3 h-3" />
                <span>120+</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <LanguageToggle />
              <div className="w-px h-4 bg-border" />
              <UserMenu />
            </div>

            {/* Mobile: User Menu + Hamburger side-by-side */}
            <div className="md:hidden flex items-center gap-2">
              <LanguageToggle />
              <UserMenu />
              <MobileNavTrigger isOpen={mobileNavOpen} onToggle={() => setMobileNavOpen(!mobileNavOpen)} />
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

      <Footer />
    </div>
  );
};

export default AppLayout;
