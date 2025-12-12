import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { EDGE_FUNCTIONS_REGISTRY } from '../_shared/edgeFunctionRegistry.ts';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'list-available-functions';

// Use the shared registry as the single source of truth
const ALL_FUNCTIONS = EDGE_FUNCTIONS_REGISTRY.map(fn => ({
  name: fn.name,
  category: fn.category,
  description: fn.description,
  capabilities: fn.capabilities,
  example_use: fn.example_use
}));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const url = new URL(req.url);
    const category = url.searchParams.get("category");

    let functions = ALL_FUNCTIONS;
    
    if (category) {
      functions = ALL_FUNCTIONS.filter(f => f.category === category);
    }

    const categories = [...new Set(ALL_FUNCTIONS.map(f => f.category))];

    await usageTracker.success({ functions_count: functions.length, categories_count: categories.length });

    return new Response(
      JSON.stringify({
        success: true,
        total: functions.length,
        categories,
        functions,
        message: `Found ${functions.length} edge functions${category ? ` in category '${category}'` : ""}`,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
