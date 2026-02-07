import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const POOL_WALLET = "46UxNFuGM2E3UwmZWWJicaRPoRwqwW4byQkaTHkX8yPcVihp91qAVtSFipWUGJJUyTXgzSqxzDQtNLf2bsp2DX2qCCgC5mg";
const POOL_URL = "pool.supportxmr.com:3333";

function generateUserNumber(username: string): string {
  const seed = `${username}-${Date.now()}-${Math.random()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(seed);
  return crypto.subtle.digest('SHA-256', data)
    .then(hash => {
      const hexString = Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      return hexString.substring(0, 8).toUpperCase();
    });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, device_info } = await req.json();
    
    if (!username || username.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Username is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user_number = await generateUserNumber(username);
    const worker_id = `${POOL_WALLET}.${user_number}`;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Store registration in user_worker_mappings
    const { error: dbError } = await supabase
      .from('user_worker_mappings')
      .upsert({
        worker_id: user_number,
        wallet: POOL_WALLET,
        device_type: device_info || 'mobile-termux',
        registration_method: 'edge-function',
        username: username,
        registered_at: new Date().toISOString()
      }, {
        onConflict: 'worker_id'
      });

    if (dbError) {
      console.error('Database error:', dbError);
    }

    // Generate config
    const config = {
      autosave: true,
      cpu: true,
      opencl: false,
      cuda: false,
      pools: [{
        url: POOL_URL,
        user: worker_id,
        pass: "xmrt-dao-mobile",
        keepalive: true,
        tls: false
      }]
    };

    const response = {
      success: true,
      user_number,
      worker_id,
      pool_url: POOL_URL,
      username,
      config_json: JSON.stringify(config, null, 2),
      tracking_url: "https://xmrtdao.streamlit.app",
      instructions: [
        "1. Save the config_json to 'config.json'",
        "2. Install XMRig: git clone https://github.com/xmrig/xmrig.git",
        "3. Build: cd xmrig && mkdir build && cd build && cmake .. && make",
        "4. Start mining: ./xmrig -c /path/to/config.json"
      ]
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Registration error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
