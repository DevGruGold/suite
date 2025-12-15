import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface APIKeyHealth {
  service_name: string;
  key_type: string | null;
  is_healthy: boolean;
  last_checked: string;
  error_message: string | null;
  expiry_warning: boolean;
  days_until_expiry: number | null;
  metadata: any;
}

export interface CredentialRequiredError {
  error_type: 'credential_required';
  service: string;
  credential_type: string;
  reason: string;
  user_prompt: string;
  optional: boolean;
  help_url?: string;
  required_scopes?: string[];
  attempted?: string[];
}

export function isCredentialRequiredError(error: any): error is CredentialRequiredError {
  return error?.error_type === 'credential_required';
}

export async function getAPIKeyHealth(): Promise<APIKeyHealth[]> {
  const { data, error } = await supabase
    .from('api_key_health')
    .select('*')
    .order('service_name');

  if (error) {
    console.error('Failed to fetch API key health:', error);
    return [];
  }

  // Sort to show most important AI services first
  const sorted = (data || []).sort((a, b) => {
    const order = ['lovable_ai', 'vertex_ai', 'gemini', 'deepseek', 'openrouter', 'openai', 'github', 'elevenlabs', 'hume'];
    const aIndex = order.indexOf(a.service_name);
    const bIndex = order.indexOf(b.service_name);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });

  return sorted;
}

export async function refreshAPIKeyHealth(): Promise<void> {
  try {
    await supabase.functions.invoke('api-key-health-monitor');
    console.log('✅ API key health check triggered');
  } catch (error) {
    console.error('Failed to trigger health check:', error);
  }
}

export function useAPIKeyHealth() {
  const [health, setHealth] = useState<APIKeyHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      setLoading(true);
      const data = await getAPIKeyHealth();
      setHealth(data);
      setLoading(false);
    };

    fetchHealth();

    // Set up real-time subscription
    const channel = supabase
      .channel('api_key_health_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'api_key_health'
        },
        () => {
          fetchHealth();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { health, loading, refresh: refreshAPIKeyHealth };
}
