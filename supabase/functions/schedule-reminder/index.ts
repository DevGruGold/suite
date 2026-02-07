import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'schedule-reminder';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action_type, action_data, execute_at, session_key } = await req.json();

    if (!action_type || !action_data || !execute_at) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: action_type, action_data, execute_at' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate next execution time
    const executeAtDate = new Date(execute_at);
    if (isNaN(executeAtDate.getTime())) {
      return new Response(JSON.stringify({ 
        error: 'Invalid execute_at timestamp' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for duplicate reminders in the last 5 minutes
    const { data: existingReminders } = await supabase
      .from('scheduled_actions')
      .select('id')
      .eq('is_active', true)
      .eq('action_type', action_type)
      .contains('action_data', { message: action_data.message })
      .gte('created_at', new Date(Date.now() - 300000).toISOString())
      .limit(1);

    if (existingReminders && existingReminders.length > 0) {
      console.log('⏭️ Duplicate reminder detected, skipping creation');
      return new Response(JSON.stringify({ 
        success: true,
        message: 'Reminder already exists',
        duplicate: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Count active scheduled actions to prevent overload
    const { count } = await supabase
      .from('scheduled_actions')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('session_key', session_key || 'global');

    if (count && count >= 50) {
      return new Response(JSON.stringify({ 
        error: 'Maximum of 50 active scheduled actions reached' 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create scheduled action
    const { data: scheduledAction, error } = await supabase
      .from('scheduled_actions')
      .insert({
        session_key: session_key || 'global',
        action_name: action_data.message || 'Scheduled Reminder',
        action_type,
        action_data,
        schedule_expression: 'once',
        next_execution: executeAtDate.toISOString(),
        is_active: true,
        metadata: {
          created_by: 'eliza',
          scheduled_at: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create scheduled action:', error);
      throw error;
    }

    console.log(`✅ Scheduled reminder created: ${action_data.message} at ${executeAtDate.toISOString()}`);
    await usageTracker.success({ scheduled_at: executeAtDate.toISOString() });

    return new Response(JSON.stringify({
      success: true,
      scheduled_action: scheduledAction,
      message: `Reminder scheduled for ${executeAtDate.toISOString()}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ schedule-reminder error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
