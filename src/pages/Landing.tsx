import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Target, Code, BarChart3, FileText, 
  Sparkles, Users, Bot, Shield,
  ArrowRight, Play, CheckCircle2
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
  { icon: Sparkles, value: '$12.4M', label: 'Average C-Suite Savings' },
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
  const { signInWithGoogle, isAuthenticated } = useAuth();

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
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-primary/5 to-transparent rounded-full" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">Suite AI</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Button size="sm" onClick={handleGetStarted} className="bg-gradient-to-r from-primary to-accent hover:opacity-90">
              Start Free Trial
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 animate-fade-in">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Ethical AI for Enterprise</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight animate-fade-in">
            Replace Your{' '}
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent bg-[length:200%_auto] animate-[gradient_3s_linear_infinite]">
              C-Suite
            </span>
            <br />
            Not Your Workers
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-fade-in delay-100">
            AI Executive Council that saves <span className="text-primary font-semibold">$12.4M</span> annually 
            while enabling <span className="text-primary font-semibold">41% salary increases</span> for your employees.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12 animate-fade-in delay-200">
            <Button 
              size="lg" 
              onClick={handleGetStarted}
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-lg px-8 py-6 group"
            >
              Start Free Trial
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6 group">
              <Play className="mr-2 w-5 h-5" />
              Watch Demo
            </Button>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto animate-fade-in delay-300">
            {benefits.map((benefit, i) => (
              <div key={i} className="p-4 rounded-xl bg-card/50 backdrop-blur border border-border/50 hover:border-primary/50 transition-colors">
                <benefit.icon className="w-6 h-6 text-primary mx-auto mb-2" />
                <div className="text-2xl md:text-3xl font-bold">{benefit.value}</div>
                <div className="text-xs text-muted-foreground">{benefit.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What Section - AI Executives */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Meet Your AI Executive Council</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Four specialized AI executives work together 24/7, making strategic decisions and executing autonomous workflows.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {executives.map((exec, i) => (
              <Card 
                key={i} 
                className="group hover:shadow-xl hover:-translate-y-2 transition-all duration-300 border-border/50 bg-card/80 backdrop-blur overflow-hidden"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <CardContent className="p-6">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${exec.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <exec.icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="text-2xl font-bold mb-1">{exec.title}</div>
                  <div className="text-sm text-primary font-medium mb-3">{exec.role}</div>
                  <p className="text-sm text-muted-foreground">{exec.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Why Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Choose Suite AI?</h2>
            <p className="text-muted-foreground">Ethical AI that empowers workers, not replaces them.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              {[
                { title: 'Massive Cost Savings', desc: 'Average $12.4M saved by replacing expensive C-suite salaries with AI executives.' },
                { title: 'Employee Empowerment', desc: 'Savings redistributed as 41% average salary increases for workers.' },
                { title: 'Autonomous Operations', desc: '120+ edge functions execute tasks 24/7 without human intervention.' },
              ].map((item, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors">
                  <CheckCircle2 className="w-6 h-6 text-primary shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl blur-2xl" />
              <div className="relative bg-card border border-border rounded-2xl p-6 h-full flex flex-col justify-center">
                <div className="text-center">
                  <div className="text-5xl font-bold text-primary mb-2">$0</div>
                  <div className="text-muted-foreground mb-4">to start your free trial</div>
                  <div className="text-sm text-muted-foreground">No credit card required</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground">Get started in minutes, not months.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={i} className="text-center group">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <span className="text-xl font-bold text-primary-foreground">{step.number}</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-2xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Transform Your Enterprise?
          </h2>
          <p className="text-muted-foreground mb-8">
            Join forward-thinking companies using AI to empower their workforce.
          </p>
          <Button 
            size="lg" 
            onClick={handleGetStarted}
            className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-lg px-12 py-6 group"
          >
            Start Your Free Trial
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>
          <p className="text-sm text-muted-foreground mt-4">No credit card required • Cancel anytime</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border/50">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            <span>© 2024 Suite AI. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <Link to="/licensing" className="hover:text-foreground transition-colors">Enterprise</Link>
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
