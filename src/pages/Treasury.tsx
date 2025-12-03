import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { IdeaSubmissionForm } from "@/components/IdeaSubmissionForm";
import { IdeaDashboard } from "@/components/IdeaDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MobileNav } from "@/components/MobileNav";
import { Button } from "@/components/ui/button";
import { ArrowLeft, DollarSign, Lightbulb, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Treasury = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <MobileNav />
      
      {/* Header */}
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 max-w-7xl">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Page Title */}
        <div className="text-center space-y-4 mb-8">
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground">
            {t('treasury.title')}
          </h1>
          <p className="text-muted-foreground">{t('treasury.description')}</p>
        </div>

        <Tabs defaultValue="treasury" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="treasury" className="gap-2">
              <DollarSign className="w-4 h-4" />
              <span className="hidden sm:inline">Treasury</span>
            </TabsTrigger>
            <TabsTrigger value="submit" className="gap-2">
              <Lightbulb className="w-4 h-4" />
              <span className="hidden sm:inline">Submit Idea</span>
            </TabsTrigger>
            <TabsTrigger value="ideas" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Community</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="treasury">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">{t('treasury.purchase.title')}</CardTitle>
                  <CardDescription>
                    {t('treasury.description')}
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

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">{t('treasury.stats.title')}</CardTitle>
                  <CardDescription>
                    {t('treasury.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                      <span className="text-sm text-muted-foreground">{t('treasury.stats.tvl')}</span>
                      <span className="font-medium text-primary">$0.00</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                      <span className="text-sm text-muted-foreground">{t('treasury.stats.contributors')}</span>
                      <span className="font-medium text-primary">0</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="submit">
            <IdeaSubmissionForm />
          </TabsContent>

          <TabsContent value="ideas">
            <IdeaDashboard />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Treasury;