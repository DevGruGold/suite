import { supabase } from '@/integrations/supabase/client';

export interface CorrelationResult {
  hasCorrelation: boolean;
  confidence: number;
  matchedSources: string[];
  userProfileId?: string;
}

export interface LinkedIdentity {
  id: string;
  type: string;
  sourceId: string;
  confidence: number;
  createdAt: string;
}

export interface UnifiedProfile {
  id: string;
  displayName?: string;
  email?: string;
  walletAddress?: string;
  totalXmrtEarned: number;
  chatSessions: number;
  deviceConnections: number;
  linkedIdentities: LinkedIdentity[];
}

// Generate a simple device fingerprint
export const generateDeviceFingerprint = (): string => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('fingerprint', 2, 2);
  }
  
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 'unknown',
    canvas.toDataURL(),
  ];
  
  // Simple hash
  let hash = 0;
  const str = components.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(36);
};

export const userIdentityService = {
  /**
   * Record a session event for IP correlation
   */
  async recordSessionEvent(
    sessionKey: string,
    sourceType: 'chat_session' | 'device_connection' | 'xmrt_charger',
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const fingerprint = generateDeviceFingerprint();
    const userAgent = navigator.userAgent;
    
    try {
      await supabase.functions.invoke('correlate-user-identity', {
        body: {
          action: 'record_event',
          sessionKey,
          sourceType,
          userAgent,
          deviceFingerprint: fingerprint,
          metadata,
        },
      });
    } catch (err) {
      console.error('Failed to record session event:', err);
    }
  },

  /**
   * Check if correlation exists for a session
   */
  async checkCorrelation(sessionKey: string): Promise<CorrelationResult> {
    try {
      const { data, error } = await supabase.functions.invoke('correlate-user-identity', {
        body: {
          action: 'check_correlation',
          sessionKey,
        },
      });

      if (error) throw error;

      return data || {
        hasCorrelation: false,
        confidence: 0,
        matchedSources: [],
      };
    } catch (err) {
      console.error('Failed to check correlation:', err);
      return {
        hasCorrelation: false,
        confidence: 0,
        matchedSources: [],
      };
    }
  },

  /**
   * Get unified profile for a session (includes all linked data)
   */
  async getUnifiedProfile(sessionKey: string): Promise<UnifiedProfile | null> {
    try {
      const { data, error } = await supabase.functions.invoke('correlate-user-identity', {
        body: {
          action: 'get_unified_profile',
          sessionKey,
        },
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Failed to get unified profile:', err);
      return null;
    }
  },

  /**
   * Respond to a correlation match (accept/decline linking)
   */
  async respondToCorrelation(
    matchId: string,
    accept: boolean
  ): Promise<{ success: boolean }> {
    try {
      const { data, error } = await supabase.functions.invoke('correlate-user-identity', {
        body: {
          action: 'respond_to_match',
          matchId,
          accept,
        },
      });

      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error('Failed to respond to correlation:', err);
      return { success: false };
    }
  },

  /**
   * Get all linked identities for a profile
   */
  async getLinkedIdentities(profileId: string): Promise<LinkedIdentity[]> {
    try {
      const { data, error } = await supabase.functions.invoke('correlate-user-identity', {
        body: {
          action: 'get_linked_identities',
          profileId,
        },
      });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Failed to get linked identities:', err);
      return [];
    }
  },

  /**
   * Manually link two identities (requires consent)
   */
  async linkIdentities(
    sourceSessionKey: string,
    targetSessionKey: string
  ): Promise<{ success: boolean; profileId?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('correlate-user-identity', {
        body: {
          action: 'link_identities',
          sourceSessionKey,
          targetSessionKey,
        },
      });

      if (error) throw error;
      return data || { success: false };
    } catch (err) {
      console.error('Failed to link identities:', err);
      return { success: false };
    }
  },

  /**
   * Delete all correlation data for a session (GDPR compliance)
   */
  async deleteCorrelationData(sessionKey: string): Promise<{ success: boolean }> {
    try {
      const { data, error } = await supabase.functions.invoke('correlate-user-identity', {
        body: {
          action: 'delete_data',
          sessionKey,
        },
      });

      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error('Failed to delete correlation data:', err);
      return { success: false };
    }
  },

  /**
   * Get privacy consent status
   */
  getLocalConsent(): { ipCorrelation: boolean; deviceFingerprinting: boolean; crossPlatformLinking: boolean } | null {
    const stored = localStorage.getItem('xmrt_privacy_consent');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  },

  /**
   * Check if user has given any correlation consent
   */
  hasCorrelationConsent(): boolean {
    const consent = this.getLocalConsent();
    return consent?.ipCorrelation || consent?.crossPlatformLinking || false;
  },
};

export default userIdentityService;
