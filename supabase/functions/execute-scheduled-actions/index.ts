import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'execute-scheduled-actions';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('⏰ Checking for due scheduled actions...');

    // Get due scheduled actions
    const { data: dueActions, error: fetchError } = await supabase
      .from('scheduled_actions')
      .select('*')
      .eq('is_active', true)
      .lte('next_execution', new Date().toISOString())
      .order('next_execution', { ascending: true })
      .limit(20);

    if (fetchError) {
      console.error('Failed to fetch scheduled actions:', fetchError);
      throw fetchError;
    }

    if (!dueActions || dueActions.length === 0) {
      console.log('✅ No due scheduled actions found');
      return new Response(JSON.stringify({ 
        success: true,
        executed: 0,
        message: 'No due actions'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📋 Found ${dueActions.length} due scheduled actions`);

    const results = [];

    for (const action of dueActions) {
      try {
        console.log(`⚡ Executing: ${action.action_name}`);

        // Handle different action types
        if (action.action_type === 'reminder') {
          // Create activity log entry for Eliza to pick up
          await supabase.from('eliza_activity_log').insert({
            activity_type: 'scheduled_reminder',
            title: '⏰ Scheduled Follow-Up',
            description: action.action_data?.message || action.action_name,
            status: 'completed',
            mentioned_to_user: false,
            metadata: {
              scheduled_action_id: action.id,
              context: action.action_data?.context || {},
              callback_action: action.action_data?.callback_action || null
            }
          });

          console.log(`✅ Created activity log for reminder: ${action.action_name}`);
        }

        // Mark action as executed
        await supabase
          .from('scheduled_actions')
          .update({
            last_execution: new Date().toISOString(),
            is_active: false,
            metadata: {
              ...action.metadata,
              executed_at: new Date().toISOString(),
              execution_status: 'completed'
            }
          })
          .eq('id', action.id);

        results.push({
          action_id: action.id,
          action_name: action.action_name,
          success: true
        });

      } catch (actionError: any) {
        console.error(`❌ Failed to execute action ${action.id}:`, actionError);
        
        // Log failure but continue with other actions
        await supabase.from('webhook_logs').insert({
          webhook_name: 'execute-scheduled-actions',
          trigger_table: 'scheduled_actions',
          trigger_operation: 'EXECUTE',
          payload: { action_id: action.id, action_name: action.action_name },
          status: 'failed',
          error_message: actionError.message
        });

        results.push({
          action_id: action.id,
          action_name: action.action_name,
          success: false,
          error: actionError.message
        });
      }
    }

    // Clean up old inactive actions (older than 7 days)
    const { error: cleanupError } = await supabase
      .from('scheduled_actions')
      .delete()
      .eq('is_active', false)
      .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (cleanupError) {
      console.warn('Failed to cleanup old actions:', cleanupError);
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`🎉 Executed ${successCount}/${results.length} scheduled actions`);

    await usageTracker.success({ executed: successCount, total: results.length });
    return new Response(JSON.stringify({
      success: true,
      executed: successCount,
      total: results.length,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ execute-scheduled-actions error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
