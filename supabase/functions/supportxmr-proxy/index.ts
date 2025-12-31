import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Hardcoded wallet address for mining pool
const DEFAULT_WALLET = '46UxNFuGM2E3UwmZWWJicaRPoRwqwW4byQkaTHkX8yPcVihp91qAVtSFipWUGJJUyTXgzSqxzDQtNLf2bsp2DX2qCCgC5mg';
const POOL_API_BASE = 'https://supportxmr.com/api';

// Monero atomic units: 1 XMR = 1,000,000,000,000 piconeros
const ATOMIC_UNITS = 1000000000000;

interface MinerStats {
  hash: number;
  totalHashes: number;
  lastHash: number;
  validShares: number;
  invalidShares: number;
  amtPaid: number;
  amtDue: number;
  txnCount: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
      },
    });
  }

  try {
    // Parse request body, handle empty body gracefully
    let body: any = {};
    try {
      const text = await req.text();
      if (text && text.trim()) {
        body = JSON.parse(text);
      }
    } catch (parseError) {
      console.log('Request body parse error (non-fatal):', parseError);
      // Continue with empty body - will use defaults
    }

    const { action = 'get_stats', wallet_address, worker_id } = body;
    
    // Use provided wallet or fall back to default
    const walletToUse = wallet_address || DEFAULT_WALLET;
    
    console.log(`Action: ${action}, Wallet: ${walletToUse.substring(0, 20)}...`);

    switch (action) {
      case 'get_stats': {
        // Fetch miner stats from SupportXMR
        const statsUrl = `${POOL_API_BASE}/miner/${walletToUse}/stats`;
        console.log(`Fetching stats from: ${statsUrl}`);
        
        const response = await fetch(statsUrl);
        
        if (!response.ok) {
          throw new Error(`Pool API error: ${response.status} ${response.statusText}`);
        }
        
        const data: MinerStats = await response.json();
        console.log('Pool response:', JSON.stringify(data, null, 2));
        
        // Convert atomic units to XMR
        const amtPaidXMR = data.amtPaid / ATOMIC_UNITS;
        const amtDueXMR = data.amtDue / ATOMIC_UNITS;
        
        // Get worker identifiers
        const identifiersUrl = `${POOL_API_BASE}/miner/${walletToUse}/identifiers`;
        const identResponse = await fetch(identifiersUrl);
        const workers = identResponse.ok ? await identResponse.json() : [];
        
        return new Response(
          JSON.stringify({
            success: true,
            wallet: walletToUse,
            hashrate: data.hash || 0,
            totalHashes: data.totalHashes || 0,
            validShares: data.validShares || 0,
            invalidShares: data.invalidShares || 0,
            amountPaid: amtPaidXMR,
            amountDue: amtDueXMR,
            txnCount: data.txnCount || 0,
            workers: workers,
            lastUpdate: new Date().toISOString(),
            raw: {
              amtPaid: data.amtPaid,
              amtDue: data.amtDue
            }
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      case 'get_worker_stats': {
        if (!worker_id) {
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'worker_id required for this action' 
            }),
            { 
              status: 400,
              headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            }
          );
        }

        const identifiersUrl = `${POOL_API_BASE}/miner/${walletToUse}/identifiers/${worker_id}/stats`;
        console.log(`Fetching worker stats from: ${identifiersUrl}`);
        
        const response = await fetch(identifiersUrl);
        
        if (!response.ok) {
          throw new Error(`Pool API error: ${response.status} ${response.statusText}`);
        }
        
        const workerData = await response.json();
        
        return new Response(
          JSON.stringify({
            success: true,
            worker_id: worker_id,
            hashrate: workerData.hash || 0,
            totalHashes: workerData.totalHashes || 0,
            lastHash: workerData.lastHash || 0,
            validShares: workerData.validShares || 0,
            invalidShares: workerData.invalidShares || 0,
            lastUpdate: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      default:
        return new Response(
          JSON.stringify({ 
            success: false,
            error: `Unknown action: ${action}`,
            availableActions: ['get_stats', 'get_worker_stats']
          }),
          { 
            status: 400,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
    }
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      }),
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});
