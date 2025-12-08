import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, GitCommit, DollarSign, TrendingUp, Cpu, Battery, Zap, ExternalLink, CheckCircle, XCircle, Clock } from 'lucide-react';
import { GitHubPATInput } from './GitHubContributorRegistration';
import { SkeletonCard } from './ui/skeleton-card';
import MiningLeaderboard from './MiningLeaderboard';
import XMRTChargerLeaderboard from './XMRTChargerLeaderboard';
import { Badge } from './ui/badge';

interface Contributor {
  github_username: string;
  wallet_address: string;
  total_contributions: number;
  total_xmrt_earned: number;
  avg_validation_score: number;
  target_repo_owner: string;
  target_repo_name: string;
  last_contribution_at?: string;
}

interface Contribution {
  id: string;
  github_username: string;
  contribution_type: string;
  repo_name: string;
  repo_owner: string;
  is_validated: boolean;
  validation_score: number | null;
  xmrt_earned: number;
  created_at: string;
  github_url?: string;
}

interface SummaryStats {
  githubContributors: number;
  githubCredits: number;
  miningWorkers: number;
  totalHashrate: number;
  chargerDevices: number;
  totalPopPoints: number;
}

export const ContributorDashboard = () => {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [recentContributions, setRecentContributions] = useState<Contribution[]>([]);
  const [showPATInput, setShowPATInput] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SummaryStats>({
    githubContributors: 0,
    githubCredits: 0,
    miningWorkers: 0,
    totalHashrate: 0,
    chargerDevices: 0,
    totalPopPoints: 0
  });

  useEffect(() => {
    fetchData();
    
    const channel = supabase
      .channel('contributor-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'github_contributors'
      }, () => fetchData())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'github_contributions'
      }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch GitHub contributors
    const { data: contributorsData } = await supabase
      .from('github_contributors')
      .select('*')
      .eq('is_active', true)
      .order('total_xmrt_earned', { ascending: false })
      .limit(10);

    if (contributorsData) {
      setContributors(contributorsData);
      
      // Calculate GitHub stats
      const totalCredits = contributorsData.reduce((sum, c) => sum + Number(c.total_xmrt_earned || 0), 0);
      setStats(prev => ({
        ...prev,
        githubContributors: contributorsData.length,
        githubCredits: totalCredits
      }));
    }

    // Fetch recent contributions with XMRT earned
    const { data: contributionsData } = await supabase
      .from('github_contributions')
      .select('id, github_username, contribution_type, repo_name, repo_owner, is_validated, validation_score, xmrt_earned, created_at, github_url')
      .order('created_at', { ascending: false })
      .limit(20);

    if (contributionsData) {
      setRecentContributions(contributionsData);
    }

    // Fetch mining stats
    try {
      const { data: miningData } = await supabase.functions.invoke('mining-proxy');
      if (miningData) {
        const workers = Array.isArray(miningData.workers) ? miningData.workers : [];
        
        if (workers.length > 0) {
          // Use individual workers from pool
          const totalHash = workers.reduce((sum: number, w: any) => sum + (w.hash || w.hashrate || 0), 0);
          setStats(prev => ({
            ...prev,
            miningWorkers: workers.length,
            totalHashrate: totalHash
          }));
        } else if (miningData.hash || miningData.hashrate) {
          // Fallback to global stats when workers array is empty
          setStats(prev => ({
            ...prev,
            miningWorkers: 1,
            totalHashrate: miningData.hash || miningData.hashrate || 0
          }));
        }
      }
    } catch (e) {
      console.log('Mining stats unavailable');
    }

    // Fetch charger stats
    try {
      const { data: chargerData } = await supabase.rpc('get_xmrt_charger_leaderboard', { limit_count: 100 });
      if (chargerData) {
        const totalPop = chargerData.reduce((sum: number, c: any) => sum + (c.pop_points || 0), 0);
        setStats(prev => ({
          ...prev,
          chargerDevices: chargerData.length,
          totalPopPoints: totalPop
        }));
      }
    } catch (e) {
      console.log('Charger stats unavailable');
    }

    setLoading(false);
  };

  const formatHashrate = (h: number) => {
    if (h >= 1000000) return `${(h / 1000000).toFixed(2)} MH/s`;
    if (h >= 1000) return `${(h / 1000).toFixed(2)} KH/s`;
    return `${h.toFixed(0)} H/s`;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6" aria-busy="true">
        <SkeletonCard lines={2} showHeader={true} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold flex items-center justify-center gap-3">
          <Trophy className="w-10 h-10 text-suite-warning" aria-hidden="true" />
          Team Contributions
        </h1>
        <p className="text-muted-foreground mt-3 text-lg max-w-2xl mx-auto">
          Earn Suite Credits through code contributions, mining, and device charging
        </p>
      </header>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/20">
                <GitCommit className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">GitHub Contributors</p>
                <p className="text-2xl font-bold">{stats.githubContributors}</p>
                <p className="text-xs text-primary">{stats.githubCredits.toLocaleString()} Credits Earned</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-orange-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-orange-500/20">
                <Cpu className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Mining Workers</p>
                <p className="text-2xl font-bold">{stats.miningWorkers}</p>
                <p className="text-xs text-orange-500">{formatHashrate(stats.totalHashrate)} Total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-500/20">
                <Battery className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Device Chargers</p>
                <p className="text-2xl font-bold">{stats.chargerDevices}</p>
                <p className="text-xs text-green-500">{stats.totalPopPoints.toLocaleString()} PoP Points</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="github" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="github" className="flex items-center gap-2">
            <GitCommit className="w-4 h-4" />
            <span className="hidden sm:inline">GitHub</span>
            <span className="sm:hidden">Code</span>
          </TabsTrigger>
          <TabsTrigger value="mining" className="flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            <span className="hidden sm:inline">Mining</span>
            <span className="sm:hidden">Mine</span>
          </TabsTrigger>
          <TabsTrigger value="chargers" className="flex items-center gap-2">
            <Battery className="w-4 h-4" />
            <span className="hidden sm:inline">Chargers</span>
            <span className="sm:hidden">Charge</span>
          </TabsTrigger>
        </TabsList>

        {/* GitHub Tab */}
        <TabsContent value="github" className="space-y-6">
          {/* Setup Card */}
          {!showPATInput ? (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCommit className="w-5 h-5" />
                  Get Started with GitHub Contributions
                </CardTitle>
                <CardDescription>
                  Configure your GitHub access and wallet address to start earning Suite Credits
                </CardDescription>
              </CardHeader>
              <CardContent>
                <button
                  onClick={() => setShowPATInput(true)}
                  className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all"
                >
                  Configure GitHub & Wallet
                </button>
              </CardContent>
            </Card>
          ) : (
            <GitHubPATInput onKeyValidated={() => setShowPATInput(false)} />
          )}

          {/* GitHub Leaderboard */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-suite-warning" />
                Top GitHub Contributors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {contributors.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No contributors yet. Be the first to earn Suite Credits!
                  </p>
                ) : (
                  contributors.map((contributor, index) => (
                    <div
                      key={contributor.github_username}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div 
                          className={`text-2xl font-bold w-10 ${
                            index === 0 ? 'text-suite-warning' :
                            index === 1 ? 'text-muted-foreground' :
                            index === 2 ? 'text-orange-600' :
                            'text-muted-foreground'
                          }`}
                        >
                          #{index + 1}
                        </div>
                        <div>
                          <div className="font-semibold">@{contributor.github_username}</div>
                          <div className="text-sm text-muted-foreground">
                            {contributor.target_repo_owner}/{contributor.target_repo_name}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-6 text-right">
                        <div className="hidden sm:block">
                          <div className="text-sm text-muted-foreground">Contributions</div>
                          <div className="font-semibold">{contributor.total_contributions}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1 justify-end">
                            <DollarSign className="w-3 h-3" />
                            Credits
                          </div>
                          <div className="font-bold text-primary">
                            {Number(contributor.total_xmrt_earned).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Contributions with XMRT */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              Recent Contributions
            </CardTitle>
            <CardDescription>
              Latest validated contributions and XMRT rewards
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentContributions.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  No contributions yet. Start contributing to earn XMRT!
                </p>
              ) : (
                recentContributions.map((contribution) => (
                  <div
                    key={contribution.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {contribution.is_validated ? (
                        contribution.xmrt_earned > 0 ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-destructive" />
                        )
                      ) : (
                        <Clock className="w-5 h-5 text-muted-foreground animate-pulse" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">@{contribution.github_username}</span>
                          <Badge variant="outline" className="text-xs">
                            {contribution.contribution_type}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {contribution.repo_owner}/{contribution.repo_name}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {contribution.validation_score !== null && (
                        <div className="text-sm">
                          <span className={
                            contribution.validation_score >= 90 ? 'text-green-500' :
                            contribution.validation_score >= 70 ? 'text-primary' :
                            contribution.validation_score >= 50 ? 'text-suite-warning' :
                            'text-destructive'
                          }>
                            {contribution.validation_score}/100
                          </span>
                        </div>
                      )}
                      <div className="text-right min-w-[80px]">
                        <div className="font-bold text-primary">
                          +{contribution.xmrt_earned.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">XMRT</div>
                      </div>
                      {contribution.github_url && (
                        <a
                          href={contribution.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

          {/* How it Works */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                How GitHub Contributions Work
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="text-4xl font-bold text-primary">1</div>
                  <h3 className="font-semibold">Configure Your Setup</h3>
                  <p className="text-sm text-muted-foreground">
                    Add your GitHub access token and connect your wallet address
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-4xl font-bold text-primary">2</div>
                  <h3 className="font-semibold">Make Contributions</h3>
                  <p className="text-sm text-muted-foreground">
                    Create commits, issues, PRs, and discussions. All contributions are validated
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-4xl font-bold text-primary">3</div>
                  <h3 className="font-semibold">Earn Suite Credits</h3>
                  <p className="text-sm text-muted-foreground">
                    Get rewarded automatically. Exceptional work (90+) earns 1.5x bonus!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mining Tab */}
        <TabsContent value="mining" className="space-y-6">
          <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-orange-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-orange-500" />
                MobileMonero.com Mining Pool
              </CardTitle>
              <CardDescription>
                Mine Monero (XMR) directly from your mobile device and earn rewards
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a
                href="https://mobilemonero.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all"
              >
                <Zap className="w-4 h-4" />
                Start Mining on MobileMonero.com
                <ExternalLink className="w-4 h-4" />
              </a>
            </CardContent>
          </Card>

          <MiningLeaderboard />
        </TabsContent>

        {/* Chargers Tab */}
        <TabsContent value="chargers" className="space-y-6">
          <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-green-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Battery className="w-5 h-5 text-green-500" />
                XMRT Charger Program
              </CardTitle>
              <CardDescription>
                Earn PoP (Proof of Power) points by charging your devices while connected to Suite
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div className="p-3 rounded-lg bg-green-500/10">
                  <div className="font-semibold">Connect Device</div>
                  <p className="text-muted-foreground">Plug in and start a charging session</p>
                </div>
                <div className="p-3 rounded-lg bg-green-500/10">
                  <div className="font-semibold">Earn PoP Points</div>
                  <p className="text-muted-foreground">Based on efficiency and duration</p>
                </div>
                <div className="p-3 rounded-lg bg-green-500/10">
                  <div className="font-semibold">Climb Leaderboard</div>
                  <p className="text-muted-foreground">Top chargers earn bonus rewards</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <XMRTChargerLeaderboard />
        </TabsContent>
      </Tabs>
    </div>
  );
};
