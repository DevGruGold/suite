// Unified Data Service - Single source of truth for all XMRT data
import { supabase } from '@/integrations/supabase/client';

export interface MiningStats {
  hashRate: number;
  validShares: number;
  totalHashes: number;
  amountDue: number;
  amountPaid: number;
  isOnline: boolean;
  lastUpdate: Date;
}

export interface UserContext {
  ip: string;
  isFounder: boolean;
  founderConfidence: number;
  founderSignals: string[];
  timestamp: number;
}

export interface FounderValidation {
  isFounder: boolean;
  confidence: number;
  signals: string[];
}

// Known founder IP - this is the primary identification signal
const FOUNDER_IP = '190.211.120.214';

class UnifiedDataService {
  private miningStatsCache: { data: MiningStats | null; timestamp: number } = { data: null, timestamp: 0 };
  private userContextCache: { data: UserContext | null; timestamp: number } = { data: null, timestamp: 0 };
  private readonly CACHE_DURATION = 30000; // 30 seconds

  // Multi-signal founder validation
  async validateFounderStatus(ip: string): Promise<FounderValidation> {
    const signals: string[] = [];
    let confidence = 0;

    // Signal 1: Direct IP match to known founder IP (PRIMARY - 100 points)
    if (ip === FOUNDER_IP) {
      signals.push('ip_match_known_founder');
      confidence += 100;
      console.log('🎖️ Founder validation: IP matches known founder IP');
    }

    // Signal 2: Database founder flag in user_profiles.metadata
    try {
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('metadata, total_xmrt_earned')
        .eq('ip_address', ip)
        .maybeSingle();
      
      // Type-safe access to metadata.founder
      const metadata = profileData?.metadata as Record<string, unknown> | null;
      if (metadata?.founder === true) {
        signals.push('db_founder_flag');
        confidence += 50;
        console.log('🎖️ Founder validation: Database founder flag is true');
      }

      // Signal 3: High XMRT earnings (founder has significant history)
      if (profileData?.total_xmrt_earned && profileData.total_xmrt_earned > 100000) {
        signals.push('high_xmrt_earnings');
        confidence += 20;
        console.log('🎖️ Founder validation: High XMRT earnings detected');
      }
    } catch (error) {
      console.warn('Failed to query user_profiles for founder validation:', error);
    }

    // Signal 4: Device connection history from this IP
    try {
      const { data: deviceSessions } = await supabase
        .from('battery_sessions')
        .select('device_id')
        .eq('ip_address', ip)
        .order('started_at', { ascending: false })
        .limit(10);
      
      if (deviceSessions && deviceSessions.length >= 5) {
        signals.push('consistent_device_usage');
        confidence += 10;
        console.log('🎖️ Founder validation: Consistent device usage pattern');
      }
    } catch (error) {
      console.warn('Failed to query device sessions for founder validation:', error);
    }

    // Signal 5: localStorage backup (for testing/development)
    if (localStorage.getItem('isProjectFounder') === 'true') {
      signals.push('localstorage_flag');
      confidence += 10;
    }

    const isFounder = confidence >= 50; // Need at least database flag OR IP match
    
    console.log(`🎖️ Founder validation complete: ${isFounder ? 'CONFIRMED' : 'NOT FOUNDER'} (confidence: ${confidence}, signals: ${signals.join(', ')})`);
    
    return {
      isFounder,
      confidence: Math.min(confidence, 100),
      signals
    };
  }

  // Get user context (IP and founder status) - NOW QUERIES DATABASE
  async getUserContext(): Promise<UserContext> {
    const now = Date.now();
    
    // Return cached data if fresh
    if (this.userContextCache.data && (now - this.userContextCache.timestamp) < this.CACHE_DURATION) {
      return this.userContextCache.data;
    }

    try {
      // Get current IP
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      const ip = data.ip || 'Unknown';
      
      console.log('📡 Current IP:', ip);
      
      // Validate founder status using multi-signal approach
      const founderValidation = await this.validateFounderStatus(ip);
      
      const userContext: UserContext = {
        ip,
        isFounder: founderValidation.isFounder,
        founderConfidence: founderValidation.confidence,
        founderSignals: founderValidation.signals,
        timestamp: now
      };

      // Cache the result
      this.userContextCache = { data: userContext, timestamp: now };
      
      if (founderValidation.isFounder) {
        console.log('🎖️ FOUNDER STATUS CONFIRMED for IP:', ip);
      }
      
      return userContext;
      
    } catch (error) {
      console.error('Failed to fetch user context:', error);
      
      // Return fallback data
      const fallback: UserContext = {
        ip: 'Unknown',
        isFounder: localStorage.getItem('isProjectFounder') === 'true',
        founderConfidence: 0,
        founderSignals: [],
        timestamp: now
      };
      
      this.userContextCache = { data: fallback, timestamp: now };
      return fallback;
    }
  }

// Make getMiningStats an instance method instead of static
  async getMiningStats(): Promise<MiningStats | null> {
    const now = Date.now();
    
    // Return cached data if fresh
    if (this.miningStatsCache.data && (now - this.miningStatsCache.timestamp) < this.CACHE_DURATION) {
      return this.miningStatsCache.data;
    }

    try {
      console.log('📊 UnifiedData: Fetching mining statistics...');
      
      // Use Supabase proxy endpoint which handles CORS
      const response = await fetch('https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/mining-proxy');
      
      if (!response.ok) {
        console.warn('⚠️ Mining API request failed:', response.status);
        return null; // No mock data - return null if real data unavailable
      }
      
      const data = await response.json();
      console.log('✅ UnifiedData: Mining stats retrieved');
      
      const miningStats: MiningStats = {
        hashRate: data.hash || 0,
        validShares: data.validShares || 0,
        totalHashes: data.totalHashes || 0,
        amountDue: (data.amtDue || 0) / 1000000000000, // Convert from atomic units
        amountPaid: (data.amtPaid || 0) / 1000000000000,
        isOnline: data.lastHash ? ((Date.now() / 1000) - data.lastHash) < 300 : false, // Online if last hash within 5 minutes
        lastUpdate: new Date()
      };

      // Cache the result
      this.miningStatsCache = { data: miningStats, timestamp: now };
      return miningStats;
      
    } catch (error) {
      console.error('❌ UnifiedData: Mining stats error:', error);
      return null; // No fallback mock data - return null on error
    }
  }

  // Format mining stats for display - updated for new interface
  formatMiningStats(stats: MiningStats | null): string {
    if (!stats) return 'Mining statistics are currently unavailable.';

    const formatHashrate = (hashrate: number): string => {
      if (hashrate >= 1000000) {
        return `${(hashrate / 1000000).toFixed(2)} MH/s`;
      } else if (hashrate >= 1000) {
        return `${(hashrate / 1000).toFixed(2)} KH/s`;
      }
      return `${hashrate.toFixed(2)} H/s`;
    };

    return `📊 **Live Mining Statistics (SupportXMR Pool):**
• **Hash Rate**: ${formatHashrate(stats.hashRate)}
• **Status**: ${stats.isOnline ? '🟢 Mining (Online)' : '🔴 Idle (Offline)'}
• **Valid Shares**: ${stats.validShares.toLocaleString()}
• **Total Hashes**: ${stats.totalHashes.toLocaleString()}
• **Amount Due**: ${stats.amountDue.toFixed(6)} XMR
• **Amount Paid**: ${stats.amountPaid.toFixed(6)} XMR
• **Last Update**: ${stats.lastUpdate.toLocaleTimeString()}`;
  }

  // Clear all caches
  clearCache(): void {
    this.miningStatsCache = { data: null, timestamp: 0 };
    this.userContextCache = { data: null, timestamp: 0 };
  }

  // Get cache status for debugging
  getCacheStatus() {
    const now = Date.now();
    return {
      miningStats: {
        cached: !!this.miningStatsCache.data,
        age: now - this.miningStatsCache.timestamp,
        fresh: (now - this.miningStatsCache.timestamp) < this.CACHE_DURATION
      },
      userContext: {
        cached: !!this.userContextCache.data,
        age: now - this.userContextCache.timestamp,
        fresh: (now - this.userContextCache.timestamp) < this.CACHE_DURATION
      }
    };
  }
}

// Export singleton instance
export const unifiedDataService = new UnifiedDataService();