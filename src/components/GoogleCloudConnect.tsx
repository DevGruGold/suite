import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { CheckCircle, Cloud, ExternalLink, Loader2, AlertCircle, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GoogleCloudConnectProps {
  className?: string;
}

export const GoogleCloudConnect: React.FC<GoogleCloudConnectProps> = ({ className }) => {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected' | 'error'>('checking');
  const [loading, setLoading] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Check for OAuth callback in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    if (code && state === 'google_cloud_oauth') {
      handleOAuthCallback(code);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Check connection status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setStatus('checking');
    try {
      const { data, error } = await supabase.functions.invoke('google-cloud-auth', {
        body: { action: 'status' }
      });

      if (error) throw error;
      
      // Use 'ready' field which is a boolean, not 'configured' which is always an object
      if (data?.success && data?.ready === true) {
        setStatus('connected');
      } else if (data?.success) {
        setStatus('disconnected');
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Failed to check Google Cloud status:', error);
      setStatus('disconnected');
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      // Get the current URL for the redirect
      const redirectUri = `${window.location.origin}/credentials`;
      
      const { data, error } = await supabase.functions.invoke('google-cloud-auth', {
        body: { 
          action: 'get_authorization_url',
          redirect_uri: redirectUri
        }
      });

      if (error) throw error;

      if (data?.success && data?.authorization_url) {
        // Open Google OAuth in a new window
        const authWindow = window.open(data.authorization_url, 'google_oauth', 'width=600,height=700');
        
        if (!authWindow) {
          // Popup blocked - show URL instead
          setAuthUrl(data.authorization_url);
          toast.info('Popup blocked - click the link below to connect');
        }
      } else {
        throw new Error(data?.error || 'Failed to get authorization URL');
      }
    } catch (error: any) {
      console.error('Failed to initiate Google OAuth:', error);
      toast.error('Failed to connect: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthCallback = async (code: string) => {
    setLoading(true);
    try {
      const redirectUri = `${window.location.origin}/credentials`;
      
      const { data, error } = await supabase.functions.invoke('google-cloud-auth', {
        body: { 
          action: 'callback',
          code,
          redirect_uri: redirectUri
        }
      });

      if (error) throw error;

      if (data?.success && data?.refresh_token) {
        toast.success('Google Cloud connected! Save the refresh token below.');
        // Show the refresh token for user to save
        setAuthUrl(null);
        setStatus('connected');
        
        // Display refresh token for manual save to secrets
        toast.info(
          <div className="space-y-2">
            <p className="font-semibold">Save this refresh token to Supabase secrets:</p>
            <code className="text-xs bg-muted p-2 rounded block break-all">
              {data.refresh_token.substring(0, 20)}...
            </code>
            <p className="text-xs text-muted-foreground">
              Add as GOOGLE_REFRESH_TOKEN in Supabase → Settings → Edge Functions → Secrets
            </p>
          </div>,
          { duration: 30000 }
        );
      } else {
        throw new Error(data?.error || 'OAuth callback failed');
      }
    } catch (error: any) {
      console.error('OAuth callback failed:', error);
      toast.error('OAuth failed: ' + (error.message || 'Unknown error'));
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const copyAuthUrl = () => {
    if (authUrl) {
      navigator.clipboard.writeText(authUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('URL copied to clipboard');
    }
  };

  const services = [
    { name: 'Gmail', icon: '📧' },
    { name: 'Drive', icon: '📁' },
    { name: 'Sheets', icon: '📊' },
    { name: 'Calendar', icon: '📅' }
  ];

  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Cloud className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h4 className="font-semibold">Google Cloud Services</h4>
            <p className="text-sm text-muted-foreground">
              Gmail, Drive, Sheets, Calendar
            </p>
          </div>
        </div>
        
        {status === 'checking' && (
          <Badge variant="outline" className="border-muted">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Checking
          </Badge>
        )}
        {status === 'connected' && (
          <Badge variant="outline" className="border-success text-success">
            <CheckCircle className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        )}
        {status === 'disconnected' && (
          <Badge variant="outline" className="border-warning text-warning">
            <AlertCircle className="h-3 w-3 mr-1" />
            Not Connected
          </Badge>
        )}
        {status === 'error' && (
          <Badge variant="outline" className="border-destructive text-destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        )}
      </div>

      {/* Service icons */}
      <div className="flex gap-2 mb-4">
        {services.map((service) => (
          <div
            key={service.name}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
              status === 'connected' 
                ? 'bg-success/10 text-success' 
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <span>{service.icon}</span>
            <span>{service.name}</span>
          </div>
        ))}
      </div>

      {status !== 'connected' && (
        <div className="space-y-3">
          <Button
            onClick={handleConnect}
            disabled={loading}
            className="w-full"
            variant="default"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Cloud className="h-4 w-4 mr-2" />
                Connect Google Cloud
              </>
            )}
          </Button>

          {authUrl && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                Popup blocked? Click below to authorize:
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => window.open(authUrl, '_blank')}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open Auth Page
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyAuthUrl}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Uses xmrtsolutions@gmail.com for backend service access
          </p>
        </div>
      )}

      {status === 'connected' && (
        <div className="space-y-3">
          <div className="p-3 bg-success/10 rounded-lg">
            <p className="text-sm text-success">
              ✓ Eliza can now access Gmail, Drive, Sheets, and Calendar
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={checkStatus}
            className="w-full"
          >
            Refresh Status
          </Button>
        </div>
      )}
    </Card>
  );
};

export default GoogleCloudConnect;
