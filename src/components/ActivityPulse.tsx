import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ActivityDot {
  id: string;
  type: string;
  timestamp: number;
}

export const ActivityPulse = () => {
  const [dots, setDots] = useState<ActivityDot[]>([]);
  const [recentActivities, setRecentActivities] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch recent activities
    const fetchRecent = async () => {
      const { data } = await supabase
        .from('eliza_activity_log')
        .select('activity_type, description')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (data) {
        setRecentActivities(data.map(a => 
          `${a.activity_type}: ${a.description ? a.description.slice(0, 50) : 'completed'}`
        ));
      }
    };

    fetchRecent();

    // Subscribe to new activities
    const channel = supabase
      .channel('activity-pulse')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'eliza_activity_log'
      }, (payload) => {
        const newDot: ActivityDot = {
          id: crypto.randomUUID(),
          type: payload.new.activity_type || 'default',
          timestamp: Date.now()
        };
        
        setDots(prev => [...prev.slice(-20), newDot]);
        
        setRecentActivities(prev => [
          `${payload.new.activity_type}: ${typeof payload.new.details === 'string' ? payload.new.details.slice(0, 50) : 'completed'}`,
          ...prev.slice(0, 4)
        ]);

        // Remove dot after animation
        setTimeout(() => {
          setDots(prev => prev.filter(d => d.id !== newDot.id));
        }, 3000);
      })
      .subscribe();

    // Generate periodic dots for visual effect
    const interval = setInterval(() => {
      const types = ['python', 'success', 'learning', 'system'];
      const newDot: ActivityDot = {
        id: crypto.randomUUID(),
        type: types[Math.floor(Math.random() * types.length)],
        timestamp: Date.now()
      };
      setDots(prev => [...prev.slice(-15), newDot]);
      
      setTimeout(() => {
        setDots(prev => prev.filter(d => d.id !== newDot.id));
      }, 3000);
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const getDotColor = (type: string) => {
    switch (type) {
      case 'python': return 'bg-primary';
      case 'success': return 'bg-emerald-500';
      case 'learning': return 'bg-violet-500';
      case 'auto_fix': return 'bg-amber-500';
      default: return 'bg-muted-foreground';
    }
  };

  return (
    <div className="relative w-full overflow-hidden">
      {/* Activity dots container */}
      <div 
        ref={containerRef}
        className="relative h-8 w-full overflow-hidden"
      >
        {dots.map((dot, index) => (
          <div
            key={dot.id}
            className={`absolute w-2 h-2 rounded-full ${getDotColor(dot.type)} opacity-80`}
            style={{
              left: `${(index * 8) % 100}%`,
              top: '50%',
              transform: 'translateY(-50%)',
              animation: 'flow-dot 3s linear forwards'
            }}
          />
        ))}
        
        {/* Gradient overlays */}
        <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent z-10" />
        <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent z-10" />
      </div>

      {/* Activity ticker */}
      <div className="relative h-6 overflow-hidden">
        <div className="animate-ticker whitespace-nowrap">
          {recentActivities.map((activity, i) => (
            <span key={i} className="inline-block mx-4 text-xs text-muted-foreground">
              • {activity}
            </span>
          ))}
          {recentActivities.length === 0 && (
            <span className="text-xs text-muted-foreground">Loading activity feed...</span>
          )}
        </div>
      </div>
    </div>
  );
};
