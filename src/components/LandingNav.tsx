import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { SuiteLogo } from '@/components/SuiteLogo';
import { AuthModal } from '@/components/AuthModal';
import { Menu, X, LogIn, Sparkles } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export function LandingNav() {
  const navigate = useNavigate();
  const { signInWithGoogle, isAuthenticated } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGetStarted = async () => {
    if (isAuthenticated) {
      navigate('/dashboard');
      return;
    }
    
    try {
      setIsSigningIn(true);
      await signInWithGoogle();
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign in');
      setIsSigningIn(false);
    }
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <SuiteLogo size="md" />

          <div className="flex items-center gap-3">
            {/* CTA Button */}
            <Button 
              onClick={handleGetStarted}
              disabled={isSigningIn}
              className="hidden sm:flex"
              size="sm"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {isAuthenticated ? 'Go to Dashboard' : 'Start Free Trial'}
            </Button>

            {/* Hamburger Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => document.getElementById('executives')?.scrollIntoView({ behavior: 'smooth' })}>
                  AI Executives
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => document.getElementById('benefits')?.scrollIntoView({ behavior: 'smooth' })}>
                  Benefits
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
                  How It Works
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {isAuthenticated ? (
                  <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Go to Dashboard
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => setAuthModalOpen(true)}>
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign In
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </>
  );
}
