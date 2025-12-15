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
  COO: 'text-red-500',
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

  const executiveVotes = votes.filter(v => ['CSO', 'CTO', 'CIO', 'CAO', 'COO'].includes(v.executive_name));
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

  // Allow community voting during all voting phases
  const canVote = proposal.status === 'voting';
  const hasNotVoted = !userVote;

  // Determine outcome summary
  const getOutcomeSummary = () => {
    if (executiveApprovals >= 4) return `${executiveApprovals}/5 executives approved`;
    if (executiveRejections >= 3) return `${executiveRejections}/5 executives rejected`;
    return `${executiveApprovals} approve, ${executiveRejections} reject, ${executiveAbstentions} abstain`;
  };

  return (
    <Card className="border border-border hover:border-primary/30 transition-colors overflow-hidden">
      {/* OUTCOME BANNER - Clear status at top for decided proposals */}
      {proposal.status === 'approved' && (
        <div className="bg-green-500/10 border-b-2 border-green-500 px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="font-semibold text-green-700 dark:text-green-400">Approved by Executive Council</span>
          </div>
          <p className="text-sm text-green-600/80 dark:text-green-400/80 mt-1">
            {getOutcomeSummary()} • Consensus reached
          </p>
        </div>
      )}
      
      {(proposal.status === 'rejected' || proposal.status === 'rejected_with_feedback') && (
        <div className="bg-red-500/10 border-b-2 border-red-500 px-4 py-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600" />
            <span className="font-semibold text-red-700 dark:text-red-400">Rejected by Executive Council</span>
          </div>
          <p className="text-sm text-red-600/80 dark:text-red-400/80 mt-1">
            {getOutcomeSummary()}
          </p>
        </div>
      )}
      
      {proposal.status === 'queued_for_deployment' && (
        <div className="bg-purple-500/10 border-b-2 border-purple-500 px-4 py-3">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-purple-600" />
            <span className="font-semibold text-purple-700 dark:text-purple-400">Queued for Deployment</span>
          </div>
          <p className="text-sm text-purple-600/80 dark:text-purple-400/80 mt-1">
            Approved and ready for implementation
          </p>
        </div>
      )}
      
      {proposal.status === 'deployed' && (
        <div className="bg-blue-500/10 border-b-2 border-blue-500 px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-blue-700 dark:text-blue-400">Deployed & Live</span>
          </div>
          <p className="text-sm text-blue-600/80 dark:text-blue-400/80 mt-1">
            Function is now active in the system
          </p>
        </div>
      )}

      <CardHeader className="p-4 sm:pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <CardTitle className="text-base sm:text-lg break-words">{proposal.function_name}</CardTitle>
              {proposal.status === 'voting' && (
                <Badge variant="outline" className={`${statusColors[proposal.status]} shrink-0`}>
                  {statusLabels[proposal.status]}
                </Badge>
              )}
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
        {/* Voting Phase Indicator with Countdown - only for voting status */}
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

        {/* Executive Reasoning - Always show for decided proposals (directly from votes, not stale reports) */}
        {(proposal.status !== 'voting' && proposal.status !== 'pending') && executiveVotes.length > 0 && (
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Executive Reasoning
            </h4>
            <div className="space-y-2">
              {executiveVotes.map(vote => (
                <div key={vote.id} className="flex items-start gap-2 text-sm">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`font-medium ${executiveColors[vote.executive_name] || 'text-foreground'}`}>
                      {vote.executive_name}:
                    </span>
                    {vote.vote === 'approve' && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                    {vote.vote === 'reject' && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                    {vote.vote === 'abstain' && <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">{vote.reasoning}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vote Summary - Compact for decided, detailed for voting */}
        {proposal.status === 'voting' ? (
          <>
            {/* Executive Vote Progress - detailed view for active voting */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">Executive Council (4/5 needed)</p>
              <VoteProgress 
                approvals={executiveApprovals} 
                rejections={executiveRejections} 
                abstentions={executiveAbstentions}
                required={4}
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
          </>
        ) : (
          /* Compact vote summary for decided proposals */
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Exec: {executiveApprovals}✓ {executiveRejections}✗
            </span>
            {communityVotes.length > 0 && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                Community: {communityApprovals}✓ {communityRejections}✗
              </span>
            )}
          </div>
        )}

        {/* Prominent Voting CTA */}
        {canVote && (
          <div className={`p-4 rounded-lg border-2 ${hasNotVoted ? 'bg-primary/5 border-primary/30 animate-pulse' : 'bg-muted/30 border-border'}`}>
            {/* Voting Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="font-semibold text-sm">
                  {hasNotVoted ? '🗳️ Cast Your Vote' : '✓ You Voted'}
                </span>
              </div>
              {proposal.voting_phase === 'executive' && executiveVotes.length < 5 && (
                <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Executives: {executiveVotes.length}/5
                </Badge>
              )}
              {proposal.voting_phase === 'community' && (
                <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                  Community Phase Active
                </Badge>
              )}
            </div>
            
            {/* Not voted prompt */}
            {hasNotVoted && (
              <p className="text-xs text-muted-foreground mb-3">
                Your vote helps shape the ecosystem. Every vote counts!
              </p>
            )}
            
            {/* Already voted indicator */}
            {userVote && (
              <p className="text-xs text-muted-foreground mb-3">
                You voted: <span className={
                  userVote === 'approve' ? 'text-green-600 font-semibold' :
                  userVote === 'reject' ? 'text-red-600 font-semibold' :
                  'text-muted-foreground font-semibold'
                }>{userVote.toUpperCase()}</span>
                <span className="ml-1 opacity-70">(click to change)</span>
              </p>
            )}
            
            {/* Voting Buttons - Large and prominent */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                size="lg"
                variant={userVote === 'approve' ? 'default' : 'outline'}
                className={`${userVote === 'approve' 
                  ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20' 
                  : 'hover:bg-green-500/10 hover:text-green-600 hover:border-green-500/50 border-2'} 
                  font-medium transition-all`}
                onClick={() => handleVote('approve')}
                disabled={voting}
              >
                {voting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Approve
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant={userVote === 'reject' ? 'default' : 'outline'}
                className={`${userVote === 'reject' 
                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20' 
                  : 'hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/50 border-2'} 
                  font-medium transition-all`}
                onClick={() => handleVote('reject')}
                disabled={voting}
              >
                {voting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <XCircle className="h-5 w-5 mr-2" />
                    Reject
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant={userVote === 'abstain' ? 'default' : 'outline'}
                className={`${userVote === 'abstain' 
                  ? 'bg-muted text-foreground' 
                  : 'border-2'} 
                  font-medium transition-all`}
                onClick={() => handleVote('abstain')}
                disabled={voting}
              >
                {voting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <MinusCircle className="h-5 w-5 mr-2" />
                    Abstain
                  </>
                )}
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

            {/* Show executive votes only during voting phase in expanded - decided proposals show it above */}
            {proposal.status === 'voting' && executiveVotes.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Executive Votes So Far</h4>
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

            {/* Implementation analysis for approved proposals */}
            {implementationAnalysis && (proposal.status === 'approved' || proposal.status === 'queued_for_deployment' || proposal.status === 'deployed') && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Implementation Details</h4>
                {implementationAnalysis.implementation_plan && (
                  <div className="text-xs text-muted-foreground mb-2">
                    <strong>Plan:</strong> {JSON.stringify(implementationAnalysis.implementation_plan)}
                  </div>
                )}
                {implementationAnalysis.next_steps && (
                  <div className="text-xs text-muted-foreground">
                    <strong>Next Steps:</strong> {Array.isArray(implementationAnalysis.next_steps) 
                      ? implementationAnalysis.next_steps.join(', ') 
                      : implementationAnalysis.next_steps}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};