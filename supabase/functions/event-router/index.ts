/**
 * EVENT ROUTER - Central Webhook Ingress (The Brain Stem)
 * 
 * Purpose: Single entry point for ALL incoming webhooks
 * Sources: GitHub, Vercel, Supabase, custom integrations
 * 
 * Flow:
 * 1. Validate webhook signatures (GitHub HMAC, Vercel secret)
 * 2. Normalize payload structure
 * 3. Log to webhook_logs with event metadata
 * 4. Forward to event-dispatcher for intelligent routing
 * 5. Return immediate 200 OK (async processing)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-github-event, x-github-delivery, x-hub-signature-256, x-vercel-signature',
};

interface NormalizedEvent {
  event_source: string;
  event_type: string;
  priority: number;
  payload: any;
  metadata: Record<string, any>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const url = new URL(req.url);
    const source = url.searchParams.get('source') || 'unknown';
    const rawBody = await req.text();
    const headers = Object.fromEntries(req.headers.entries());

    console.log(`📥 Webhook received from: ${source}`);

    // Validate signature based on source
    let isValid = false;
    let validationError = '';

    if (source === 'github' || headers['x-github-event']) {
      isValid = await validateGitHubSignature(rawBody, headers['x-hub-signature-256']);
      if (!isValid) validationError = 'Invalid GitHub signature';
    } else if (source === 'vercel') {
      isValid = await validateVercelSignature(rawBody, headers['x-vercel-signature']);
      if (!isValid) validationError = 'Invalid Vercel signature';
    } else if (source === 'supabase' || headers['authorization']?.includes('Bearer')) {
      // Internal Supabase calls are pre-authenticated
      isValid = true;
    } else {
      validationError = 'Unknown source or missing authentication';
    }

    if (!isValid) {
      console.error(`❌ Validation failed: ${validationError}`);
      return new Response(JSON.stringify({ error: validationError }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const payload = JSON.parse(rawBody);
    console.log(`✅ Signature validated for ${source}`);

    // Normalize event structure
    const normalized = normalizeEvent(source, payload, headers);
    console.log(`🔄 Normalized event: ${normalized.event_type} (priority: ${normalized.priority})`);

    // Log to webhook_logs
    const { data: logEntry, error: logError } = await supabase
      .from('webhook_logs')
      .insert({
        webhook_name: normalized.event_type,
        trigger_table: source,
        trigger_operation: 'WEBHOOK',
        payload: normalized.payload,
        status: 'pending',
        event_source: normalized.event_source,
        event_type: normalized.event_type,
        processing_status: 'pending'
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to log webhook:', logError);
      throw logError;
    }

    console.log(`📝 Logged webhook: ${logEntry.id}`);

    // Forward to event-dispatcher asynchronously
    const dispatchPromise = supabase.functions.invoke('event-dispatcher', {
      body: {
        event_id: logEntry.id,
        ...normalized
      }
    }).then(result => {
      console.log(`✅ Dispatched to event-dispatcher:`, result.data);
      return result;
    }).catch(error => {
      console.error('❌ Dispatch failed:', error);
      return { error };
    });

    // Don't await - return immediately
    EdgeRuntime.waitUntil(dispatchPromise);

    return new Response(
      JSON.stringify({
        success: true,
        event_id: logEntry.id,
        event_type: normalized.event_type,
        message: 'Event received and queued for processing'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Event router error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function validateGitHubSignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  
  const secret = Deno.env.get('GITHUB_WEBHOOK_SECRET');
  if (!secret) {
    console.warn('⚠️ GITHUB_WEBHOOK_SECRET not configured');
    return true; // Allow in development
  }

  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  const expectedSignature = 'sha256=' + hmac.digest('hex');
  
  return signature === expectedSignature;
}

async function validateVercelSignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  
  const secret = Deno.env.get('VERCEL_WEBHOOK_SECRET');
  if (!secret) {
    console.warn('⚠️ VERCEL_WEBHOOK_SECRET not configured');
    return true; // Allow in development
  }

  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  const expectedSignature = hmac.digest('hex');
  
  return signature === expectedSignature;
}

function normalizeEvent(source: string, payload: any, headers: Record<string, any>): NormalizedEvent {
  if (source === 'github' || headers['x-github-event']) {
    const eventType = headers['x-github-event'];
    const action = payload.action || 'unknown';
    
    return {
      event_source: 'github',
      event_type: `github:${eventType}:${action}`,
      priority: calculateGitHubPriority(eventType, payload),
      payload,
      metadata: {
        repository: payload.repository?.full_name,
        sender: payload.sender?.login,
        action,
        delivery_id: headers['x-github-delivery']
      }
    };
  }

  if (source === 'vercel') {
    const deploymentState = payload.payload?.deployment?.state || payload.type;
    
    return {
      event_source: 'vercel',
      event_type: `vercel:deployment:${deploymentState?.toLowerCase()}`,
      priority: deploymentState === 'ERROR' ? 9 : 3,
      payload,
      metadata: {
        project: payload.payload?.project?.name || payload.project,
        deployment_id: payload.payload?.deployment?.id,
        url: payload.payload?.deployment?.url
      }
    };
  }

  if (source === 'supabase') {
    return {
      event_source: 'supabase',
      event_type: payload.event_type || 'supabase:unknown',
      priority: payload.priority || 5,
      payload: payload.payload || payload,
      metadata: payload.metadata || {}
    };
  }

  return {
    event_source: source,
    event_type: `${source}:unknown`,
    priority: 5,
    payload,
    metadata: {}
  };
}

function calculateGitHubPriority(eventType: string, payload: any): number {
  // Security events: highest priority
  if (eventType === 'security_advisory' || eventType === 'dependabot_alert') {
    return 10;
  }

  // Issues with specific labels
  if (eventType === 'issues') {
    const labels = payload.issue?.labels?.map((l: any) => l.name) || [];
    if (labels.includes('critical') || labels.includes('security')) return 9;
    if (labels.includes('bug')) return 7;
    if (labels.includes('enhancement')) return 5;
  }

  // Pull requests
  if (eventType === 'pull_request') return 6;

  // Workflow runs (failures are urgent)
  if (eventType === 'workflow_run' && payload.workflow_run?.conclusion === 'failure') {
    return 8;
  }

  return 5; // Default priority
}
