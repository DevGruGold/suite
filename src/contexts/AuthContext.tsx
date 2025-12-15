import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type AppRole = 'user' | 'contributor' | 'moderator' | 'admin' | 'superadmin';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  github_username: string | null;
  twitter_handle: string | null;
  bio: string | null;
  timezone: string;
  is_active: boolean;
  email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  wallet_address: string | null;
  total_xmrt_earned: number;
  total_pop_points: number;
  total_mining_shares: number;
  github_contributions_count: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperadmin: boolean;
  hasGoogleCloudConnection: boolean;
  signInWithGoogle: () => Promise<void>;
  connectGoogleCloud: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasGoogleCloudConnection, setHasGoogleCloudConnection] = useState(false);
  const { toast } = useToast();

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        return;
      }

      setProfile(profileData as Profile);

      // Fetch roles using RPC to avoid RLS recursion
      const { data: rolesData, error: rolesError } = await supabase
        .rpc('get_user_roles', { _user_id: userId });

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
        setRoles(['user']);
      } else {
        setRoles((rolesData as AppRole[]) || ['user']);
      }

      // Check if user has Google Cloud connection
      const { data: oauthData } = await supabase
        .from('oauth_connections')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', 'google_cloud')
        .eq('is_active', true)
        .maybeSingle();
      
      setHasGoogleCloudConnection(!!oauthData);
    } catch (error) {
      console.error('Error in fetchProfile:', error);
    }
  }, []);

  // Process hash fragment tokens from OAuth redirects
  useEffect(() => {
    if (window.location.hash.includes('access_token')) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      });
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer profile fetch to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
          
          // Only store Google Cloud token if we have a refresh token (from extended scopes)
          if (event === 'SIGNED_IN' && session.provider_refresh_token) {
            const userEmail = session.user.email || '';
            setTimeout(() => {
              storeGoogleCloudToken(session.user.id, session.provider_refresh_token!, userEmail);
              setHasGoogleCloudConnection(true);
            }, 100);
          }
        } else {
          setProfile(null);
          setRoles([]);
          setHasGoogleCloudConnection(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const getRedirectUrl = () => {
    // Always redirect to dashboard after auth
    if (window.location.hostname.includes('lovable') || 
        window.location.hostname.includes('lovableproject')) {
      return 'https://suite-beta.vercel.app/dashboard';
    }
    return `${window.location.origin}/dashboard`;
  };

  // Store Google Cloud refresh token after login
  const storeGoogleCloudToken = useCallback(async (userId: string, refreshToken: string, email: string) => {
    try {
      const { error } = await supabase.from('oauth_connections').upsert({
        user_id: userId,
        provider: 'google_cloud',
        account_email: email,
        refresh_token: refreshToken,
        scopes: ['gmail', 'drive', 'sheets', 'calendar'],
        connected_at: new Date().toISOString(),
        is_active: true
      }, { onConflict: 'user_id,provider' });

      if (error) {
        console.error('Failed to store Google Cloud token:', error);
      } else {
        console.log('Google Cloud token stored for Eliza access');
      }
    } catch (err) {
      console.error('Error storing Google Cloud token:', err);
    }
  }, []);

  // Basic scopes for normal sign-in (no Google Cloud access)
  const BASIC_SCOPES = 'openid email profile';

  // Extended Google OAuth scopes for superadmins with full Google Cloud access
  const GOOGLE_CLOUD_SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar',
    'openid',
    'email',
    'profile'
  ].join(' ');

  // Standard sign-in for all users - simple OAuth with basic scopes
  const signInWithGoogle = async () => {
    const redirectUrl = getRedirectUrl();
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        scopes: BASIC_SCOPES,
      },
    });

    if (error) {
      toast({
        title: 'Sign in failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Connect Google Cloud services - for superadmins only
  const connectGoogleCloud = async () => {
    const redirectUrl = getRedirectUrl();
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        scopes: GOOGLE_CLOUD_SCOPES,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      },
    });

    if (error) {
      toast({
        title: 'Failed to connect Google Cloud',
        description: error.message,
        variant: 'destructive',
      });
    }
  };


  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        title: 'Sign in failed',
        description: error.message,
        variant: 'destructive',
      });
      return { error };
    }

    toast({
      title: 'Welcome back!',
      description: 'You have successfully signed in.',
    });

    return { error: null };
  };

  const signUpWithEmail = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = getRedirectUrl();
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      toast({
        title: 'Sign up failed',
        description: error.message,
        variant: 'destructive',
      });
      return { error };
    }

    toast({
      title: 'Account created!',
      description: 'Please check your email to verify your account.',
    });

    return { error: null };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      toast({
        title: 'Sign out failed',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setUser(null);
      setSession(null);
      setProfile(null);
      setRoles([]);
      toast({
        title: 'Signed out',
        description: 'You have been signed out successfully.',
      });
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    roles,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: roles.includes('admin') || roles.includes('superadmin'),
    isSuperadmin: roles.includes('superadmin'),
    hasGoogleCloudConnection,
    signInWithGoogle,
    connectGoogleCloud,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
