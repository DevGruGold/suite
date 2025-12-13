import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pickaxe, Activity, Clock, Trash2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { LinkWorkerDialog } from './LinkWorkerDialog';
import { toast } from 'sonner';

interface WorkerStats {
  worker_id: string;
  total_hashrate: number | null;
  total_shares: number | null;
  last_active: string | null;
  is_active: boolean | null;
}

interface MiningSessionsListProps {
  userId: string;
  linkedWorkerIds: string[];
  onWorkersUpdated: (workerIds: string[]) => void;
}

export function MiningSessionsList({ userId, linkedWorkerIds, onWorkersUpdated }: MiningSessionsListProps) {
  const [workers, setWorkers] = useState<WorkerStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchWorkerStats = async () => {
    if (linkedWorkerIds.length === 0) {
      setWorkers([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_worker_mappings')
        .select('worker_id, total_hashrate, total_shares, last_active, is_active')
        .in('worker_id', linkedWorkerIds);

      if (error) throw error;
      setWorkers((data as WorkerStats[]) || []);
    } catch (error) {
      console.error('Error fetching worker stats:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWorkerStats();
  }, [linkedWorkerIds]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchWorkerStats();
  };

  const handleUnlinkWorker = async (workerId: string) => {
    const newWorkerIds = linkedWorkerIds.filter(id => id !== workerId);
    
    const { error } = await supabase
      .from('profiles')
      .update({ linked_worker_ids: newWorkerIds })
      .eq('id', userId);

    if (error) {
      toast.error('Failed to unlink worker');
      return;
    }

    toast.success(`Worker ${workerId} unlinked`);
    onWorkersUpdated(newWorkerIds);
  };

  const handleWorkerLinked = (workerId: string) => {
    onWorkersUpdated([...linkedWorkerIds, workerId]);
  };

  const totalHashrate = workers.reduce((sum, w) => sum + (w.total_hashrate || 0), 0);
  const totalShares = workers.reduce((sum, w) => sum + (w.total_shares || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Pickaxe className="h-5 w-5 text-primary" />
          My Mining Workers
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <LinkWorkerDialog
            userId={userId}
            existingWorkerIds={linkedWorkerIds}
            onWorkerLinked={handleWorkerLinked}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading workers...
          </div>
        ) : linkedWorkerIds.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Pickaxe className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No workers linked yet</p>
            <p className="text-sm mt-1">Link your XMRig worker ID to track mining sessions</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{totalHashrate.toFixed(1)} H/s</p>
                <p className="text-xs text-muted-foreground">Total Hashrate</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{totalShares.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Shares</p>
              </div>
            </div>

            {/* Worker list */}
            <div className="space-y-2">
              {workers.map((worker) => (
                <div
                  key={worker.worker_id}
                  className="flex items-center justify-between p-3 bg-card border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${worker.is_active ? 'bg-green-500' : 'bg-muted'}`} />
                    <div>
                      <p className="font-mono font-medium">{worker.worker_id}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Activity className="h-3 w-3" />
                        {(worker.total_hashrate || 0).toFixed(1)} H/s
                        <span className="mx-1">•</span>
                        {(worker.total_shares || 0).toLocaleString()} shares
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right mr-2">
                      <Badge variant={worker.is_active ? 'default' : 'secondary'} className="text-xs">
                        {worker.is_active ? 'Active' : 'Idle'}
                      </Badge>
                      {worker.last_active && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(worker.last_active), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleUnlinkWorker(worker.worker_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Show linked workers not found in pool */}
              {linkedWorkerIds
                .filter(id => !workers.find(w => w.worker_id === id))
                .map(id => (
                  <div
                    key={id}
                    className="flex items-center justify-between p-3 bg-muted/30 border border-dashed rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-yellow-500" />
                      <div>
                        <p className="font-mono font-medium">{id}</p>
                        <p className="text-xs text-muted-foreground">Not yet seen in pool</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleUnlinkWorker(id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
