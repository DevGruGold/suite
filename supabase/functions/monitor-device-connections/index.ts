import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

// UUID validation helper
const isValidUUID = (str: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof str === 'string' && uuidRegex.test(str);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse body with flexible structure support
    const body = await req.json();
    const action = body.action || body.data?.action;
    const payload = body.data || body;

    // Early validation for action
    if (!action) {
      return new Response(JSON.stringify({ 
        error: 'Missing required "action" parameter',
        valid_actions: ['connect', 'disconnect', 'heartbeat', 'status', 'list_active'],
        hint: 'Provide action as top-level key or nested in data object'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📱 Device Connection Monitor - Action: ${action}`);

    let result;

    switch (action) {
      case 'connect':
        result = await handleConnect(supabase, payload);
        break;
      case 'disconnect':
        result = await handleDisconnect(supabase, payload);
        break;
      case 'heartbeat':
        result = await handleHeartbeat(supabase, payload);
        break;
      case 'status':
        result = await handleStatus(supabase, payload);
        break;
      case 'list_active':
        result = await handleListActive(supabase);
        break;
      default:
        return new Response(JSON.stringify({ 
          error: `Unknown action: "${action}"`,
          valid_actions: ['connect', 'disconnect', 'heartbeat', 'status', 'list_active']
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Monitor Device Connections Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function handleConnect(supabase: any, payload: any) {
  const {
    device_fingerprint,
    battery_level,
    device_type = 'unknown',
    ip_address,
    user_agent
  } = payload;

  // Generate session key for authentication
  const session_key = crypto.randomUUID();

  // Insert new connection session
  const { data: session, error } = await supabase
    .from('device_connection_sessions')
    .insert({
      device_id: device_fingerprint,
      session_key,
      battery_level_start: battery_level,
      ip_address,
      user_agent,
      is_active: true,
      connected_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;

  // Log activity
  await supabase.from('device_activity_log').insert({
    device_id: device_fingerprint,
    session_id: session.id,
    activity_type: 'device_connect',
    activity_data: { 
      device_type, 
      battery_level,
      ip_address 
    }
  });

  console.log(`✅ Device connected: ${device_fingerprint}, Session: ${session.id}`);

  return {
    success: true,
    session_id: session.id,
    session_key,
    device_id: device_fingerprint,
    connected_at: session.connected_at
  };
}

async function handleDisconnect(supabase: any, payload: any) {
  const { session_id, battery_level_end } = payload;

  // Validate session_id
  if (!session_id) {
    throw new Error('session_id is required for disconnect action');
  }
  if (!isValidUUID(session_id)) {
    throw new Error(`Invalid session_id format: "${session_id}". Expected valid UUID.`);
  }

  // Call database function to disconnect session
  const { data, error } = await supabase.rpc('disconnect_device_session', {
    p_session_id: session_id
  });

  if (error) throw error;

  // Update battery level if provided
  if (battery_level_end !== undefined) {
    await supabase
      .from('device_connection_sessions')
      .update({ battery_level_end })
      .eq('id', session_id);
  }

  // Log activity
  const { data: session } = await supabase
    .from('device_connection_sessions')
    .select('device_id')
    .eq('id', session_id)
    .single();

  if (session) {
    await supabase.from('device_activity_log').insert({
      device_id: session.device_id,
      session_id,
      activity_type: 'device_disconnect',
      activity_data: { battery_level_end }
    });
  }

  console.log(`✅ Device disconnected: Session ${session_id}`);

  return {
    success: true,
    session_id,
    disconnected_at: new Date().toISOString()
  };
}

async function handleHeartbeat(supabase: any, payload: any) {
  const { session_id, battery_level, commands_received = 0 } = payload;

  // Validate session_id
  if (!session_id) {
    throw new Error('session_id is required for heartbeat action');
  }
  if (!isValidUUID(session_id)) {
    throw new Error(`Invalid session_id format: "${session_id}". Expected valid UUID.`);
  }

  // Update heartbeat
  const { error } = await supabase.rpc('update_session_heartbeat', {
    p_session_id: session_id
  });

  if (error) throw error;

  // Update battery level and commands if provided
  const updates: any = { last_heartbeat: new Date().toISOString() };
  if (battery_level !== undefined) updates.battery_level_current = battery_level;
  if (commands_received > 0) updates.commands_received = commands_received;

  await supabase
    .from('device_connection_sessions')
    .update(updates)
    .eq('id', session_id);

  // Fetch pending commands for this session
  const { data: pendingCommands } = await supabase
    .from('engagement_commands')
    .select('*')
    .or(`session_id.eq.${session_id},target_all.eq.true`)
    .in('status', ['pending', 'sent'])
    .order('priority', { ascending: false })
    .order('issued_at', { ascending: true })
    .limit(10);

  // Mark commands as sent
  if (pendingCommands && pendingCommands.length > 0) {
    const commandIds = pendingCommands.map((cmd: any) => cmd.id);
    await supabase
      .from('engagement_commands')
      .update({ 
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .in('id', commandIds)
      .eq('status', 'pending');
  }

  return {
    success: true,
    session_id,
    heartbeat_at: new Date().toISOString(),
    pending_commands: pendingCommands || []
  };
}

// NEW: List all active sessions without requiring a specific session_id
async function handleListActive(supabase: any) {
  const cutoffTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago

  const { data: sessions, error } = await supabase
    .from('device_connection_sessions')
    .select('id, device_id, is_active, last_heartbeat, connected_at, battery_level_current')
    .eq('is_active', true)
    .gte('last_heartbeat', cutoffTime)
    .order('last_heartbeat', { ascending: false })
    .limit(100);

  if (error) throw error;

  return {
    success: true,
    active_count: sessions?.length || 0,
    sessions: sessions || [],
    cutoff_time: cutoffTime
  };
}

async function handleStatus(supabase: any, payload: any) {
  const { session_id } = payload;

  // Validate session_id
  if (!session_id) {
    throw new Error('session_id is required for status action. Use list_active to get all active sessions.');
  }
  if (!isValidUUID(session_id)) {
    throw new Error(`Invalid session_id format: "${session_id}". Expected valid UUID.`);
  }

  // Get session info
  const { data: session, error } = await supabase
    .from('device_connection_sessions')
    .select('*')
    .eq('id', session_id)
    .single();

  if (error) throw error;

  // Get recent commands
  const { data: commands } = await supabase
    .from('engagement_commands')
    .select('*')
    .eq('session_id', session_id)
    .order('issued_at', { ascending: false })
    .limit(20);

  return {
    success: true,
    session,
    recent_commands: commands || []
  };
}
