import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Users, Clock, TrendingUp, Zap } from 'lucide-react';
import { EXECUTIVE_PROFILES, ExecutiveName } from './ExecutiveBio';
import { useAPIKeyHealth } from '@/services/credentialManager';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';

interface ExecutiveDirectoryProps {
  onExecutiveSelect?: (executive: ExecutiveName) => void;
  onCouncilConvene?: () => void;
}

export const ExecutiveDirectory: React.FC<ExecutiveDirectoryProps> = ({ 
  onExecutiveSelect,
  onCouncilConvene 
}) => {
  const { health, loading } = useAPIKeyHealth();

  const getExecutiveStatus = (serviceName: string) => {
    const serviceMap: Record<string, string> = {
      'vercel-ai-chat': 'vercel_ai',
      'deepseek-chat': 'deepseek',
      'gemini-chat': 'gemini',
      'openai-chat': 'openai'
    };
    
    const mappedService = serviceMap[serviceName];
    const service = health.find(h => h.service_name === mappedService);
    
    if (!service) return { status: 'unknown', color: 'bg-muted' };
    if (service.is_healthy && !service.expiry_warning) return { status: 'online', color: 'bg-mining-active' };
    if (service.is_healthy && service.expiry_warning) return { status: 'warning', color: 'bg-mining-warning' };
    return { status: 'offline', color: 'bg-destructive' };
  };

  const executives = Object.entries(EXECUTIVE_PROFILES);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Users className="w-8 h-8 text-primary" />
          <h2 className="text-3xl font-bold text-foreground">Suite Executive Board</h2>
        </div>
        <p className="text-muted-foreground">
          Engage with AI Executives individually or convene the full board for group deliberation
        </p>
      </div>

      {/* Executive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {executives.map(([key, exec]) => {
          const { status, color } = getExecutiveStatus(key);
          
          return (
            <Card key={key} className="border-border hover:border-primary/50 transition-all hover:shadow-lg">
              <CardHeader className="text-center pb-4">
                <div className="flex flex-col items-center gap-2">
                  {/* Avatar */}
                  <div 
                    className={`rounded-full w-16 h-16 flex items-center justify-center bg-${exec.color}-500/20 border-4 border-${exec.color}-500 text-3xl`}
                    style={{
                      backgroundColor: `hsl(var(--executive-${exec.colorClass.replace('executive-', '')}) / 0.2)`,
                      borderColor: `hsl(var(--executive-${exec.colorClass.replace('executive-', '')}))`
                    }}
                  >
                    {exec.icon}
                  </div>
                  
                  {/* Title */}
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{exec.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{exec.fullTitle}</p>
                  </div>
                  
                  {/* Status */}
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${color}`} />
                    <span className="text-xs text-muted-foreground capitalize">{status}</span>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                {/* Specialty */}
                <div className="text-center">
                  <Badge variant="secondary" className="text-xs">
                    {exec.specialty}
                  </Badge>
                </div>
                
                {/* Model */}
                <p className="text-xs text-center text-muted-foreground">
                  Powered by {exec.model}
                </p>
                
                {/* Response Time */}
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{exec.responseTime}</span>
                </div>
                
                {/* Actions */}
                <div className="space-y-2">
                  <Button 
                    size="sm" 
                    className="w-full"
                    onClick={() => onExecutiveSelect?.(key as ExecutiveName)}
                    disabled={status === 'offline'}
                  >
                    <Zap className="w-3 h-3 mr-2" />
                    Chat Now
                  </Button>
                  
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full text-xs">
                        View Profile
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <span className="text-2xl">{exec.icon}</span>
                          {exec.fullTitle}
                        </DialogTitle>
                        <DialogDescription>
                          {exec.specialty} • {exec.model}
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-4 pt-4">
                        <div>
                          <h4 className="font-semibold text-sm mb-2">About</h4>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {exec.bio}
                          </p>
                        </div>
                        
                        <div>
                          <h4 className="font-semibold text-sm mb-2">Core Strengths</h4>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {exec.strengths.map((strength, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <TrendingUp className="w-3 h-3 mt-0.5 text-primary flex-shrink-0" />
                                <span>{strength}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        <div>
                          <h4 className="font-semibold text-sm mb-2">Best For</h4>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {exec.bestFor.map((use, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-primary">•</span>
                                <span>{use}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        <Button 
                          className="w-full"
                          onClick={() => {
                            onExecutiveSelect?.(key as ExecutiveName);
                          }}
                          disabled={status === 'offline'}
                        >
                          Start 1-on-1 Chat
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Convene Council Button */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-full w-12 h-12 flex items-center justify-center bg-primary/20 border-2 border-primary">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Full Council Deliberation</h3>
              <p className="text-sm text-muted-foreground">
                Engage all 4 executives for comprehensive analysis and synthesis
              </p>
            </div>
          </div>
          <Button 
            size="lg" 
            onClick={onCouncilConvene}
            className="min-w-[200px]"
          >
            <Users className="w-4 h-4 mr-2" />
            Convene Council
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
