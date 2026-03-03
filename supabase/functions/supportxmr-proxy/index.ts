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

        // Step 1: Get all registered worker identifiers
        const identifiersUrl = `${POOL_API_BASE}/miner/${walletToUse}/identifiers`;
        const identResponse = await fetch(identifiersUrl);
        const identifierList: string[] = identResponse.ok ? await identResponse.json() : [];
        console.log(`Found ${identifierList.length} registered worker identifiers:`, identifierList);

        // Step 2: Fetch per-worker stats in parallel (cap at 10 to avoid timeouts)
        const THIRTY_MIN_MS = 30 * 60 * 1000;
        const nowMs = Date.now();

        const workerStatPromises = identifierList.slice(0, 10).map(async (workerId: string) => {
          try {
            const workerStatsUrl = `${POOL_API_BASE}/miner/${walletToUse}/identifiers/${encodeURIComponent(workerId)}/stats`;
            const workerResp = await fetch(workerStatsUrl);
            if (!workerResp.ok) {
              console.warn(`Could not fetch stats for worker "${workerId}": ${workerResp.status}`);
              return { id: workerId, hashrate: 0, validShares: 0, lastHash: 0, active: false };
            }
            const ws = await workerResp.json();
            // lastHash is a Unix timestamp (seconds) of the most recent share submission
            const lastHashMs = (ws.lastHash || 0) * 1000;
            const recentlyActive = lastHashMs > 0 && (nowMs - lastHashMs) < THIRTY_MIN_MS;
            const active = (ws.hash || 0) > 0 || recentlyActive;
            return {
              id: workerId,
              hashrate: ws.hash || 0,
              totalHashes: ws.totalHashes || 0,
              validShares: ws.validShares || 0,
              invalidShares: ws.invalidShares || 0,
              lastHash: ws.lastHash || 0,
              lastHashAgo: lastHashMs > 0 ? Math.round((nowMs - lastHashMs) / 1000 / 60) + 'm ago' : 'never',
              active,
            };
          } catch (e) {
            console.warn(`Error fetching stats for worker "${workerId}":`, e);
            return { id: workerId, hashrate: 0, validShares: 0, lastHash: 0, active: false };
          }
        });

        const workerDetails = await Promise.all(workerStatPromises);
        const activeWorkers = workerDetails.filter(w => w.active);
        const activeWorkerIds = activeWorkers.map(w => w.id);

        console.log(`Active workers: ${activeWorkers.length} / ${workerDetails.length} — IDs: ${activeWorkerIds.join(', ')}`);

        // If global hashrate > 0 but no workers resolved as active (e.g. workers submitted
        // shares recently but identifier stats lag), fall back to counting the pool total as 1
        // so the dashboard never shows 0 when mining IS happening.
        const computedActiveCount = activeWorkers.length > 0
          ? activeWorkers.length
          : (data.hash > 0 ? Math.max(identifierList.length, 1) : 0);

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
            // Rich worker data
            workers: workerDetails,
            active_workers: computedActiveCount,
            worker_ids: activeWorkerIds,
            total_registered_workers: identifierList.length,
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
