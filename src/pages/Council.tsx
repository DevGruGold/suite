import { useNavigate } from 'react-router-dom';
import { ExecutiveDirectory } from '@/components/ExecutiveDirectory';
import { ExecutiveStatusIndicator } from '@/components/ExecutiveStatusIndicator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Zap, Activity } from 'lucide-react';
import { ExecutiveName } from '@/components/ExecutiveBio';

const Council = () => {
  const navigate = useNavigate();

  const handleExecutiveSelect = (executive: ExecutiveName) => {
    navigate('/', { state: { selectedExecutive: executive } });
  };

  const handleCouncilConvene = () => {
    navigate('/', { state: { councilMode: true } });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Status indicator at top */}
      <div className="flex justify-end mb-4">
        <ExecutiveStatusIndicator />
      </div>

      {/* Page Title */}
      <div className="text-center space-y-4 mb-12">
        <div className="flex items-center justify-center gap-3">
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground">
            Executive Board
          </h1>
        </div>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Meet the AI leadership team managing autonomous operations
        </p>
        
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
      </div>

      {/* Executive Directory */}
      <ExecutiveDirectory 
        onExecutiveSelect={handleExecutiveSelect}
        onCouncilConvene={handleCouncilConvene}
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
    </div>
  );
};

export default Council;
