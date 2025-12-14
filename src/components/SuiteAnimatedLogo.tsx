import { cn } from "@/lib/utils";

interface SuiteAnimatedLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
  animate?: boolean;
}

export function SuiteAnimatedLogo({ 
  className, 
  size = "md", 
  showWordmark = true,
  animate = true 
}: SuiteAnimatedLogoProps) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-14 h-14",
    xl: "w-20 h-20"
  };

  const textSizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
    xl: "text-3xl"
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn("relative", sizeClasses[size])}>
        {/* Outer glow ring */}
        <div className={cn(
          "absolute inset-0 rounded-xl bg-gradient-to-r from-primary via-primary/50 to-primary blur-lg opacity-50",
          animate && "animate-pulse-subtle"
        )} />
        
        {/* Main logo container */}
        <div className="relative w-full h-full">
          <svg
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
          >
            {/* Gradient definitions */}
            <defs>
              <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(var(--primary))" />
                <stop offset="50%" stopColor="hsl(var(--primary) / 0.8)" />
                <stop offset="100%" stopColor="hsl(var(--primary) / 0.6)" />
              </linearGradient>
              <linearGradient id="accentGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(var(--primary) / 0.3)" />
                <stop offset="100%" stopColor="hsl(var(--primary))" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Background hexagon */}
            <path
              d="M24 4L42 14V34L24 44L6 34V14L24 4Z"
              fill="hsl(var(--background))"
              stroke="url(#logoGradient)"
              strokeWidth="1.5"
              className={cn(animate && "animate-pulse-subtle")}
            />

            {/* Inner geometric S shape */}
            <path
              d="M32 16C32 16 28 14 24 14C18 14 16 18 16 20C16 24 20 26 24 27C28 28 32 30 32 34C32 38 28 40 24 40C20 40 16 38 16 38"
              stroke="url(#logoGradient)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
              filter="url(#glow)"
            />

            {/* Orbital nodes */}
            {animate && (
              <>
                <circle r="2" fill="hsl(var(--primary))" className="animate-orbit-1">
                  <animateMotion
                    dur="4s"
                    repeatCount="indefinite"
                    path="M24 4 A20 20 0 1 1 23.99 4"
                  />
                </circle>
                <circle r="1.5" fill="hsl(var(--primary) / 0.7)" className="animate-orbit-2">
                  <animateMotion
                    dur="6s"
                    repeatCount="indefinite"
                    path="M24 8 A16 16 0 1 0 24.01 8"
                  />
                </circle>
                <circle r="1" fill="hsl(var(--primary) / 0.5)" className="animate-orbit-3">
                  <animateMotion
                    dur="8s"
                    repeatCount="indefinite"
                    path="M24 6 A18 18 0 1 1 23.99 6"
                  />
                </circle>
              </>
            )}

            {/* Corner accent nodes */}
            <circle cx="8" cy="14" r="2" fill="hsl(var(--primary) / 0.6)" className={cn(animate && "animate-pulse-subtle")} />
            <circle cx="40" cy="14" r="2" fill="hsl(var(--primary) / 0.6)" className={cn(animate && "animate-pulse-subtle")} style={{ animationDelay: "0.5s" }} />
            <circle cx="8" cy="34" r="2" fill="hsl(var(--primary) / 0.6)" className={cn(animate && "animate-pulse-subtle")} style={{ animationDelay: "1s" }} />
            <circle cx="40" cy="34" r="2" fill="hsl(var(--primary) / 0.6)" className={cn(animate && "animate-pulse-subtle")} style={{ animationDelay: "1.5s" }} />
          </svg>
        </div>
      </div>

      {showWordmark && (
        <span className={cn(
          "font-display font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent",
          textSizeClasses[size]
        )}>
          SUITE
        </span>
      )}
    </div>
  );
}

export function SuiteAnimatedIcon({ className, animate = true }: { className?: string; animate?: boolean }) {
  return (
    <div className={cn("relative w-8 h-8", className)}>
      <div className={cn(
        "absolute inset-0 rounded-lg bg-primary/20 blur-md",
        animate && "animate-pulse-subtle"
      )} />
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative w-full h-full"
      >
        <path
          d="M24 4L42 14V34L24 44L6 34V14L24 4Z"
          fill="hsl(var(--primary) / 0.1)"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
        />
        <path
          d="M32 16C32 16 28 14 24 14C18 14 16 18 16 20C16 24 20 26 24 27C28 28 32 30 32 34C32 38 28 40 24 40C20 40 16 38 16 38"
          stroke="hsl(var(--primary))"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
