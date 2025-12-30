import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Lock, TrendingUp, Users, Coins, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TreasuryStats {
  totalXMRMined: number;
  totalValueUSD: number;
  lockedXMR: number;
  lockedValueUSD: number;
  activeMobileMiners: number;
  totalContributors: number;
  xmrPriceUSD: number;
  lockThreshold: number;
  lockProgress: number;
}

export function TreasuryStats() {
  const [stats, setStats] = useState<TreasuryStats>({
    totalXMRMined: 0,
    totalValueUSD: 0,
    lockedXMR: 0,
    lockedValueUSD: 0,
    activeMobileMiners: 0,
    totalContributors: 0,
    xmrPriceUSD: 0,
    lockThreshold: 1000000, // $1M USD threshold
    lockProgress: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTreasuryStats();
    
    // Set up real-time subscription
    const subscription = supabase
      .channel('treasury_stats_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'treasury_stats' },
        () => {
          loadTreasuryStats();
        }
      )
      .subscribe();

    // Refresh every 5 minutes
    const interval = setInterval(loadTreasuryStats, 5 * 60 * 1000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const loadTreasuryStats = async () => {
    try {
      // Fetch current XMR price
      const xmrPrice = await fetchXMRPrice();
      
      // Fetch mining stats from database
      const { data: miningData, error: miningError } = await supabase
        .from('mining_sessions')
        .select('xmr_earned, is_mobile_worker, created_at')
        .order('created_at', { ascending: false });

      if (miningError) throw miningError;

      // Calculate stats
      const totalXMRMined = miningData?.reduce((sum, session) => sum + (session.xmr_earned || 0), 0) || 0;
      const mobileMinersXMR = miningData?.filter(s => s.is_mobile_worker).reduce((sum, s) => sum + (s.xmr_earned || 0), 0) || 0;
      const totalValueUSD = totalXMRMined * xmrPrice;
      const mobileWorkersValue = mobileMinersXMR * xmrPrice;

      // Determine locked XMR (first $1M from mobile workers)
      const lockThreshold = 1000000; // $1M USD
      const lockedXMR = Math.min(mobileMinersXMR, lockThreshold / xmrPrice);
      const lockedValueUSD = Math.min(mobileWorkersValue, lockThreshold);
      
      // Get unique contributors
      const { count: contributorCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .not('github_username', 'is', null);

      // Get active mobile miners (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: activeMobileMiners } = await supabase
        .from('mining_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('is_mobile_worker', true)
        .gte('created_at', oneDayAgo);

      setStats({
        totalXMRMined,
        totalValueUSD,
        lockedXMR,
        lockedValueUSD,
        activeMobileMiners: activeMobileMiners || 0,
        totalContributors: contributorCount || 0,
        xmrPriceUSD: xmrPrice,
        lockThreshold,
        lockProgress: (lockedValueUSD / lockThreshold) * 100
      });

    } catch (error) {
      console.error("Error loading treasury stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchXMRPrice = async (): Promise<number> => {
    try {
      // Try CoinGecko first
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd');
      const data = await response.json();
      return data.monero?.usd || 150; // Fallback price
    } catch (error) {
      console.error("Error fetching XMR price:", error);
      return 150; // Fallback price
    }
  };

  if (loading) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Treasury Stats</CardTitle>
          <CardDescription>Loading treasury data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <DollarSign className="w-5 h-5 text-primary" />
          Treasury Stats
        </CardTitle>
        <CardDescription>
          Real-time treasury and MobileMonero mining statistics
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Total Treasury Value */}
          <div className="flex justify-between items-center p-4 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Coins className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total XMR Mined</p>
                <p className="text-lg font-bold text-foreground">
                  {stats.totalXMRMined.toFixed(4)} XMR
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">
                ${stats.totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground">
                @ ${stats.xmrPriceUSD.toFixed(2)}/XMR
              </p>
            </div>
          </div>

          {/* Locked XMR (First $1M from Mobile Workers) */}
          <div className="flex justify-between items-center p-4 rounded-lg bg-gradient-to-r from-orange-500/10 to-orange-500/5 border border-orange-500/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                <Lock className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Locked XMR (Mobile Workers)</p>
                <p className="text-lg font-bold text-foreground">
                  {stats.lockedXMR.toFixed(4)} XMR
                </p>
                <div className="mt-1">
                  <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500"
                      style={{ width: `${Math.min(stats.lockProgress, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.lockProgress.toFixed(1)}% of $1M goal
                  </p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-orange-500">
                ${stats.lockedValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground">
                Locked Forever
              </p>
            </div>
          </div>

          {/* Active Mobile Miners */}
          <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Active Mobile Miners (24h)</span>
            </div>
            <span className="font-medium text-foreground">{stats.activeMobileMiners}</span>
          </div>

          {/* Total Contributors */}
          <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Total Contributors</span>
            </div>
            <span className="font-medium text-foreground">{stats.totalContributors}</span>
          </div>

          {/* Lock Info Banner */}
          {stats.lockProgress < 100 && (
            <div className="mt-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">MobileMonero Lock Program</p>
                  <p>
                    The first $1M worth of XMR earned by MobileMonero workers is automatically locked 
                    in the treasury forever, ensuring long-term project sustainability and rewarding 
                    early mobile miners with permanent value capture.
                  </p>
                </div>
              </div>
            </div>
          )}

          {stats.lockProgress >= 100 && (
            <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-green-500 mb-1">🎉 Lock Goal Achieved!</p>
                  <p>
                    The $1M MobileMonero lock goal has been reached! These funds are permanently 
                    secured in the treasury, providing lasting value to the ecosystem.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
