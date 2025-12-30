import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Smartphone, Cpu, Activity, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ClaimableWorker {
  worker_id: string;
  username: string;
  hashrate: number;
  valid_shares: number;
  last_ping: string;
  is_active: boolean;
  device_info: {
    device_model?: string;
    android_version?: string;
    cpu_cores?: number;
  };
  expires_at: string;
}

interface ClaimedWorker {
  worker_id: string;
  device_id: string;
  hashrate: number;
  valid_shares: number;
  last_seen: string;
  is_active: boolean;
  device_info: {
    device_model?: string;
    android_version?: string;
  };
  linked_at: string;
}

export function WorkerClaimComponent() {
  const [claimableWorkers, setClaimableWorkers] = useState<ClaimableWorker[]>([]);
  const [myWorkers, setMyWorkers] = useState<ClaimedWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimToken, setClaimToken] = useState('');
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    fetchWorkers();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchWorkers, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchWorkers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Fetch claimable workers
      const { data: claimableData, error: claimableError } = await supabase.functions.invoke('worker-registration', {
        body: { action: 'get_claimable' }
      });

      if (!claimableError && claimableData?.success) {
        setClaimableWorkers(claimableData.workers || []);
      }

      // Fetch my workers if logged in
      if (user) {
        const { data: myData, error: myError } = await supabase.functions.invoke('worker-registration', {
          body: { 
            action: 'get_my_workers',
            user_id: user.id
          }
        });

        if (!myError && myData?.success) {
          setMyWorkers(myData.workers || []);
        }
      }
    } catch (error) {
      console.error('Error fetching workers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimWorker = async () => {
    if (!claimToken || claimToken.length !== 6) {
      toast.error('Please enter a valid 6-character claim token');
      return;
    }

    setClaiming(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please sign in to claim workers');
        return;
      }

      const { data, error } = await supabase.functions.invoke('worker-registration', {
        body: {
          action: 'claim',
          claim_token: claimToken.toUpperCase(),
          user_id: user.id
        }
      });

      if (error || !data?.success) {
        toast.error(data?.error || 'Failed to claim worker');
        return;
      }

      toast.success(`Worker ${data.worker.worker_id} claimed successfully!`);
      setClaimDialogOpen(false);
      setClaimToken('');
      fetchWorkers(); // Refresh lists
      
    } catch (error) {
      console.error('Claim error:', error);
      toast.error('An error occurred while claiming the worker');
    } finally {
      setClaiming(false);
    }
  };

  const formatHashrate = (hashrate: number) => {
    if (hashrate >= 1000000) return `${(hashrate / 1000000).toFixed(2)} MH/s`;
    if (hashrate >= 1000) return `${(hashrate / 1000).toFixed(2)} KH/s`;
    return `${hashrate.toFixed(2)} H/s`;
  };

  const formatTimeAgo = (timestamp: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(timestamp).getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Claim Worker Button */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Claim Your Mining Worker
          </CardTitle>
          <CardDescription>
            Enter the claim token from your mobile mining setup to link your device
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => setClaimDialogOpen(true)}
            className="w-full sm:w-auto"
          >
            Claim Worker with Token
          </Button>
        </CardContent>
      </Card>

      {/* My Claimed Workers */}
      {myWorkers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              My Workers ({myWorkers.length})
            </CardTitle>
            <CardDescription>
              Workers you've claimed and linked to your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {myWorkers.map((worker) => (
                <div 
                  key={worker.worker_id}
                  className="p-4 rounded-lg border bg-card"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {worker.worker_id}
                        </span>
                        {worker.is_active && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <Activity className="h-3 w-3" />
                            Active
                          </span>
                        )}
                      </div>
                      
                      {worker.device_info?.device_model && (
                        <p className="text-sm text-muted-foreground">
                          {worker.device_info.device_model}
                          {worker.device_info.android_version && 
                            ` (Android ${worker.device_info.android_version})`
                          }
                        </p>
                      )}
                      
                      <p className="text-xs text-muted-foreground">
                        Claimed {formatTimeAgo(worker.linked_at)}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary">
                          {formatHashrate(worker.hashrate)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {worker.valid_shares.toLocaleString()} shares
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Workers to Claim */}
      {claimableWorkers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-blue-500" />
              Available Workers ({claimableWorkers.length})
            </CardTitle>
            <CardDescription>
              Active workers waiting to be claimed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {claimableWorkers.map((worker) => (
                <div 
                  key={worker.worker_id}
                  className="p-4 rounded-lg border bg-secondary/50"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {worker.worker_id}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({worker.username})
                        </span>
                      </div>
                      
                      {worker.device_info?.device_model && (
                        <p className="text-sm text-muted-foreground">
                          {worker.device_info.device_model}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last ping: {formatTimeAgo(worker.last_ping)}
                        </span>
                        <span>
                          Expires: {formatTimeAgo(worker.expires_at)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-lg font-bold">
                        {formatHashrate(worker.hashrate)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {worker.valid_shares.toLocaleString()} shares
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {myWorkers.length === 0 && claimableWorkers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Workers Found</h3>
            <p className="text-muted-foreground mb-4 max-w-md">
              Set up mobile mining on your device and use the claim token to link it here.
            </p>
            <Button onClick={() => setClaimDialogOpen(true)}>
              Claim Your First Worker
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Claim Dialog */}
      <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim Mining Worker</DialogTitle>
            <DialogDescription>
              Enter the 6-character claim token from your mobile mining setup
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Claim Token</label>
              <Input
                placeholder="ABC123"
                value={claimToken}
                onChange={(e) => setClaimToken(e.target.value.toUpperCase())}
                maxLength={6}
                className="text-center text-lg font-mono tracking-widest"
              />
              <p className="text-xs text-muted-foreground">
                Find this token in your mobile mining setup output
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setClaimDialogOpen(false);
                setClaimToken('');
              }}
              disabled={claiming}
            >
              Cancel
            </Button>
            <Button
              onClick={handleClaimWorker}
              disabled={claiming || claimToken.length !== 6}
            >
              {claiming ? 'Claiming...' : 'Claim Worker'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
