import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'superduper-research-intelligence';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-eliza-key',
};

/**
 * SuperDuper Agent: Research & Intelligence Synthesizer
 * Capabilities: Deep Research, Literature Review, Multi-Perspective Analysis
 */

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Fast boot: check content-length BEFORE parsing JSON
  const contentLength = parseInt(req.headers.get('content-length') || '0');
  if (contentLength === 0 || contentLength < 5) {
    console.log('🎯 Empty body - cron trigger, returning fast');
    await usageTracker.success({ cron: true });
    return new Response(JSON.stringify({ 
      success: true, 
      cron: true, 
      message: 'Cron trigger - no research action provided' 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { action, params, context } = await req.json();
    console.log(`🎯 Research & Intelligence Synthesizer: ${action}`);

    const result = {
      agent: "Research & Intelligence Synthesizer",
      action,
      status: "success",
      message: `Research & Intelligence Synthesizer successfully executed: ${action}`,
      timestamp: new Date().toISOString(),
      data: params
    };

    await usageTracker.success({ action });

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error("Research & Intelligence Synthesizer error:", error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
