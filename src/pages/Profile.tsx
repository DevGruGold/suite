import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  User, Wallet, GitCommit, Cpu, Battery, Coins, 
  ExternalLink, Copy, CheckCircle, Edit2, Save, X,
  Shield, Zap
} from "lucide-react";
import { Navigate } from "react-router-dom";
import { MiningSessionsList } from "@/components/MiningSessionsList";
import { ChargerSessionsList } from "@/components/ChargerSessionsList";

interface UserEarnings {
  github_xmrt: number;
  github_contributions: number;
  pop_points: number;
  mining_shares: number;
  total_xmrt: number;
  wallet_address: string | null;
}

const Profile = () => {
  const { user, profile, roles, isAuthenticated, isLoading } = useAuth();
  const [earnings, setEarnings] = useState<UserEarnings | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [linkedWorkerIds, setLinkedWorkerIds] = useState<string[]>([]);
  const [editForm, setEditForm] = useState({
    display_name: '',
    github_username: '',
    wallet_address: '',
    bio: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setEditForm({
        display_name: profile.display_name || '',
        github_username: profile.github_username || '',
        wallet_address: profile.wallet_address || '',
        bio: profile.bio || ''
      });
      // Load linked worker IDs from profile
      fetchLinkedWorkerIds();
      fetchEarnings();
    }
  }, [profile]);

  const fetchLinkedWorkerIds = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('linked_worker_ids')
        .eq('id', user.id)
        .single();
      
      if (!error && data?.linked_worker_ids) {
        setLinkedWorkerIds(data.linked_worker_ids);
      }
    } catch (err) {
      console.log('Could not fetch linked workers:', err);
    }
  };

  const fetchEarnings = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase.rpc('get_user_earnings', {
        user_profile_id: user.id
      });
      
      if (!error && data && typeof data === 'object') {
        setEarnings(data as unknown as UserEarnings);
      }
    } catch (err) {
      console.log('Could not fetch earnings:', err);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: editForm.display_name,
          github_username: editForm.github_username,
          wallet_address: editForm.wallet_address,
          bio: editForm.bio,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;
      
      toast.success('Profile updated successfully');
      setIsEditing(false);
      fetchEarnings();
    } catch (err) {
      toast.error('Failed to update profile');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  const highestRole = roles[roles.length - 1] || 'user';

  return (
    <>
      <SEOHead
        title="My Profile | Suite"
        description="View your earnings, manage your wallet, and track your contributions across the Suite ecosystem."
        url="/profile"
      />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-foreground">My Profile</h1>
          {!isEditing ? (
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              <Edit2 className="w-4 h-4 mr-2" />
              Edit Profile
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSaveProfile} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-6">
          {/* Profile Info Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Avatar" className="w-16 h-16 rounded-full" />
                  ) : (
                    <User className="w-8 h-8 text-primary" />
                  )}
                </div>
                <div className="flex-1">
                  {isEditing ? (
                    <Input
                      value={editForm.display_name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, display_name: e.target.value }))}
                      placeholder="Display name"
                      className="text-xl font-bold mb-1"
                    />
                  ) : (
                    <CardTitle className="text-xl">
                      {profile?.display_name || profile?.full_name || 'Anonymous User'}
                    </CardTitle>
                  )}
                  <CardDescription>{user?.email}</CardDescription>
                </div>
                <Badge variant={highestRole === 'superadmin' ? 'default' : 'secondary'} className="capitalize">
                  <Shield className="w-3 h-3 mr-1" />
                  {highestRole}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>GitHub Username</Label>
                      <Input
                        value={editForm.github_username}
                        onChange={(e) => setEditForm(prev => ({ ...prev, github_username: e.target.value }))}
                        placeholder="@username"
                      />
                    </div>
                    <div>
                      <Label>Wallet Address</Label>
                      <Input
                        value={editForm.wallet_address}
                        onChange={(e) => setEditForm(prev => ({ ...prev, wallet_address: e.target.value }))}
                        placeholder="0x..."
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Bio</Label>
                    <Input
                      value={editForm.bio}
                      onChange={(e) => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
                      placeholder="Tell us about yourself..."
                    />
                  </div>
                </>
              ) : (
                <div className="grid gap-3 text-sm">
                  {profile?.github_username && (
                    <div className="flex items-center gap-2">
                      <GitCommit className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">GitHub:</span>
                      <span className="font-medium">@{profile.github_username}</span>
                    </div>
                  )}
                  {profile?.wallet_address && (
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Wallet:</span>
                      <span className="font-mono text-xs">{profile.wallet_address.slice(0, 10)}...{profile.wallet_address.slice(-6)}</span>
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(profile.wallet_address!)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  {profile?.bio && (
                    <p className="text-muted-foreground">{profile.bio}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Earnings Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-primary" />
                My Earnings
              </CardTitle>
              <CardDescription>
                Aggregated earnings from all contribution sources
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Coins className="w-4 h-4 text-primary" />
                    <span className="text-sm text-muted-foreground">Total XMRT</span>
                  </div>
                  <p className="text-2xl font-bold text-primary">
                    {earnings?.total_xmrt?.toLocaleString() || '0'}
                  </p>
                </div>
                
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <GitCommit className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">GitHub</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-500">
                    {earnings?.github_xmrt?.toLocaleString() || '0'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {earnings?.github_contributions || 0} contributions
                  </p>
                </div>
                
                <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="w-4 h-4 text-orange-500" />
                    <span className="text-sm text-muted-foreground">Mining</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-500">
                    {earnings?.mining_shares?.toLocaleString() || '0'}
                  </p>
                  <p className="text-xs text-muted-foreground">shares submitted</p>
                </div>
                
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Battery className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">Charger PoP</span>
                  </div>
                  <p className="text-2xl font-bold text-green-500">
                    {earnings?.pop_points?.toLocaleString() || '0'}
                  </p>
                  <p className="text-xs text-muted-foreground">proof of participation</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mining Workers Section */}
          {user?.id && (
            <MiningSessionsList
              userId={user.id}
              linkedWorkerIds={linkedWorkerIds}
              onWorkersUpdated={setLinkedWorkerIds}
            />
          )}

          {/* Charger Sessions Section */}
          {user?.id && (
            <ChargerSessionsList
              userId={user.id}
              walletAddress={profile?.wallet_address || undefined}
            />
          )}

          {/* Wallet Connection Guide */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-primary" />
                Wallet & Token Guide
              </CardTitle>
              <CardDescription>
                How to connect your wallet, transfer XMRT, and bridge to XMR
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step 1: Connect Wallet */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                  1
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2">Connect Your Wallet</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Install MetaMask or any Web3 wallet. Click the button below to connect and link your wallet address to your profile.
                  </p>
                  <Button variant="outline" className="gap-2">
                    <Wallet className="w-4 h-4" />
                    {profile?.wallet_address ? 'Wallet Connected' : 'Connect MetaMask'}
                    {profile?.wallet_address && <CheckCircle className="w-4 h-4 text-green-500" />}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Step 2: Switch Network */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                  2
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2">Switch to Sepolia Testnet</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    XMRT tokens currently run on the Sepolia testnet. When you connect, we'll automatically prompt you to switch networks.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="gap-1">
                      <Zap className="w-3 h-3" />
                      Chain ID: 11155111
                    </Badge>
                    <Badge variant="outline">Network: Sepolia</Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Step 3: Transfer XMRT */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                  3
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2">Transfer / Withdraw XMRT</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Your earned XMRT tokens can be claimed on-chain and transferred to any ERC-20 compatible wallet.
                  </p>
                  <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                    <p><strong>XMRT Contract:</strong> <code className="text-xs">0x...</code> (Sepolia)</p>
                    <p><strong>Token Standard:</strong> ERC-20</p>
                    <p><strong>Decimals:</strong> 18</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Step 4: Bridge to XMR */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                  4
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2">Bridge to XMR (Monero)</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Convert your XMRT tokens to real XMR (Monero) for maximum privacy. Use decentralized bridges or atomic swaps.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="gap-2" asChild>
                      <a href="https://unstoppableswap.net/" target="_blank" rel="noopener noreferrer">
                        Unstoppable Swap
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2" asChild>
                      <a href="https://thorchain.org/" target="_blank" rel="noopener noreferrer">
                        THORChain
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Help Links */}
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Need Help?
                </h4>
                <div className="flex flex-wrap gap-3 text-sm">
                  <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                    Install MetaMask <ExternalLink className="w-3 h-3" />
                  </a>
                  <a href="https://sepoliafaucet.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                    Get Sepolia ETH <ExternalLink className="w-3 h-3" />
                  </a>
                  <a href="https://www.getmonero.org/downloads/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                    Monero Wallet <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default Profile;
