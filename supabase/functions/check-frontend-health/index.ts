import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'check-frontend-health';

const VERCEL_SERVICES = [
  { name: 'frontend', url: 'https://xmrtdao.vercel.app/api/health' },
  { name: 'io', url: 'https://xmrt-io.vercel.app/health' },
  { name: 'ecosystem', url: 'https://xmrt-ecosystem.vercel.app/health' },
  { name: 'dao', url: 'https://xmrt-dao-ecosystem.vercel.app/health' }
];

console.log(`🏥 Multi-Service Health Check Scheduler starting...`);

async function checkServiceHealth(service: { name: string; url: string }, supabase: any) {
  const startTime = Date.now();
  try {
    const response = await fetch(service.url, {
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });
    
    const responseTime = Date.now() - startTime;
    const status = response.ok ? 'online' : 'degraded';
    
    // Log to database
    await supabase.from('vercel_service_health').insert({
      service_name: service.name,
      status,
      status_code: response.status,
      response_time_ms: responseTime,
      check_timestamp: new Date().toISOString(),
      error_message: null
    });
    
    return { service: service.name, status, responseTime };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    // Log error to database
    await supabase.from('vercel_service_health').insert({
      service_name: service.name,
      status: 'offline',
      status_code: 0,
      response_time_ms: responseTime,
      check_timestamp: new Date().toISOString(),
      error_message: error.message
    });
    
    return { service: service.name, status: 'offline', error: error.message };
  }
}

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`🔍 Checking health for all Vercel services...`);

    // Check all services in parallel
    const results = await Promise.all(
      VERCEL_SERVICES.map(service => checkServiceHealth(service, supabase))
    );

    const allHealthy = results.every(r => r.status === 'online');
    
    console.log(`✅ Health check completed:`, results);

    await usageTracker.success({ all_healthy: allHealthy, services_checked: results.length });
    return new Response(
      JSON.stringify({ 
        success: true,
        overall_status: allHealthy ? 'healthy' : 'degraded',
        services: results,
        checked_at: new Date().toISOString()
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in health check scheduler:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
});
