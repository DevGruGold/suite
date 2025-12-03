import { cn } from "@/lib/utils"

interface SkeletonCardProps {
  className?: string
  lines?: number
  showHeader?: boolean
  showFooter?: boolean
}

export function SkeletonCard({ 
  className, 
  lines = 3, 
  showHeader = true,
  showFooter = false 
}: SkeletonCardProps) {
  return (
    <div 
      className={cn(
        "rounded-lg border bg-card p-6 space-y-4",
        className
      )}
      role="status"
      aria-label="Loading content"
    >
      {showHeader && (
        <div className="space-y-2">
          <div className="h-5 w-1/3 rounded bg-muted shimmer" />
          <div className="h-3 w-1/2 rounded bg-muted shimmer" />
        </div>
      )}
      
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div 
            key={i} 
            className={cn(
              "h-4 rounded bg-muted shimmer",
              i === lines - 1 ? "w-4/5" : "w-full"
            )}
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>

      {showFooter && (
        <div className="flex gap-3 pt-2">
          <div className="h-9 w-24 rounded bg-muted shimmer" />
          <div className="h-9 w-20 rounded bg-muted shimmer" />
        </div>
      )}
      
      <span className="sr-only">Loading...</span>
    </div>
  )
}

interface SkeletonTextProps {
  className?: string
  width?: string
}

export function SkeletonText({ className, width = "w-full" }: SkeletonTextProps) {
  return (
    <div 
      className={cn("h-4 rounded bg-muted shimmer", width, className)}
      role="status"
      aria-label="Loading text"
    />
  )
}

interface SkeletonAvatarProps {
  className?: string
  size?: "sm" | "md" | "lg"
}

export function SkeletonAvatar({ className, size = "md" }: SkeletonAvatarProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12"
  }
  
  return (
    <div 
      className={cn(
        "rounded-full bg-muted shimmer",
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label="Loading avatar"
    />
  )
}

interface SkeletonListProps {
  className?: string
  items?: number
}

export function SkeletonList({ className, items = 3 }: SkeletonListProps) {
  return (
    <div className={cn("space-y-4", className)} role="status" aria-label="Loading list">
      {Array.from({ length: items }).map((_, i) => (
        <div 
          key={i} 
          className="flex items-center gap-4 p-4 rounded-lg border bg-card"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <SkeletonAvatar />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded bg-muted shimmer" />
            <div className="h-3 w-1/2 rounded bg-muted shimmer" />
          </div>
          <div className="h-8 w-20 rounded bg-muted shimmer" />
        </div>
      ))}
      <span className="sr-only">Loading list items...</span>
    </div>
  )
}
