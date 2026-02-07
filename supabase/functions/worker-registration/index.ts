import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Generate 6-character claim token
function generateClaimToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Exclude confusing characters
  let token = ''
  for (let i = 0; i < 6; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
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

    const { action, worker_id, username, device_info, wallet_address, timestamp, user_id, claim_token } = await req.json()

    console.log(`[worker-registration] Action: ${action}, Worker: ${worker_id}`)

    // ACTION: register - Register new worker and generate claim token
    if (action === 'register') {
      if (!worker_id || !username) {
        throw new Error('worker_id and username are required')
      }

      // Generate unique claim token
      const token = generateClaimToken()
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

      // Check if worker already registered
      const { data: existing } = await supabase
        .from('pending_worker_claims')
        .select('*')
        .eq('worker_id', worker_id)
        .single()

      if (existing) {
        // Update existing registration
        await supabase
          .from('pending_worker_claims')
          .update({
            claim_token: token,
            expires_at: expiresAt.toISOString(),
            device_info: device_info,
            last_ping: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('worker_id', worker_id)
      } else {
        // Create new registration
        await supabase
          .from('pending_worker_claims')
          .insert({
            worker_id: worker_id,
            username: username,
            claim_token: token,
            wallet_address: wallet_address,
            device_info: device_info,
            expires_at: expiresAt.toISOString(),
            last_ping: new Date().toISOString(),
            status: 'pending'
          })
      }

      // Also ensure worker is in worker_registrations (if not already)
      const { data: workerReg } = await supabase
        .from('worker_registrations')
        .select('*')
        .eq('worker_id', worker_id)
        .single()

      if (!workerReg) {
        await supabase
          .from('worker_registrations')
          .insert({
            worker_id: worker_id,
            wallet_address: wallet_address,
            worker_type: 'mobilemonero',
            is_active: true,
            last_seen: new Date().toISOString()
          })
      }

      return new Response(
        JSON.stringify({
          success: true,
          claim_token: token,
          expires_at: expiresAt.toISOString(),
          message: 'Worker registered. Use claim token in Suite to link to your account.',
          worker_id: worker_id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ACTION: ping - Worker heartbeat
    if (action === 'ping') {
      if (!worker_id) {
        throw new Error('worker_id is required')
      }

      // Update last ping time
      await supabase
        .from('pending_worker_claims')
        .update({
          last_ping: new Date().toISOString()
        })
        .eq('worker_id', worker_id)

      // Update worker_registrations
      await supabase
        .from('worker_registrations')
        .update({
          last_seen: new Date().toISOString(),
          is_active: true
        })
        .eq('worker_id', worker_id)

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Ping recorded'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ACTION: claim - User claims a worker with token
    if (action === 'claim') {
      if (!claim_token || !user_id) {
        throw new Error('claim_token and user_id are required')
      }

      // Find pending claim
      const { data: pending, error: findError } = await supabase
        .from('pending_worker_claims')
        .select('*')
        .eq('claim_token', claim_token.toUpperCase())
        .eq('status', 'pending')
        .single()

      if (findError || !pending) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Invalid or expired claim token'
          }),
          { 
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      // Check if token expired
      if (new Date(pending.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Claim token has expired'
          }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      // Create device-miner association
      const { error: linkError } = await supabase
        .from('device_miner_associations')
        .upsert({
          device_id: pending.worker_id,
          worker_id: pending.worker_id,
          wallet_address: pending.wallet_address,
          user_id: user_id,
          device_info: pending.device_info,
          linked_at: new Date().toISOString(),
          claim_method: 'token'
        })

      if (linkError) {
        throw new Error(`Failed to link worker: ${linkError.message}`)
      }

      // Update pending claim status
      await supabase
        .from('pending_worker_claims')
        .update({
          status: 'claimed',
          claimed_by: user_id,
          claimed_at: new Date().toISOString()
        })
        .eq('id', pending.id)

      // Get worker stats from worker_registrations
      const { data: workerStats } = await supabase
        .from('worker_registrations')
        .select('hashrate, valid_shares, invalid_shares')
        .eq('worker_id', pending.worker_id)
        .single()

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Worker claimed successfully',
          worker: {
            worker_id: pending.worker_id,
            username: pending.username,
            device_info: pending.device_info,
            hashrate: workerStats?.hashrate || 0,
            claimed_at: new Date().toISOString()
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ACTION: get_claimable - Get list of claimable workers (for frontend)
    if (action === 'get_claimable') {
      const { data: claimable } = await supabase
        .from('pending_worker_claims')
        .select(`
          *,
          worker_registrations!inner(hashrate, valid_shares, invalid_shares, last_seen, is_active)
        `)
        .eq('status', 'pending')
        .gte('expires_at', new Date().toISOString())
        .order('last_ping', { ascending: false })

      return new Response(
        JSON.stringify({
          success: true,
          workers: claimable || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ACTION: get_my_workers - Get user's claimed workers
    if (action === 'get_my_workers') {
      if (!user_id) {
        throw new Error('user_id is required')
      }

      const { data: myWorkers } = await supabase
        .from('device_miner_associations')
        .select(`
          *,
          worker_registrations!inner(hashrate, valid_shares, invalid_shares, last_seen, is_active)
        `)
        .eq('user_id', user_id)
        .order('linked_at', { ascending: false })

      return new Response(
        JSON.stringify({
          success: true,
          workers: myWorkers || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Invalid action')

  } catch (error) {
    console.error('[worker-registration] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
