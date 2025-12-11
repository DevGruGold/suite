import { useState } from "react";
import { Building2, Users, DollarSign, Shield, ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import LicenseApplicationForm from "@/components/LicenseApplicationForm";
import LicenseTierCards from "@/components/LicenseTierCards";
import SavingsCalculator from "@/components/SavingsCalculator";
import SEOHead from "@/components/SEOHead";

const Licensing = () => {
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
        <section className="relative overflow-hidden py-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5" />
        <div className="relative max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary mb-6">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-medium">Ethical AI Licensing</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
            Replace Your C-Suite,<br />Not Your Workers
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Our AI Executive Board delivers Fortune 500 leadership capabilities at a fraction of the cost. 
            The difference? <span className="text-primary font-semibold">100% of savings go to your employees.</span>
          </p>

          {/* Key Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12">
            <Card className="bg-card/50 backdrop-blur border-primary/20">
              <CardContent className="pt-6 text-center">
                <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-500" />
                <p className="text-3xl font-bold text-green-500">$12.4M</p>
                <p className="text-sm text-muted-foreground">Average Annual Savings</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur border-primary/20">
              <CardContent className="pt-6 text-center">
                <Users className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                <p className="text-3xl font-bold text-blue-500">41%</p>
                <p className="text-sm text-muted-foreground">Employee Salary Increase</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur border-primary/20">
              <CardContent className="pt-6 text-center">
                <Building2 className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                <p className="text-3xl font-bold text-purple-500">4</p>
                <p className="text-sm text-muted-foreground">AI Executives (CSO, CTO, CIO, CAO)</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => setShowForm(true)} className="gap-2">
              Start Application <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={handleChatWithEliza} className="gap-2">
              <MessageCircle className="w-4 h-4" /> Talk to Eliza Instead
            </Button>
          </div>
        </div>
      </section>

      {/* Savings Calculator */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">Calculate Your Savings</h2>
          <SavingsCalculator />
        </div>
      </section>

      {/* Tier Cards */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Choose Your License Tier</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            Every tier includes our ethical commitment: savings from AI executive replacement 
            must be redistributed to employees, not shareholders.
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
                <CardTitle className="text-2xl">Corporate License Application</CardTitle>
                <CardDescription>
                  Complete this form to apply for our ethical AI executive licensing program.
                  Prefer conversation? <button onClick={handleChatWithEliza} className="text-primary hover:underline">Let Eliza guide you through it.</button>
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
                Our Ethical Commitment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <p>
                The XMRT AI Executive Licensing Model is built on a simple principle: 
                <strong className="text-foreground"> AI should enhance humans, not replace them.</strong>
              </p>
              <p>
                When you license our AI executives, you agree to our downward redistribution mandate:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>100% of executive compensation savings must be redistributed to employees</li>
                <li>No layoffs allowed as a condition of the license</li>
                <li>Quarterly compliance audits ensure adherence</li>
                <li>Public transparency reports showcase your commitment</li>
              </ul>
              <p className="pt-4 text-foreground font-medium">
                This isn't just good ethics—it's good business. Companies in our program report 
                higher employee satisfaction, lower turnover, and stronger productivity.
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