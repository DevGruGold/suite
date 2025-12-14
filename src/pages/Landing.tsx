import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { SuiteLogo } from '@/components/SuiteLogo';
import { DemoVideoModal } from '@/components/DemoVideoModal';
import { LandingNav } from '@/components/LandingNav';
import { 
  Target, Code, BarChart3, FileText, 
  Users, Bot, Shield,
  ArrowRight, Play, CheckCircle2, Zap
} from 'lucide-react';

const executives = [
  {
    icon: Target,
    title: 'CSO',
    role: 'Chief Strategy Officer',
    description: 'Business strategy, market analysis, competitive intelligence',
    gradient: 'from-orange-500 to-red-500',
  },
  {
    icon: Code,
    title: 'CTO',
    role: 'Chief Technology Officer', 
    description: 'Architecture decisions, code reviews, technical roadmaps',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    icon: BarChart3,
    title: 'CIO',
    role: 'Chief Information Officer',
    description: 'Data insights, analytics, information governance',
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    icon: FileText,
    title: 'CAO',
    role: 'Chief Administrative Officer',
    description: 'Operations, compliance, administrative workflows',
    gradient: 'from-green-500 to-emerald-500',
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
      await signInWithGoogle();
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
            Replace Your{' '}
            <span className="bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
              C-Suite
            </span>
            <br />
            <span className="text-foreground/90">Not Your Workers</span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            AI Executive Council that saves <span className="text-primary font-semibold">$12.4M</span> annually 
            while enabling <span className="text-primary font-semibold">41% salary increases</span> for your employees.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Button 
              size="lg" 
              onClick={handleGetStarted}
              className="text-lg px-8 py-6 bg-primary hover:bg-primary/90"
            >
              Start Free Trial
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="text-lg px-8 py-6 border-primary/30 hover:border-primary/60 hover:bg-primary/5"
              onClick={() => setDemoOpen(true)}
            >
              <Play className="mr-2 w-5 h-5" />
              Watch Demo
            </Button>
          </div>

          {/* Stats Row - show final values immediately for fast scrollers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {benefits.map((benefit, i) => (
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
      <section id="executives" className="py-12 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/20 to-transparent" />
        
        <div className="container mx-auto max-w-6xl relative">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">Meet Your AI Executive Council</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Four specialized AI executives work together 24/7, making strategic decisions and executing autonomous workflows.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {executives.map((exec, i) => (
              <Card 
                key={i} 
                className="group hover:shadow-xl hover:-translate-y-2 transition-all duration-300 border-border/50 bg-card/80 overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${exec.gradient} opacity-0 group-hover:opacity-5 transition-opacity`} />
                
                <CardContent className="p-6 relative">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${exec.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg`}>
                    <exec.icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="text-2xl font-bold mb-1 group-hover:text-primary transition-colors">{exec.title}</div>
                  <div className="text-sm text-primary font-medium mb-3">{exec.role}</div>
                  <p className="text-sm text-muted-foreground">{exec.description}</p>
                  
                  <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${exec.gradient} transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left`} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Why Section */}
      <section id="benefits" className="py-12 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">Why Choose Suite AI?</h2>
            <p className="text-muted-foreground text-lg">Ethical AI that empowers workers, not replaces them.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              {[
                { title: 'Massive Cost Savings', desc: 'Average $12.4M saved by replacing expensive C-suite salaries with AI executives.' },
                { title: 'Employee Empowerment', desc: 'Savings redistributed as 41% average salary increases for workers.' },
                { title: 'Autonomous Operations', desc: '120+ edge functions execute tasks 24/7 without human intervention.' },
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
                <div className="text-xl text-muted-foreground mb-4">to start your free trial</div>
                <div className="text-sm text-muted-foreground mb-6">No credit card required</div>
                <Button onClick={handleGetStarted} className="w-full" size="lg">
                  Get Started Now
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-12 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/20 to-transparent" />
        
        <div className="container mx-auto max-w-4xl relative">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground text-lg">Get started in minutes, not months.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={i} className="text-center group">
                <div className="relative mx-auto mb-6">
                  {i < steps.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 left-full w-full h-0.5 bg-gradient-to-r from-primary/50 to-primary/10" />
                  )}
                  
                  <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform shadow-xl shadow-primary/20">
                    <span className="text-2xl font-bold text-primary-foreground">{step.number}</span>
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4 relative">
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-primary/10 rounded-full blur-xl" />
        </div>
        
        <div className="container mx-auto max-w-2xl text-center relative">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Ready to Transform Your Enterprise?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join forward-thinking companies already using Suite AI to save millions while empowering their workforce.
          </p>
          <Button 
            size="lg" 
            onClick={handleGetStarted}
            className="text-lg px-10 py-6 bg-primary hover:bg-primary/90"
          >
            Start Your Free Trial
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-border/50">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <SuiteLogo size="sm" />
              <span className="text-sm text-muted-foreground">© 2025 All rights reserved.</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link to="/licensing" className="hover:text-primary transition-colors">Enterprise</Link>
              <Link to="/governance" className="hover:text-primary transition-colors">Governance</Link>
            </div>
          </div>
        </div>
      </footer>

      <DemoVideoModal open={demoOpen} onOpenChange={setDemoOpen} />
    </div>
  );
}
