import { useEffect, useState } from 'react';
import { formatTime } from '@/utils/dateFormatter';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, AlertCircle, XCircle, Activity, ShieldAlert } from 'lucide-react';

interface ComponentStatus {
  status: 'healthy' | 'degraded' | 'error' | 'unknown' | 'not_configured';
  error?: string;
  [key: string]: any;
}

interface SystemStatus {
  timestamp: string;
  overall_status: 'healthy' | 'degraded' | 'unhealthy' | 'error';
  health_score: number;
  components: {
    database?: ComponentStatus;
    agents?: ComponentStatus & {
      stats?: {
        total: number;
        idle: number;
        busy: number;
        working: number;
        working: number;
        blocked: number;
        completed: number;
        error: number;
      };
    };
    tasks?: ComponentStatus & {
      stats?: {
        total: number;
        pending: number;
        in_progress: number;
        blocked: number;
        completed: number;
        failed: number;
      };
    };
    edge_functions?: ComponentStatus & {
      message?: string;
      total_deployed?: number;
      total_active_24h?: number;
      total_idle?: number;
      stats?: any;
    };
    mining?: ComponentStatus;
    render_service?: ComponentStatus;
    activity_log?: ComponentStatus;
  };
}

export const SystemStatusMonitor = () => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSystemStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase.functions.invoke('system-status', {
        body: {}
      });

      if (fetchError) throw fetchError;

      if (data?.success) {
        setStatus(data.status);
      } else {
        throw new Error(data?.error || 'Failed to fetch system status');
      }
    } catch (err) {
      console.error('System status fetch error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status?.components?.agents?.stats?.blocked && status.components.agents.stats.blocked > 0) {
      toast({
        title: "Agents Blocked",
        description: `${status.components.agents.stats.blocked} agent(s) are currently blocked and require attention.`,
        variant: "destructive",
      });
    }
  }, [status]);

  useEffect(() => {
    fetchSystemStatus();

    // Refresh every 5 minutes (300000ms) - matches cron job schedule
    const interval = setInterval(fetchSystemStatus, 300000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (componentStatus: string) => {
    switch (componentStatus) {
      case 'healthy':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'error':
      case 'unhealthy':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (componentStatus: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      healthy: 'default',
      degraded: 'secondary',
      error: 'destructive',
      unhealthy: 'destructive',
      unknown: 'outline',
      not_configured: 'outline'
    };

    return (
      <Badge variant={variants[componentStatus] || 'outline'}>
        {componentStatus}
      </Badge>
    );
  };

  if (loading && !status) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading system status...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center text-destructive">
            <XCircle className="h-5 w-5 mr-2" />
            <span>Error: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon(status.overall_status)}
              System Health Monitor
            </CardTitle>
            <CardDescription>
              Last updated: {formatTime(status.timestamp)}
            </CardDescription>
          </div>
          {getStatusBadge(status.overall_status)}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Health Score */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Health Score</span>
            <span className="text-sm font-bold">{status.health_score}%</span>
          </div>
          <Progress value={status.health_score} className="h-2" />
        </div>

        {/* Components Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Database */}
          {status.components.database && (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Database</span>
                {getStatusIcon(status.components.database.status)}
              </div>
              {status.components.database.error && (
                <p className="text-xs text-muted-foreground">{status.components.database.error}</p>
              )}
            </div>
          )}

          {/* Agents */}
          {status.components.agents && (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Agents</span>
                {getStatusIcon(status.components.agents.status)}
              </div>
              {status.components.agents.stats && (
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Total</div>
                    <div className="font-bold">{status.components.agents.stats.total}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Idle</div>
                    <div className="font-bold text-green-600">{status.components.agents.stats.idle}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Working</div>
                    <div className="font-bold text-blue-600">{status.components.agents.stats.working}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Blocked</div>
                    <div className={`font-bold ${status.components.agents.stats.blocked > 0 ? 'text-red-600 animate-pulse' : 'text-muted-foreground'}`}>
                      {status.components.agents.stats.blocked || 0}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tasks */}
          {status.components.tasks && (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Tasks</span>
                {getStatusIcon(status.components.tasks.status)}
              </div>
              {status.components.tasks.stats && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Total</div>
                    <div className="font-bold">{status.components.tasks.stats.total}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Pending</div>
                    <div className="font-bold text-yellow-600">{status.components.tasks.stats.pending}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Completed</div>
                    <div className="font-bold text-green-600">{status.components.tasks.stats.completed}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Edge Functions */}
          {status.components.edge_functions && (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Edge Functions</span>
                {getStatusIcon(status.components.edge_functions.status)}
              </div>
              {status.components.edge_functions.message && (
                <p className="text-xs text-muted-foreground">{status.components.edge_functions.message}</p>
              )}
              <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                <div>
                  <div className="text-muted-foreground">Deployed</div>
                  <div className="font-bold">{status.components.edge_functions.total_deployed || 0}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Active 24h</div>
                  <div className="font-bold text-green-600">{status.components.edge_functions.total_active_24h || 0}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Idle</div>
                  <div className="font-bold text-yellow-600">{status.components.edge_functions.total_idle || 0}</div>
                </div>
              </div>
            </div>
          )}

          {/* Mining */}
          {status.components.mining && (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Mining</span>
                {getStatusIcon(status.components.mining.status)}
              </div>
              {status.components.mining.hash_rate !== undefined && (
                <div className="text-xs">
                  <div className="text-muted-foreground">Hash Rate</div>
                  <div className="font-bold">{status.components.mining.hash_rate} H/s</div>
                </div>
              )}
            </div>
          )}

          {/* Render Service */}
          {status.components.render_service && (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Render Service</span>
                {getStatusIcon(status.components.render_service.status)}
              </div>
              {status.components.render_service.latest_deploy && (
                <div className="text-xs space-y-1">
                  <div>
                    <span className="text-muted-foreground">Status: </span>
                    <Badge variant="outline" className="text-xs">
                      {status.components.render_service.latest_deploy.status}
                    </Badge>
                  </div>
                  {status.components.render_service.latest_deploy.commit_hash && (
                    <div className="text-muted-foreground">
                      Commit: {status.components.render_service.latest_deploy.commit_hash}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Activity Log */}
          {status.components.activity_log && (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Activity Log</span>
                {getStatusIcon(status.components.activity_log.status)}
              </div>
              {status.components.activity_log.stats && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Pending</div>
                    <div className="font-bold">{status.components.activity_log.stats.pending}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Failed</div>
                    <div className="font-bold text-red-600">{status.components.activity_log.stats.failed}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
