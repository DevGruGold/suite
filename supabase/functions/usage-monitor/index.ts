import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'usage-monitor';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const notifications = [];

    // Get all active API keys
    const { data: apiKeys } = await supabase
      .from('service_api_keys')
      .select('*')
      .eq('status', 'active');

    if (!apiKeys) {
      return new Response(
        JSON.stringify({ success: true, notifications: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    for (const key of apiKeys) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      
      // Get current month's usage
      const { data: usage } = await supabase
        .from('service_usage_logs')
        .select('request_count')
        .eq('api_key', key.api_key)
        .gte('logged_at', `${currentMonth}-01`)
        .maybeSingle();

      const currentUsage = usage?.request_count || 0;
      const limit = key.monthly_limit || 100;
      const usagePercent = (currentUsage / limit) * 100;

      // 75% quota warning
      if (usagePercent >= 75 && usagePercent < 100) {
        notifications.push({
          type: 'quota_warning',
          api_key: key.api_key,
          owner_email: key.owner_email,
          current_usage: currentUsage,
          limit,
          percent: usagePercent.toFixed(1),
          message: `You've used ${currentUsage} of ${limit} requests (${usagePercent.toFixed(1)}%). Consider upgrading to avoid hitting your limit.`,
        });
      }

      // Quota exceeded
      if (currentUsage >= limit) {
        notifications.push({
          type: 'quota_exceeded',
          api_key: key.api_key,
          owner_email: key.owner_email,
          current_usage: currentUsage,
          limit,
          message: `You've reached your ${limit} request limit. Upgrade to keep using the service.`,
        });
      }

      // High usage pattern (good upsell opportunity)
      if (usagePercent >= 90 && key.tier === 'free') {
        notifications.push({
          type: 'upsell_opportunity',
          api_key: key.api_key,
          owner_email: key.owner_email,
          current_usage: currentUsage,
          limit,
          message: `You're a power user! Upgrade to Basic tier ($10/mo) for 10x more requests and never worry about limits.`,
        });
      }

      // Inactive account (churn risk)
      const lastUsed = new Date(key.last_used || key.created_at);
      const daysSinceUse = Math.floor((Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSinceUse >= 30 && key.tier !== 'free') {
        notifications.push({
          type: 'churn_risk',
          api_key: key.api_key,
          owner_email: key.owner_email,
          days_inactive: daysSinceUse,
          tier: key.tier,
          message: `Haven't seen you in ${daysSinceUse} days! Is everything okay? Let me know if you need help.`,
        });
      }
    }

    // Log notifications for Eliza to act on
    for (const notification of notifications) {
      await supabase.from('eliza_activity_log').insert({
        activity_type: 'usage_notification',
        title: `Usage Alert: ${notification.type}`,
        description: notification.message,
        status: 'pending',
        metadata: notification,
      });

      console.log(`📊 Notification: ${notification.type} for ${notification.owner_email}`);
    }

    await usageTracker.success({ notifications_created: notifications.length });
    return new Response(
      JSON.stringify({
        success: true,
        notifications_created: notifications.length,
        notifications,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in usage-monitor:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
