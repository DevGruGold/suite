import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface APIKeyData {
  service_name: string;
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  owner_email: string;
  owner_name?: string;
}

interface UsageData {
  api_key: string;
  service_name: string;
  endpoint: string;
  tokens_used?: number;
  response_time_ms?: number;
  status_code?: number;
}

const TIER_QUOTAS = {
  free: 100,
  basic: 1000,
  pro: 10000,
  enterprise: 1000000,
};

const TIER_PRICES = {
  free: 0,
  basic: 10,
  pro: 50,
  enterprise: 500,
};

serve(async (req) => {
  const usageTracker = startUsageTracking('service-monetization-engine');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, data } = await req.json();
    console.log(`[Service Monetization] Action: ${action}`);

    switch (action) {
      case 'generate_api_key': {
        const keyData = data as APIKeyData;
        
        // Generate unique API key
        const apiKey = `xmrt_${keyData.tier}_${crypto.randomUUID().replace(/-/g, '').substring(0, 24)}`;
        
        // Insert API key record
        const { data: newKey, error: keyError } = await supabase
          .from('service_api_keys')
          .insert({
            api_key: apiKey,
            service_name: keyData.service_name,
            tier: keyData.tier,
            owner_email: keyData.owner_email,
            owner_name: keyData.owner_name,
            quota_requests_per_month: TIER_QUOTAS[keyData.tier],
            quota_used_current_month: 0,
            status: 'active',
          })
          .select()
          .single();

        if (keyError) throw keyError;

        // Revenue metrics can be calculated in batch later
        console.log(`[Service Monetization] Generated API key for ${keyData.owner_email}`);

        return new Response(
          JSON.stringify({
            success: true,
            api_key: apiKey,
            tier: keyData.tier,
            quota: TIER_QUOTAS[keyData.tier],
            monthly_cost: TIER_PRICES[keyData.tier],
            message: `API key generated successfully. Quota: ${TIER_QUOTAS[keyData.tier]} requests/month.`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'validate_api_key': {
        const { api_key } = data;

        const { data: keyRecord, error: keyError } = await supabase
          .from('service_api_keys')
          .select('*')
          .eq('api_key', api_key)
          .single();

        if (keyError || !keyRecord) {
          return new Response(
            JSON.stringify({ valid: false, error: 'Invalid API key' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
          );
        }

        // Check if expired
        if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
          return new Response(
            JSON.stringify({ valid: false, error: 'API key expired' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
          );
        }

        // Check if suspended
        if (keyRecord.status !== 'active') {
          return new Response(
            JSON.stringify({ valid: false, error: `API key ${keyRecord.status}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
          );
        }

        // Check quota
        if (keyRecord.quota_used_current_month >= keyRecord.quota_requests_per_month) {
          return new Response(
            JSON.stringify({ 
              valid: false, 
              error: 'Quota exceeded',
              quota_used: keyRecord.quota_used_current_month,
              quota_limit: keyRecord.quota_requests_per_month,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
          );
        }

        return new Response(
          JSON.stringify({
            valid: true,
            tier: keyRecord.tier,
            quota_remaining: keyRecord.quota_requests_per_month - keyRecord.quota_used_current_month,
            quota_limit: keyRecord.quota_requests_per_month,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'track_usage': {
        const usageData = data as UsageData;

        // Log usage
        const { error: logError } = await supabase
          .from('service_usage_logs')
          .insert({
            api_key: usageData.api_key,
            service_name: usageData.service_name,
            endpoint: usageData.endpoint,
            tokens_used: usageData.tokens_used || 0,
            response_time_ms: usageData.response_time_ms,
            status_code: usageData.status_code || 200,
            cost_usd: 0, // Calculate later based on tier pricing
          });

        if (logError) throw logError;

        // Get current usage and increment
        const { data: currentKey } = await supabase
          .from('service_api_keys')
          .select('quota_used_current_month')
          .eq('api_key', usageData.api_key)
          .single();

        const newUsage = (currentKey?.quota_used_current_month || 0) + 1;

        const { error: updateError } = await supabase
          .from('service_api_keys')
          .update({ 
            quota_used_current_month: newUsage,
            last_used_at: new Date().toISOString(),
          })
          .eq('api_key', usageData.api_key);

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({ success: true, tracked: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_usage_stats': {
        const { api_key } = data;

        const { data: keyRecord } = await supabase
          .from('service_api_keys')
          .select('*')
          .eq('api_key', api_key)
          .single();

        if (!keyRecord) {
          return new Response(
            JSON.stringify({ error: 'API key not found' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          );
        }

        // Get usage logs for current month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { data: usageLogs } = await supabase
          .from('service_usage_logs')
          .select('*')
          .eq('api_key', api_key)
          .gte('timestamp', startOfMonth.toISOString())
          .order('timestamp', { ascending: false })
          .limit(100);

        return new Response(
          JSON.stringify({
            api_key_info: {
              tier: keyRecord.tier,
              status: keyRecord.status,
              created_at: keyRecord.created_at,
              last_used_at: keyRecord.last_used_at,
            },
            quota: {
              used: keyRecord.quota_used_current_month,
              limit: keyRecord.quota_requests_per_month,
              remaining: keyRecord.quota_requests_per_month - keyRecord.quota_used_current_month,
              percentage: ((keyRecord.quota_used_current_month / keyRecord.quota_requests_per_month) * 100).toFixed(1),
            },
            recent_usage: usageLogs || [],
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'upgrade_tier': {
        const { api_key, new_tier } = data;

        const { error: updateError } = await supabase
          .from('service_api_keys')
          .update({
            tier: new_tier,
            quota_requests_per_month: TIER_QUOTAS[new_tier as keyof typeof TIER_QUOTAS],
          })
          .eq('api_key', api_key);

        if (updateError) throw updateError;

        console.log(`[Service Monetization] Upgraded ${api_key} to ${new_tier}`);

        return new Response(
          JSON.stringify({
            success: true,
            new_tier,
            new_quota: TIER_QUOTAS[new_tier as keyof typeof TIER_QUOTAS],
            new_monthly_cost: TIER_PRICES[new_tier as keyof typeof TIER_PRICES],
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'suspend_api_key': {
        const { api_key, reason } = data;

        // Get current metadata
        const { data: currentKey } = await supabase
          .from('service_api_keys')
          .select('metadata')
          .eq('api_key', api_key)
          .single();

        const updatedMetadata = {
          ...(currentKey?.metadata || {}),
          suspend_reason: reason,
        };

        const { error: suspendError } = await supabase
          .from('service_api_keys')
          .update({
            status: 'suspended',
            metadata: updatedMetadata,
          })
          .eq('api_key', api_key);

        if (suspendError) throw suspendError;

        console.log(`[Service Monetization] Suspended ${api_key}: ${reason}`);

        return new Response(
          JSON.stringify({ success: true, suspended: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'calculate_revenue': {
        const { start_date, end_date } = data;

        // Get all active API keys
        const { data: apiKeys } = await supabase
          .from('service_api_keys')
          .select('tier, created_at, status');

        const activeKeys = apiKeys?.filter(k => k.status === 'active') || [];
        
        const tierCounts = {
          free: activeKeys.filter(k => k.tier === 'free').length,
          basic: activeKeys.filter(k => k.tier === 'basic').length,
          pro: activeKeys.filter(k => k.tier === 'pro').length,
          enterprise: activeKeys.filter(k => k.tier === 'enterprise').length,
        };

        const mrr = 
          tierCounts.basic * TIER_PRICES.basic +
          tierCounts.pro * TIER_PRICES.pro +
          tierCounts.enterprise * TIER_PRICES.enterprise;

        // Get usage stats
        const { data: usageLogs, count } = await supabase
          .from('service_usage_logs')
          .select('*', { count: 'exact' })
          .gte('timestamp', start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .lte('timestamp', end_date || new Date().toISOString());

        // Service breakdown
        const serviceBreakdown: Record<string, number> = {};
        usageLogs?.forEach(log => {
          serviceBreakdown[log.service_name] = (serviceBreakdown[log.service_name] || 0) + 1;
        });

        const topService = Object.entries(serviceBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

        return new Response(
          JSON.stringify({
            mrr_usd: mrr,
            total_customers: activeKeys.length,
            tier_breakdown: tierCounts,
            total_requests: count || 0,
            top_service: topService,
            service_breakdown: serviceBreakdown,
            period: {
              start: start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              end: end_date || new Date().toISOString(),
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'create_invoice': {
        const { api_key } = data;

        // Get API key info
        const { data: keyRecord } = await supabase
          .from('service_api_keys')
          .select('*')
          .eq('api_key', api_key)
          .single();

        if (!keyRecord) {
          return new Response(
            JSON.stringify({ error: 'API key not found' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          );
        }

        // Calculate billing period
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        // Get usage count
        const { count } = await supabase
          .from('service_usage_logs')
          .select('*', { count: 'exact', head: true })
          .eq('api_key', api_key)
          .gte('timestamp', periodStart.toISOString())
          .lte('timestamp', periodEnd.toISOString());

        const totalCost = TIER_PRICES[keyRecord.tier as keyof typeof TIER_PRICES];

        // Create invoice
        const { data: invoice, error: invoiceError } = await supabase
          .from('service_invoices')
          .insert({
            api_key,
            billing_period_start: periodStart.toISOString(),
            billing_period_end: periodEnd.toISOString(),
            total_requests: count || 0,
            total_cost_usd: totalCost,
            status: 'pending',
          })
          .select()
          .single();

        if (invoiceError) throw invoiceError;

        return new Response(
          JSON.stringify({
            success: true,
            invoice,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_top_customers': {
        const { limit = 10 } = data;

        // Get top customers by tier and usage
        const { data: topKeys } = await supabase
          .from('service_api_keys')
          .select('*')
          .eq('status', 'active')
          .order('tier', { ascending: false })
          .order('quota_used_current_month', { ascending: false })
          .limit(limit);

        const customersWithValue = topKeys?.map(key => ({
          owner_email: key.owner_email,
          owner_name: key.owner_name,
          tier: key.tier,
          monthly_value: TIER_PRICES[key.tier as keyof typeof TIER_PRICES],
          usage_this_month: key.quota_used_current_month,
          created_at: key.created_at,
          last_used_at: key.last_used_at,
        })) || [];

        return new Response(
          JSON.stringify({
            top_customers: customersWithValue,
            total_value: customersWithValue.reduce((sum, c) => sum + c.monthly_value, 0),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        await usageTracker.failure(`Unknown action: ${action}`, 400);
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
  } catch (error) {
    console.error('[Service Monetization] Error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
