import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'redis-cache';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

console.log('🗄️ Redis Cache Service starting...');

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, key, value, ttl } = await req.json();
    
    const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
    const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
    
    if (!redisUrl || !redisToken) {
      throw new Error('Redis credentials not configured');
    }

    console.log(`📝 Redis action: ${action}, key: ${key}`);

    let result: any;

    switch(action) {
      case 'get':
        const getResponse = await fetch(`${redisUrl}/get/${key}`, {
          headers: { Authorization: `Bearer ${redisToken}` }
        });
        result = await getResponse.json();
        break;

      case 'set':
        const setUrl = ttl 
          ? `${redisUrl}/setex/${key}/${ttl}` 
          : `${redisUrl}/set/${key}`;
        const setResponse = await fetch(setUrl, {
          method: 'POST',
          headers: { 
            Authorization: `Bearer ${redisToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(value)
        });
        result = await setResponse.json();
        break;

      case 'delete':
        const delResponse = await fetch(`${redisUrl}/del/${key}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${redisToken}` }
        });
        result = await delResponse.json();
        break;

      case 'health':
        const pingResponse = await fetch(`${redisUrl}/ping`, {
          headers: { Authorization: `Bearer ${redisToken}` }
        });
        const pingResult = await pingResponse.json();
        result = { 
          status: 'ok', 
          connected: pingResult.result === 'PONG',
          timestamp: new Date().toISOString()
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`✅ Redis ${action} completed successfully`);
    await usageTracker.success({ action });

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Redis cache error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
