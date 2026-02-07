import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const url = new URL(req.url);
    const sessionId = url.searchParams.get('session_id');
    const success = url.searchParams.get('success') === 'true';

    if (!sessionId) {
      throw new Error('session_id is required');
    }

    // Handle successful payment
    if (success) {
      // DEDUPLICATION CHECK: See if payment was already processed via VSCO Workspace
      const { data: vscoPayment } = await supabase
        .from('vsco_orders')
        .select('vsco_id')
        .eq('external_reference', sessionId)
        .maybeSingle();

      if (vscoPayment) {
        console.log(`⏭️ Payment ${sessionId} already processed via VSCO Workspace, skipping Stripe fallback`);
        return new Response(
          `<!DOCTYPE html>
          <html><head><title>Payment Already Processed</title>
          <style>body { font-family: system-ui; max-width: 600px; margin: 100px auto; text-align: center; }
          .success { color: #10b981; font-size: 48px; } .message { color: #374151; margin: 20px 0; }
          .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }</style>
          </head><body>
            <div class="success">✓</div>
            <h1>Payment Confirmed</h1>
            <p class="message">Your payment was processed through Party Favor Photo.</p>
            <a href="${supabaseUrl}" class="button">Return to Dashboard</a>
          </body></html>`,
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
        );
      }

      const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
      
      if (!stripeSecretKey) {
        throw new Error('Stripe not configured');
      }

      // Retrieve checkout session from Stripe
      const sessionResponse = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
        {
          headers: {
            'Authorization': `Bearer ${stripeSecretKey}`,
          },
        }
      );

      if (!sessionResponse.ok) {
        throw new Error('Failed to retrieve Stripe session');
      }

      const sessionData = await sessionResponse.json();
      const { metadata, customer_email, amount_total } = sessionData;

      // Determine if this is a Suite platform payment vs Party Favor Photo
      const isSuitePayment = metadata?.service_name !== 'party_favor_photo' && 
                            !metadata?.vsco_job_id;

      if (!isSuitePayment) {
        console.log('📸 Party Favor Photo payment detected - deferring to VSCO Workspace as primary processor');
        // Log but don't process Suite-specific workflows for VSCO payments
        await supabase.from('eliza_activity_log').insert({
          activity_type: 'payment_deferred',
          title: 'Payment Deferred to VSCO',
          description: `Payment for ${customer_email} deferred to VSCO Workspace processor`,
          status: 'completed',
          metadata: {
            payment_source: 'stripe_to_vsco',
            customer_email,
            stripe_session_id: sessionId,
            vsco_job_id: metadata?.vsco_job_id,
          },
        });
      } else {
        // SUITE PLATFORM PAYMENT - Process fully via Stripe fallback

        // Upgrade API key tier
        if (metadata?.api_key) {
          await supabase
            .from('service_api_keys')
            .update({
              tier: metadata.tier,
              status: 'active',
              updated_at: new Date().toISOString(),
            })
            .eq('api_key', metadata.api_key);

          console.log(`✅ Upgraded API key ${metadata.api_key} to ${metadata.tier} tier`);
        }

        // Update session acquisition stage
        if (metadata?.session_key) {
          await supabase
            .from('conversation_sessions')
            .update({
              acquisition_stage: 'paying',
              conversion_event: 'payment_completed',
              lifetime_value: amount_total / 100,
              updated_at: new Date().toISOString(),
            })
            .eq('session_key', metadata.session_key);

          console.log(`✅ Updated session ${metadata.session_key} to paying customer`);
        }

        // Record onboarding checkpoint
        if (metadata?.api_key) {
          await supabase.rpc('track_onboarding_checkpoint', {
            p_api_key: metadata.api_key,
            p_checkpoint: 'payment_completed',
            p_metadata: {
              tier: metadata.tier,
              amount: amount_total / 100,
              stripe_session_id: sessionId,
            },
          });
        }

        // Log activity with payment source distinction
        await supabase.from('eliza_activity_log').insert({
          activity_type: 'payment_completed',
          title: 'Customer Payment Successful',
          description: `Customer ${customer_email} completed payment for ${metadata?.tier || 'unknown'} tier`,
          status: 'completed',
          metadata: {
            payment_source: 'stripe_fallback', // Distinguish from vsco_primary
            customer_email,
            tier: metadata?.tier,
            amount: amount_total / 100,
            service_name: metadata?.service_name,
            stripe_session_id: sessionId,
          },
        });

        // Trigger welcome workflow with CORRECT payload structure
        await supabase.functions.invoke('workflow-template-manager', {
          body: {
            action: 'execute_template',
            data: {
              template_name: 'acquire_new_customer',
              params: {
                customer_email,
                api_key: metadata?.api_key,
                tier: metadata?.tier,
                service_name: metadata?.service_name,
              },
            },
          },
        });
      }

      // Return success page
      return new Response(
        `<!DOCTYPE html>
        <html>
          <head>
            <title>Payment Successful</title>
            <style>
              body { font-family: system-ui; max-width: 600px; margin: 100px auto; text-align: center; }
              .success { color: #10b981; font-size: 48px; }
              .message { color: #374151; margin: 20px 0; }
              .button { 
                display: inline-block; 
                background: #2563eb; 
                color: white; 
                padding: 12px 24px; 
                text-decoration: none; 
                border-radius: 6px; 
                margin-top: 20px;
              }
            </style>
          </head>
          <body>
            <div class="success">✓</div>
            <h1>Payment Successful!</h1>
            <p class="message">Your ${metadata.tier} tier subscription is now active.</p>
            <p class="message">Check your email (${customer_email}) for your API key and getting started guide.</p>
            <a href="${supabaseUrl}" class="button">Return to Dashboard</a>
          </body>
        </html>`,
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/html' } 
        }
      );
    } else {
      // Handle cancelled payment
      return new Response(
        `<!DOCTYPE html>
        <html>
          <head>
            <title>Payment Cancelled</title>
            <style>
              body { font-family: system-ui; max-width: 600px; margin: 100px auto; text-align: center; }
              .cancelled { color: #ef4444; font-size: 48px; }
              .message { color: #374151; margin: 20px 0; }
              .button { 
                display: inline-block; 
                background: #2563eb; 
                color: white; 
                padding: 12px 24px; 
                text-decoration: none; 
                border-radius: 6px; 
                margin-top: 20px;
              }
            </style>
          </head>
          <body>
            <div class="cancelled">✗</div>
            <h1>Payment Cancelled</h1>
            <p class="message">No charges were made. You can try again anytime.</p>
            <a href="${supabaseUrl}" class="button">Return to Dashboard</a>
          </body>
        </html>`,
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/html' } 
        }
      );
    }

  } catch (error: any) {
    console.error('Error in stripe-payment-webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
