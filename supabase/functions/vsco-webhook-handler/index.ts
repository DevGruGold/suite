import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { startUsageTrackingWithRequest } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'vsco-webhook-handler';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-vsco-signature',
};

// Supported event types from Táve automations
type VscoEventType = 
  | 'lead_created'
  | 'lead_status_changed'
  | 'job_booked'
  | 'job_updated'
  | 'job_completed'
  | 'payment_received'
  | 'invoice_created'
  | 'event_scheduled'
  | 'event_updated'
  | 'contact_created'
  | 'contact_updated'
  | 'quote_sent'
  | 'quote_accepted'
  | 'contract_signed'
  | 'questionnaire_completed'
  | 'custom';

interface VscoWebhookPayload {
  event_type: VscoEventType;
  job_id?: string;
  contact_id?: string;
  event_id?: string;
  order_id?: string;
  payment_id?: string;
  job_type?: string;
  job_stage?: string;
  contact_email?: string;
  contact_name?: string;
  contact_phone?: string;
  amount?: number;
  currency?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTrackingWithRequest(FUNCTION_NAME, req);

  const startTime = Date.now();
  
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      await usageTracker.failure('Method not allowed', 405);
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use POST.' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse the webhook payload
    let payload: VscoWebhookPayload;
    try {
      payload = await req.json();
    } catch {
      console.error('[vsco-webhook-handler] Invalid JSON payload');
      await usageTracker.failure('Invalid JSON payload', 400);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventType = payload.event_type || 'custom';
    const timestamp = payload.timestamp || new Date().toISOString();

    console.log(`[vsco-webhook-handler] Received event: ${eventType}`, {
      job_id: payload.job_id,
      contact_id: payload.contact_id,
      contact_email: payload.contact_email,
    });

    // Log the webhook to webhook_logs table
    const { error: logError } = await supabase.from('webhook_logs').insert({
      webhook_name: 'vsco-webhook-handler',
      event_type: eventType,
      payload: payload,
      status: 'processing',
      received_at: timestamp,
      metadata: {
        source: 'tave',
        job_id: payload.job_id,
        contact_id: payload.contact_id,
      },
    });

    if (logError) {
      console.error('[vsco-webhook-handler] Failed to log webhook:', logError);
    }

    // Process the event based on type
    let processingResult: { success: boolean; message: string; data?: unknown } = {
      success: true,
      message: `Event ${eventType} received and logged`,
    };

    switch (eventType) {
      case 'lead_created':
        processingResult = await handleLeadCreated(supabase, payload);
        break;

      case 'lead_status_changed':
        processingResult = await handleLeadStatusChanged(supabase, payload);
        break;

      case 'job_booked':
        processingResult = await handleJobBooked(supabase, payload);
        break;

      case 'job_completed':
        processingResult = await handleJobCompleted(supabase, payload);
        break;

      case 'payment_received':
        processingResult = await handlePaymentReceived(supabase, payload);
        break;

      case 'quote_accepted':
        processingResult = await handleQuoteAccepted(supabase, payload);
        break;

      case 'contract_signed':
        processingResult = await handleContractSigned(supabase, payload);
        break;

      default:
        // Log custom/unknown events for manual review
        console.log(`[vsco-webhook-handler] Unhandled event type: ${eventType}`);
        processingResult = {
          success: true,
          message: `Event ${eventType} logged for review`,
        };
    }

    // Update webhook log with result
    await supabase.from('webhook_logs').update({
      status: processingResult.success ? 'completed' : 'failed',
      processed_at: new Date().toISOString(),
      result: processingResult,
      execution_time_ms: Date.now() - startTime,
    }).eq('webhook_name', 'vsco-webhook-handler')
      .eq('event_type', eventType)
      .order('received_at', { ascending: false })
      .limit(1);

    // Log to activity feed
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'vsco_webhook',
      description: `VSCO ${eventType}: ${processingResult.message}`,
      status: processingResult.success ? 'completed' : 'failed',
      metadata: {
        event_type: eventType,
        job_id: payload.job_id,
        contact_email: payload.contact_email,
        execution_time_ms: Date.now() - startTime,
      },
    });

    await usageTracker.success({ result_summary: `${eventType}: ${processingResult.message}` });
    return new Response(
      JSON.stringify({
        success: true,
        event_type: eventType,
        message: processingResult.message,
        processed_at: new Date().toISOString(),
        execution_time_ms: Date.now() - startTime,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[vsco-webhook-handler] Error:', error);
    await usageTracker.failure(error instanceof Error ? error.message : 'Unknown error', 500);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Event Handlers

async function handleLeadCreated(supabase: ReturnType<typeof createClient>, payload: VscoWebhookPayload) {
  console.log('[vsco-webhook-handler] Processing lead_created:', payload.contact_email);
  
  // Log to corporate_license_applications if it looks like a Suite lead
  if (payload.job_type?.toLowerCase().includes('suite')) {
    await supabase.from('corporate_license_applications').insert({
      company_name: payload.metadata?.company_name || payload.contact_name || 'Unknown',
      contact_email: payload.contact_email || '',
      contact_name: payload.contact_name || '',
      application_status: 'pending',
      tier_requested: 'enterprise',
      company_size: 1,
      filled_by: 'vsco_webhook',
      metadata: {
        vsco_job_id: payload.job_id,
        source: 'tave_webhook',
      },
    });
  }

  return {
    success: true,
    message: `New lead created: ${payload.contact_email || payload.job_id}`,
  };
}

async function handleLeadStatusChanged(supabase: ReturnType<typeof createClient>, payload: VscoWebhookPayload) {
  console.log('[vsco-webhook-handler] Processing lead_status_changed:', payload.job_stage);
  
  return {
    success: true,
    message: `Lead status changed to: ${payload.job_stage}`,
  };
}

async function handleJobBooked(supabase: ReturnType<typeof createClient>, payload: VscoWebhookPayload) {
  console.log('[vsco-webhook-handler] Processing job_booked:', payload.job_id);
  
  // Create activity feed entry for booked job
  await supabase.from('activity_feed').insert({
    type: 'job_booked',
    title: `Job Booked: ${payload.job_type || 'Photo Session'}`,
    description: `New booking from ${payload.contact_name || payload.contact_email}`,
    data: {
      job_id: payload.job_id,
      contact_email: payload.contact_email,
      job_type: payload.job_type,
    },
  });

  return {
    success: true,
    message: `Job booked: ${payload.job_id}`,
  };
}

async function handleJobCompleted(supabase: ReturnType<typeof createClient>, payload: VscoWebhookPayload) {
  console.log('[vsco-webhook-handler] Processing job_completed:', payload.job_id);
  
  return {
    success: true,
    message: `Job completed: ${payload.job_id}`,
  };
}

async function handlePaymentReceived(supabase: ReturnType<typeof createClient>, payload: VscoWebhookPayload) {
  console.log('[vsco-webhook-handler] Processing payment_received:', payload.amount);
  
  // Update license application status if this is a Suite payment
  if (payload.metadata?.tier || payload.job_type?.toLowerCase().includes('suite')) {
    await supabase.from('corporate_license_applications')
      .update({ 
        application_status: 'approved',
        metadata: {
          payment_received: true,
          payment_amount: payload.amount,
          payment_date: payload.timestamp,
        },
      })
      .eq('metadata->>vsco_job_id', payload.job_id);
  }

  // Log to activity feed
  await supabase.from('activity_feed').insert({
    type: 'payment_received',
    title: `Payment Received: ${payload.currency || '$'}${payload.amount}`,
    description: `Payment from ${payload.contact_name || payload.contact_email}`,
    data: {
      job_id: payload.job_id,
      amount: payload.amount,
      currency: payload.currency,
    },
  });

  return {
    success: true,
    message: `Payment received: ${payload.currency || '$'}${payload.amount}`,
  };
}

async function handleQuoteAccepted(supabase: ReturnType<typeof createClient>, payload: VscoWebhookPayload) {
  console.log('[vsco-webhook-handler] Processing quote_accepted:', payload.job_id);
  
  return {
    success: true,
    message: `Quote accepted for job: ${payload.job_id}`,
  };
}

async function handleContractSigned(supabase: ReturnType<typeof createClient>, payload: VscoWebhookPayload) {
  console.log('[vsco-webhook-handler] Processing contract_signed:', payload.job_id);
  
  return {
    success: true,
    message: `Contract signed for job: ${payload.job_id}`,
  };
}
