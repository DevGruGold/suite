import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { 
  ChevronDown, 
  ChevronUp, 
  CheckCircle, 
  XCircle, 
  MinusCircle,
  User,
  Clock,
  Sparkles,
  Users,
  Loader2,
  AlertCircle,
  Lightbulb,
  Rocket,
  MessageSquare
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { VoteProgress } from './VoteProgress';
import { VotingPhaseIndicator } from './VotingPhaseIndicator';
import { ProposalComments } from './ProposalComments';
import { AIDecisionPanel, DecisionReport, ImplementationAnalysis } from './AIDecisionPanel';

interface Proposal {
  id: string;
  function_name: string;
  description: string;
  rationale: string;
  use_cases: any;
  proposed_by: string;
  status: string;
  created_at: string;
  updated_at: string;
  implementation_code?: string | null;
  category?: string;
  voting_phase?: string;
  executive_deadline?: string | null;
  community_deadline?: string | null;
}

interface ExecutiveVote {
  id: string;
  proposal_id: string;
  executive_name: string;
  vote: string;
  reasoning: string;
  created_at: string;
  session_key?: string;
}

interface ProposalCardProps {
  proposal: Proposal;
  votes: ExecutiveVote[];
  decisionReport?: DecisionReport;
  onVoteSuccess: () => void;
}

const statusColors: Record<string, string> = {
  voting: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  approved: 'bg-green-500/10 text-green-600 border-green-500/30',
  rejected: 'bg-red-500/10 text-red-600 border-red-500/30',
  rejected_with_feedback: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  queued_for_deployment: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  deployed: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  pending: 'bg-muted text-muted-foreground border-border',
};

const statusLabels: Record<string, string> = {
  voting: 'VOTING',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  rejected_with_feedback: 'FEEDBACK READY',
  queued_for_deployment: 'QUEUED',
  deployed: 'DEPLOYED',
  pending: 'PENDING',
};

const executiveColors: Record<string, string> = {
  CSO: 'text-purple-500',
  CTO: 'text-blue-500',
  CIO: 'text-green-500',
  CAO: 'text-orange-500',
  COMMUNITY: 'text-pink-500',
};

export const ProposalCard: React.FC<ProposalCardProps> = ({ 
  proposal, 
  votes,
  decisionReport,
  onVoteSuccess 
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [voting, setVoting] = useState(false);
  const [userVote, setUserVote] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<any>(null);
  const [implementationAnalysis, setImplementationAnalysis] = useState<ImplementationAnalysis | null>(null);

  useEffect(() => {
    if (proposal.implementation_code) {
      try {
        const parsed = JSON.parse(proposal.implementation_code as string);
        // Check if it's feedback (rejected) or implementation analysis (approved)
        if (parsed.improvement_suggestions || parsed.rejection_reasons) {
          setFeedback(parsed);
          setImplementationAnalysis(parsed);
        } else if (parsed.generated_code || parsed.implementation_plan || parsed.next_steps) {
          setImplementationAnalysis(parsed);
        } else {
          setFeedback(parsed);
        }
      } catch (e) {
        // Not JSON - might be raw code
        if (proposal.status === 'approved' || proposal.status === 'queued_for_deployment') {
          setImplementationAnalysis({ generated_code: proposal.implementation_code as string });
        }
      }
    }
  }, [proposal]);

  const getSessionKey = () => {
    let sessionKey = localStorage.getItem('governance_session_key');
    if (!sessionKey) {
      sessionKey = `community_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('governance_session_key', sessionKey);
    }
    return sessionKey;
  };

  useEffect(() => {
    const sessionKey = getSessionKey();
    const existingVote = votes.find(
      v => v.executive_name === 'COMMUNITY' && v.session_key === sessionKey
    );
    if (existingVote) {
      setUserVote(existingVote.vote);
    }
  }, [votes]);

  const executiveVotes = votes.filter(v => ['CSO', 'CTO', 'CIO', 'CAO'].includes(v.executive_name));
  const communityVotes = votes.filter(v => v.executive_name === 'COMMUNITY');
  
  const executiveApprovals = executiveVotes.filter(v => v.vote === 'approve').length;
  const executiveRejections = executiveVotes.filter(v => v.vote === 'reject').length;
  const executiveAbstentions = executiveVotes.filter(v => v.vote === 'abstain').length;
  
  const communityApprovals = communityVotes.filter(v => v.vote === 'approve').length;
  const communityRejections = communityVotes.filter(v => v.vote === 'reject').length;

  const handleVote = async (vote: 'approve' | 'reject' | 'abstain') => {
    setVoting(true);
    try {
      const sessionKey = getSessionKey();

      const { data, error } = await supabase.functions.invoke('vote-on-proposal', {
        body: {
          proposal_id: proposal.id,
          executive_name: 'COMMUNITY',
          vote,
          reasoning: `Community member vote: ${vote}`,
          session_key: sessionKey
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setUserVote(vote);
      toast({
        title: '✅ Vote Recorded',
        description: userVote 
          ? `Your vote changed to ${vote}.`
          : `Your ${vote} vote has been recorded.`,
      });

      if (data?.consensus_reached) {
        toast({
          title: data.status === 'approved' ? '🎉 Proposal Approved!' : '❌ Proposal Rejected',
          description: `Executive consensus reached (${data.vote_summary.executive.approvals}/4 approvals).`,
        });
      }

      onVoteSuccess();
    } catch (error: any) {
      console.error('Vote failed:', error);
      toast({
        title: 'Vote Failed',
        description: error.message || 'Failed to record vote',
        variant: 'destructive'
      });
    } finally {
      setVoting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const canVote = proposal.status === 'voting' && 
    (proposal.voting_phase === 'community' || !proposal.voting_phase);

  return (
    <Card className="border border-border hover:border-primary/30 transition-colors">
      <CardHeader className="p-4 sm:pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <CardTitle className="text-base sm:text-lg break-words">{proposal.function_name}</CardTitle>
              <Badge variant="outline" className={`${statusColors[proposal.status] || statusColors.pending} shrink-0`}>
                {statusLabels[proposal.status] || proposal.status.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {proposal.proposed_by}
              </span>
              <span className="text-border hidden sm:inline">•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(proposal.created_at)}
              </span>
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-0 space-y-4">
        {/* Voting Phase Indicator with Countdown */}
        {proposal.status === 'voting' && (
          <VotingPhaseIndicator 
            phase={proposal.voting_phase || 'executive'}
            executiveDeadline={proposal.executive_deadline}
            communityDeadline={proposal.community_deadline}
            status={proposal.status}
          />
        )}

        {/* Description */}
        <p className="text-sm">{proposal.description}</p>

        {/* AI Decision Panel - Show for decided proposals */}
        {decisionReport && (proposal.status === 'approved' || proposal.status === 'rejected' || 
          proposal.status === 'rejected_with_feedback' || proposal.status === 'queued_for_deployment' || 
          proposal.status === 'deployed') && (
          <AIDecisionPanel 
            decision={decisionReport}
            implementationAnalysis={implementationAnalysis}
            functionName={proposal.function_name}
          />
        )}

        {/* Executive Vote Progress */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium">Executive Council (3/4 needed)</p>
          <VoteProgress 
            approvals={executiveApprovals} 
            rejections={executiveRejections} 
            abstentions={executiveAbstentions}
            required={3}
          />
        </div>

        {/* Community Vote Stats */}
        {communityVotes.length > 0 && (
          <div className="flex items-center gap-3 sm:gap-4 text-sm flex-wrap">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-pink-500" />
              <span className="text-muted-foreground text-xs sm:text-sm">Community:</span>
            </div>
            <span className="text-green-600 text-xs sm:text-sm">✓ {communityApprovals}</span>
            <span className="text-red-600 text-xs sm:text-sm">✗ {communityRejections}</span>
            <span className="text-muted-foreground text-xs">({communityVotes.length} total)</span>
          </div>
        )}

        {/* Voting Buttons - Stack on mobile */}
        {canVote && (
          <div className="space-y-2">
            {executiveVotes.length < 4 && executiveVotes.length > 0 && proposal.voting_phase === 'executive' && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 p-2 rounded-md">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Executives deliberating... ({executiveVotes.length}/4 have voted)</span>
              </div>
            )}
            
            {userVote && (
              <p className="text-xs text-muted-foreground">
                You voted: <span className={
                  userVote === 'approve' ? 'text-green-600 font-medium' :
                  userVote === 'reject' ? 'text-red-600 font-medium' :
                  'text-muted-foreground font-medium'
                }>{userVote.toUpperCase()}</span>
                <span className="ml-1">(click to change)</span>
              </p>
            )}
            
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              <Button
                size="sm"
                variant={userVote === 'approve' ? 'default' : 'outline'}
                className={`${userVote === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'hover:bg-green-500/10 hover:text-green-600 hover:border-green-500/30'} text-xs sm:text-sm`}
                onClick={() => handleVote('approve')}
                disabled={voting}
              >
                {voting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 sm:mr-1" />}
                <span className="hidden sm:inline">Approve</span>
              </Button>
              <Button
                size="sm"
                variant={userVote === 'reject' ? 'default' : 'outline'}
                className={`${userVote === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/30'} text-xs sm:text-sm`}
                onClick={() => handleVote('reject')}
                disabled={voting}
              >
                {voting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 sm:mr-1" />}
                <span className="hidden sm:inline">Reject</span>
              </Button>
              <Button
                size="sm"
                variant={userVote === 'abstain' ? 'default' : 'outline'}
                className={`${userVote === 'abstain' ? 'bg-muted' : ''} text-xs sm:text-sm`}
                onClick={() => handleVote('abstain')}
                disabled={voting}
              >
                {voting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MinusCircle className="h-4 w-4 sm:mr-1" />}
                <span className="hidden sm:inline">Abstain</span>
              </Button>
            </div>
          </div>
        )}

        {/* Queued for Deployment Status */}
        {proposal.status === 'queued_for_deployment' && (
          <div className="flex items-center gap-2 text-sm text-purple-600 bg-purple-500/10 p-3 rounded-md">
            <Rocket className="h-4 w-4 shrink-0" />
            <span className="text-xs sm:text-sm">Approved and queued for implementation.</span>
          </div>
        )}

        {/* Rejected with Feedback */}
        {proposal.status === 'rejected_with_feedback' && feedback && (
          <div className="space-y-3 p-3 rounded-md bg-orange-500/5 border border-orange-500/20">
            <div className="flex items-center gap-2 text-orange-600">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium text-sm">Improvement Suggestions</span>
            </div>
            {feedback.improvement_suggestions && (
              <ul className="space-y-1">
                {feedback.improvement_suggestions.map((suggestion: string, idx: number) => (
                  <li key={idx} className="text-xs sm:text-sm text-muted-foreground flex items-start gap-2">
                    <Lightbulb className="h-3 w-3 mt-1 text-amber-500 shrink-0" />
                    {suggestion}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Action Buttons - Stack on mobile */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full sm:flex-1"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                <span className="text-xs sm:text-sm">Hide Details</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                <span className="text-xs sm:text-sm">View Details</span>
              </>
            )}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="w-full sm:flex-1"
            onClick={() => setShowComments(!showComments)}
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            <span className="text-xs sm:text-sm">{showComments ? 'Hide' : 'Show'} Discussion</span>
          </Button>
        </div>

        {/* Comments Section */}
        {showComments && (
          <div className="pt-4 border-t border-border">
            <ProposalComments 
              proposalId={proposal.id} 
              phase={proposal.voting_phase || 'executive'}
            />
          </div>
        )}

        {/* Expanded Details */}
        {expanded && (
          <div className="space-y-4 pt-4 border-t border-border">
            <div>
              <h4 className="text-sm font-semibold mb-2">Rationale</h4>
              <p className="text-xs sm:text-sm text-muted-foreground">{proposal.rationale}</p>
            </div>

            {proposal.use_cases && proposal.use_cases.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Use Cases</h4>
                <ul className="list-disc list-inside text-xs sm:text-sm text-muted-foreground space-y-1">
                  {proposal.use_cases.map((useCase: string, idx: number) => (
                    <li key={idx}>{useCase}</li>
                  ))}
                </ul>
              </div>
            )}

            {executiveVotes.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Executive Reasoning</h4>
                <div className="space-y-3">
                  {executiveVotes.map(vote => (
                    <div 
                      key={vote.id} 
                      className="p-3 rounded-lg bg-muted/50 border border-border"
                    >
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`font-medium text-sm ${executiveColors[vote.executive_name] || 'text-foreground'}`}>
                          {vote.executive_name}
                        </span>
                        <Badge 
                          variant="outline" 
                          className={
                            vote.vote === 'approve' 
                              ? 'bg-green-500/10 text-green-600 border-green-500/30' 
                              : vote.vote === 'reject'
                              ? 'bg-red-500/10 text-red-600 border-red-500/30'
                              : 'bg-muted text-muted-foreground'
                          }
                        >
                          {vote.vote.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">{vote.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};