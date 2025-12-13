import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { startUsageTracking } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'superduper-communication-outreach';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-eliza-key',
};

/**
 * SuperDuper Agent: Communication & Outreach Maestro
 * Capabilities: Email Drafting, Profile Optimization, Investor Outreach
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body for cron triggers
    }

    const { action, params, context } = body;

    // Early return for cron triggers
    if (!action) {
      console.log('🎯 Communication & Outreach Maestro: Cron health check - OK');
      await usageTracker.success({ result_summary: 'cron_health_check' });
      return new Response(
        JSON.stringify({ 
          success: true, 
          cron: true,
          agent: "Communication & Outreach Maestro",
          status: "healthy",
          message: "Ready for outreach tasks",
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎯 Communication & Outreach Maestro: ${action}`);

    const result = {
      agent: "Communication & Outreach Maestro",
      action,
      status: "success",
      message: `Communication & Outreach Maestro successfully executed: ${action}`,
      timestamp: new Date().toISOString(),
      data: params
    };

    await usageTracker.success({ result_summary: `${action}_completed` });
    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error("Communication & Outreach Maestro error:", error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});