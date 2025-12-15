import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Vote, Plus, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProposalCard } from '@/components/ProposalCard';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { SEOHead } from '@/components/SEOHead';

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

interface DecisionReport {
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

export default function Governance() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [votes, setVotes] = useState<Record<string, ExecutiveVote[]>>({});
  const [decisions, setDecisions] = useState<Record<string, DecisionReport>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [proposalDialogOpen, setProposalDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const [newProposal, setNewProposal] = useState({
    function_name: '',
    description: '',
    rationale: '',
    use_cases: '',
    proposed_by: ''
  });

  const fetchProposals = async () => {
    try {
      const { data: proposalsData, error: proposalsError } = await supabase
        .from('edge_function_proposals')
        .select('*')
        .order('created_at', { ascending: false });

      if (proposalsError) throw proposalsError;
      setProposals(proposalsData || []);

      const { data: votesData, error: votesError } = await supabase
        .from('executive_votes')
        .select('*');

      if (votesError) throw votesError;

      const votesMap: Record<string, ExecutiveVote[]> = {};
      votesData?.forEach(vote => {
        if (!votesMap[vote.proposal_id]) {
          votesMap[vote.proposal_id] = [];
        }
        votesMap[vote.proposal_id].push(vote);
      });
      setVotes(votesMap);

      // Fetch AI decision reports
      const { data: decisionsData, error: decisionsError } = await supabase
        .from('eliza_decision_reports')
        .select('*');

      if (!decisionsError && decisionsData) {
        const decisionsMap: Record<string, DecisionReport> = {};
        decisionsData.forEach(d => {
          decisionsMap[d.proposal_id] = d as DecisionReport;
        });
        setDecisions(decisionsMap);
      }
    } catch (error) {
      console.error('Failed to fetch proposals:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerPhaseCheck = async () => {
    setRefreshing(true);
    try {
      await supabase.functions.invoke('governance-phase-manager', {
        body: { action: 'check_all' }
      });
      await fetchProposals();
      toast({
        title: 'Refreshed',
        description: 'Governance phases checked and updated.'
      });
    } catch (error) {
      console.error('Phase check failed:', error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProposals();

    const proposalsChannel = supabase
      .channel('governance-proposals')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'edge_function_proposals' },
        () => fetchProposals()
      )
      .subscribe();

    const votesChannel = supabase
      .channel('governance-votes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'executive_votes' },
        () => fetchProposals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(proposalsChannel);
      supabase.removeChannel(votesChannel);
    };
  }, []);

  const filterProposals = (status: string) => {
    if (status === 'all') return proposals;
    if (status === 'approved') return proposals.filter(p => p.status === 'approved' || p.status === 'queued_for_deployment');
    if (status === 'rejected') return proposals.filter(p => p.status === 'rejected' || p.status === 'rejected_with_feedback');
    return proposals.filter(p => p.status === status);
  };

  const getCounts = () => {
    return {
      all: proposals.length,
      voting: proposals.filter(p => p.status === 'voting').length,
      approved: proposals.filter(p => p.status === 'approved' || p.status === 'queued_for_deployment').length,
      rejected: proposals.filter(p => p.status === 'rejected' || p.status === 'rejected_with_feedback').length,
      deployed: proposals.filter(p => p.status === 'deployed').length,
    };
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newProposal.function_name || !newProposal.description || !newProposal.rationale || !newProposal.proposed_by) {
      toast({
        title: 'Missing Fields',
        description: 'Please fill in all required fields.',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      const useCases = newProposal.use_cases
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const { data, error } = await supabase.functions.invoke('propose-new-edge-function', {
        body: {
          function_name: newProposal.function_name,
          description: newProposal.description,
          rationale: newProposal.rationale,
          use_cases: useCases,
          proposed_by: newProposal.proposed_by,
          category: 'community'
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Proposal Submitted',
        description: 'Your proposal has been submitted. Executive voting will begin shortly.'
      });

      setNewProposal({
        function_name: '',
        description: '',
        rationale: '',
        use_cases: '',
        proposed_by: ''
      });
      setProposalDialogOpen(false);
      fetchProposals();
    } catch (error: any) {
      console.error('Failed to submit proposal:', error);
      toast({
        title: 'Submission Failed',
        description: error.message || 'Failed to submit proposal',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const counts = getCounts();

  const EmptyState = ({ message }: { message: string }) => (
    <div className="text-center py-12">
      <Vote className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );

  return (
    <>
      <SEOHead
        title="Democratic AI Governance - Your Vote Matters | Suite"
        description="The first AI where YOU vote on what gets built. Community + Executive votes, transparent decisions, real impact on the platform's evolution."
        image="/og-image-governance.svg"
        url="/governance"
        keywords="AI governance, democratic voting, community proposals, decentralized AI, DAO governance"
        twitterLabel1="🗳️ Your Vote"
        twitterData1="Counts"
        twitterLabel2="⏱️ Decisions"
        twitterData2="24hr"
      />
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-7xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Vote className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <h1 className="text-lg sm:text-xl font-semibold">Governance</h1>
        </div>
        
        <div className="flex items-center gap-2 justify-between sm:justify-end">
          <Badge variant="outline" className="text-suite-warning border-suite-warning/30 bg-suite-warning/10 text-xs sm:text-sm">
            {counts.voting} awaiting votes
          </Badge>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={triggerPhaseCheck}
              disabled={refreshing}
              className="px-2 sm:px-3"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            
            <Dialog open={proposalDialogOpen} onOpenChange={setProposalDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1 sm:gap-2 px-2 sm:px-3">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">New Proposal</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto mx-4">
                <DialogHeader>
                  <DialogTitle>Propose New Edge Function</DialogTitle>
                  <DialogDescription>
                    Submit a proposal for review. Executives vote within 1 hour, then community votes for 24 hours.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmitProposal} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="function_name">Function Name *</Label>
                    <Input
                      id="function_name"
                      placeholder="e.g., my-awesome-function"
                      value={newProposal.function_name}
                      onChange={e => setNewProposal(prev => ({ ...prev, function_name: e.target.value }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="proposed_by">Your Name / Handle *</Label>
                    <Input
                      id="proposed_by"
                      placeholder="e.g., CommunityMember123"
                      value={newProposal.proposed_by}
                      onChange={e => setNewProposal(prev => ({ ...prev, proposed_by: e.target.value }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="description">Description *</Label>
                    <Textarea
                      id="description"
                      placeholder="What does this function do?"
                      value={newProposal.description}
                      onChange={e => setNewProposal(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="rationale">Rationale *</Label>
                    <Textarea
                      id="rationale"
                      placeholder="Why is this function needed?"
                      value={newProposal.rationale}
                      onChange={e => setNewProposal(prev => ({ ...prev, rationale: e.target.value }))}
                      rows={3}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="use_cases">Use Cases (one per line)</Label>
                    <Textarea
                      id="use_cases"
                      placeholder="Automated monitoring&#10;User notifications"
                      value={newProposal.use_cases}
                      onChange={e => setNewProposal(prev => ({ ...prev, use_cases: e.target.value }))}
                      rows={3}
                    />
                  </div>
                  
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Proposal'
                    )}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="mb-4 sm:mb-8 p-3 sm:p-4 rounded-lg bg-muted/30 border border-border/60">
        <p className="text-xs sm:text-sm text-muted-foreground">
          <strong className="text-foreground">Timed Voting:</strong> Executives have 1 hour to vote, then community has 24 hours. 
          4/5 executive approvals needed to pass.
        </p>
      </div>

      {/* Tabs - Horizontally scrollable on mobile */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <TabsList className="mb-4 sm:mb-6 flex gap-1 sm:gap-2 h-auto bg-transparent p-0 min-w-max">
            <TabsTrigger 
              value="all" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm px-2 sm:px-3"
            >
              All ({counts.all})
            </TabsTrigger>
            <TabsTrigger 
              value="voting"
              className="data-[state=active]:bg-suite-warning data-[state=active]:text-white text-xs sm:text-sm px-2 sm:px-3"
            >
              <Vote className="h-3 w-3 mr-1" />
              Voting ({counts.voting})
            </TabsTrigger>
            <TabsTrigger 
              value="approved"
              className="data-[state=active]:bg-suite-success data-[state=active]:text-white text-xs sm:text-sm px-2 sm:px-3"
            >
              Approved ({counts.approved})
            </TabsTrigger>
            <TabsTrigger 
              value="rejected"
              className="data-[state=active]:bg-destructive data-[state=active]:text-white text-xs sm:text-sm px-2 sm:px-3"
            >
              Rejected ({counts.rejected})
            </TabsTrigger>
            {counts.deployed > 0 && (
              <TabsTrigger 
                value="deployed"
                className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs sm:text-sm px-2 sm:px-3"
              >
                Deployed ({counts.deployed})
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <TabsContent value="all" className="space-y-3 sm:space-y-4 mt-0">
              {filterProposals('all').length === 0 ? (
                <EmptyState message="No proposals yet. Be the first to submit one!" />
              ) : (
                filterProposals('all').map(proposal => (
                  <ProposalCard 
                    key={proposal.id} 
                    proposal={proposal} 
                    votes={votes[proposal.id] || []}
                    decisionReport={decisions[proposal.id]}
                    onVoteSuccess={fetchProposals}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="voting" className="space-y-3 sm:space-y-4 mt-0">
              {filterProposals('voting').length === 0 ? (
                <EmptyState message="No proposals currently in voting" />
              ) : (
                filterProposals('voting').map(proposal => (
                  <ProposalCard 
                    key={proposal.id} 
                    proposal={proposal} 
                    votes={votes[proposal.id] || []}
                    decisionReport={decisions[proposal.id]}
                    onVoteSuccess={fetchProposals}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="approved" className="space-y-3 sm:space-y-4 mt-0">
              {filterProposals('approved').length === 0 ? (
                <EmptyState message="No approved proposals" />
              ) : (
                filterProposals('approved').map(proposal => (
                  <ProposalCard 
                    key={proposal.id} 
                    proposal={proposal} 
                    votes={votes[proposal.id] || []}
                    decisionReport={decisions[proposal.id]}
                    onVoteSuccess={fetchProposals}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="rejected" className="space-y-3 sm:space-y-4 mt-0">
              {filterProposals('rejected').length === 0 ? (
                <EmptyState message="No rejected proposals" />
              ) : (
                filterProposals('rejected').map(proposal => (
                  <ProposalCard 
                    key={proposal.id} 
                    proposal={proposal} 
                    votes={votes[proposal.id] || []}
                    decisionReport={decisions[proposal.id]}
                    onVoteSuccess={fetchProposals}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="deployed" className="space-y-3 sm:space-y-4 mt-0">
              {filterProposals('deployed').length === 0 ? (
                <EmptyState message="No deployed proposals yet" />
              ) : (
                filterProposals('deployed').map(proposal => (
                  <ProposalCard 
                    key={proposal.id} 
                    proposal={proposal} 
                    votes={votes[proposal.id] || []}
                    decisionReport={decisions[proposal.id]}
                    onVoteSuccess={fetchProposals}
                  />
                ))
              )}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
    </>
  );
}
