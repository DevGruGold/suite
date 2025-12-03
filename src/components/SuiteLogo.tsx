import { cn } from "@/lib/utils";

interface SuiteLogoProps {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}

export function SuiteLogo({ className, showWordmark = true, size = "md" }: SuiteLogoProps) {
  const sizeClasses = {
    sm: "h-6",
    md: "h-8",
    lg: "h-10",
    xl: "h-12"
  };

  const textSizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
    xl: "text-3xl"
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Logo Icon - Abstract S shape */}
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(sizeClasses[size], "w-auto")}
        aria-label="Suite logo"
      >
        {/* Background circle */}
        <circle cx="16" cy="16" r="15" className="fill-primary" />
        
        {/* Abstract S shape */}
        <path
          d="M10 12C10 10.8954 10.8954 10 12 10H18C20.2091 10 22 11.7909 22 14C22 16.2091 20.2091 18 18 18H14C11.7909 18 10 19.7909 10 22C10 24.2091 11.7909 26 14 26H20C21.1046 26 22 25.1046 22 24"
          className="stroke-primary-foreground"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        
        {/* Accent dot */}
        <circle cx="22" cy="12" r="2" className="fill-primary-foreground opacity-80" />
      </svg>

      {showWordmark && (
        <span className={cn(
          "font-semibold tracking-tight text-foreground",
          textSizeClasses[size]
        )}>
          Suite
        </span>
      )}
    </div>
  );
}

// Favicon-optimized version (smaller, simpler)
export function SuiteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8", className)}
      aria-label="Suite icon"
    >
      <circle cx="16" cy="16" r="15" className="fill-primary" />
      <path
        d="M10 12C10 10.8954 10.8954 10 12 10H18C20.2091 10 22 11.7909 22 14C22 16.2091 20.2091 18 18 18H14C11.7909 18 10 19.7909 10 22C10 24.2091 11.7909 26 14 26H20C21.1046 26 22 25.1046 22 24"
        className="stroke-primary-foreground"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="22" cy="12" r="2" className="fill-primary-foreground opacity-80" />
    </svg>
  );
}
