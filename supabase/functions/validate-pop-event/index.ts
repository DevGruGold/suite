import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'validate-pop-event';

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, ...payload } = await req.json();

    console.log(`🏆 PoP Event Validator - Action: ${action}`);

    let result;

    switch (action) {
      case 'validate':
        result = await validatePopEvent(supabase, payload);
        break;
      case 'events':
        result = await getPopEvents(supabase, payload);
        break;
      case 'leaderboard':
        result = await getLeaderboard(supabase, payload);
        break;
      case 'payout':
        result = await markPayout(supabase, payload);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await usageTracker.success({ action });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ PoP Validation Error:', error);
    await usageTracker.failure(error instanceof Error ? error.message : 'Unknown error', 400);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function validatePopEvent(supabase: any, payload: any) {
  const {
    wallet_address,
    device_id,
    event_type,
    event_data,
    session_id,
    validation_method = 'automated'
  } = payload;

  // Validate event type
  const validTypes = ['charging_session', 'mining_session', 'device_connection', 'task_completion'];
  if (!validTypes.includes(event_type)) {
    throw new Error(`Invalid event_type. Must be one of: ${validTypes.join(', ')}`);
  }

  // Calculate PoP points based on event type
  let pop_points = 0;
  let confidence_score = 0.7;

  switch (event_type) {
    case 'charging_session':
      // Use database function for charging PoP calculation
      const { data: chargingPoints } = await supabase.rpc('calculate_charging_pop_points', {
        p_duration_minutes: event_data.duration_minutes || 0,
        p_efficiency: event_data.efficiency || 100,
        p_battery_contribution: event_data.battery_gain || 0
      });
      pop_points = chargingPoints || 0;
      confidence_score = 0.8;
      break;

    case 'mining_session':
      // Mining: Points = (hashes_submitted / 1000) * difficulty_multiplier
      const hashes = event_data.hashes_submitted || 0;
      const difficulty_multiplier = event_data.difficulty_multiplier || 1.0;
      pop_points = Math.floor((hashes / 1000) * difficulty_multiplier);
      confidence_score = validation_method === 'pool_verification' ? 1.0 : 0.9;
      break;

    case 'device_connection':
      // Connection: Points = (connection_duration_minutes / 10) * uptime_bonus
      const connection_minutes = event_data.connection_duration_minutes || 0;
      const uptime_bonus = event_data.uptime_bonus || 1.0;
      pop_points = Math.floor((connection_minutes / 10) * uptime_bonus);
      confidence_score = 0.7;
      break;

    case 'task_completion':
      // Task: Points = task_complexity_score * success_rate
      const complexity = event_data.task_complexity_score || 1;
      const success_rate = event_data.success_rate || 1.0;
      pop_points = Math.floor(complexity * success_rate);
      confidence_score = 0.9;
      break;
  }

  // Adjust confidence based on validation method
  const methodConfidence: Record<string, number> = {
    'device_attestation': 0.8,
    'pool_verification': 1.0,
    'manual_review': 0.9,
    'automated': 0.7
  };
  confidence_score = methodConfidence[validation_method] || 0.7;

  // Insert PoP event
  const { data: event, error } = await supabase
    .from('pop_events_ledger')
    .insert({
      wallet_address,
      device_id,
      session_id,
      event_type,
      event_data,
      pop_points,
      confidence_score,
      validation_method,
      is_validated: true,
      validated_at: new Date().toISOString(),
      event_timestamp: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;

  // Log activity
  await supabase.from('device_activity_log').insert({
    device_id,
    session_id,
    activity_type: 'pop_event_validated',
    activity_data: {
      event_id: event.id,
      event_type,
      pop_points,
      wallet_address
    },
    is_pop_eligible: true
  });

  console.log(`✅ PoP event validated: ${event_type}, ${pop_points} points`);

  return {
    success: true,
    event_id: event.id,
    pop_points,
    confidence_score,
    event_type,
    wallet_address,
    validated_at: event.validated_at
  };
}

async function getPopEvents(supabase: any, payload: any) {
  const { wallet_address, limit = 50, event_type, start_date, end_date } = payload;

  let query = supabase
    .from('pop_events_ledger')
    .select('*')
    .eq('wallet_address', wallet_address)
    .order('event_timestamp', { ascending: false })
    .limit(limit);

  if (event_type) {
    query = query.eq('event_type', event_type);
  }

  if (start_date) {
    query = query.gte('event_timestamp', start_date);
  }

  if (end_date) {
    query = query.lte('event_timestamp', end_date);
  }

  const { data: events, error } = await query;

  if (error) throw error;

  // Calculate total points
  const total_points = events?.reduce((sum: number, evt: any) => sum + (evt.pop_points || 0), 0) || 0;

  return {
    success: true,
    events: events || [],
    count: events?.length || 0,
    total_points,
    wallet_address
  };
}

async function getLeaderboard(supabase: any, payload: any) {
  const { limit = 100 } = payload;

  // Use the pop_leaderboard_view for optimized leaderboard
  const { data: leaderboard, error } = await supabase
    .from('pop_leaderboard_view')
    .select('*')
    .order('total_pop_points', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return {
    success: true,
    leaderboard: leaderboard || [],
    count: leaderboard?.length || 0,
    generated_at: new Date().toISOString()
  };
}

async function markPayout(supabase: any, payload: any) {
  const { event_id, transaction_hash } = payload;

  const { error } = await supabase
    .from('pop_events_ledger')
    .update({
      is_paid_out: true,
      paid_out_at: new Date().toISOString(),
      transaction_hash
    })
    .eq('id', event_id);

  if (error) throw error;

  console.log(`✅ PoP event marked as paid out: ${event_id}`);

  return {
    success: true,
    event_id,
    paid_out_at: new Date().toISOString(),
    transaction_hash
  };
}
