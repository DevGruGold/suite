import { useState } from 'react';
import { ExecutiveMiniChat } from '@/components/ExecutiveMiniChat';
import { ExecutiveStatusIndicator } from '@/components/ExecutiveStatusIndicator';
import { UnifiedChat } from '@/components/UnifiedChat';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Zap, ArrowLeft } from 'lucide-react';
import { ExecutiveName, EXECUTIVE_PROFILES } from '@/components/ExecutiveBio';

const EXECUTIVES: ExecutiveName[] = ['vercel-ai-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat'];

const Council = () => {
  const [isCouncilMode, setIsCouncilMode] = useState(false);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Status indicator at top */}
      <div className="flex justify-end mb-4">
        <ExecutiveStatusIndicator />
      </div>

      {/* Page Title */}
      <div className="text-center space-y-4 mb-8">
        <h1 className="text-3xl md:text-4xl font-semibold text-foreground">
          Executive Board
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          {isCouncilMode 
            ? 'Full council deliberation - all executives engaged'
            : 'Chat directly with AI executives - each tile is an independent conversation'
          }
        </p>
        
        {!isCouncilMode && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Badge variant="secondary" className="text-xs">
              <Users className="w-3 h-3 mr-1" />
              4 Executives
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <Zap className="w-3 h-3 mr-1" />
              120+ Functions
            </Badge>
          </div>
        )}
      </div>

      {/* Council Mode - Full Width Chat */}
      {isCouncilMode ? (
        <div className="space-y-4">
          <Button 
            variant="ghost" 
            onClick={() => setIsCouncilMode(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Individual Chats
          </Button>

          {/* Council Mode Indicator */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="rounded-full w-12 h-12 flex items-center justify-center bg-primary/20 border-2 border-primary">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Executive Council</h3>
              <p className="text-sm text-muted-foreground">All 4 executives providing perspectives</p>
            </div>
            <div className="ml-auto flex gap-1">
              {EXECUTIVES.map((exec) => (
                <span key={exec} className="text-lg" title={EXECUTIVE_PROFILES[exec].fullTitle}>
                  {EXECUTIVE_PROFILES[exec].icon}
                </span>
              ))}
            </div>
          </div>

          <UnifiedChat 
            defaultCouncilMode={true}
            onBack={() => setIsCouncilMode(false)}
            className="h-[600px]"
          />
        </div>
      ) : (
        <>
          {/* 2x2 Grid of Executive Mini-Chats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {EXECUTIVES.map((executive) => (
              <ExecutiveMiniChat 
                key={executive} 
                executive={executive}
              />
            ))}
          </div>

          {/* Convene Council Button */}
          <div className="flex justify-center">
            <Button 
              size="lg"
              onClick={() => setIsCouncilMode(true)}
              className="gap-2"
            >
              <Users className="w-5 h-5" />
              Convene Full Council
            </Button>
          </div>

          {/* Info Section */}
          <Card className="mt-12 border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                How It Works
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Individual Chats</h4>
                  <p className="text-muted-foreground text-sm">
                    Each tile is an independent conversation. Chat with any executive directly for specialized expertise.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Council Mode</h4>
                  <p className="text-muted-foreground text-sm">
                    Convene the full board for complex decisions requiring multiple perspectives.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Persistent History</h4>
                  <p className="text-muted-foreground text-sm">
                    Conversations are saved locally. Return anytime to continue where you left off.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Edge Functions</h4>
                  <p className="text-muted-foreground text-sm">
                    Each executive can access 120+ autonomous functions for comprehensive operations.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default Council;
