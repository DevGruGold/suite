import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Monero atomic units conversion
const MONERO_ATOMIC_UNITS = 1000000000000
const atomicUnitsToXMR = (units: number): number => units / MONERO_ATOMIC_UNITS

interface SupportXMRStats {
  amtDue: number
  amtPaid: number
  txnCount: number
  paid: number
  hash: string
  identifier: string
  lastHash: string
  validShares: number
  invalidShares: number
  avgHashrate: number
  hash2: string
}

interface WorkerStats {
  identifer: string  // Note: typo in SupportXMR API
  validShares: number
  invalidShares: number
  avgHashrate: number
  lastHash: string
}

interface SupportXMRResponse {
  amtDue: number
  amtPaid: number
  txnCount: number
  paid: number
  hash: string
  identifier: string
  lastHash: number
  identifiers?: string[]
  stats?: SupportXMRStats
  perWorkerStats?: WorkerStats[]
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get wallet address from environment or request
    const { method } = req
    let walletAddress = Deno.env.get('MINER_WALLET_ADDRESS')
    let action = 'get_stats'
    let workerId: string | null = null
    let deviceId: string | null = null

    if (method === 'POST') {
      const body = await req.json()
      action = body.action || 'get_stats'
      walletAddress = body.wallet_address || walletAddress
      workerId = body.worker_id || null
      deviceId = body.device_id || null
    }

    if (!walletAddress) {
      throw new Error('No wallet address provided')
    }

    console.log(`[supportxmr-proxy] Action: ${action}, Wallet: ${walletAddress?.substring(0, 8)}...`)

    // Fetch mining statistics from SupportXMR
    const supportXMRUrl = `https://supportxmr.com/api/miner/${walletAddress}/stats`
    console.log(`[supportxmr-proxy] Fetching from: ${supportXMRUrl}`)

    const supportXMRResponse = await fetch(supportXMRUrl)
    if (!supportXMRResponse.ok) {
      throw new Error(`SupportXMR API error: ${supportXMRResponse.status}`)
    }

    const supportXMRData: SupportXMRResponse = await supportXMRResponse.json()
    console.log(`[supportxmr-proxy] Received data with ${supportXMRData.perWorkerStats?.length || 0} workers`)

    // Calculate total hashrate
    let totalHashrate = 0
    const workers: any[] = []

    // Process per-worker statistics
    if (supportXMRData.perWorkerStats && supportXMRData.perWorkerStats.length > 0) {
      for (const worker of supportXMRData.perWorkerStats) {
        const workerHashrate = worker.avgHashrate || 0
        totalHashrate += workerHashrate

        // Store or update worker registration
        const { data: existingWorker } = await supabase
          .from('worker_registrations')
          .select('*')
          .eq('worker_id', worker.identifer)
          .single()

        const workerData = {
          worker_id: worker.identifer,
          wallet_address: walletAddress,
          hashrate: workerHashrate,
          valid_shares: worker.validShares || 0,
          invalid_shares: worker.invalidShares || 0,
          last_hash: worker.lastHash || '',
          last_seen: new Date().toISOString(),
          is_active: workerHashrate > 0,
          worker_type: 'supportxmr'
        }

        if (existingWorker) {
          await supabase
            .from('worker_registrations')
            .update(workerData)
            .eq('worker_id', worker.identifer)
        } else {
          await supabase
            .from('worker_registrations')
            .insert(workerData)
        }

        workers.push({
          worker_id: worker.identifer,
          hashrate: workerHashrate,
          hashrate_human: `${(workerHashrate / 1000).toFixed(2)} KH/s`,
          valid_shares: worker.validShares || 0,
          invalid_shares: worker.invalidShares || 0,
          last_hash: worker.lastHash || '',
          is_active: workerHashrate > 0
        })
      }
    }

    // If specific action requested
    if (action === 'link_worker' && workerId && deviceId) {
      // Find worker in the stats
      const worker = workers.find(w => w.worker_id === workerId)
      
      if (!worker) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Worker not found in mining pool',
            available_workers: workers.map(w => w.worker_id)
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Link worker to device
      const { error: linkError } = await supabase
        .from('device_miner_associations')
        .upsert({
          device_id: deviceId,
          worker_id: workerId,
          wallet_address: walletAddress,
          linked_at: new Date().toISOString()
        })

      if (linkError) {
        throw new Error(`Failed to link worker: ${linkError.message}`)
      }

      return new Response(
        JSON.stringify({
          success: true,
          worker_id: workerId,
          device_id: deviceId,
          wallet_address: walletAddress,
          hashrate: worker.hashrate,
          message: 'Worker successfully linked to device'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update treasury stats
    const treasuryValue = atomicUnitsToXMR(supportXMRData.amtDue + supportXMRData.amtPaid)
    const treasuryValueUSD = treasuryValue * 200 // Approximate XMR price, should be fetched from price API

    await supabase
      .from('treasury_stats')
      .upsert({
        id: 1,
        total_xmr: treasuryValue,
        total_value_usd: treasuryValueUSD,
        locked_xmr: 0, // Will be updated by MobileMonero lock trigger
        locked_value_usd: 0,
        active_miners: workers.filter(w => w.is_active).length,
        total_contributors: workers.length,
        updated_at: new Date().toISOString()
      })

    // Record mining session update
    await supabase
      .from('mining_sessions')
      .insert({
        worker_id: 'global_pool',
        wallet_address: walletAddress,
        hashrate: totalHashrate,
        shares_found: supportXMRData.stats?.validShares || 0,
        xmr_earned: atomicUnitsToXMR(supportXMRData.amtDue),
        session_duration: 3600, // 1 hour snapshot
        device_type: 'pool_aggregate'
      })

    // Prepare response
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      wallet_address: walletAddress,
      
      // Treasury summary
      treasury: {
        total_xmr: treasuryValue,
        total_xmr_human: `${treasuryValue.toFixed(6)} XMR`,
        total_value_usd: treasuryValueUSD,
        total_value_usd_human: `$${treasuryValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        amount_due_xmr: atomicUnitsToXMR(supportXMRData.amtDue),
        amount_paid_xmr: atomicUnitsToXMR(supportXMRData.amtPaid),
        transaction_count: supportXMRData.txnCount
      },

      // Mining statistics
      mining: {
        total_hashrate: totalHashrate,
        total_hashrate_human: `${(totalHashrate / 1000).toFixed(2)} KH/s`,
        active_workers: workers.filter(w => w.is_active).length,
        total_workers: workers.length,
        valid_shares: supportXMRData.stats?.validShares || 0,
        invalid_shares: supportXMRData.stats?.invalidShares || 0
      },

      // Detailed worker information
      workers: workers,

      // Raw SupportXMR data (for debugging)
      raw_data: {
        amtDue: supportXMRData.amtDue,
        amtPaid: supportXMRData.amtPaid,
        txnCount: supportXMRData.txnCount,
        hash: supportXMRData.hash,
        identifiers: supportXMRData.identifiers || []
      }
    }

    console.log(`[supportxmr-proxy] Success: ${workers.length} workers, ${totalHashrate} H/s`)

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[supportxmr-proxy] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
