import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, ...payload } = await req.json();

    console.log(`📤 Engagement Command - Action: ${action}`);

    let result;

    switch (action) {
      case 'command':
        result = await issueCommand(supabase, payload);
        break;
      case 'pending':
        result = await getPendingCommands(supabase, payload);
        break;
      case 'acknowledge':
        result = await acknowledgeCommand(supabase, payload);
        break;
      case 'complete':
        result = await completeCommand(supabase, payload);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Engagement Command Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function issueCommand(supabase: any, payload: any) {
  const {
    device_id,
    session_id,
    target_all = false,
    command_type,
    command_payload,
    priority = 5,
    expires_in_minutes = 60
  } = payload;

  // Validate command type
  const validTypes = ['notification', 'config_update', 'mining_start', 'mining_stop', 'pop_reward'];
  if (!validTypes.includes(command_type)) {
    throw new Error(`Invalid command_type. Must be one of: ${validTypes.join(', ')}`);
  }

  // Calculate expiry time
  const expires_at = new Date(Date.now() + expires_in_minutes * 60 * 1000).toISOString();

  // Insert command
  const { data: command, error } = await supabase
    .from('engagement_commands')
    .insert({
      device_id: target_all ? null : device_id,
      session_id: target_all ? null : session_id,
      target_all,
      command_type,
      command_payload,
      priority,
      expires_at,
      status: 'pending',
      issued_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;

  console.log(`✅ Command issued: ${command_type} (ID: ${command.id})`);

  return {
    success: true,
    command_id: command.id,
    command_type,
    status: 'pending',
    target_all,
    issued_at: command.issued_at,
    expires_at: command.expires_at
  };
}

async function getPendingCommands(supabase: any, payload: any) {
  const { device_id, session_id } = payload;

  let query = supabase
    .from('engagement_commands')
    .select('*')
    .in('status', ['pending', 'sent'])
    .order('priority', { ascending: false })
    .order('issued_at', { ascending: true });

  // Filter by device or session, or get broadcast commands
  if (session_id) {
    query = query.or(`session_id.eq.${session_id},target_all.eq.true`);
  } else if (device_id) {
    query = query.or(`device_id.eq.${device_id},target_all.eq.true`);
  } else {
    query = query.eq('target_all', true);
  }

  const { data: commands, error } = await query;

  if (error) throw error;

  // Mark pending commands as sent
  if (commands && commands.length > 0) {
    const pendingIds = commands
      .filter((cmd: any) => cmd.status === 'pending')
      .map((cmd: any) => cmd.id);
    
    if (pendingIds.length > 0) {
      await supabase
        .from('engagement_commands')
        .update({ 
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .in('id', pendingIds);
    }
  }

  console.log(`✅ Retrieved ${commands?.length || 0} pending commands`);

  return {
    success: true,
    commands: commands || [],
    count: commands?.length || 0
  };
}

async function acknowledgeCommand(supabase: any, payload: any) {
  const { command_id } = payload;

  const { error } = await supabase
    .from('engagement_commands')
    .update({
      status: 'acknowledged',
      acknowledged_at: new Date().toISOString()
    })
    .eq('id', command_id);

  if (error) throw error;

  console.log(`✅ Command acknowledged: ${command_id}`);

  return {
    success: true,
    command_id,
    status: 'acknowledged',
    acknowledged_at: new Date().toISOString()
  };
}

async function completeCommand(supabase: any, payload: any) {
  const { command_id, execution_result } = payload;

  // Update command status
  const { data: command, error } = await supabase
    .from('engagement_commands')
    .update({
      status: 'completed',
      executed_at: new Date().toISOString(),
      execution_result
    })
    .eq('id', command_id)
    .select()
    .single();

  if (error) throw error;

  // Log activity
  if (command.device_id) {
    await supabase.from('device_activity_log').insert({
      device_id: command.device_id,
      session_id: command.session_id,
      activity_type: 'command_executed',
      activity_data: {
        command_id,
        command_type: command.command_type,
        execution_result
      }
    });
  }

  console.log(`✅ Command completed: ${command_id}`);

  return {
    success: true,
    command_id,
    status: 'completed',
    executed_at: command.executed_at,
    execution_result
  };
}
