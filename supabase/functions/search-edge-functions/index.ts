import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { EDGE_FUNCTIONS_REGISTRY } from '../_shared/edgeFunctionRegistry.ts';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'search-edge-functions';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, category } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Searching edge functions for: "${query}"${category ? ` (category: ${category})` : ''}`);

    // Import the registry
    const { EDGE_FUNCTIONS_REGISTRY } = await import('../_shared/edgeFunctionRegistry.ts');
    
    // Filter by category if provided
    let functions = category 
      ? EDGE_FUNCTIONS_REGISTRY.filter((f: any) => f.category === category)
      : EDGE_FUNCTIONS_REGISTRY;

    // Search across name, description, capabilities, and example_use
    const queryLower = query.toLowerCase();
    const results = functions
      .map((fn: any) => {
        let score = 0;
        
        // Exact name match gets highest score
        if (fn.name.toLowerCase() === queryLower) score += 100;
        else if (fn.name.toLowerCase().includes(queryLower)) score += 50;
        
        // Description matches
        if (fn.description.toLowerCase().includes(queryLower)) score += 30;
        
        // Capability matches
        const capabilityMatch = fn.capabilities.some((cap: string) => 
          cap.toLowerCase().includes(queryLower)
        );
        if (capabilityMatch) score += 40;
        
        // Example use matches
        if (fn.example_use.toLowerCase().includes(queryLower)) score += 20;
        
        return { ...fn, relevance_score: score };
      })
      .filter((fn: any) => fn.relevance_score > 0)
      .sort((a: any, b: any) => b.relevance_score - a.relevance_score)
      .slice(0, 10);

    console.log(`✅ Found ${results.length} matching functions`);
    await usageTracker.success({ query, results_count: results.length });

    return new Response(
      JSON.stringify({
        query,
        category,
        results,
        total_functions_searched: functions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error searching edge functions:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});