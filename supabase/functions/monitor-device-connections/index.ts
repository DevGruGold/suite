import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

// UUID validation helper
const isValidUUID = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

// Generate deterministic UUID from fingerprint string
function fingerprintToUUID(fingerprint: string): string {
  if (!fingerprint) return crypto.randomUUID();
  if (isValidUUID(fingerprint)) return fingerprint;
  
  // Create a deterministic UUID v5-style from the fingerprint
  // Use simple hash-based approach for consistency
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data[i];
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Format as UUID-like string with deterministic parts
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const hex2 = fingerprint.length.toString(16).padStart(4, '0');
  return `${hex}-${hex2}-4000-8000-${fingerprint.slice(0, 12).padEnd(12, '0')}`;
}

// Find session by ID (UUID) or session_key (string)
async function findSessionByIdOrKey(supabase: any, idOrKey: string): Promise<{ id: string; device_id: string } | null> {
  if (!idOrKey) {
    console.warn('⚠️ findSessionByIdOrKey called with empty idOrKey');
    return null;
  }

  // First try as UUID
  if (isValidUUID(idOrKey)) {
    const { data, error } = await supabase
      .from('device_connection_sessions')
      .select('id, device_id')
      .eq('id', idOrKey)
      .eq('is_active', true)
      .single();
    
    if (data && !error) {
      console.log(`✅ Session found by UUID: ${idOrKey}`);
      return data;
    }
    console.log(`⚠️ No active session found for UUID: ${idOrKey}, trying as session_key...`);
  }

  // Fallback: try as session_key
  const { data, error } = await supabase
    .from('device_connection_sessions')
    .select('id, device_id')
    .eq('session_key', idOrKey)
    .eq('is_active', true)
    .order('connected_at', { ascending: false })
    .limit(1)
    .single();

  if (data && !error) {
    console.log(`✅ Session found by session_key: ${idOrKey} -> UUID: ${data.id}`);
    return data;
  }

  console.warn(`⚠️ No session found for idOrKey: ${idOrKey}`);
  return null;
}

// Structured error logging
function logError(context: string, error: any, payload?: any) {
  console.error(`❌ ${context}:`, {
    message: error?.message || 'Unknown error',
    stack: error?.stack?.split('\n').slice(0, 3).join('\n'),
    payload: payload ? JSON.stringify(payload).slice(0, 500) : undefined,
    timestamp: new Date().toISOString()
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let body: any = {};
  let action: string | undefined;
  let payload: any = {};

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Defensive JSON parsing
    try {
      body = await req.json();
    } catch (parseError) {
      logError('JSON Parse Error', parseError);
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON in request body',
        hint: 'Ensure request body is valid JSON with Content-Type: application/json',
        received_content_type: req.headers.get('content-type')
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Extract action and payload with flexible structure support
    action = body.action || body.data?.action;
    payload = body.data || body;

    // Sanitize payload - remove action to avoid confusion
    if (payload.action) {
      const { action: _, ...cleanPayload } = payload;
      payload = cleanPayload;
    }

    // Early validation for action
    if (!action) {
      return new Response(JSON.stringify({ 
        error: 'Missing required "action" parameter',
        valid_actions: ['connect', 'disconnect', 'heartbeat', 'status', 'list_active'],
        hint: 'Provide action as top-level key or nested in data object',
        received_keys: Object.keys(body)
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📡 Connection event: ${action} for device: ${payload.device_id || payload.device_fingerprint || 'unknown'} session: ${payload.session_id || payload.session_key || 'new'}`);

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
    logError(`Monitor Device Connections [${action || 'unknown'}]`, error, payload);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isValidationError = errorMessage.includes('required') || errorMessage.includes('Invalid');
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      action: action || 'unknown',
      hint: isValidationError 
        ? 'Check payload structure matches expected format'
        : 'Internal error - check edge function logs for details',
      timestamp: new Date().toISOString()
    }), {
      status: isValidationError ? 400 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function handleConnect(supabase: any, payload: any) {
  // Extract with defaults and flexible field names
  const device_fingerprint = payload.device_fingerprint || payload.device_id || payload.deviceId;
  const battery_level = payload.battery_level ?? payload.batteryLevel ?? null;
  const device_type = payload.device_type || payload.deviceType || 'unknown';
  const ip_address = payload.ip_address || payload.ipAddress || '0.0.0.0';
  const user_agent = payload.user_agent || payload.userAgent || 'unknown';

  if (!device_fingerprint) {
    throw new Error('device_fingerprint or device_id is required for connect action');
  }

  // Normalize device_id to UUID format
  const normalized_device_id = fingerprintToUUID(device_fingerprint);
  
  // Generate session key for authentication
  const session_key = `session_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  console.log(`🔗 Connecting device: ${device_fingerprint} -> normalized: ${normalized_device_id}`);

  // Insert new connection session
  const { data: session, error } = await supabase
    .from('device_connection_sessions')
    .insert({
      device_id: normalized_device_id,
      session_key,
      battery_level_start: battery_level,
      battery_level_current: battery_level,
      ip_address,
      user_agent,
      is_active: true,
      connected_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    logError('handleConnect insert failed', error, { device_fingerprint, normalized_device_id });
    throw error;
  }

  // Log activity (non-blocking)
  supabase.from('device_activity_log').insert({
    device_id: normalized_device_id,
    session_id: session.id,
    activity_type: 'device_connect',
    category: 'connection',
    description: `Device connected: ${device_type}`,
    details: { 
      device_type, 
      battery_level,
      ip_address,
      original_fingerprint: device_fingerprint
    }
  }).then(() => {}).catch((e: any) => console.warn('Activity log insert failed:', e.message));

  console.log(`✅ Device connected: ${device_fingerprint}, Session: ${session.id}`);

  return {
    success: true,
    session_id: session.id,
    session_key,
    device_id: normalized_device_id,
    original_fingerprint: device_fingerprint,
    connected_at: session.connected_at
  };
}

async function handleDisconnect(supabase: any, payload: any) {
  const session_id_input = payload.session_id || payload.sessionId || payload.session_key;
  const battery_level_end = payload.battery_level_end ?? payload.batteryLevelEnd ?? null;

  if (!session_id_input) {
    throw new Error('session_id or session_key is required for disconnect action');
  }

  // Find session with fallback lookup
  const session = await findSessionByIdOrKey(supabase, session_id_input);
  
  if (!session) {
    console.warn(`⚠️ Disconnect: Session not found for: ${session_id_input}`);
    return {
      success: false,
      error: 'Session not found or already disconnected',
      provided_id: session_id_input
    };
  }

  const session_id = session.id;

  // Update session to disconnected
  const { error } = await supabase
    .from('device_connection_sessions')
    .update({ 
      is_active: false,
      disconnected_at: new Date().toISOString(),
      battery_level_end
    })
    .eq('id', session_id);

  if (error) {
    logError('handleDisconnect update failed', error, { session_id });
    throw error;
  }

  // Log activity (non-blocking)
  supabase.from('device_activity_log').insert({
    device_id: session.device_id,
    session_id,
    activity_type: 'device_disconnect',
    category: 'connection',
    description: 'Device disconnected',
    details: { battery_level_end }
  }).then(() => {}).catch((e: any) => console.warn('Activity log insert failed:', e.message));

  console.log(`✅ Device disconnected: Session ${session_id}`);

  return {
    success: true,
    session_id,
    disconnected_at: new Date().toISOString()
  };
}

async function handleHeartbeat(supabase: any, payload: any) {
  const session_id_input = payload.session_id || payload.sessionId || payload.session_key;
  const battery_level = payload.battery_level ?? payload.batteryLevel;
  const commands_received = payload.commands_received ?? payload.commandsReceived ?? 0;

  if (!session_id_input) {
    throw new Error('session_id or session_key is required for heartbeat action');
  }

  // Find session with fallback lookup
  const session = await findSessionByIdOrKey(supabase, session_id_input);
  
  if (!session) {
    console.warn(`⚠️ Heartbeat: Session not found for: ${session_id_input}`);
    return {
      success: false,
      error: 'Session not found - device may need to reconnect',
      provided_id: session_id_input,
      hint: 'Call connect action to establish a new session'
    };
  }

  const session_id = session.id;

  // Update heartbeat and optional fields
  const updates: any = { 
    last_heartbeat: new Date().toISOString(),
    is_active: true
  };
  if (battery_level !== undefined && battery_level !== null) {
    updates.battery_level_current = battery_level;
  }
  if (commands_received > 0) {
    updates.commands_received = commands_received;
  }

  const { error } = await supabase
    .from('device_connection_sessions')
    .update(updates)
    .eq('id', session_id);

  if (error) {
    logError('handleHeartbeat update failed', error, { session_id, updates });
    throw error;
  }

  // Fetch pending commands for this session
  const { data: pendingCommands } = await supabase
    .from('engagement_commands')
    .select('*')
    .or(`session_id.eq.${session_id},target_all.eq.true`)
    .in('status', ['pending', 'sent'])
    .order('priority', { ascending: false })
    .order('issued_at', { ascending: true })
    .limit(10);

  // Mark commands as sent (non-blocking)
  if (pendingCommands && pendingCommands.length > 0) {
    const commandIds = pendingCommands.map((cmd: any) => cmd.id);
    supabase
      .from('engagement_commands')
      .update({ 
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .in('id', commandIds)
      .eq('status', 'pending')
      .then(() => {})
      .catch((e: any) => console.warn('Command status update failed:', e.message));
  }

  console.log(`💓 Heartbeat recorded for session: ${session_id}`);

  return {
    success: true,
    session_id,
    resolved_from: session_id_input !== session_id ? session_id_input : undefined,
    heartbeat_at: new Date().toISOString(),
    pending_commands: pendingCommands || []
  };
}

async function handleListActive(supabase: any) {
  const cutoffTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago
  const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 minutes ago

  // Get active sessions
  const { data: sessions, error } = await supabase
    .from('device_connection_sessions')
    .select('id, device_id, is_active, last_heartbeat, connected_at, battery_level_current, session_key')
    .eq('is_active', true)
    .gte('last_heartbeat', cutoffTime)
    .order('last_heartbeat', { ascending: false })
    .limit(100);

  if (error) {
    logError('handleListActive query failed', error);
    throw error;
  }

  // Get stale sessions (active but no recent heartbeat)
  const { data: staleSessions } = await supabase
    .from('device_connection_sessions')
    .select('id')
    .eq('is_active', true)
    .lt('last_heartbeat', cutoffTime)
    .gte('last_heartbeat', staleCutoff);

  // Calculate metrics
  const activeCount = sessions?.length || 0;
  const staleCount = staleSessions?.length || 0;
  
  // Average session duration for active sessions
  let avgDurationSeconds = 0;
  if (sessions && sessions.length > 0) {
    const now = Date.now();
    const durations = sessions.map((s: any) => 
      (now - new Date(s.connected_at).getTime()) / 1000
    );
    avgDurationSeconds = Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length);
  }

  return {
    success: true,
    active_count: activeCount,
    stale_count: staleCount,
    avg_session_duration_seconds: avgDurationSeconds,
    sessions: sessions || [],
    cutoff_time: cutoffTime
  };
}

async function handleStatus(supabase: any, payload: any) {
  const session_id_input = payload.session_id || payload.sessionId || payload.session_key;

  if (!session_id_input) {
    throw new Error('session_id or session_key is required for status action. Use list_active to get all active sessions.');
  }

  // Find session with fallback lookup
  const sessionRef = await findSessionByIdOrKey(supabase, session_id_input);
  
  if (!sessionRef) {
    return {
      success: false,
      error: 'Session not found',
      provided_id: session_id_input,
      hint: 'Session may have expired or been disconnected. Use list_active to see current sessions.'
    };
  }

  // Get full session info
  const { data: session, error } = await supabase
    .from('device_connection_sessions')
    .select('*')
    .eq('id', sessionRef.id)
    .single();

  if (error) {
    logError('handleStatus session query failed', error, { session_id: sessionRef.id });
    throw error;
  }

  // Get recent commands
  const { data: commands } = await supabase
    .from('engagement_commands')
    .select('*')
    .eq('session_id', sessionRef.id)
    .order('issued_at', { ascending: false })
    .limit(20);

  return {
    success: true,
    session,
    resolved_session_id: sessionRef.id,
    recent_commands: commands || []
  };
}
