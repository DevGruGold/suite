import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { SuiteLogo } from '@/components/SuiteLogo';
import { DemoVideoModal } from '@/components/DemoVideoModal';
import { LandingNav } from '@/components/LandingNav';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Users, Bot, Shield,
  ArrowRight, Play, CheckCircle2, Zap
} from 'lucide-react';

const executives = [
  {
    name: 'Dr. Anya Sharma',
    title: 'CTO',
    role: 'Chief Technology Officer',
    description: 'AI/ML strategy, technical architecture, ethical AI, subagent orchestration',
    gradient: 'from-blue-500 to-cyan-500',
    photo: '/executives/anya.png',
  },
  {
    name: 'Mr. Omar Al-Farsi',
    title: 'CFO',
    role: 'Chief Financial Officer',
    description: 'Treasury management, global markets, tokenomics, fiscal strategy',
    gradient: 'from-amber-500 to-yellow-500',
    photo: '/executives/omar.png',
  },
  {
    name: 'Ms. Isabella Rodriguez',
    title: 'CMO',
    role: 'Chief Marketing Officer',
    description: 'Brand storytelling, viral growth, consumer psychology, content strategy',
    gradient: 'from-pink-500 to-rose-500',
    photo: '/executives/bella.png',
  },
  {
    name: 'Mr. Klaus Richter',
    title: 'COO',
    role: 'Chief Operations Officer',
    description: 'Process optimization, agent pipelines, operational excellence',
    gradient: 'from-slate-500 to-gray-600',
    photo: '/executives/klaus.png',
  },
  {
    name: 'Ms. Akari Tanaka',
    title: 'CPO',
    role: 'Chief People Officer',
    description: 'Talent development, inclusive culture, community governance',
    gradient: 'from-teal-500 to-emerald-500',
    photo: '/executives/akari.png',
  },
];

const benefits = [
  { icon: Zap, value: '$12.4M', label: 'Average C-Suite Savings' },
  { icon: Users, value: '41%', label: 'Employee Salary Increase' },
  { icon: Bot, value: '120+', label: 'Autonomous Functions' },
  { icon: Shield, value: '24/7', label: 'Always-On Operations' },
];

const steps = [
  { number: '01', title: 'Sign Up', description: 'Create your account in seconds with Google' },
  { number: '02', title: 'Chat with Executives', description: 'Describe your needs to AI council members' },
  { number: '03', title: 'Watch It Work', description: 'Autonomous agents execute tasks in real-time' },
];

export default function Landing() {
  const navigate = useNavigate();
  const { signInWithGoogle, isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();
  const [demoOpen, setDemoOpen] = useState(false);

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleGetStarted = async () => {
    if (isAuthenticated) {
      window.location.href = '/dashboard';
    } else {
      window.location.href = '/signup'; // <--- This will correctly redirect to the signup/OAuth screen
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Lightweight Background - reduced blur for performance */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />

        {/* Single animated blob - reduced from 3 */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-xl opacity-60" />

        {/* Grid pattern - lighter */}
        <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--primary)/0.015)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.015)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black,transparent)]" />
      </div>

      {/* Navigation with Auth Modal */}
      <LandingNav />

      {/* Hero Section */}
      <section className="pt-24 pb-10 px-4">
        <div className="container mx-auto text-center max-w-5xl">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            {t('landing.hero.title.part1')}{' '}
            <span className="bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
              {t('landing.hero.title.part2')}
            </span>
            <br />
            <span className="text-foreground/90">{t('landing.hero.title.part3')}</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            {t('landing.hero.subtitle')}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Button
              size="lg"
              onClick={handleGetStarted}
              className="text-lg px-8 py-6 bg-primary hover:bg-primary/90"
            >
              {t('landing.hero.start.trial')}
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-6 border-primary/30 hover:border-primary/60 hover:bg-primary/5"
              onClick={() => setDemoOpen(true)}
            >
              <Play className="mr-2 w-5 h-5" />
              {t('landing.hero.watch.demo')}
            </Button>
          </div>

          {/* Stats Row - show final values immediately for fast scrollers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { icon: Zap, value: '$12.4M', label: t('landing.stats.savings') },
              { icon: Users, value: '41%', label: t('landing.stats.salary') },
              { icon: Bot, value: '120+', label: t('landing.stats.functions') },
              { icon: Shield, value: '24/7', label: t('landing.stats.operations') },
            ].map((benefit, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl bg-card/50 border border-border/50 hover:border-primary/40 hover:bg-card/80 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <benefit.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="text-2xl md:text-3xl font-bold">{benefit.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{benefit.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Executives Section */}
      <section id="executives" className="py-12 px-4 relative scroll-mt-20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/20 to-transparent" />

        <div className="container mx-auto max-w-6xl relative">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">{t('landing.executives.title')}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              {t('landing.executives.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
            {executives.map((exec, i) => (
              <Card
                key={i}
                className="group hover:shadow-xl hover:-translate-y-2 transition-all duration-300 border-border/50 bg-card/80 overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${exec.gradient} opacity-0 group-hover:opacity-5 transition-opacity`} />

                <CardContent className="p-6 relative text-center">
                  {/* Portrait photo with gradient fallback */}
                  <div className="relative mx-auto mb-4 w-20 h-20">
                    <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${exec.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform overflow-hidden border-2 border-primary/20`}>
                      <img
                        src={exec.photo}
                        alt={exec.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                      <span className="text-3xl hidden items-center justify-center w-full h-full"></span>
                    </div>
                    {/* Online indicator */}
                    <div className="absolute bottom-1 right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />
                  </div>
                  <div className="text-base font-bold mb-0.5 group-hover:text-primary transition-colors leading-tight">{exec.name}</div>
                  <div className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 bg-gradient-to-r ${exec.gradient} text-white`}>{exec.title}</div>
                  <div className="text-xs text-primary font-medium mb-2">{exec.role}</div>
                  <p className="text-xs text-muted-foreground">{exec.description}</p>

                  <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${exec.gradient} transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left`} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Why Section */}
      <section id="benefits" className="py-12 px-4 scroll-mt-20">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">{t('landing.benefits.title')}</h2>
            <p className="text-muted-foreground text-lg">{t('landing.benefits.subtitle')}</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              {[
                { title: t('landing.benefits.cost.title'), desc: t('landing.benefits.cost.desc') },
                { title: t('landing.benefits.empowerment.title'), desc: t('landing.benefits.empowerment.desc') },
                { title: t('landing.benefits.autonomous.title'), desc: t('landing.benefits.autonomous.desc') },
              ].map((item, i) => (
                <div
                  key={i}
                  className="group flex gap-4 p-5 rounded-2xl hover:bg-muted/50 border border-transparent hover:border-border/50 transition-colors"
                >
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1 group-hover:text-primary transition-colors">{item.title}</h3>
                    <p className="text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-accent/15 rounded-3xl blur-xl" />

              <div className="relative bg-card border border-border/50 rounded-3xl p-8 text-center">
                <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <div className="text-6xl md:text-7xl font-bold text-primary mb-3">$0</div>
                <div className="text-xl text-muted-foreground mb-4">{t('landing.trial.title')}</div>
                <div className="text-sm text-muted-foreground mb-6">{t('landing.trial.description')}</div>
                <Button
                  size="lg"
                  onClick={handleGetStarted}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  {t('landing.trial.button')}
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-12 px-4 scroll-mt-20">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">{t('landing.howitworks.title')}</h2>
            <p className="text-muted-foreground text-lg">{t('landing.howitworks.subtitle')}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-primary">
                  {step.number}
                </div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">{t('landing.cta.title')}</h2>
          <p className="text-lg text-muted-foreground mb-8">{t('landing.cta.subtitle')}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={handleGetStarted}
              className="text-lg px-8 py-6 bg-primary hover:bg-primary/90"
            >
              {t('landing.cta.button.primary')}
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-6"
              onClick={() => setDemoOpen(true)}
            >
              <Play className="mr-2 w-5 h-5" />
              {t('landing.cta.button.secondary')}
            </Button>
          </div>
        </div>
      </section>

      {/* Demo Video Modal */}
      <DemoVideoModal open={demoOpen} onOpenChange={setDemoOpen} />
    </div>
  );
}
