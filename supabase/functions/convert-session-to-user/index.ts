import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const usageTracker = startUsageTracking('convert-session-to-user');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { session_key, email, action = 'create_user_profile' } = await req.json();

    if (!session_key) {
      throw new Error('session_key is required');
    }

    // Get session
    const { data: session } = await supabase
      .from('conversation_sessions')
      .select('*')
      .eq('session_key', session_key)
      .single();

    if (!session) {
      throw new Error('Session not found');
    }

    let result: any = {};

    switch (action) {
      case 'create_user_profile':
        if (!email) {
          throw new Error('email is required for create_user_profile');
        }

        // Check if user already exists
        const { data: existingUser } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        let userId: string;

        if (existingUser) {
          userId = existingUser.id;
        } else {
          // Create new user profile
          const { data: newUser, error: createError } = await supabase
            .from('user_profiles')
            .insert({
              email,
              ip_address: '0.0.0.0',
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (createError) throw createError;
          userId = newUser.id;

          console.log(`✅ Created user profile: ${userId} for ${email}`);
        }

        // Link session to user profile
        const { error: updateError } = await supabase
          .from('conversation_sessions')
          .update({
            user_profile_id: userId,
            acquisition_stage: 'qualified',
            updated_at: new Date().toISOString(),
          })
          .eq('session_key', session_key);

        if (updateError) throw updateError;

        result = {
          user_id: userId,
          email,
          linked: true,
        };
        break;

      case 'link_api_key_to_session':
        const { api_key } = await req.json();
        if (!api_key) {
          throw new Error('api_key is required for link_api_key_to_session');
        }

        // Get conversation context
        const { data: messages } = await supabase
          .from('conversation_messages')
          .select('content, message_type')
          .eq('session_id', session.id)
          .order('timestamp', { ascending: false })
          .limit(10);

        const conversationContext = {
          last_10_messages: messages,
          session_created_at: session.created_at,
          lead_score: session.lead_score || 0,
        };

        // Link API key to session
        const { error: linkError } = await supabase
          .from('service_api_keys')
          .update({
            session_key,
            acquired_via: 'chat_conversation',
            conversation_context: conversationContext,
          })
          .eq('api_key', api_key);

        if (linkError) throw linkError;

        // Update session conversion event
        await supabase
          .from('conversation_sessions')
          .update({
            conversion_event: 'api_key_generated',
            acquisition_stage: 'trial',
            updated_at: new Date().toISOString(),
          })
          .eq('session_key', session_key);

        result = {
          api_key,
          linked_to_session: session_key,
          context_saved: true,
        };
        break;

      case 'enrich_user_profile':
        const { enrichment_data } = await req.json();
        
        if (!session.user_profile_id) {
          throw new Error('Session must be linked to user profile first');
        }

        // Update user profile with enrichment data
        const { error: enrichError } = await supabase
          .from('user_profiles')
          .update({
            metadata: enrichment_data,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.user_profile_id);

        if (enrichError) throw enrichError;

        result = {
          user_id: session.user_profile_id,
          enriched: true,
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await usageTracker.success({ result_summary: `action_${action}` });
    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in convert-session-to-user:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
