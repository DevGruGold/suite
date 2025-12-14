import { cn } from "@/lib/utils";

interface SuiteAnimatedLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
  animate?: boolean;
}

const sizeConfig = {
  sm: { container: "w-8 h-8", text: "text-lg", particles: 3, cubeScale: 32 },
  md: { container: "w-10 h-10", text: "text-xl", particles: 4, cubeScale: 40 },
  lg: { container: "w-14 h-14", text: "text-2xl", particles: 5, cubeScale: 56 },
  xl: { container: "w-20 h-20", text: "text-3xl", particles: 6, cubeScale: 80 },
};

export function SuiteAnimatedLogo({ 
  className, 
  size = "md", 
  showWordmark = true,
  animate = true 
}: SuiteAnimatedLogoProps) {
  const config = sizeConfig[size];
  const particleCount = animate ? config.particles : 0;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn("relative", config.container)}>
        {/* Ambient glow underneath */}
        <div className={cn(
          "absolute -bottom-1 left-1/2 -translate-x-1/2 w-3/4 h-2 bg-primary/30 blur-md rounded-full",
          animate && "animate-pulse-subtle"
        )} />
        
        {/* Particle trail container */}
        {animate && (
          <div className="absolute inset-0 -z-10">
            {Array.from({ length: particleCount }).map((_, i) => (
              <div
                key={i}
                className="absolute left-1/2 -translate-x-1/2 rounded-full animate-particle-trail"
                style={{
                  '--particle-opacity': 0.7 - (i * 0.12),
                  animationDelay: `${i * 0.15}s`,
                  width: Math.max(3, 6 - i),
                  height: Math.max(3, 6 - i),
                  bottom: `${8 + (i * 6)}%`,
                  background: `radial-gradient(circle, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.3) 100%)`,
                  filter: `blur(${1 + i * 0.3}px)`,
                  boxShadow: `0 0 ${4 + i}px hsl(var(--primary) / ${0.5 - i * 0.08})`,
                } as React.CSSProperties}
              />
            ))}
          </div>
        )}
        
        {/* Main floating cube */}
        <div className={cn("relative w-full h-full", animate && "animate-cube-float")}>
          <svg
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
          >
            {/* Gradient definitions */}
            <defs>
              {/* Top face gradient (brightest) */}
              <linearGradient id="topFaceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(var(--primary))" />
                <stop offset="100%" stopColor="hsl(var(--primary) / 0.85)" />
              </linearGradient>
              
              {/* Left face gradient (medium) */}
              <linearGradient id="leftFaceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(var(--primary) / 0.7)" />
                <stop offset="100%" stopColor="hsl(var(--primary) / 0.5)" />
              </linearGradient>
              
              {/* Right face gradient (darkest) */}
              <linearGradient id="rightFaceGradient" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="hsl(var(--primary) / 0.55)" />
                <stop offset="100%" stopColor="hsl(var(--primary) / 0.35)" />
              </linearGradient>
              
              {/* Glow filter for S */}
              <filter id="sGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.5" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              
              {/* Shimmer gradient for highlight */}
              <linearGradient id="shimmerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(0 0% 100% / 0)" />
                <stop offset="50%" stopColor="hsl(0 0% 100% / 0.3)" />
                <stop offset="100%" stopColor="hsl(0 0% 100% / 0)" />
              </linearGradient>
            </defs>

            {/* Right face (darkest) - drawn first */}
            <polygon
              points="24,30 24,48 42,38 42,20"
              fill="url(#rightFaceGradient)"
            />

            {/* Left face (medium) */}
            <polygon
              points="24,30 24,48 6,38 6,20"
              fill="url(#leftFaceGradient)"
            />

            {/* Top face (brightest) with diamond shape */}
            <polygon
              points="24,2 42,12 24,22 6,12"
              fill="url(#topFaceGradient)"
            />

            {/* Edge highlights */}
            <path
              d="M24 2 L42 12 L42 20 M6 12 L6 20 M24 22 L24 30"
              stroke="hsl(0 0% 100% / 0.3)"
              strokeWidth="0.5"
              fill="none"
            />
            <path
              d="M24 2 L6 12 L24 22 L42 12 Z"
              stroke="hsl(0 0% 100% / 0.2)"
              strokeWidth="0.5"
              fill="none"
            />

            {/* S Lettermark on top face */}
            <text
              x="24"
              y="15"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="hsl(var(--primary-foreground))"
              fontSize="10"
              fontWeight="700"
              fontFamily="Inter, system-ui, sans-serif"
              filter="url(#sGlow)"
            >
              S
            </text>

            {/* Subtle highlight line on top face edge */}
            <line
              x1="24"
              y1="2"
              x2="42"
              y2="12"
              stroke="hsl(0 0% 100% / 0.4)"
              strokeWidth="0.75"
            />
          </svg>
        </div>
      </div>

      {showWordmark && (
        <span className={cn(
          "font-display font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent",
          config.text
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
      {/* Ambient glow */}
      <div className={cn(
        "absolute -bottom-1 left-1/2 -translate-x-1/2 w-3/4 h-1.5 bg-primary/25 blur-sm rounded-full",
        animate && "animate-pulse-subtle"
      )} />
      
      {/* Floating cube */}
      <div className={cn("relative w-full h-full", animate && "animate-cube-float")}>
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Right face */}
          <polygon
            points="24,30 24,48 42,38 42,20"
            fill="hsl(var(--primary) / 0.4)"
          />
          {/* Left face */}
          <polygon
            points="24,30 24,48 6,38 6,20"
            fill="hsl(var(--primary) / 0.6)"
          />
          {/* Top face */}
          <polygon
            points="24,2 42,12 24,22 6,12"
            fill="hsl(var(--primary))"
          />
          {/* S lettermark */}
          <text
            x="24"
            y="15"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="hsl(var(--primary-foreground))"
            fontSize="10"
            fontWeight="700"
            fontFamily="Inter, system-ui, sans-serif"
          >
            S
          </text>
          {/* Top edge highlight */}
          <path
            d="M24 2 L42 12 L24 22 L6 12 Z"
            stroke="hsl(0 0% 100% / 0.25)"
            strokeWidth="0.5"
            fill="none"
          />
        </svg>
      </div>
    </div>
  );
}
