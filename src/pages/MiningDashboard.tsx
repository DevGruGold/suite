import LiveMiningStats from '@/components/LiveMiningStats';
import { TreasuryStats } from '@/components/TreasuryStats';
import { SEOHead } from '@/components/SEOHead';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const MiningDashboard = () => {
  return (
    <>
      <SEOHead
        title="Mining Dashboard | Suite"
        description="Dedicated mining operations dashboard with pooled hashrate, treasury progress, and worker activity."
        image="/og-image-contributors.svg"
        url="/mining-dashboard"
        keywords="mining dashboard, hashrate, workers, treasury, XMRT"
        twitterLabel1="⛏️ Mining"
        twitterData1="Dedicated"
        twitterLabel2="📊 Metrics"
        twitterData2="Live"
      />

      <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground">
            Mining Operations
          </h1>
          <p className="text-muted-foreground max-w-3xl">
            Live mining telemetry now loads only on this dedicated page so the main dashboard stays focused on system operations and chat responsiveness.
          </p>
        </div>

        <LiveMiningStats />

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <TreasuryStats />

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Why this page exists</CardTitle>
              <CardDescription>
                Mining polling is isolated here to reduce unnecessary background traffic elsewhere.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>• Main dashboard chat no longer starts mining-stat polling on load.</p>
              <p>• Mining requests reuse a shared 30-second client cache to avoid duplicate edge-function calls.</p>
              <p>• Treasury and worker views now read from the same cached mining snapshot.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default MiningDashboard;
