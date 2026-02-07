import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";

const QUERY_TIMEOUT_MS = 8000; // 8 second timeout per query

// Timeout wrapper for database queries
async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${operation} timeout after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

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

// Find session by ID (UUID) or session_key (string) - with timeout
async function findSessionByIdOrKey(supabase: any, idOrKey: string): Promise<{ id: string; device_id: string } | null> {
  if (!idOrKey) {
    console.warn('⚠️ findSessionByIdOrKey called with empty idOrKey');
    return null;
  }

  // First try as UUID
  if (isValidUUID(idOrKey)) {
    try {
      const { data, error } = await withTimeout(
        supabase.from('device_connection_sessions').select('id, device_id').eq('id', idOrKey).eq('is_active', true).maybeSingle(),
        QUERY_TIMEOUT_MS,
        'findSessionByUUID'
      );
      
      if (data && !error) {
        console.log(`✅ Session found by UUID: ${idOrKey}`);
        return data;
      }
    } catch (e) {
      console.warn(`⚠️ UUID lookup timed out for: ${idOrKey}`);
    }
    console.log(`⚠️ No active session found for UUID: ${idOrKey}, trying as session_key...`);
  }

  // Fallback: try as session_key
  try {
    const { data, error } = await withTimeout(
      supabase.from('device_connection_sessions').select('id, device_id').eq('session_key', idOrKey).eq('is_active', true).order('connected_at', { ascending: false }).limit(1).maybeSingle(),
      QUERY_TIMEOUT_MS,
      'findSessionByKey'
    );

    if (data && !error) {
      console.log(`✅ Session found by session_key: ${idOrKey} -> UUID: ${data.id}`);
      return data;
    }
  } catch (e) {
    console.warn(`⚠️ Session key lookup timed out for: ${idOrKey}`);
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

  // Fast boot: check content-length BEFORE parsing JSON
  const contentLength = parseInt(req.headers.get('content-length') || '0');
  if (contentLength === 0 || contentLength < 5) {
    console.log('📡 Empty body - cron trigger, returning fast');
    return new Response(JSON.stringify({ 
      success: true, 
      cron: true, 
      message: 'Cron trigger - no device action provided' 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
        result = await handleConnect(supabase, payload, req);
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
      case 'generate_claim_code':
        result = await handleGenerateClaimCode(supabase, payload);
        break;
      case 'verify_claim_code':
        result = await handleVerifyClaimCode(supabase, payload);
        break;
      case 'auto_pair_by_ip':
        result = await handleAutoPairByIP(supabase, payload);
        break;
      case 'list_user_devices':
        result = await handleListUserDevices(supabase, payload);
        break;
      case 'unclaim_device':
        result = await handleUnclaimDevice(supabase, payload);
        break;
      default:
        return new Response(JSON.stringify({ 
          error: `Unknown action: "${action}"`,
          valid_actions: ['connect', 'disconnect', 'heartbeat', 'status', 'list_active', 'generate_claim_code', 'verify_claim_code', 'auto_pair_by_ip', 'list_user_devices', 'unclaim_device']
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

// Helper: Get real client IP from request headers
function getClientIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
    || req.headers.get('cf-connecting-ip')  
    || req.headers.get('x-real-ip')
    || '0.0.0.0';
}

// Helper: Get IP geolocation
async function getIPLocation(ip: string): Promise<{ city?: string; region?: string; country?: string; lat?: number; lon?: number } | null> {
  if (!ip || ip === '0.0.0.0' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip === '127.0.0.1') {
    return null;
  }
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,country,lat,lon`);
    const data = await response.json();
    if (data.status === 'success') {
      return { city: data.city, region: data.regionName, country: data.country, lat: data.lat, lon: data.lon };
    }
  } catch (e) {
    console.warn('IP geolocation failed:', e);
  }
  return null;
}

// Helper: Generate 6-char alphanumeric claim code
function generateClaimCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars (I,O,0,1)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function handleConnect(supabase: any, payload: any, req: Request) {
  const device_fingerprint = payload.device_fingerprint || payload.device_id || payload.deviceId;
  const battery_level = payload.battery_level ?? payload.batteryLevel ?? null;
  const device_type = payload.device_type || payload.deviceType || 'unknown';
  const user_agent = payload.user_agent || payload.userAgent || 'unknown';
  
  // Get real client IP from request headers
  const ip_address = getClientIP(req);

  if (!device_fingerprint) {
    throw new Error('device_fingerprint or device_id is required for connect action');
  }

  const normalized_device_id = fingerprintToUUID(device_fingerprint);
  const session_key = `session_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  console.log(`🔗 Connecting device: ${device_fingerprint} -> normalized: ${normalized_device_id}, IP: ${ip_address}`);

  // Get IP geolocation (non-blocking)
  const locationPromise = getIPLocation(ip_address);

  // Upsert device record with location
  const location = await locationPromise;
  
  // Update or create device record
  const { error: upsertError } = await supabase.from('devices').upsert({
    id: normalized_device_id,
    device_fingerprint,
    device_type,
    browser: payload.browser || null,
    os: payload.os || null,
    last_known_location: location || {},
    ip_addresses: [ip_address],
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  
  if (upsertError) {
    console.warn('Device upsert failed:', upsertError.message);
  }

  // Insert new connection session with location
  const { data: session, error } = await supabase
    .from('device_connection_sessions')
    .insert({
      device_id: normalized_device_id,
      session_key,
      battery_level_start: battery_level,
      battery_level_current: battery_level,
      ip_address,
      user_agent,
      location_data: location || {},
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
    details: { device_type, battery_level, ip_address, location, original_fingerprint: device_fingerprint }
  }).then(({ error: logError }: any) => {
    if (logError) console.warn('Activity log insert failed:', logError.message);
  });

  console.log(`✅ Device connected: ${device_fingerprint}, Session: ${session.id}`);

  return {
    success: true,
    session_id: session.id,
    session_key,
    device_id: normalized_device_id,
    original_fingerprint: device_fingerprint,
    connected_at: session.connected_at,
    ip_address,
    location,
    heartbeat_interval_recommended_ms: 60000,
    heartbeat_required: true,
    heartbeat_hint: 'Send heartbeat action every 30-60 seconds to maintain active status and receive commands'
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
  }).then(({ error: logError }: any) => {
    if (logError) console.warn('Activity log insert failed:', logError.message);
  });

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
      .then(({ error: cmdError }: any) => {
        if (cmdError) console.warn('Command status update failed:', cmdError.message);
      });
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

// ===== Device Claiming Actions =====

async function handleGenerateClaimCode(supabase: any, payload: any) {
  const device_id = payload.device_id;
  
  if (!device_id) {
    throw new Error('device_id is required for generate_claim_code action');
  }

  const claim_code = generateClaimCode();
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  const { error } = await supabase
    .from('devices')
    .update({
      claim_verification_code: claim_code,
      claim_code_expires_at: expires_at
    })
    .eq('id', device_id);

  if (error) {
    logError('handleGenerateClaimCode update failed', error, { device_id });
    throw error;
  }

  console.log(`🔐 Claim code generated for device: ${device_id}`);

  return {
    success: true,
    device_id,
    claim_code,
    expires_at,
    expires_in_seconds: 600
  };
}

async function handleVerifyClaimCode(supabase: any, payload: any) {
  const { claim_code, device_id, user_id } = payload;

  if (!claim_code) {
    throw new Error('claim_code is required for verify_claim_code action');
  }

  // Find device with matching claim code
  let query = supabase
    .from('devices')
    .select('id, device_fingerprint, claimed_by, claim_code_expires_at')
    .eq('claim_verification_code', claim_code.toUpperCase())
    .is('claimed_by', null);

  if (device_id) {
    query = query.eq('id', device_id);
  }

  const { data: device, error } = await query.single();

  if (error || !device) {
    return { success: false, error: 'Invalid or expired claim code' };
  }

  // Check expiration
  if (device.claim_code_expires_at && new Date(device.claim_code_expires_at) < new Date()) {
    return { success: false, error: 'Claim code has expired' };
  }

  // Claim the device
  const { error: updateError } = await supabase
    .from('devices')
    .update({
      claimed_by: user_id,
      claimed_at: new Date().toISOString(),
      claim_verification_code: null,
      claim_code_expires_at: null
    })
    .eq('id', device.id);

  if (updateError) {
    logError('handleVerifyClaimCode update failed', updateError, { device_id: device.id });
    throw updateError;
  }

  // Update user's linked_device_ids
  if (user_id) {
    await supabase.rpc('array_append_unique', {
      table_name: 'profiles',
      column_name: 'linked_device_ids',
      id: user_id,
      value: device.id
    }).catch(() => {});
  }

  console.log(`✅ Device ${device.id} claimed by user ${user_id}`);

  return {
    success: true,
    device_id: device.id,
    device_fingerprint: device.device_fingerprint,
    claimed_at: new Date().toISOString()
  };
}

async function handleAutoPairByIP(supabase: any, payload: any) {
  const { device_id, user_ip, user_id } = payload;

  if (!device_id || !user_id) {
    throw new Error('device_id and user_id are required for auto_pair_by_ip action');
  }

  // Get device's last known IP
  const { data: sessions, error: sessionError } = await supabase
    .from('device_connection_sessions')
    .select('ip_address')
    .eq('device_id', device_id)
    .eq('is_active', true)
    .order('connected_at', { ascending: false })
    .limit(1);

  if (sessionError || !sessions || sessions.length === 0) {
    return { success: false, error: 'Device not found or not connected' };
  }

  const deviceIP = sessions[0].ip_address;

  // Compare IPs (exact match or same /24 subnet)
  const userParts = (user_ip || '').split('.');
  const deviceParts = (deviceIP || '').split('.');
  
  const ipMatches = user_ip === deviceIP || 
    (userParts.length === 4 && deviceParts.length === 4 &&
     userParts[0] === deviceParts[0] && userParts[1] === deviceParts[1] && userParts[2] === deviceParts[2]);

  if (!ipMatches) {
    return { success: false, error: 'IP addresses do not match. Use QR code or manual code entry.' };
  }

  // Claim the device
  const { error: updateError } = await supabase
    .from('devices')
    .update({
      claimed_by: user_id,
      claimed_at: new Date().toISOString()
    })
    .eq('id', device_id)
    .is('claimed_by', null);

  if (updateError) {
    logError('handleAutoPairByIP update failed', updateError, { device_id });
    throw updateError;
  }

  console.log(`✅ Device ${device_id} auto-paired by IP match`);

  return {
    success: true,
    device_id,
    paired_at: new Date().toISOString(),
    method: 'ip_match'
  };
}

async function handleListUserDevices(supabase: any, payload: any) {
  const { user_id } = payload;

  if (!user_id) {
    throw new Error('user_id is required for list_user_devices action');
  }

  const { data: devices, error } = await supabase
    .from('devices')
    .select(`
      id,
      device_fingerprint,
      device_type,
      browser,
      os,
      last_known_location,
      claimed_at,
      device_connection_sessions (
        id,
        is_active,
        last_heartbeat,
        connected_at
      )
    `)
    .eq('claimed_by', user_id)
    .order('claimed_at', { ascending: false });

  if (error) {
    logError('handleListUserDevices query failed', error, { user_id });
    throw error;
  }

  // Get PoP points per device
  const deviceIds = devices?.map((d: any) => d.id) || [];
  const { data: popData } = await supabase
    .from('pop_events_ledger')
    .select('device_id, pop_points')
    .in('device_id', deviceIds);

  const popByDevice: Record<string, number> = {};
  popData?.forEach((p: any) => {
    popByDevice[p.device_id] = (popByDevice[p.device_id] || 0) + (p.pop_points || 0);
  });

  const formattedDevices = devices?.map((d: any) => {
    const sessions = d.device_connection_sessions || [];
    const activeSession = sessions.find((s: any) => s.is_active);
    const lastSession = sessions[0];

    return {
      id: d.id,
      deviceFingerprint: d.device_fingerprint?.slice(0, 6) + '...' + d.device_fingerprint?.slice(-4) || 'Unknown',
      deviceType: d.device_type || 'Device',
      os: d.os,
      browser: d.browser,
      location: d.last_known_location,
      claimedAt: d.claimed_at,
      lastActive: activeSession?.last_heartbeat || lastSession?.last_heartbeat || d.claimed_at,
      isOnline: !!activeSession,
      totalPopPoints: popByDevice[d.id] || 0
    };
  }) || [];

  return {
    success: true,
    devices: formattedDevices,
    count: formattedDevices.length
  };
}

async function handleUnclaimDevice(supabase: any, payload: any) {
  const { device_id, user_id } = payload;

  if (!device_id || !user_id) {
    throw new Error('device_id and user_id are required for unclaim_device action');
  }

  // Verify ownership
  const { data: device, error: fetchError } = await supabase
    .from('devices')
    .select('claimed_by')
    .eq('id', device_id)
    .single();

  if (fetchError || !device) {
    return { success: false, error: 'Device not found' };
  }

  if (device.claimed_by !== user_id) {
    return { success: false, error: 'You do not own this device' };
  }

  // Unclaim
  const { error: updateError } = await supabase
    .from('devices')
    .update({
      claimed_by: null,
      claimed_at: null
    })
    .eq('id', device_id);

  if (updateError) {
    logError('handleUnclaimDevice update failed', updateError, { device_id });
    throw updateError;
  }

  console.log(`✅ Device ${device_id} unclaimed by user ${user_id}`);

  return {
    success: true,
    device_id,
    unclaimed_at: new Date().toISOString()
  };
}
