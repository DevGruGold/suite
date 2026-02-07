import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const VERCEL_PROJECT_ID = 'prj_64pcUv0bTn3aGLXvhUNqCI1YPKTt';
const VERCEL_WEBHOOK_URL = 'https://xmrtdao.vercel.app/webhooks';

console.log(`🚀 Vercel Manager starting...`);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, data } = await req.json();
    console.log(`🌐 Vercel Manager - Action: ${action}`);

    // Initialize Supabase client for logging
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    switch (action) {
      case 'send_webhook': {
        // Send data to Vercel webhook endpoint
        console.log(`📡 Sending webhook to ${VERCEL_WEBHOOK_URL}...`);
        const response = await fetch(VERCEL_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('VERCEL_WEBHOOK_SECRET') || 'none'}`
          },
          body: JSON.stringify(data)
        });

        const result = await response.json().catch(() => ({ text: await response.text() }));
        
        console.log(`📡 Webhook response: ${response.status}`);

        // Log webhook activity
        await supabase.from('eliza_activity_log').insert({
          activity_type: 'webhook_sent',
          title: '📡 Vercel Webhook Sent',
          description: `Sent webhook to frontend: ${data.event_type || 'unknown'}`,
          status: response.ok ? 'completed' : 'failed',
          metadata: { request: data, response: result, statusCode: response.status }
        });

        return new Response(
          JSON.stringify({ success: response.ok, data: result, statusCode: response.status }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_frontend_status': {
        // Check if frontend is reachable
        console.log(`🔍 Checking frontend status...`);
        const startTime = Date.now();
        
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch('https://xmrtdao.vercel.app/api/health', {
            signal: controller.signal
          });
          
          clearTimeout(timeout);
          const responseTime = Date.now() - startTime;
          
          const healthStatus = {
            status: response.ok ? 'online' : 'degraded',
            status_code: response.status,
            response_time_ms: responseTime,
            check_timestamp: new Date().toISOString()
          };
          
          // Log to frontend_health_checks table
          await supabase.from('frontend_health_checks').insert({
            status: healthStatus.status,
            status_code: response.status,
            response_time_ms: responseTime,
            metadata: { url: 'https://xmrtdao.vercel.app/api/health' }
          });
          
          console.log(`✅ Frontend status: ${response.status} (${responseTime}ms)`);
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              ...healthStatus
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          const responseTime = Date.now() - startTime;
          
          // Log failed health check
          await supabase.from('frontend_health_checks').insert({
            status: 'offline',
            status_code: null,
            response_time_ms: responseTime,
            error_message: error.message,
            metadata: { url: 'https://xmrtdao.vercel.app/api/health' }
          });
          
          console.error(`❌ Frontend unreachable: ${error.message}`);
          return new Response(
            JSON.stringify({ 
              success: false, 
              status: 'offline',
              error: error.message 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'log_function_invocation': {
        // Receive logs from Vercel functions
        const { function_name, invocation_data } = data;
        
        console.log(`📝 Logging Vercel function invocation: ${function_name}`);
        
        await supabase.from('vercel_function_logs').insert({
          function_name,
          function_path: invocation_data?.path,
          invocation_id: invocation_data?.invocation_id,
          status: invocation_data?.status || 'success',
          execution_time_ms: invocation_data?.execution_time_ms,
          cold_start: invocation_data?.cold_start,
          region: invocation_data?.region,
          request_method: invocation_data?.request_method,
          request_path: invocation_data?.request_path,
          response_status: invocation_data?.response_status,
          error_message: invocation_data?.error_message,
          logs: invocation_data?.logs,
          metadata: invocation_data?.metadata || {}
        });
        
        return new Response(
          JSON.stringify({ success: true, message: 'Function invocation logged' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'notify_deployment': {
        // Notify frontend about backend changes
        console.log(`📢 Notifying frontend of deployment...`);
        const notification = {
          event_type: 'backend_updated',
          timestamp: new Date().toISOString(),
          changes: data.changes || [],
          version: data.version || 'unknown'
        };

        const response = await fetch(VERCEL_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notification)
        });

        console.log(`📢 Deployment notification sent: ${response.status}`);

        return new Response(
          JSON.stringify({ success: response.ok, statusCode: response.status }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_project_info': {
        // Return static project info (no API key needed)
        console.log(`ℹ️ Returning Vercel project info`);
        return new Response(
          JSON.stringify({
            success: true,
            project: {
              id: VERCEL_PROJECT_ID,
              url: 'https://xmrtdao.vercel.app',
              webhookUrl: VERCEL_WEBHOOK_URL,
              status: 'active',
              integration: 'supabase-backend',
              backend: {
                url: 'https://vawouugtzwmejxqkeqqj.supabase.co',
                project_id: 'vawouugtzwmejxqkeqqj'
              }
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('❌ Vercel Manager error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
