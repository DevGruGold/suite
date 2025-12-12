import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'mining-proxy';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Monero atomic units conversion: 1 XMR = 10^12 atomic units
const MONERO_ATOMIC_UNITS = 1000000000000;

function atomicUnitsToXMR(atomicUnits: number): number {
  return atomicUnits / MONERO_ATOMIC_UNITS;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    const url = new URL(req.url);
    const path = url.pathname;
    
    // Handle worker registration endpoint (POST /worker or /register)
    if ((path.includes('/worker') || path.includes('/register')) && req.method === 'POST') {
      const body = await req.json();
      const { worker_id, wallet, alias, user_id, session_key } = body;
      
      if (!worker_id || !wallet) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Missing required fields: worker_id and wallet' 
          }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      console.log('Registering worker:', worker_id, 'for wallet:', wallet);
      
      // Store worker registration in user_worker_mappings table
      const { data: workerData, error: workerError } = await supabase
        .from('user_worker_mappings')
        .upsert({
          worker_id,
          wallet_address: wallet,
          alias: alias || null,
          user_id: user_id || null,
          session_key: session_key || null,
          device_type: body.device_type || 'unknown',
          registration_method: body.registration_method || 'direct',
          last_active: new Date().toISOString(),
          is_active: true,
          metadata: {
            registered_via: 'mobile_miner',
            timestamp: body.timestamp || Date.now(),
            user_agent: req.headers.get('user-agent') || 'unknown'
          }
        }, {
          onConflict: 'worker_id'
        })
        .select()
        .single();
      
      if (workerError) {
        console.error('Worker registration error:', workerError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to register worker',
            details: workerError.message
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      console.log('Worker registered successfully:', workerData);
      
      return new Response(
        JSON.stringify({ 
          success: true,
          worker: workerData,
          message: 'Worker registered successfully'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const minerAddress = Deno.env.get('MINER_WALLET_ADDRESS') || '46UxNFuGM2E3UwmZWWJicaRPoRwqwW4byQkaTHkX8yPcVihp91qAVtSFipWUGJJUyTXgzSqxzDQtNLf2bsp2DX2qCCgC5mg';
    const apiUrl = `https://www.supportxmr.com/api/miner/${minerAddress}/stats/`;
    
    console.log('Fetching mining stats from SupportXMR:', apiUrl);
    console.log('Using miner address:', minerAddress);
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'XMRT-DAO/1.0',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Mining API error:', response.status, response.statusText);
      throw new Error(`Mining API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Mining stats fetched successfully');
    console.log('Full API Response:', JSON.stringify(data, null, 2));

    // The SupportXMR API returns data in format: { "amtDue": ..., "amtPaid": ..., "hash": ..., etc. }
    // Not in a nested structure. Let's adapt to whatever structure comes back.
    
    // Register/update individual workers from perWorkerStats if it exists
    const workers = [];
    if (data.perWorkerStats && Array.isArray(data.perWorkerStats)) {
      for (const worker of data.perWorkerStats) {
        const workerId = worker.identifier || worker.identifer || worker.id || 'unknown';
        
        // Update worker_registrations (legacy table for compatibility)
        const { error: legacyError } = await supabase
          .from('worker_registrations')
          .upsert({
            worker_id: workerId,
            ip_address: '0.0.0.0',
            last_seen: new Date().toISOString(),
            is_active: true,
            metadata: {
              hash_rate: worker.hash || 0,
              valid_shares: worker.validShares || 0,
              invalid_shares: worker.invalidShares || 0,
              last_hash_time: worker.lastHash || worker.lts || 0,
            }
          }, {
            onConflict: 'worker_id'
          });

        if (legacyError) {
          console.error('Failed to update legacy worker_registrations:', workerId, legacyError);
        }
        
        // Update user_worker_mappings with latest stats from pool
        const { data: mappingData, error: mappingError } = await supabase
          .from('user_worker_mappings')
          .update({
            last_active: new Date().toISOString(),
            total_hashrate: worker.hash || 0,
            total_shares: worker.validShares || 0,
            metadata: {
              ...worker,
              last_updated_from_pool: new Date().toISOString()
            }
          })
          .eq('worker_id', workerId)
          .select()
          .single();
        
        if (mappingError && mappingError.code !== 'PGRST116') {
          console.error('Failed to update worker mapping:', workerId, mappingError);
        } else if (mappingData) {
          console.log('Worker mapping updated:', workerId, 'for wallet:', mappingData.wallet_address);
        }

        workers.push({
          identifier: workerId,
          hash: worker.hash || 0,
          validShares: worker.validShares || 0,
          invalidShares: worker.invalidShares || 0,
          lastHash: worker.lastHash || worker.lts || 0,
          wallet: mappingData?.wallet_address || null,
          alias: mappingData?.alias || null,
        });
      }
    }

    // Return both workers array AND original data with XMR conversion
    const responseData = {
      ...data,
      // Convert atomic units to XMR for all amount fields
      amtDue: atomicUnitsToXMR(data.amtDue || 0),
      amtPaid: atomicUnitsToXMR(data.amtPaid || 0),
      amountDue: atomicUnitsToXMR(data.amtDue || 0), // Alias for compatibility
      amountPaid: atomicUnitsToXMR(data.amtPaid || 0), // Alias for compatibility
      workers: workers.length > 0 ? workers : undefined
    };

    await usageTracker.success({ workers_count: workers.length, has_data: !!data });

    return new Response(
      JSON.stringify(responseData),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error: any) {
    console.error('Mining proxy error:', error);
    await usageTracker.failure(error?.message || 'Unknown error', 500);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch mining stats',
        message: error?.message || 'Unknown error occurred'
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
})
