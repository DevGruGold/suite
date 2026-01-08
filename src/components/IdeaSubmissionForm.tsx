import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Lightbulb, Loader2 } from 'lucide-react';

export const IdeaSubmissionForm = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title || !description || !category) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const sessionKey = localStorage.getItem('session_key') || 
        `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      localStorage.setItem('session_key', sessionKey);

      const { error } = await supabase
        .from('community_ideas')
        .insert({
          title,
          description,
          category,
          submitted_by_session_key: sessionKey,
          status: 'submitted'
        });

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      toast({
        title: "Idea Submitted! 🎉",
        description: "Eliza and the Executive Council will review your idea soon."
      });

      // Reset form
      setTitle('');
      setDescription('');
      setCategory('');

    } catch (error: any) {
      console.error('Error submitting idea:', error);
      toast({
        title: "Submission Failed",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-primary" />
          <CardTitle>Submit Your Idea</CardTitle>
        </div>
        <CardDescription>
          Share your vision for XMRT DAO. Ideas are evaluated based on financial sovereignty, democracy, privacy, technical feasibility, and community benefit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Idea Title</Label>
            <Input
              id="title"
              placeholder="e.g., Solar Panel Mining Integration"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory} required>
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="financial_sovereignty">Financial Sovereignty</SelectItem>
                <SelectItem value="democracy">Democracy</SelectItem>
                <SelectItem value="privacy">Privacy</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="community">Community</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe your idea in detail. What problem does it solve? How does it benefit XMRT DAO members?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              required
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm space-y-2">
            <p className="font-semibold">Evaluation Criteria:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Financial Sovereignty: Enhances economic control & reduces centralization</li>
              <li>Democracy: Empowers governance & increases transparency</li>
              <li>Privacy: Strengthens anonymity & encryption</li>
              <li>Technical Feasibility: Clear implementation path</li>
              <li>Community Benefit: Positive impact on members</li>
            </ul>
            <p className="text-muted-foreground italic">
              Ideas scoring 65+ (out of 100) are approved for implementation
            </p>
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Idea'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
