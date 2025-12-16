import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
  };
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  return new Response(JSON.stringify({
    message: "ai-chat is working - enhanced features coming in Phase 2!",
    function: "ai-chat",
    status: "minimal_operational"
  }), { headers });
});