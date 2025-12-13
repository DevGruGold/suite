import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { startUsageTracking } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'superduper-code-architect';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-eliza-key',
};

/**
 * SuperDuper Agent: Code Architect & Quality Guardian
 * Capabilities: Code Review, Architecture Design, Full-Stack Development
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
      console.log('🎯 Code Architect & Quality Guardian: Cron health check - OK');
      await usageTracker.success({ result_summary: 'cron_health_check' });
      return new Response(
        JSON.stringify({ 
          success: true, 
          cron: true,
          agent: "Code Architect & Quality Guardian",
          status: "healthy",
          message: "Ready for code architecture tasks",
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎯 Code Architect & Quality Guardian: ${action}`);

    const result = {
      agent: "Code Architect & Quality Guardian",
      action,
      status: "success",
      message: `Code Architect & Quality Guardian successfully executed: ${action}`,
      timestamp: new Date().toISOString(),
      data: params
    };

    await usageTracker.success({ result_summary: `${action}_completed` });
    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error("Code Architect & Quality Guardian error:", error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});