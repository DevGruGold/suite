import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, GitCommit, Cpu, Battery, Lightbulb, Users } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { IdeaSubmissionForm } from "@/components/IdeaSubmissionForm";
import { IdeaDashboard } from "@/components/IdeaDashboard";
import { ContributorDashboard } from "@/components/ContributorDashboard";
import { TreasuryStats } from "@/components/TreasuryStats";

const Earn = () => {
  return (
    <>
      <SEOHead
        title="Earn XMRT Tokens | Suite"
        description="Earn XMRT tokens through code contributions, mining, device charging, or idea submissions. Multiple pathways to participate in the Suite ecosystem."
        image="/og-image-contributors.svg"
        url="/earn"
        keywords="XMRT tokens, crypto rewards, GitHub contributions, mining, proof of participation, community treasury"
        twitterLabel1="💰 Earn"
        twitterData1="4 Ways"
        twitterLabel2="⚡ Rewards"
        twitterData2="Real-time"
      />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Page Title */}
        <div className="text-center space-y-4 mb-8">
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground">
            Earn & Contribute
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Multiple pathways to earn XMRT tokens: contribute code, mine crypto, charge your device, or submit ideas
          </p>
        </div>

        <Tabs defaultValue="contribute" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="contribute" className="gap-2">
              <GitCommit className="w-4 h-4" />
              <span className="hidden sm:inline">Contribute</span>
            </TabsTrigger>
            <TabsTrigger value="treasury" className="gap-2">
              <DollarSign className="w-4 h-4" />
              <span className="hidden sm:inline">Treasury</span>
            </TabsTrigger>
            <TabsTrigger value="ideas" className="gap-2">
              <Lightbulb className="w-4 h-4" />
              <span className="hidden sm:inline">Ideas</span>
            </TabsTrigger>
            <TabsTrigger value="community" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Community</span>
            </TabsTrigger>
          </TabsList>

          {/* Contribute Tab - GitHub, Mining, Chargers */}
          <TabsContent value="contribute">
            <ContributorDashboard />
          </TabsContent>

          {/* Treasury Tab - NOW WITH REAL STATS */}
          <TabsContent value="treasury">
            <div className="grid gap-6 md:grid-cols-2">
              {/* REPLACED STATIC TREASURY STATS WITH REAL COMPONENT */}
              <TreasuryStats />

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">Purchase Crypto</CardTitle>
                  <CardDescription>
                    Buy cryptocurrency directly with fiat to fund your participation
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div style={{ width: "100%", height: "600px" }}>
                    <iframe
                      src="https://buy.onramper.com?color=3b82f6&apiKey=pk_prod_01HMVZ8HJ2E7XQFVT2VVJMVZ0Q"
                      title="Onramper widget"
                      height="600px"
                      width="100%"
                      allow="accelerometer; autoplay; camera; gyroscope; payment"
                      className="rounded-lg"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Ideas Tab */}
          <TabsContent value="ideas">
            <IdeaSubmissionForm />
          </TabsContent>

          {/* Community Tab */}
          <TabsContent value="community">
            <IdeaDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default Earn;
