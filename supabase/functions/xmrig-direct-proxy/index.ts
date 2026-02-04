import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { xmrig_api_url, device_id, action } = await req.json();

    console.log('🔌 XMRig Direct Proxy Request:', { xmrig_api_url, device_id, action });

    // Validate XMRig API URL
    if (!xmrig_api_url || !xmrig_api_url.startsWith('http')) {
      throw new Error('Invalid XMRig API URL');
    }

    // Get DAO wallet from environment
    const DAO_WALLET = Deno.env.get('MINER_WALLET_ADDRESS');
    if (!DAO_WALLET) {
      throw new Error('DAO wallet not configured');
    }

    // Fetch stats from XMRig HTTP API
    const summaryUrl = `${xmrig_api_url}/2/summary`;
    console.log('📡 Fetching from XMRig:', summaryUrl);
    
    const xmrigResponse = await fetch(summaryUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!xmrigResponse.ok) {
      throw new Error(`XMRig API returned ${xmrigResponse.status}`);
    }

    const xmrigData = await xmrigResponse.json();
    console.log('📊 XMRig Response:', JSON.stringify(xmrigData, null, 2));

    // Parse XMRig data
    const hashrate = xmrigData.hashrate?.total?.[0] || 0; // 10s average
    const hashrate_60s = xmrigData.hashrate?.total?.[1] || 0;
    const hashrate_15m = xmrigData.hashrate?.total?.[2] || 0;
    
    const shares_good = xmrigData.results?.shares_good || 0;
    const shares_total = xmrigData.results?.shares_total || 0;
    
    const worker_id = xmrigData.worker_id || 'unknown';
    const uptime = xmrigData.uptime || 0;
    const pool_url = xmrigData.connection?.pool || '';

    // Extract wallet from pool connection (format: wallet@domain:port)
    const wallet_match = pool_url.match(/^([^@]+)@/);
    const detected_wallet = wallet_match ? wallet_match[1] : null;

    console.log('💰 Wallet Detection:', { pool_url, detected_wallet, dao_wallet: DAO_WALLET });

    // Validate wallet matches DAO pool
    if (!detected_wallet) {
      throw new Error('Cannot detect wallet address from XMRig pool connection. Ensure your miner is running and connected to a pool.');
    }

    if (detected_wallet !== DAO_WALLET) {
      throw new Error(`You must mine to the XMRT DAO pool wallet. Detected: ${detected_wallet.substring(0, 8)}... but expected: ${DAO_WALLET.substring(0, 8)}...`);
    }

    console.log('✅ Wallet validation passed - mining to DAO pool');

    // If action is 'connect', store in database
    if (action === 'connect' && device_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Upsert XMR worker with XMRig API URL and validated wallet
      const { data: worker, error: workerError } = await supabase
        .from('xmr_workers')
        .upsert({
          worker_id: worker_id,
          wallet_address: detected_wallet,
          xmrig_api_url: xmrig_api_url,
          connection_type: 'xmrig_direct',
          is_active: true,
          metadata: {
            last_hashrate: hashrate,
            uptime: uptime,
            pool: pool_url,
            mining_pool_type: 'dao_pool',
            last_updated: new Date().toISOString(),
          },
        }, {
          onConflict: 'worker_id',
        })
        .select()
        .single();

      if (workerError) {
        console.error('❌ Error upserting worker:', workerError);
        throw workerError;
      }

      console.log('✅ Worker upserted:', worker);

      // Create device-miner association
      const { error: assocError } = await supabase
        .from('device_miner_associations')
        .upsert({
          device_id: device_id,
          miner_id: worker.id,
          is_active: true,
          metadata: {
            connection_type: 'xmrig_direct',
            mining_pool_type: 'dao_pool',
            last_shares_counted: 0,
            total_shares_rewarded: 0,
            connected_at: new Date().toISOString(),
          },
        }, {
          onConflict: 'device_id,miner_id',
        });

      if (assocError) {
        console.error('❌ Error creating association:', assocError);
      }

      // Store mining update
      const { error: updateError } = await supabase
        .from('mining_updates')
        .insert({
          miner_id: worker.id,
          metric: {
            hashrate: hashrate,
            hashrate_60s: hashrate_60s,
            hashrate_15m: hashrate_15m,
            shares_good: shares_good,
            shares_total: shares_total,
            uptime: uptime,
            source: 'xmrig_direct',
          },
        });

      if (updateError) {
        console.error('⚠️ Error storing mining update:', updateError);
      }
    }

    // Return stats in standardized format
    return new Response(JSON.stringify({
      success: true,
      source: 'xmrig_direct',
      detected_wallet: detected_wallet,
      worker: {
        worker_id: worker_id,
        is_active: true,
      },
      stats: {
        hashrate: hashrate,
        hashrate_60s: hashrate_60s,
        hashrate_15m: hashrate_15m,
        shares: shares_good,
        shares_total: shares_total,
        xmr_earned: 0, // XMRig doesn't track earnings
        xmrt_bonus: 0,
      },
      raw_data: xmrigData,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ XMRig Proxy Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
