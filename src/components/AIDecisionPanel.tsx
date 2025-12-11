import React, { useState } from 'react';
import { Bot, CheckCircle, XCircle, Scale, Code, Copy, Download, Lightbulb, Rocket, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { toast } from '@/hooks/use-toast';

export interface DecisionReport {
  id: string;
  proposal_id: string;
  decision: string;
  reasoning: string;
  decision_method: string;
  weighted_score_approve: number;
  weighted_score_reject: number;
  executive_votes: Record<string, any>;
  community_votes: Record<string, number>;
  total_executive_votes: number;
  total_community_votes: number;
  created_at: string;
}

export interface ImplementationAnalysis {
  decision_summary?: string;
  implementation_plan?: string[];
  generated_code?: string;
  next_steps?: string[];
  improvement_suggestions?: string[];
  rejection_reasons?: string[];
  category?: string;
  complexity?: string;
}

interface AIDecisionPanelProps {
  decision: DecisionReport;
  implementationAnalysis?: ImplementationAnalysis | null;
  functionName: string;
}

export const AIDecisionPanel: React.FC<AIDecisionPanelProps> = ({
  decision,
  implementationAnalysis,
  functionName
}) => {
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);
  
  const isApproved = decision.decision === 'approved';
  const totalWeightedScore = decision.weighted_score_approve + decision.weighted_score_reject;
  const approvePercentage = totalWeightedScore > 0 
    ? (decision.weighted_score_approve / totalWeightedScore) * 100 
    : 50;

  const executiveApprovals = Object.values(decision.executive_votes || {}).filter((v: any) => v === 'approve' || v?.vote === 'approve').length;
  const executiveRejections = Object.values(decision.executive_votes || {}).filter((v: any) => v === 'reject' || v?.vote === 'reject').length;
  
  // Handle both {approve: n, reject: n} and {approvals: n, rejections: n} formats
  const communityApprovals = (decision.community_votes as any)?.approve ?? (decision.community_votes as any)?.approvals ?? 0;
  const communityRejections = (decision.community_votes as any)?.reject ?? (decision.community_votes as any)?.rejections ?? 0;

  const copyToClipboard = () => {
    if (implementationAnalysis?.generated_code) {
      navigator.clipboard.writeText(implementationAnalysis.generated_code);
      toast({ title: 'Copied', description: 'Code copied to clipboard' });
    }
  };

  const downloadCode = () => {
    if (implementationAnalysis?.generated_code) {
      const blob = new Blob([implementationAnalysis.generated_code], { type: 'text/typescript' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${functionName}.ts`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`rounded-lg border-2 p-4 space-y-4 ${
      isApproved 
        ? 'bg-green-500/5 border-green-500/30' 
        : 'bg-red-500/5 border-red-500/30'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bot className={`h-5 w-5 ${isApproved ? 'text-green-500' : 'text-red-500'}`} />
          <span className="font-semibold text-sm">AI Decision:</span>
          <Badge className={`${
            isApproved 
              ? 'bg-green-500 text-white hover:bg-green-600' 
              : 'bg-red-500 text-white hover:bg-red-600'
          }`}>
            {isApproved ? (
              <><CheckCircle className="h-3 w-3 mr-1" /> APPROVED</>
            ) : (
              <><XCircle className="h-3 w-3 mr-1" /> REJECTED</>
            )}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDate(decision.created_at)}
        </span>
      </div>

      {/* Reasoning Quote */}
      <div className={`p-3 rounded-md border ${
        isApproved ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'
      }`}>
        <p className="text-sm italic text-muted-foreground leading-relaxed">
          "{decision.reasoning}"
        </p>
      </div>

      {/* Weighted Vote Breakdown */}
      <div className="space-y-3 p-3 rounded-md bg-muted/30 border border-border">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Weighted Vote Breakdown</span>
        </div>

        {/* Visual Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="text-green-600">Approve: {decision.weighted_score_approve} pts</span>
            <span className="text-red-600">Reject: {decision.weighted_score_reject} pts</span>
          </div>
          <div className="h-3 rounded-full bg-red-500/20 overflow-hidden">
            <div 
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${approvePercentage}%` }}
            />
          </div>
        </div>

        {/* Vote Details */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="font-medium">Executive (×10)</span>
            </div>
            <div className="flex gap-2">
              <span className="text-green-600">✓ {executiveApprovals}</span>
              <span className="text-red-600">✗ {executiveRejections}</span>
              <span className="text-muted-foreground">({decision.total_executive_votes} voted)</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="font-medium">Community (×1)</span>
            </div>
            <div className="flex gap-2">
              <span className="text-green-600">✓ {communityApprovals}</span>
              <span className="text-red-600">✗ {communityRejections}</span>
              <span className="text-muted-foreground">({decision.total_community_votes} voted)</span>
            </div>
          </div>
        </div>

        {/* Decision Method */}
        <div className="pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground">
            <strong>Decision Method:</strong> {decision.decision_method || 'Weighted Algorithm'}
          </span>
        </div>
      </div>

      {/* Approved: Implementation Details */}
      {isApproved && implementationAnalysis && (
        <div className="space-y-3 p-3 rounded-md bg-green-500/5 border border-green-500/20">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-green-700">Implementation Plan</span>
          </div>

          {implementationAnalysis.category && (
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                Category: {implementationAnalysis.category}
              </Badge>
              {implementationAnalysis.complexity && (
                <Badge variant="outline" className="text-xs">
                  Complexity: {implementationAnalysis.complexity}
                </Badge>
              )}
            </div>
          )}

          {implementationAnalysis.next_steps && implementationAnalysis.next_steps.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Next Steps:</span>
              <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-0.5 pl-1">
                {implementationAnalysis.next_steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {implementationAnalysis.generated_code && (
            <Dialog open={codeDialogOpen} onOpenChange={setCodeDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Code className="h-4 w-4" />
                  View Generated Code
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Generated Code: {functionName}
                  </DialogTitle>
                </DialogHeader>
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs font-mono">
                  <code>{implementationAnalysis.generated_code}</code>
                </pre>
                <div className="flex gap-2 mt-4">
                  <Button onClick={copyToClipboard} size="sm" variant="outline">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Code
                  </Button>
                  <Button onClick={downloadCode} size="sm" variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* Rejected: Improvement Guidance */}
      {!isApproved && implementationAnalysis && (
        <div className="space-y-3 p-3 rounded-md bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-700">Improvement Suggestions</span>
          </div>

          {implementationAnalysis.rejection_reasons && implementationAnalysis.rejection_reasons.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Rejection Reasons:</span>
              <ul className="text-xs text-muted-foreground space-y-0.5 pl-1">
                {implementationAnalysis.rejection_reasons.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <XCircle className="h-3 w-3 mt-0.5 text-red-500 shrink-0" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {implementationAnalysis.improvement_suggestions && implementationAnalysis.improvement_suggestions.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">How to Improve:</span>
              <ul className="text-xs text-muted-foreground space-y-0.5 pl-1">
                {implementationAnalysis.improvement_suggestions.map((suggestion, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Lightbulb className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-2 border-t border-amber-500/20">
            <p className="text-xs text-muted-foreground">
              <strong>🔄 Resubmission:</strong> You can resubmit after addressing the feedback above.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
