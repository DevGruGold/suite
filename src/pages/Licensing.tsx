import { useState } from "react";
import { Building2, Users, DollarSign, Shield, ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import LicenseApplicationForm from "@/components/LicenseApplicationForm";
import LicenseTierCards from "@/components/LicenseTierCards";
import SavingsCalculator from "@/components/SavingsCalculator";
import SEOHead from "@/components/SEOHead";
import { useLanguage } from "@/contexts/LanguageContext";

const Licensing = () => {
  const { t } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>("free_trial");

  const handleTierSelect = (tier: string) => {
    setSelectedTier(tier);
    setShowForm(true);
  };

  const handleChatWithEliza = () => {
    // Navigate to home and open chat with licensing context
    window.location.href = "/?chat=licensing";
  };

  return (
    <>
      <SEOHead 
        title="Replace Your C-Suite, Not Your Workers | Suite"
        description="AI executives save companies $12.4M in executive costs - redistributed as 41% raises to every employee. Ethical AI that empowers workers."
        image="/suite-social-card.svg"
        url="/licensing"
      />
      <div className="min-h-screen bg-background">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-10 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5" />
        <div className="relative max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary mb-6">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-medium">{t('licensing.hero.badge')}</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
            {t('licensing.hero.title')}
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            {t('licensing.hero.subtitle')}
          </p>

          {/* Key Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12">
            <Card className="bg-card/50 backdrop-blur border-primary/20">
              <CardContent className="pt-6 text-center">
                <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-500" />
                <p className="text-3xl font-bold text-green-500">$12.4M</p>
                <p className="text-sm text-muted-foreground">{t('licensing.stats.savings')}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur border-primary/20">
              <CardContent className="pt-6 text-center">
                <Users className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                <p className="text-3xl font-bold text-blue-500">41%</p>
                <p className="text-sm text-muted-foreground">{t('licensing.stats.salary')}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur border-primary/20">
              <CardContent className="pt-6 text-center">
                <Building2 className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                <p className="text-3xl font-bold text-purple-500">5</p>
                <p className="text-sm text-muted-foreground">{t('licensing.stats.executives')}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => setShowForm(true)} className="gap-2">
              {t('licensing.button.apply')} <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={handleChatWithEliza} className="gap-2">
              <MessageCircle className="w-4 h-4" /> {t('licensing.button.chat')}
            </Button>
          </div>
        </div>
      </section>

      {/* Savings Calculator */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">{t('licensing.calculator.title')}</h2>
          <SavingsCalculator />
        </div>
      </section>

      {/* Tier Cards */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">{t('licensing.tiers.title')}</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            {t('licensing.tiers.subtitle')}
          </p>
          <LicenseTierCards onSelectTier={handleTierSelect} selectedTier={selectedTier} />
        </div>
      </section>

      {/* Application Form */}
      {showForm && (
        <section className="py-16 px-4 bg-muted/30" id="application-form">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">{t('licensing.form.title')}</CardTitle>
                <CardDescription>
                  {t('licensing.form.subtitle')}
                  {' '}{t('licensing.form.chat.prompt')} <button onClick={handleChatWithEliza} className="text-primary hover:underline">{t('licensing.form.chat.link')}</button>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LicenseApplicationForm selectedTier={selectedTier} onTierChange={setSelectedTier} />
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Ethical Commitment Section */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-background">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Shield className="w-6 h-6 text-primary" />
                {t('licensing.commitment.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <p>
                {t('licensing.commitment.p1')}
              </p>
              <p>
                {t('licensing.commitment.p2')}
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>{t('licensing.commitment.li1')}</li>
                <li>{t('licensing.commitment.li2')}</li>
                <li>{t('licensing.commitment.li3')}</li>
                <li>{t('licensing.commitment.li4')}</li>
              </ul>
              <p className="pt-4 text-foreground font-medium">
                {t('licensing.commitment.footer')}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
      </div>
    </>
  );
};

export default Licensing;