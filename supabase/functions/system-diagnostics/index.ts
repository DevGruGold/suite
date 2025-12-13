import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'system-diagnostics';

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
    console.log('🔍 System Diagnostics - Gathering system information...');

    // Get system information using Deno APIs
    const diagnostics = {
      timestamp: new Date().toISOString(),
      system: {
        os: Deno.build.os,
        arch: Deno.build.arch,
        version: Deno.version.deno,
        typescript_version: Deno.version.typescript,
        v8_version: Deno.version.v8,
      },
      memory: {
        rss: Deno.memoryUsage().rss,
        heap_total: Deno.memoryUsage().heapTotal,
        heap_used: Deno.memoryUsage().heapUsed,
        external: Deno.memoryUsage().external,
      },
      environment: {
        hostname: Deno.hostname(),
        env_vars_count: Object.keys(Deno.env.toObject()).length,
      },
    };

    // Format memory values in MB
    const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    
    const formattedDiagnostics = {
      ...diagnostics,
      memory: {
        rss: formatMB(diagnostics.memory.rss),
        heap_total: formatMB(diagnostics.memory.heap_total),
        heap_used: formatMB(diagnostics.memory.heap_used),
        external: formatMB(diagnostics.memory.external),
      },
    };

    console.log('✅ System diagnostics gathered:', formattedDiagnostics);

    await usageTracker.success({ heap_used: diagnostics.memory.heap_used });
    return new Response(JSON.stringify({
      success: true,
      diagnostics: formattedDiagnostics,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ System diagnostics error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
