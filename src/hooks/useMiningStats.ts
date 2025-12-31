import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MiningStats {
  hashRate: number;
  hashrate?: number; // Deprecated alias
  validShares: number;
  invalidShares: number;
  totalHashes: number;
  amountDue: number;
  amountPaid: number;
  isOnline: boolean;
  lastUpdate: Date;
}

export interface WorkerStats {
  identifier: string;
  hash: number;
  validShares: number;
  invalidShares: number;
  lastHash: number;
}

const CACHE_DURATION = 30000; // 30 seconds
let cachedMiningStats: MiningStats | null = null;
let cachedWorkers: WorkerStats[] | null = null;
let lastFetchTime = 0;

export const useMiningStats = () => {
  const [stats, setStats] = useState<MiningStats | null>(cachedMiningStats);
  const [workers, setWorkers] = useState<WorkerStats[]>(cachedWorkers || []);
  const [loading, setLoading] = useState(!cachedMiningStats);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    const now = Date.now();
    
    // Return cached data if still fresh
    if (cachedMiningStats && now - lastFetchTime < CACHE_DURATION) {
      setStats(cachedMiningStats);
      setWorkers(cachedWorkers || []);
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase.functions.invoke('mining-proxy', {
        body: { action: 'getStats' }
      });

      if (fetchError) throw fetchError;

      const miningStats: MiningStats = {
        hashRate: data?.hash || 0,
        hashrate: data?.hash || 0, // Deprecated alias
        totalHashes: data?.totalHashes || 0,
        validShares: data?.validShares || 0,
        invalidShares: data?.invalidShares || 0,
        amountDue: data?.amountDue || 0,
        amountPaid: data?.amountPaid || 0,
        isOnline: data?.isOnline || false,
        lastUpdate: new Date(now)
      };

      const workersList: WorkerStats[] = (data?.workers || [])
        .map((w: any) => ({
          identifier: w.identifier || 'Unknown',
          hash: w.hash || 0,
          validShares: w.validShares || 0,
          invalidShares: w.invalidShares || 0,
          lastHash: w.lastHash || 0
        }))
        .sort((a: WorkerStats, b: WorkerStats) => b.hash - a.hash);

      // Update cache
      cachedMiningStats = miningStats;
      cachedWorkers = workersList;
      lastFetchTime = now;

      setStats(miningStats);
      setWorkers(workersList);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch mining stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, CACHE_DURATION);
    return () => clearInterval(interval);
  }, []);

  return { stats, workers, loading, error, refetch: fetchStats };
};
