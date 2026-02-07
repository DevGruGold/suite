import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIER_PRICES: Record<string, { amount: number; name: string }> = {
  basic: { amount: 1000, name: 'Basic Tier - 1,000 requests/month' },
  pro: { amount: 5000, name: 'Pro Tier - 10,000 requests/month' },
  enterprise: { amount: 50000, name: 'Enterprise Tier - Unlimited requests' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ 
          error: 'Stripe not configured',
          message: 'Payment processing is not available. Please contact support.',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { customer_email, tier, service_name, trial_days = 0, session_key, api_key } = await req.json();

    if (!customer_email || !tier || !service_name) {
      throw new Error('customer_email, tier, and service_name are required');
    }

    if (!TIER_PRICES[tier]) {
      throw new Error(`Invalid tier: ${tier}. Must be basic, pro, or enterprise`);
    }

    const priceInfo = TIER_PRICES[tier];
    
    // Create Stripe checkout session
    const checkoutSession = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'success_url': `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-payment-webhook?session_id={CHECKOUT_SESSION_ID}&success=true`,
        'cancel_url': `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-payment-webhook?session_id={CHECKOUT_SESSION_ID}&success=false`,
        'customer_email': customer_email,
        'client_reference_id': session_key || api_key || '',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `${service_name} - ${priceInfo.name}`,
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][price_data][unit_amount]': priceInfo.amount.toString(),
        'line_items[0][quantity]': '1',
        ...(trial_days > 0 && {
          'subscription_data[trial_period_days]': trial_days.toString(),
        }),
        'metadata[service_name]': service_name,
        'metadata[tier]': tier,
        'metadata[session_key]': session_key || '',
        'metadata[api_key]': api_key || '',
      }).toString(),
    });

    if (!checkoutSession.ok) {
      const error = await checkoutSession.text();
      console.error('Stripe error:', error);
      throw new Error('Failed to create Stripe checkout session');
    }

    const checkoutData = await checkoutSession.json();

    // Log the payment link generation
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    await supabase.from('eliza_activity_log').insert({
      activity_type: 'payment_link_generated',
      title: 'Stripe Payment Link Created',
      description: `Generated ${tier} tier payment link for ${customer_email}`,
      status: 'completed',
      metadata: {
        customer_email,
        tier,
        service_name,
        checkout_session_id: checkoutData.id,
        trial_days,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: checkoutData.url,
        checkout_session_id: checkoutData.id,
        tier,
        amount: priceInfo.amount / 100,
        trial_days,
        message: trial_days > 0 
          ? `Payment link generated with ${trial_days} day trial. Share this link: ${checkoutData.url}`
          : `Payment link generated. Share this link: ${checkoutData.url}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in generate-stripe-link:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
