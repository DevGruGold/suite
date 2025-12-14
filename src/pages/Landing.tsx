import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { SuiteAnimatedLogo, SuiteAnimatedIcon } from '@/components/SuiteAnimatedLogo';
import { DemoVideoModal } from '@/components/DemoVideoModal';
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

// Animated counter component
function AnimatedCounter({ value, suffix = '' }: { value: string; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState('0');
  const ref = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const numericValue = parseFloat(value.replace(/[^0-9.]/g, ''));
          const duration = 2000;
          const startTime = performance.now();

          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 4);
            const current = numericValue * eased;

            if (value.includes('.')) {
              setDisplayValue(current.toFixed(1));
            } else {
              setDisplayValue(Math.floor(current).toString());
            }

            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              setDisplayValue(value.replace(/[^0-9.]/g, ''));
            }
          };

          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, hasAnimated]);

  const prefix = value.startsWith('$') ? '$' : '';
  const actualSuffix = value.endsWith('%') ? '%' : value.endsWith('+') ? '+' : suffix;

  return (
    <div ref={ref} className="text-2xl md:text-3xl font-bold">
      {prefix}{displayValue}{actualSuffix}
    </div>
  );
}

export default function Landing() {
  const { signInWithGoogle, isAuthenticated } = useAuth();
  const [demoOpen, setDemoOpen] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Mouse tracking for spotlight effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleGetStarted = async () => {
    if (isAuthenticated) {
      window.location.href = '/dashboard';
    } else {
      await signInWithGoogle();
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
        
        {/* Morphing gradient blobs */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/15 rounded-full blur-3xl animate-morph" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-accent/15 rounded-full blur-3xl animate-morph" style={{ animationDelay: "-4s" }} />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-float" />
        
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--primary)/0.02)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black,transparent)]" />
        
        {/* Mouse spotlight */}
        <div 
          className="pointer-events-none absolute w-96 h-96 rounded-full bg-primary/5 blur-3xl transition-all duration-500 ease-out"
          style={{ 
            left: mousePosition.x - 192, 
            top: mousePosition.y - 192,
          }} 
        />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/60 border-b border-border/30">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <SuiteAnimatedLogo size="sm" />
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Button 
              size="sm" 
              onClick={handleGetStarted} 
              className="bg-primary hover:bg-primary/90 relative overflow-hidden group"
            >
              <span className="relative z-10">Start Free Trial</span>
              <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/80 to-primary opacity-0 group-hover:opacity-100 transition-opacity" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-28 pb-20 px-4">
        <div className="container mx-auto text-center max-w-5xl">
          {/* Animated hero logo */}
          <div className="flex justify-center mb-8 animate-fade-in">
            <SuiteAnimatedLogo size="xl" showWordmark={false} />
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight animate-fade-in">
            Replace Your{' '}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-primary via-primary/80 to-primary bg-[length:200%_auto] bg-clip-text text-transparent animate-text-shimmer">
                C-Suite
              </span>
              {/* Glow effect under text */}
              <div className="absolute -inset-x-4 -bottom-2 h-4 bg-primary/20 blur-xl" />
            </span>
            <br />
            <span className="text-foreground/90">Not Your Workers</span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: "0.1s" }}>
            AI Executive Council that saves <span className="text-primary font-semibold">$12.4M</span> annually 
            while enabling <span className="text-primary font-semibold">41% salary increases</span> for your employees.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <Button 
              size="lg" 
              onClick={handleGetStarted}
              className="relative text-lg px-8 py-6 group overflow-hidden bg-primary hover:bg-primary"
            >
              <span className="relative z-10 flex items-center">
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
              {/* Animated shine effect */}
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="text-lg px-8 py-6 group border-primary/30 hover:border-primary/60 hover:bg-primary/5"
              onClick={() => setDemoOpen(true)}
            >
              <Play className="mr-2 w-5 h-5 group-hover:scale-110 transition-transform" />
              Watch Demo
            </Button>
          </div>

          {/* Stats Row with animated counters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {benefits.map((benefit, i) => (
              <div 
                key={i} 
                className="group p-5 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/40 hover:bg-card/80 transition-all duration-300 animate-fade-in hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
                style={{ animationDelay: `${0.3 + i * 0.1}s` }}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 group-hover:bg-primary/20 transition-all">
                  <benefit.icon className="w-5 h-5 text-primary" />
                </div>
                <AnimatedCounter value={benefit.value} />
                <div className="text-xs text-muted-foreground mt-1">{benefit.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What Section - AI Executives */}
      <section className="py-24 px-4 relative">
        {/* Section background accent */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/30 to-transparent" />
        
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
                className="group relative hover:shadow-2xl hover:-translate-y-3 transition-all duration-500 border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden animate-fade-in"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                {/* Hover glow effect */}
                <div className={`absolute inset-0 bg-gradient-to-br ${exec.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
                
                <CardContent className="p-6 relative">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${exec.gradient} flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg`}>
                    <exec.icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="text-2xl font-bold mb-1 group-hover:text-primary transition-colors">{exec.title}</div>
                  <div className="text-sm text-primary font-medium mb-3">{exec.role}</div>
                  <p className="text-sm text-muted-foreground">{exec.description}</p>
                  
                  {/* Bottom accent line */}
                  <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${exec.gradient} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left`} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Why Section */}
      <section className="py-24 px-4">
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
                  className="group flex gap-4 p-5 rounded-2xl hover:bg-muted/50 border border-transparent hover:border-border/50 transition-all duration-300 animate-fade-in"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 group-hover:scale-110 transition-all">
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
              {/* Animated glow background */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-accent/20 rounded-3xl blur-3xl animate-pulse-subtle" />
              
              <div className="relative bg-card border border-border/50 rounded-3xl p-8 text-center animate-tilt-3d">
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
      <section className="py-24 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/30 to-transparent" />
        
        <div className="container mx-auto max-w-4xl relative">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground text-lg">Get started in minutes, not months.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div 
                key={i} 
                className="text-center group animate-fade-in"
                style={{ animationDelay: `${i * 0.15}s` }}
              >
                <div className="relative mx-auto mb-6">
                  {/* Connector line */}
                  {i < steps.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 left-full w-full h-0.5 bg-gradient-to-r from-primary/50 to-primary/10" />
                  )}
                  
                  <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mx-auto group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-xl shadow-primary/20">
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
      <section className="py-32 px-4 relative">
        {/* Animated background */}
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl animate-pulse-subtle" />
        </div>
        
        <div className="container mx-auto max-w-2xl text-center relative">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 animate-fade-in">
            Ready to Transform Your Enterprise?
          </h2>
          <p className="text-muted-foreground text-lg mb-10 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            Join forward-thinking companies using AI to empower their workforce.
          </p>
          <Button 
            size="lg" 
            onClick={handleGetStarted}
            className="text-lg px-12 py-7 group relative overflow-hidden bg-primary hover:bg-primary animate-fade-in"
            style={{ animationDelay: "0.2s" }}
          >
            <span className="relative z-10 flex items-center">
              Start Your Free Trial
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </Button>
          <p className="text-sm text-muted-foreground mt-6 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            No credit card required • Cancel anytime
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border/30 backdrop-blur-sm">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <SuiteAnimatedIcon animate={false} />
            <span>© 2024 Suite AI. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <Link to="/licensing" className="hover:text-foreground transition-colors">Enterprise</Link>
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          </div>
        </div>
      </footer>

      {/* Demo Video Modal */}
      <DemoVideoModal open={demoOpen} onOpenChange={setDemoOpen} />
    </div>
  );
}