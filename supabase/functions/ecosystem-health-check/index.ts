import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    const checks = await Promise.allSettled([
      checkDatabase(supabase),
      checkSuiteBeta(),
      checkDAOEcosystem(),
      checkEcosystemHub()
    ]);
    
    const results = checks.map((check, index) => {
      const services = ["database", "suite-beta", "dao-ecosystem", "ecosystem-hub"];
      return {
        service: services[index],
        healthy: check.status === "fulfilled" && check.value.healthy,
        details: check.status === "fulfilled" ? check.value.details : check.reason
      };
    });
    
    const overallHealth = results.every(r => r.healthy) ? "healthy" : "degraded";
    
    return new Response(
      JSON.stringify({
        overall_health: overallHealth,
        checks: results,
        timestamp: new Date().toISOString()
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function checkDatabase(supabase: any) {
  try {
    const { data, error } = await supabase.from("agents").select("id").limit(1);
    return { healthy: !error, details: error ? error.message : "OK" };
  } catch (e) {
    return { healthy: false, details: e.message };
  }
}

async function checkSuiteBeta() {
  try {
    const response = await fetch("https://suite-beta.vercel.app/", { 
      signal: AbortSignal.timeout(5000) 
    });
    return { healthy: response.ok, details: `Status: ${response.status}` };
  } catch (e) {
    return { healthy: false, details: e.message };
  }
}

async function checkDAOEcosystem() {
  try {
    const response = await fetch("https://xmrt-dao-ecosystem.vercel.app/", { 
      signal: AbortSignal.timeout(5000) 
    });
    return { healthy: response.ok, details: `Status: ${response.status}` };
  } catch (e) {
    return { healthy: false, details: e.message };
  }
}

async function checkEcosystemHub() {
  try {
    const response = await fetch("https://xmrt-ecosystem.vercel.app/", { 
      signal: AbortSignal.timeout(5000) 
    });
    return { healthy: response.ok, details: `Status: ${response.status}` };
  } catch (e) {
    return { healthy: false, details: e.message };
  }
}
