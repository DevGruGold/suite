import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BatteryCharging, Smartphone, RefreshCw, Zap, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface ChargerSession {
  id: string;
  event_type: string;
  pop_points: number | null;
  is_validated: boolean | null;
  validated_at: string | null;
  event_data: {
    device_type?: string;
    battery_level_start?: number;
    battery_level_end?: number;
    duration_seconds?: number;
    efficiency_score?: number;
  } | null;
}

interface ChargerSessionsListProps {
  userId: string;
  walletAddress?: string;
}

export function ChargerSessionsList({ userId, walletAddress }: ChargerSessionsListProps) {
  const [sessions, setSessions] = useState<ChargerSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalPopPoints, setTotalPopPoints] = useState(0);

  const fetchSessions = async () => {
    try {
      // Build the query based on available identifiers
      let query = supabase
        .from('pop_events_ledger')
        .select('id, event_type, pop_points, is_validated, validated_at, event_data')
        .order('validated_at', { ascending: false })
        .limit(20);

      // Filter by user_id or wallet_address
      if (walletAddress) {
        query = query.or(`user_id.eq.${userId},wallet_address.eq.${walletAddress}`);
      } else {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Cast the data to our interface
      const typedSessions = (data || []).map(session => ({
        id: session.id,
        event_type: session.event_type,
        pop_points: session.pop_points,
        is_validated: session.is_validated,
        validated_at: session.validated_at,
        event_data: session.event_data as ChargerSession['event_data']
      }));
      
      setSessions(typedSessions);
      setTotalPopPoints(typedSessions.reduce((sum, s) => sum + (Number(s.pop_points) || 0), 0));
    } catch (error) {
      console.error('Error fetching charger sessions:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [userId, walletAddress]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchSessions();
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BatteryCharging className="h-5 w-5 text-primary" />
          My Charger Sessions
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading sessions...
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BatteryCharging className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No charger sessions yet</p>
            <p className="text-sm mt-1">Connect your device while charging to earn PoP points</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{totalPopPoints.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Total PoP Points</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{sessions.length}</p>
                <p className="text-xs text-muted-foreground">Sessions</p>
              </div>
            </div>

            {/* Session list */}
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-card border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Smartphone className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {session.event_data?.device_type || 'Unknown Device'}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {session.validated_at 
                          ? formatDistanceToNow(new Date(session.validated_at), { addSuffix: true })
                          : 'Pending'}
                        {session.event_data?.duration_seconds && (
                          <>
                            <span className="mx-1">•</span>
                            {formatDuration(session.event_data.duration_seconds)}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {session.event_data?.battery_level_start !== undefined && 
                     session.event_data?.battery_level_end !== undefined && (
                      <div className="text-xs text-muted-foreground text-right">
                        <span>{session.event_data.battery_level_start}%</span>
                        <span className="mx-1">→</span>
                        <span className="text-green-500">{session.event_data.battery_level_end}%</span>
                      </div>
                    )}
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-primary font-medium">
                        <Zap className="h-3 w-3" />
                        +{Number(session.pop_points || 0).toFixed(1)}
                      </div>
                      <Badge 
                        variant={session.is_validated ? 'default' : 'secondary'}
                        className="text-xs mt-1"
                      >
                        {session.is_validated ? '✓ Valid' : 'Pending'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
