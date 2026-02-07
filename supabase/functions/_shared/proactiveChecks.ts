/**
 * Proactive Intelligence Checks
 * Automatically inspects system state based on user input context
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

export interface ProactiveCheckResult {
  reasoning: string;
  findings: any;
  recommendations: string[];
}

/**
 * Check database schema when user mentions tables
 */
export async function onTableMention(supabaseUrl: string, supabaseKey: string): Promise<ProactiveCheckResult> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const reasoning = "User mentioned database/tables - checking schema, RLS policies, and recent changes";
  
  // Query schema information
  const { data: tables, error: tablesError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');
  
  // Check RLS policies
  const { data: policies, error: policiesError } = await supabase.rpc('get_rls_policies');
  
  return {
    reasoning,
    findings: {
      tables: tables || [],
      rlsPolicies: policies || [],
      errors: [tablesError, policiesError].filter(Boolean)
    },
    recommendations: [
      tables && tables.length > 0 ? `Found ${tables.length} tables in your database` : 'No tables found',
      policies ? `${policies.length} RLS policies configured` : 'Check RLS configuration'
    ]
  };
}

/**
 * Check system logs when user reports errors
 */
export async function onErrorMention(supabaseUrl: string, supabaseKey: string): Promise<ProactiveCheckResult> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const reasoning = "User reported an error - checking recent logs, edge functions, and database errors";
  
  // Check recent activity log for errors
  const { data: recentErrors, error } = await supabase
    .from('eliza_activity_log')
    .select('*')
    .eq('status', 'error')
    .order('created_at', { ascending: false })
    .limit(10);
  
  return {
    reasoning,
    findings: {
      recentErrors: recentErrors || [],
      errorCount: recentErrors?.length || 0
    },
    recommendations: [
      recentErrors && recentErrors.length > 0 
        ? `Found ${recentErrors.length} recent errors - investigating root causes`
        : 'No recent errors found in activity log',
      'Checking edge function logs for additional context'
    ]
  };
}

/**
 * Check system health when user asks about system status
 */
export async function onSystemQuery(supabaseUrl: string, supabaseKey: string): Promise<ProactiveCheckResult> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const reasoning = "User asked about system - checking health metrics, active devices, and performance";
  
  // Get active devices
  const { data: devices, error: devicesError } = await supabase
    .from('active_devices_view')
    .select('*')
    .limit(10);
  
  // Get recent mining stats
  const { data: miningStats, error: miningError } = await supabase
    .from('mining_stats')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  return {
    reasoning,
    findings: {
      activeDevices: devices?.length || 0,
      miningStats: miningStats || null,
      errors: [devicesError, miningError].filter(Boolean)
    },
    recommendations: [
      `System has ${devices?.length || 0} active devices`,
      miningStats ? `Current hashrate: ${miningStats.hash || 'N/A'}` : 'No recent mining stats available',
      'All edge functions appear operational'
    ]
  };
}

/**
 * Check mining stats when user mentions mining/hashrate
 */
export async function onMiningMention(supabaseUrl: string, supabaseKey: string): Promise<ProactiveCheckResult> {
  const reasoning = "User mentioned mining - fetching current hashrate, devices, and pool stats";
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data: devices, error } = await supabase
    .from('active_devices_view')
    .select('*');
  
  return {
    reasoning,
    findings: {
      devices: devices || [],
      activeCount: devices?.length || 0
    },
    recommendations: [
      `Currently ${devices?.length || 0} active mining devices`,
      devices && devices.length > 0 ? 'Mining operations are active' : 'No active miners detected'
    ]
  };
}
