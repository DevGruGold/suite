import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Github, CheckCircle, Wallet, LogIn, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { toast } from 'sonner';

interface GitHubOAuthIntegrationProps {
  onConnected?: () => void;
}

export const GitHubOAuthIntegration: React.FC<GitHubOAuthIntegrationProps> = ({
  onConnected,
}) => {
  const { user, profile, refreshProfile } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletAddress, setWalletAddress] = useState(profile?.wallet_address || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (profile?.wallet_address) {
      setWalletAddress(profile.wallet_address);
    }
  }, [profile]);

  const handleGitHubLogin = async () => {
    setIsConnecting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: window.location.origin + '/earn',
          scopes: 'repo read:user user:email',
        },
      });

      if (error) throw error;
    } catch (error: any) {
      toast.error('GitHub connection failed: ' + error.message);
      setIsConnecting(false);
    }
  };

  const handleSaveWallet = async () => {
    if (!user) {
      toast.error('Please sign in with GitHub first');
      return;
    }

    if (!walletAddress || !/^(0x)?[0-9a-fA-F]{40}$/.test(walletAddress)) {
      toast.error('Invalid wallet address format');
      return;
    }

    setIsSaving(true);
    try {
      // Update profile with wallet address and github username
      const githubUsername = user.user_metadata.user_name || user.user_metadata.preferred_username;
      
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          wallet_address: walletAddress,
          github_username: githubUsername,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // Also ensure contributor record exists
      const { error: contributorError } = await supabase
        .from('github_contributors')
        .upsert({
          github_username: githubUsername,
          wallet_address: walletAddress,
          target_repo_owner: 'DevGruGold',
          target_repo_name: 'XMRT-Ecosystem',
          is_active: true,
        }, {
          onConflict: 'github_username'
        });

      if (contributorError) throw contributorError;

      toast.success('Profile and wallet updated successfully');
      await refreshProfile();
      onConnected?.();
    } catch (error: any) {
      toast.error('Failed to save profile: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const isGitHubConnected = user?.app_metadata?.provider === 'github' || user?.identities?.some(id => id.provider === 'github');

  return (
    <Card className="w-full max-w-2xl mx-auto border-primary/20 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Github className="w-6 h-6" />
          GitHub Contributor Integration
        </CardTitle>
        <CardDescription>
          Connect your GitHub account via OAuth to automatically track contributions and earn XMRT rewards.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {!isGitHubConnected ? (
          <div className="space-y-4">
            <Alert className="bg-primary/5 border-primary/20">
              <AlertDescription className="text-sm">
                Sign in with GitHub to link your account. We'll use this to verify your commits, PRs, and issues.
              </AlertDescription>
            </Alert>
            <Button 
              onClick={handleGitHubLogin} 
              disabled={isConnecting}
              className="w-full py-6 text-lg gap-2"
            >
              {isConnecting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              Connect GitHub Account
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle className="w-6 h-6 text-green-500" />
              <div>
                <p className="font-medium text-green-500">GitHub Connected</p>
                <p className="text-sm text-muted-foreground">
                  Logged in as <span className="font-bold">@{user.user_metadata.user_name || user.user_metadata.preferred_username}</span>
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wallet-address" className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Your Wallet Address (for XMRT rewards)
              </Label>
              <Input
                id="wallet-address"
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Rewards will be sent to this address after contribution validation.
              </p>
            </div>

            <Button 
              onClick={handleSaveWallet} 
              disabled={isSaving || !walletAddress.trim()}
              className="w-full gap-2"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Save & Activate Earning
            </Button>
          </div>
        )}

        <div className="pt-4 border-t border-border">
          <h4 className="font-medium text-sm mb-3">How it works:</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-primary font-bold">1.</span>
              <span>Connect your GitHub account via secure OAuth.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary font-bold">2.</span>
              <span>Contribute to the XMRT-Ecosystem repository.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary font-bold">3.</span>
              <span>Eliza (our AI) validates your work and assigns a score.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary font-bold">4.</span>
              <span>XMRT tokens are automatically credited to your profile.</span>
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
