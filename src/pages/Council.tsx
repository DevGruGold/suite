import { useState } from 'react';
import { ExecutiveDirectory } from '@/components/ExecutiveDirectory';
import { ExecutiveStatusIndicator } from '@/components/ExecutiveStatusIndicator';
import { UnifiedChat } from '@/components/UnifiedChat';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Zap, Activity, ArrowLeft } from 'lucide-react';
import { ExecutiveName, EXECUTIVE_PROFILES } from '@/components/ExecutiveBio';

const Council = () => {
  // State for selected executive or council mode
  const [activeExecutive, setActiveExecutive] = useState<ExecutiveName | null>(null);
  const [isCouncilMode, setIsCouncilMode] = useState(false);

  const handleExecutiveSelect = (executive: ExecutiveName) => {
    setActiveExecutive(executive);
    setIsCouncilMode(false);
  };

  const handleCouncilConvene = () => {
    setActiveExecutive(null);
    setIsCouncilMode(true);
  };

  const handleBack = () => {
    setActiveExecutive(null);
    setIsCouncilMode(false);
  };

  // Show chat interface when an executive is selected or council is convened
  const showChat = activeExecutive || isCouncilMode;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Status indicator at top */}
      <div className="flex justify-end mb-4">
        <ExecutiveStatusIndicator />
      </div>

      {/* Page Title */}
      <div className="text-center space-y-4 mb-8">
        <div className="flex items-center justify-center gap-3">
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground">
            Executive Board
          </h1>
        </div>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          {showChat 
            ? isCouncilMode 
              ? 'Full council deliberation - all executives engaged'
              : `Speaking with ${EXECUTIVE_PROFILES[activeExecutive!]?.fullTitle}`
            : 'Meet the AI leadership team managing autonomous operations'
          }
        </p>
        
        {!showChat && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Badge variant="secondary" className="text-xs">
              <Users className="w-3 h-3 mr-1" />
              Individual Consultation
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <Activity className="w-3 h-3 mr-1" />
              Group Deliberation
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <Zap className="w-3 h-3 mr-1" />
              120+ Functions
            </Badge>
          </div>
        )}
      </div>

      {/* Chat Interface - shown when executive is selected or council convened */}
      {showChat && (
        <div className="mb-8">
          {/* Back Button */}
          <Button 
            variant="ghost" 
            onClick={handleBack}
            className="mb-4 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Directory
          </Button>

          {/* Active Executive Indicator */}
          {activeExecutive && EXECUTIVE_PROFILES[activeExecutive] && (
            <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div 
                className="rounded-full w-12 h-12 flex items-center justify-center text-2xl"
                style={{
                  backgroundColor: `hsl(var(--executive-${EXECUTIVE_PROFILES[activeExecutive].colorClass.replace('executive-', '')}) / 0.2)`,
                  borderWidth: 2,
                  borderStyle: 'solid',
                  borderColor: `hsl(var(--executive-${EXECUTIVE_PROFILES[activeExecutive].colorClass.replace('executive-', '')}))`
                }}
              >
                {EXECUTIVE_PROFILES[activeExecutive].icon}
              </div>
              <div>
                <h3 className="font-medium text-foreground">{EXECUTIVE_PROFILES[activeExecutive].fullTitle}</h3>
                <p className="text-sm text-muted-foreground">{EXECUTIVE_PROFILES[activeExecutive].specialty}</p>
              </div>
              <Badge variant="outline" className="ml-auto">
                {EXECUTIVE_PROFILES[activeExecutive].model}
              </Badge>
            </div>
          )}

          {/* Council Mode Indicator */}
          {isCouncilMode && (
            <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="rounded-full w-12 h-12 flex items-center justify-center bg-primary/20 border-2 border-primary">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Executive Council</h3>
                <p className="text-sm text-muted-foreground">All 4 executives providing perspectives</p>
              </div>
              <div className="ml-auto flex gap-1">
                {Object.values(EXECUTIVE_PROFILES).map((exec, i) => (
                  <span key={i} className="text-lg" title={exec.fullTitle}>{exec.icon}</span>
                ))}
              </div>
            </div>
          )}

          {/* Embedded Chat */}
          <UnifiedChat 
            selectedExecutive={activeExecutive || undefined}
            defaultCouncilMode={isCouncilMode}
            onBack={handleBack}
            className="h-[600px]"
          />
        </div>
      )}

      {/* Executive Directory - shown when no executive is selected */}
      {!showChat && (
        <>
          <ExecutiveDirectory 
            onExecutiveSelect={handleExecutiveSelect}
            onCouncilConvene={handleCouncilConvene}
            selectedExecutive={activeExecutive}
          />

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
                  <h4 className="font-medium text-foreground">Individual Mode</h4>
                  <p className="text-muted-foreground text-sm">
                    Select a specific executive for specialized expertise. Each is optimized for their domain.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Council Mode</h4>
                  <p className="text-muted-foreground text-sm">
                    Convene the full board for complex decisions requiring multiple perspectives.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Intelligent Routing</h4>
                  <p className="text-muted-foreground text-sm">
                    Let the system automatically route requests to the best executive based on task type.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Edge Functions</h4>
                  <p className="text-muted-foreground text-sm">
                    The board coordinates 120+ autonomous functions for comprehensive operations.
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
