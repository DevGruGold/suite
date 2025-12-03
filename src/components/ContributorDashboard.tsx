import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, GitCommit, DollarSign, TrendingUp } from 'lucide-react';
import { GitHubPATInput } from './GitHubContributorRegistration';
import { SkeletonCard, SkeletonList } from './ui/skeleton-card';

interface Contributor {
  github_username: string;
  wallet_address: string;
  total_contributions: number;
  total_xmrt_earned: number;
  avg_validation_score: number;
  target_repo_owner: string;
  target_repo_name: string;
}

interface Contribution {
  id: string;
  contribution_type: string;
  github_url: string;
  validation_score: number | null;
  xmrt_earned: number;
  is_validated: boolean;
  is_harmful: boolean;
  created_at: string;
}

export const ContributorDashboard = () => {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [myContributions, setMyContributions] = useState<Contribution[]>([]);
  const [showPATInput, setShowPATInput] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    
    // Real-time subscription
    const channel = supabase
      .channel('contributor-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'github_contributors'
      }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch top contributors
    const { data: contributorsData } = await supabase
      .from('github_contributors')
      .select('*')
      .eq('is_active', true)
      .order('total_xmrt_earned', { ascending: false })
      .limit(10);

    if (contributorsData) {
      setContributors(contributorsData);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6" aria-busy="true">
        <SkeletonCard lines={2} showHeader={true} />
        <SkeletonList items={5} />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="w-8 h-8 text-suite-warning" aria-hidden="true" />
            Team Contribution Program
          </h1>
          <p className="text-muted-foreground mt-2">
            Earn Suite Credits by contributing to the ecosystem. Configure your GitHub access, make improvements, get rewarded.
          </p>
        </div>
      </header>

      {/* Setup Card */}
      {!showPATInput ? (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 card-interactive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCommit className="w-5 h-5" aria-hidden="true" />
              Get Started
            </CardTitle>
            <CardDescription>
              Configure your GitHub access and wallet address to start earning Suite Credits
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => setShowPATInput(true)}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 hover:shadow-md transition-all duration-200 active:scale-[0.98]"
              aria-label="Open GitHub and wallet configuration"
            >
              Configure GitHub & Wallet
            </button>
          </CardContent>
        </Card>
      ) : (
        <GitHubPATInput onKeyValidated={() => setShowPATInput(false)} />
      )}

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5" aria-hidden="true" />
            Top Contributors
          </CardTitle>
          <CardDescription>
            Team leaders earning Suite Credits through validated contributions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4" role="list" aria-label="Contributor leaderboard">
            {contributors.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No contributors yet. Be the first to earn Suite Credits!
              </p>
            ) : (
              contributors.map((contributor, index) => (
                <div
                  key={contributor.github_username}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                  role="listitem"
                >
                  <div className="flex items-center gap-4">
                    <div 
                      className={`text-2xl font-bold ${
                        index === 0 ? 'text-suite-warning' :
                        index === 1 ? 'text-muted-foreground' :
                        index === 2 ? 'text-orange-600' :
                        'text-muted-foreground'
                      }`}
                      aria-label={`Rank ${index + 1}`}
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
                    <div>
                      <div className="text-sm text-muted-foreground">Contributions</div>
                      <div className="font-semibold">{contributor.total_contributions}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Avg Score</div>
                      <div className="font-semibold">
                        {contributor.avg_validation_score?.toFixed(0) || 'N/A'}/100
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <DollarSign className="w-3 h-3" aria-hidden="true" />
                        Credits Earned
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

      {/* How it Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" aria-hidden="true" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-6" role="list" aria-label="Steps to get started">
            <div className="space-y-2" role="listitem">
              <div className="text-4xl font-bold text-primary" aria-hidden="true">1</div>
              <h3 className="font-semibold">Configure Your Setup</h3>
              <p className="text-sm text-muted-foreground">
                Add your GitHub access token, select a target repository, and connect your wallet address
              </p>
            </div>
            <div className="space-y-2" role="listitem">
              <div className="text-4xl font-bold text-primary" aria-hidden="true">2</div>
              <h3 className="font-semibold">Make Contributions</h3>
              <p className="text-sm text-muted-foreground">
                Use Suite Assistant to create commits, issues, PRs, and discussions. All contributions are validated for quality and safety
              </p>
            </div>
            <div className="space-y-2" role="listitem">
              <div className="text-4xl font-bold text-primary" aria-hidden="true">3</div>
              <h3 className="font-semibold">Earn Suite Credits</h3>
              <p className="text-sm text-muted-foreground">
                Get rewarded automatically based on validation scores. Exceptional work (90+) earns 1.5x bonus!
              </p>
            </div>
          </div>

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-semibold mb-2">Reward Structure</h4>
            <ul className="text-sm space-y-1 text-muted-foreground" aria-label="Reward tiers">
              <li>• Pull Requests: 500 Credits base (up to 750 for exceptional)</li>
              <li>• Commits: 100 Credits base (up to 150 for exceptional)</li>
              <li>• Issues: 50 Credits base (up to 75 for exceptional)</li>
              <li>• Discussions: 25 Credits base (up to 37.5 for exceptional)</li>
              <li>• Comments: 10 Credits base (up to 15 for exceptional)</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-3">
              * All contributions are validated by Suite AI. Harmful contributions result in zero rewards and may lead to suspension after 3 violations.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
