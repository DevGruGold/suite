import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, TrendingUp, Lock, Users, Activity } from 'lucide-react';
import { useMiningStats } from '@/hooks/useMiningStats';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface TreasuryData {
  total_xmr: number;
  total_value_usd: number;
  locked_xmr: number;
  locked_value_usd: number;
  active_miners: number;
  total_contributors: number;
  lock_progress: number;
}

interface MiningData {
  treasury: {
    total_xmr: number;
    total_value_usd: number;
    amount_due_xmr: number;
    amount_paid_xmr: number;
  };
  mining: {
    total_hashrate: number;
    active_workers: number;
    total_workers: number;
  };
  workers: Array<{
    worker_id: string;
    hashrate: number;
    is_active: boolean;
  }>;
}

export function TreasuryStats() {
  const [treasuryData, setTreasuryData] = useState<TreasuryData | null>(null);
  const { stats: unifiedStats, workers: unifiedWorkers, loading, error: miningError, refetch } = useMiningStats();
  const [error, setError] = useState<string | null>(null);

  const LOCK_TARGET_USD = 1000000; // $1 million goal

  useEffect(() => {
    // Set up real-time subscription
    const channel = supabase
      .channel('treasury_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'treasury_stats'
        },
        () => {
          refetch(true);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [refetch]);

  useEffect(() => {
    if (miningError) {
      setError(miningError);
      return;
    }

    if (!unifiedStats) return;

    const xmrPrice = 437.95;
    const lockedXMR = unifiedStats.amountPaid || 0;
    const dueXMR = unifiedStats.amountDue || 0;
    const totalXMR = lockedXMR + dueXMR;
    const lockedValueUSD = lockedXMR * xmrPrice;
    const totalValueUSD = totalXMR * xmrPrice;
    const lockProgress = Math.min((lockedValueUSD / LOCK_TARGET_USD) * 100, 100);

    setTreasuryData({
      total_value_usd: totalValueUSD,
      total_xmr: totalXMR,
      locked_value_usd: lockedValueUSD,
      locked_xmr: lockedXMR,
      lock_progress: lockProgress,
      active_miners: unifiedWorkers.filter((worker) => worker.hash > 0).length,
      total_contributors: unifiedWorkers.length
    });
    setError(null);
  }, [miningError, unifiedStats, unifiedWorkers]);

  const miningData: MiningData | null = unifiedStats ? {
    treasury: {
      total_xmr: (unifiedStats.amountDue || 0) + (unifiedStats.amountPaid || 0),
      total_value_usd: treasuryData?.total_value_usd || 0,
      amount_due_xmr: unifiedStats.amountDue || 0,
      amount_paid_xmr: unifiedStats.amountPaid || 0
    },
    mining: {
      total_hashrate: unifiedStats.hashRate || 0,
      active_workers: unifiedWorkers.filter((worker) => worker.hash > 0).length,
      total_workers: unifiedWorkers.length
    },
    workers: unifiedWorkers.map((worker) => ({
      worker_id: worker.identifier,
      hashrate: worker.hash,
      is_active: worker.hash > 0
    }))
  } : null;

  if (loading && !treasuryData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Treasury Stats</CardTitle>
          <CardDescription>Loading treasury data...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (error && !treasuryData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Treasury Stats</CardTitle>
          <CardDescription className="text-destructive">
            Error: {error}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatXMR = (value: number) => {
    return `${value.toFixed(6)} XMR`;
  };

  return (
    <div className="space-y-6">
      {/* MobileMonero $1M Lock - MOVED TO TOP */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-yellow-500" />
            MobileMonero $1M Lock
          </CardTitle>
          <CardDescription>
            First million dollars of XMR earned by global MobileMonero workers is permanently locked
          </CardDescription>
          <div className="pt-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/mining-dashboard">Open dedicated mining dashboard</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Lock Progress</span>
              <span className="font-semibold">
                {treasuryData ? `${treasuryData.lock_progress.toFixed(2)}%` : '0%'}
              </span>
            </div>
            <Progress 
              value={treasuryData?.lock_progress || 0} 
              className="h-3"
            />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {treasuryData ? formatCurrency(treasuryData.locked_value_usd) : '$0.00'}
              </span>
              <span className="text-muted-foreground">
                {formatCurrency(LOCK_TARGET_USD)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Locked XMR</p>
              <p className="text-lg font-bold text-yellow-600">
                {treasuryData ? formatXMR(treasuryData.locked_xmr) : '0.000000 XMR'}
              </p>
              <p className="text-xs text-muted-foreground">
                {treasuryData ? formatCurrency(treasuryData.locked_value_usd) : '$0.00'}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Remaining to Lock</p>
              <p className="text-lg font-bold">
                {treasuryData 
                  ? formatCurrency(LOCK_TARGET_USD - treasuryData.locked_value_usd)
                  : formatCurrency(LOCK_TARGET_USD)
                }
              </p>
              <p className="text-xs text-muted-foreground">
                Until permanent lock
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Treasury Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Treasury Overview
          </CardTitle>
          <CardDescription>
            Real-time XMR mining statistics and treasury value
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Treasury Value</p>
              <p className="text-3xl font-bold text-primary">
                {treasuryData ? formatCurrency(treasuryData.total_value_usd) : '$0.00'}
              </p>
              <p className="text-sm text-muted-foreground">
                {treasuryData ? formatXMR(treasuryData.total_xmr) : '0.000000 XMR'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {unifiedStats ? `⚡ ${unifiedStats.hashRate} H/s` : '⚡ 0 H/s'}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Active Mining</p>
              <p className="text-3xl font-bold">
                {unifiedWorkers ? unifiedWorkers.length : 0}
              </p>
              <p className="text-sm text-muted-foreground">
                {unifiedStats ? `${unifiedStats.hashRate} H/s` : '0 H/s'}
              </p>
            </div>
          </div>

          {/* Real-time Mining Data */}
          {miningData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Amount Due</p>
                <p className="text-sm font-semibold">
                  {formatXMR(miningData.treasury.amount_due_xmr)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Amount Paid</p>
                <p className="text-sm font-semibold">
                  {formatXMR(miningData.treasury.amount_paid_xmr)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Workers</p>
                <p className="text-sm font-semibold">{miningData.mining.total_workers}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Workers</p>
                <p className="text-sm font-semibold">{unifiedWorkers ? unifiedWorkers.length : 0}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Workers */}
      {miningData && miningData.workers && miningData.workers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-500" />
              Active Workers
            </CardTitle>
            <CardDescription>
              Currently active mining workers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {miningData.workers
                .filter(w => w.is_active)
                .slice(0, 10)
                .map((worker, idx) => (
                  <div key={worker.worker_id} className="flex justify-between items-center p-2 rounded-lg bg-secondary/50">
                    <span className="text-sm font-mono">{worker.worker_id}</span>
                    <span className="text-sm font-semibold">
                      {(worker.hashrate / 1000).toFixed(2)} KH/s
                    </span>
                  </div>
                ))}
              {miningData.workers.filter(w => w.is_active).length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  + {miningData.workers.filter(w => w.is_active).length - 10} more active workers
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Community Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 rounded-lg bg-secondary/50">
              <p className="text-2xl font-bold">{treasuryData?.active_miners || 0}</p>
              <p className="text-sm text-muted-foreground">Active Miners</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-secondary/50">
              <p className="text-2xl font-bold">{treasuryData?.total_contributors || 0}</p>
              <p className="text-sm text-muted-foreground">Total Contributors</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
