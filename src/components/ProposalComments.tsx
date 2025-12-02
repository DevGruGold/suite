import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { 
  MessageSquare, 
  Send, 
  ThumbsUp, 
  ThumbsDown, 
  Reply, 
  Loader2,
  HelpCircle,
  Lightbulb,
  Heart,
  AlertTriangle
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Comment {
  id: string;
  proposal_id: string;
  author_name: string;
  author_session_key?: string;
  comment: string;
  comment_type: string;
  parent_comment_id?: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
}

interface ProposalCommentsProps {
  proposalId: string;
  phase: string;
}

const commentTypeConfig: Record<string, { icon: React.ComponentType<any>; color: string; label: string }> = {
  argument: { icon: MessageSquare, color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', label: 'Argument' },
  question: { icon: HelpCircle, color: 'bg-purple-500/10 text-purple-600 border-purple-500/30', label: 'Question' },
  clarification: { icon: Lightbulb, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30', label: 'Clarification' },
  support: { icon: Heart, color: 'bg-green-500/10 text-green-600 border-green-500/30', label: 'Support' },
  concern: { icon: AlertTriangle, color: 'bg-red-500/10 text-red-600 border-red-500/30', label: 'Concern' },
};

const executiveColors: Record<string, string> = {
  CSO: 'text-purple-500',
  CTO: 'text-blue-500',
  CIO: 'text-green-500',
  CAO: 'text-orange-500',
  COMMUNITY: 'text-pink-500',
  ELIZA: 'text-primary',
};

export const ProposalComments: React.FC<ProposalCommentsProps> = ({ proposalId, phase }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState('argument');
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const getSessionKey = () => {
    let sessionKey = localStorage.getItem('governance_session_key');
    if (!sessionKey) {
      sessionKey = `community_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('governance_session_key', sessionKey);
    }
    return sessionKey;
  };

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from('proposal_comments')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();

    const channel = supabase
      .channel(`proposal-comments-${proposalId}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'proposal_comments', filter: `proposal_id=eq.${proposalId}` },
        () => fetchComments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const sessionKey = getSessionKey();
      
      const { error } = await supabase
        .from('proposal_comments')
        .insert({
          proposal_id: proposalId,
          author_name: 'COMMUNITY',
          author_session_key: sessionKey,
          comment: newComment.trim(),
          comment_type: commentType,
          parent_comment_id: replyTo
        });

      if (error) throw error;

      setNewComment('');
      setReplyTo(null);
      toast({
        title: 'Comment Posted',
        description: 'Your comment has been added to the discussion.'
      });
    } catch (error: any) {
      console.error('Failed to post comment:', error);
      toast({
        title: 'Failed to Post',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (commentId: string, type: 'up' | 'down') => {
    try {
      const comment = comments.find(c => c.id === commentId);
      if (!comment) return;

      const { error } = await supabase
        .from('proposal_comments')
        .update({
          upvotes: type === 'up' ? comment.upvotes + 1 : comment.upvotes,
          downvotes: type === 'down' ? comment.downvotes + 1 : comment.downvotes
        })
        .eq('id', commentId);

      if (error) throw error;
      fetchComments();
    } catch (error) {
      console.error('Vote failed:', error);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const topLevelComments = comments.filter(c => !c.parent_comment_id);
  const getReplies = (parentId: string) => comments.filter(c => c.parent_comment_id === parentId);

  const renderComment = (comment: Comment, isReply = false) => {
    const typeConfig = commentTypeConfig[comment.comment_type] || commentTypeConfig.argument;
    const TypeIcon = typeConfig.icon;
    const replies = getReplies(comment.id);

    return (
      <div key={comment.id} className={`${isReply ? 'ml-4 sm:ml-8 border-l-2 border-border pl-3 sm:pl-4' : ''}`}>
        <div className="py-3">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className={`font-medium text-sm ${executiveColors[comment.author_name] || 'text-foreground'}`}>
              {comment.author_name}
            </span>
            <Badge variant="outline" className={`${typeConfig.color} text-xs py-0`}>
              <TypeIcon className="h-3 w-3 mr-1" />
              {typeConfig.label}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatTime(comment.created_at)}</span>
          </div>
          
          <p className="text-sm text-muted-foreground mb-2">{comment.comment}</p>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => handleVote(comment.id, 'up')}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-green-500 transition-colors"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              {comment.upvotes > 0 && comment.upvotes}
            </button>
            <button 
              onClick={() => handleVote(comment.id, 'down')}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500 transition-colors"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              {comment.downvotes > 0 && comment.downvotes}
            </button>
            {phase === 'community' && !isReply && (
              <button 
                onClick={() => setReplyTo(comment.id)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Reply className="h-3.5 w-3.5" />
                Reply
              </button>
            )}
          </div>
        </div>
        
        {replies.length > 0 && (
          <div className="space-y-0">
            {replies.map(reply => renderComment(reply, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        <h4 className="text-sm font-semibold">Discussion ({comments.length})</h4>
      </div>

      {/* Comment Input */}
      {(phase === 'executive' || phase === 'community') && (
        <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border">
          {replyTo && (
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-background/50 p-2 rounded">
              <span>Replying to comment...</span>
              <button onClick={() => setReplyTo(null)} className="text-primary hover:underline">
                Cancel
              </button>
            </div>
          )}
          
          <div className="flex flex-wrap gap-2">
            {Object.entries(commentTypeConfig).map(([type, config]) => {
              const Icon = config.icon;
              return (
                <button
                  key={type}
                  onClick={() => setCommentType(type)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
                    commentType === type 
                      ? config.color 
                      : 'bg-background border-border hover:bg-muted'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {config.label}
                </button>
              );
            })}
          </div>
          
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts, concerns, or questions..."
            rows={2}
            className="resize-none text-sm"
          />
          
          <Button 
            size="sm" 
            onClick={handleSubmit}
            disabled={!newComment.trim() || submitting}
            className="w-full sm:w-auto"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Post Comment
          </Button>
        </div>
      )}

      {/* Comments List */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No comments yet. Be the first to share your thoughts!
        </p>
      ) : (
        <div className="divide-y divide-border">
          {topLevelComments.map(comment => renderComment(comment))}
        </div>
      )}
    </div>
  );
};