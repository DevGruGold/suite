import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VSCO_API_KEY = Deno.env.get('VSCO_API_KEY');
const BASE_URL = 'https://workspace.vsco.co/api/v2';

interface VscoRequestOptions {
  method?: string;
  body?: any;
  params?: Record<string, string>;
}

async function vscoRequest(
  supabase: any,
  endpoint: string,
  options: VscoRequestOptions = {},
  executive?: string
): Promise<{ data?: any; error?: string; status: number }> {
  const startTime = Date.now();
  const { method = 'GET', body, params } = options;

  if (!VSCO_API_KEY) {
    return { error: 'VSCO_API_KEY not configured', status: 500 };
  }

  let url = `${BASE_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'X-Api-Key': VSCO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseTime = Date.now() - startTime;

    // Log API call
    await supabase.from('vsco_api_logs').insert({
      action: endpoint,
      endpoint: url,
      method,
      status_code: response.status,
      response_time_ms: responseTime,
      success: response.ok,
      executive,
      request_payload: body,
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      return { error: `Rate limited. Retry after ${retryAfter} seconds`, status: 429 };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return { error: errorText || `HTTP ${response.status}`, status: response.status };
    }

    const data = await response.json();
    return { data, status: response.status };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await supabase.from('vsco_api_logs').insert({
      action: endpoint,
      endpoint: url,
      method,
      status_code: 0,
      response_time_ms: responseTime,
      success: false,
      error_message: errorMessage,
      executive,
      request_payload: body,
    });

    return { error: errorMessage, status: 0 };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const { action, data = {}, executive } = await req.json();
    console.log(`📸 [VSCO Workspace] Action: ${action}`, data);

    let result: any;

    switch (action) {
      // ====================================================================
      // STUDIO & BRANDS
      // ====================================================================
      case 'get_studio': {
        const response = await vscoRequest(supabase, '/studio', {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, studio: response.data };
        break;
      }

      case 'list_brands': {
        const response = await vscoRequest(supabase, '/brands', {}, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          // Sync brands to local DB
          const brands = response.data?.brands || [];
          for (const brand of brands) {
            await supabase.from('vsco_brands').upsert({
              vsco_id: brand.id,
              name: brand.name,
              is_default: brand.isDefault || false,
              raw_data: brand,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'vsco_id' });
          }
          result = { success: true, brands, synced: brands.length };
        }
        break;
      }

      case 'create_brand': {
        const response = await vscoRequest(supabase, '/brands', {
          method: 'POST',
          body: { name: data.name },
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, brand: response.data };
        break;
      }

      // ====================================================================
      // JOBS/LEADS MANAGEMENT
      // ====================================================================
      case 'list_jobs': {
        const params: Record<string, string> = {};
        if (data.stage) params.stage = data.stage;
        if (data.closed !== undefined) params.closed = String(data.closed);
        if (data.brand_id) params.brandId = data.brand_id;
        if (data.page) params.page = String(data.page);
        if (data.per_page) params.perPage = String(data.per_page);

        const response = await vscoRequest(supabase, '/jobs', { params }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, jobs: response.data?.jobs || [], pagination: response.data?.pagination };
        break;
      }

      case 'get_job': {
        if (!data.job_id) {
          result = { success: false, error: 'job_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/jobs/${data.job_id}`, {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, job: response.data };
        break;
      }

      case 'create_job': {
        const jobPayload: any = {
          name: data.name,
          stage: data.stage || 'lead',
        };
        if (data.brand_id) jobPayload.brandId = data.brand_id;
        if (data.job_type) jobPayload.jobType = data.job_type;
        if (data.lead_source) jobPayload.leadSource = data.lead_source;
        if (data.lead_rating) jobPayload.leadRating = data.lead_rating;
        if (data.lead_confidence) jobPayload.leadConfidence = data.lead_confidence;
        if (data.event_date) jobPayload.eventDate = data.event_date;

        const response = await vscoRequest(supabase, '/jobs', {
          method: 'POST',
          body: jobPayload,
        }, executive);

        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          // Sync to local DB
          const job = response.data;
          await supabase.from('vsco_jobs').upsert({
            vsco_id: job.id,
            name: job.name,
            stage: job.stage,
            lead_status: job.leadStatus,
            lead_rating: job.leadRating,
            lead_confidence: job.leadConfidence,
            lead_source: job.leadSource,
            job_type: job.jobType,
            brand_id: job.brandId,
            event_date: job.eventDate,
            raw_data: job,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_id' });
          result = { success: true, job };
        }
        break;
      }

      case 'update_job': {
        if (!data.job_id) {
          result = { success: false, error: 'job_id required' };
          break;
        }
        const updatePayload: any = {};
        if (data.name) updatePayload.name = data.name;
        if (data.stage) updatePayload.stage = data.stage;
        if (data.lead_status) updatePayload.leadStatus = data.lead_status;
        if (data.lead_rating) updatePayload.leadRating = data.lead_rating;
        if (data.lead_confidence) updatePayload.leadConfidence = data.lead_confidence;
        if (data.job_type) updatePayload.jobType = data.job_type;

        const response = await vscoRequest(supabase, `/jobs/${data.job_id}`, {
          method: 'PATCH',
          body: updatePayload,
        }, executive);

        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const job = response.data;
          await supabase.from('vsco_jobs').upsert({
            vsco_id: job.id,
            name: job.name,
            stage: job.stage,
            lead_status: job.leadStatus,
            lead_rating: job.leadRating,
            lead_confidence: job.leadConfidence,
            raw_data: job,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_id' });
          result = { success: true, job };
        }
        break;
      }

      case 'close_job': {
        if (!data.job_id) {
          result = { success: false, error: 'job_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/jobs/${data.job_id}`, {
          method: 'PATCH',
          body: { closed: true, closedReason: data.reason || 'completed' },
        }, executive);

        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          await supabase.from('vsco_jobs').update({
            closed: true,
            closed_reason: data.reason || 'completed',
            synced_at: new Date().toISOString(),
          }).eq('vsco_id', data.job_id);
          result = { success: true, job: response.data };
        }
        break;
      }

      // ====================================================================
      // CONTACTS/CRM
      // ====================================================================
      case 'list_contacts': {
        const params: Record<string, string> = {};
        if (data.kind) params.kind = data.kind;
        if (data.brand_id) params.brandId = data.brand_id;
        if (data.page) params.page = String(data.page);
        if (data.per_page) params.perPage = String(data.per_page);

        const response = await vscoRequest(supabase, '/contacts', { params }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, contacts: response.data?.contacts || [], pagination: response.data?.pagination };
        break;
      }

      case 'get_contact': {
        if (!data.contact_id) {
          result = { success: false, error: 'contact_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/contacts/${data.contact_id}`, {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, contact: response.data };
        break;
      }

      case 'create_contact': {
        const contactPayload: any = {
          kind: data.kind || 'person',
        };
        if (data.first_name) contactPayload.firstName = data.first_name;
        if (data.last_name) contactPayload.lastName = data.last_name;
        if (data.email) contactPayload.email = data.email;
        if (data.phone) contactPayload.phone = data.phone;
        if (data.cell_phone) contactPayload.cellPhone = data.cell_phone;
        if (data.company_name) contactPayload.companyName = data.company_name;
        if (data.brand_id) contactPayload.brandId = data.brand_id;

        const response = await vscoRequest(supabase, '/contacts', {
          method: 'POST',
          body: contactPayload,
        }, executive);

        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const contact = response.data;
          await supabase.from('vsco_contacts').upsert({
            vsco_id: contact.id,
            kind: contact.kind,
            name: contact.name,
            first_name: contact.firstName,
            last_name: contact.lastName,
            email: contact.email,
            phone: contact.phone,
            cell_phone: contact.cellPhone,
            company_name: contact.companyName,
            brand_id: contact.brandId,
            raw_data: contact,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_id' });
          result = { success: true, contact };
        }
        break;
      }

      case 'update_contact': {
        if (!data.contact_id) {
          result = { success: false, error: 'contact_id required' };
          break;
        }
        const updatePayload: any = {};
        if (data.first_name) updatePayload.firstName = data.first_name;
        if (data.last_name) updatePayload.lastName = data.last_name;
        if (data.email) updatePayload.email = data.email;
        if (data.phone) updatePayload.phone = data.phone;
        if (data.cell_phone) updatePayload.cellPhone = data.cell_phone;

        const response = await vscoRequest(supabase, `/contacts/${data.contact_id}`, {
          method: 'PATCH',
          body: updatePayload,
        }, executive);

        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const contact = response.data;
          await supabase.from('vsco_contacts').upsert({
            vsco_id: contact.id,
            first_name: contact.firstName,
            last_name: contact.lastName,
            email: contact.email,
            phone: contact.phone,
            cell_phone: contact.cellPhone,
            raw_data: contact,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_id' });
          result = { success: true, contact };
        }
        break;
      }

      // ====================================================================
      // EVENTS/CALENDAR
      // ====================================================================
      case 'list_events': {
        const params: Record<string, string> = {};
        if (data.job_id) params.jobId = data.job_id;
        if (data.start_date) params.startDate = data.start_date;
        if (data.end_date) params.endDate = data.end_date;
        if (data.page) params.page = String(data.page);

        const response = await vscoRequest(supabase, '/events', { params }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, events: response.data?.events || [], pagination: response.data?.pagination };
        break;
      }

      case 'get_event': {
        if (!data.event_id) {
          result = { success: false, error: 'event_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/events/${data.event_id}`, {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, event: response.data };
        break;
      }

      case 'create_event': {
        const eventPayload: any = {
          name: data.name,
          jobId: data.job_id,
        };
        if (data.event_type) eventPayload.eventType = data.event_type;
        if (data.channel) eventPayload.channel = data.channel;
        if (data.start_date) eventPayload.startDate = data.start_date;
        if (data.start_time) eventPayload.startTime = data.start_time;
        if (data.end_date) eventPayload.endDate = data.end_date;
        if (data.end_time) eventPayload.endTime = data.end_time;
        if (data.location_address) eventPayload.locationAddress = data.location_address;

        const response = await vscoRequest(supabase, '/events', {
          method: 'POST',
          body: eventPayload,
        }, executive);

        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const event = response.data;
          await supabase.from('vsco_events').upsert({
            vsco_id: event.id,
            vsco_job_id: event.jobId,
            name: event.name,
            event_type: event.eventType,
            channel: event.channel,
            start_date: event.startDate,
            start_time: event.startTime,
            end_date: event.endDate,
            end_time: event.endTime,
            location_address: event.locationAddress,
            confirmed: event.confirmed,
            raw_data: event,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_id' });
          result = { success: true, event };
        }
        break;
      }

      case 'update_event': {
        if (!data.event_id) {
          result = { success: false, error: 'event_id required' };
          break;
        }
        const updatePayload: any = {};
        if (data.name) updatePayload.name = data.name;
        if (data.start_date) updatePayload.startDate = data.start_date;
        if (data.start_time) updatePayload.startTime = data.start_time;
        if (data.end_date) updatePayload.endDate = data.end_date;
        if (data.end_time) updatePayload.endTime = data.end_time;
        if (data.confirmed !== undefined) updatePayload.confirmed = data.confirmed;

        const response = await vscoRequest(supabase, `/events/${data.event_id}`, {
          method: 'PATCH',
          body: updatePayload,
        }, executive);

        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const event = response.data;
          await supabase.from('vsco_events').upsert({
            vsco_id: event.id,
            name: event.name,
            start_date: event.startDate,
            start_time: event.startTime,
            end_date: event.endDate,
            end_time: event.endTime,
            confirmed: event.confirmed,
            raw_data: event,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_id' });
          result = { success: true, event };
        }
        break;
      }

      // ====================================================================
      // ORDERS/FINANCIALS
      // ====================================================================
      case 'list_orders': {
        if (!data.job_id) {
          result = { success: false, error: 'job_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/jobs/${data.job_id}/orders`, {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, orders: response.data?.orders || [] };
        break;
      }

      case 'get_order': {
        if (!data.order_id) {
          result = { success: false, error: 'order_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/orders/${data.order_id}`, {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, order: response.data };
        break;
      }

      case 'create_order': {
        if (!data.job_id) {
          result = { success: false, error: 'job_id required' };
          break;
        }
        const orderPayload: any = {
          jobId: data.job_id,
        };
        if (data.order_date) orderPayload.orderDate = data.order_date;

        const response = await vscoRequest(supabase, '/orders', {
          method: 'POST',
          body: orderPayload,
        }, executive);

        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const order = response.data;
          await supabase.from('vsco_orders').upsert({
            vsco_id: order.id,
            vsco_job_id: order.jobId,
            order_number: order.orderNumber,
            order_date: order.orderDate,
            status: order.status,
            subtotal: order.subtotal,
            tax_total: order.taxTotal,
            total: order.total,
            balance_due: order.balanceDue,
            raw_data: order,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_id' });
          result = { success: true, order };
        }
        break;
      }

      // ====================================================================
      // WEBHOOKS/AUTOMATION
      // ====================================================================
      case 'list_webhooks': {
        const response = await vscoRequest(supabase, '/webhooks', {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, webhooks: response.data?.webhooks || [] };
        break;
      }

      case 'create_webhook': {
        const webhookPayload: any = {
          url: data.url,
          events: data.events || ['*'],
        };
        if (data.brand_id) webhookPayload.brandId = data.brand_id;

        const response = await vscoRequest(supabase, '/webhooks', {
          method: 'POST',
          body: webhookPayload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, webhook: response.data };
        break;
      }

      case 'delete_webhook': {
        if (!data.webhook_id) {
          result = { success: false, error: 'webhook_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/webhooks/${data.webhook_id}`, {
          method: 'DELETE',
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, deleted: true };
        break;
      }

      // ====================================================================
      // ANALYTICS
      // ====================================================================
      case 'get_analytics': {
        // Get pipeline analytics by aggregating local data
        const { data: jobs } = await supabase
          .from('vsco_jobs')
          .select('stage, total_revenue, closed')
          .eq('closed', data.include_closed !== false);

        const stages = { lead: 0, booked: 0, fulfillment: 0, completed: 0 };
        let totalRevenue = 0;

        for (const job of jobs || []) {
          if (job.stage && stages[job.stage] !== undefined) {
            stages[job.stage]++;
          }
          if (job.total_revenue) {
            totalRevenue += Number(job.total_revenue);
          }
        }

        result = {
          success: true,
          analytics: {
            pipeline: stages,
            total_jobs: (jobs || []).length,
            total_revenue: totalRevenue,
            last_synced: new Date().toISOString(),
          },
        };
        break;
      }

      case 'get_revenue_report': {
        const { data: jobs } = await supabase
          .from('vsco_jobs')
          .select('stage, total_revenue, total_cost, account_balance')
          .eq('closed', false);

        const revenueByStage: Record<string, number> = {};
        let totalRevenue = 0;
        let totalCost = 0;
        let totalBalance = 0;

        for (const job of jobs || []) {
          const stage = job.stage || 'unknown';
          revenueByStage[stage] = (revenueByStage[stage] || 0) + Number(job.total_revenue || 0);
          totalRevenue += Number(job.total_revenue || 0);
          totalCost += Number(job.total_cost || 0);
          totalBalance += Number(job.account_balance || 0);
        }

        result = {
          success: true,
          report: {
            revenue_by_stage: revenueByStage,
            totals: {
              revenue: totalRevenue,
              cost: totalCost,
              profit: totalRevenue - totalCost,
              outstanding_balance: totalBalance,
            },
          },
        };
        break;
      }

      // ====================================================================
      // SYNC ALL - Full data synchronization
      // ====================================================================
      case 'sync_all':
      case 'sync_jobs':
      case 'sync_contacts': {
        const syncResults: any = { jobs: 0, contacts: 0, events: 0, errors: [] };

        // Sync jobs
        try {
          let page = 1;
          let hasMore = true;
          while (hasMore) {
            const jobsResponse = await vscoRequest(supabase, '/jobs', { 
              params: { page: String(page), perPage: '100' } 
            }, executive);
            
            if (jobsResponse.error) {
              syncResults.errors.push(`Jobs sync error: ${jobsResponse.error}`);
              break;
            }
            
            const jobs = jobsResponse.data?.jobs || [];
            for (const job of jobs) {
              await supabase.from('vsco_jobs').upsert({
                vsco_id: job.id,
                name: job.name,
                stage: job.stage,
                lead_status: job.leadStatus,
                lead_rating: job.leadRating,
                lead_confidence: job.leadConfidence,
                lead_source: job.leadSource,
                job_type: job.jobType,
                brand_id: job.brandId,
                event_date: job.eventDate,
                booking_date: job.bookingDate,
                total_revenue: job.totalRevenue,
                total_cost: job.totalCost,
                account_balance: job.accountBalance,
                closed: job.closed,
                closed_reason: job.closedReason,
                raw_data: job,
                synced_at: new Date().toISOString(),
              }, { onConflict: 'vsco_id' });
              syncResults.jobs++;
            }
            
            hasMore = jobs.length === 100;
            page++;
          }
        } catch (e) {
          syncResults.errors.push(`Jobs sync exception: ${e}`);
        }

        // Sync contacts
        if (action === 'sync_all' || action === 'sync_contacts') {
          try {
            let page = 1;
            let hasMore = true;
            while (hasMore) {
              const contactsResponse = await vscoRequest(supabase, '/contacts', { 
                params: { page: String(page), perPage: '100' } 
              }, executive);
              
              if (contactsResponse.error) {
                syncResults.errors.push(`Contacts sync error: ${contactsResponse.error}`);
                break;
              }
              
              const contacts = contactsResponse.data?.contacts || [];
              for (const contact of contacts) {
                await supabase.from('vsco_contacts').upsert({
                  vsco_id: contact.id,
                  kind: contact.kind,
                  name: contact.name,
                  first_name: contact.firstName,
                  last_name: contact.lastName,
                  email: contact.email,
                  phone: contact.phone,
                  cell_phone: contact.cellPhone,
                  company_name: contact.companyName,
                  brand_id: contact.brandId,
                  raw_data: contact,
                  synced_at: new Date().toISOString(),
                }, { onConflict: 'vsco_id' });
                syncResults.contacts++;
              }
              
              hasMore = contacts.length === 100;
              page++;
            }
          } catch (e) {
            syncResults.errors.push(`Contacts sync exception: ${e}`);
          }
        }

        result = { success: true, sync_results: syncResults };
        break;
      }

      case 'get_api_health': {
        // Check API health by making a simple request
        const response = await vscoRequest(supabase, '/studio', {}, executive);
        
        // Get recent API logs
        const { data: recentLogs } = await supabase
          .from('vsco_api_logs')
          .select('success, response_time_ms')
          .gte('created_at', new Date(Date.now() - 3600000).toISOString())
          .order('created_at', { ascending: false })
          .limit(100);

        const totalCalls = recentLogs?.length || 0;
        const successCalls = recentLogs?.filter(l => l.success).length || 0;
        const avgResponseTime = totalCalls > 0 
          ? Math.round(recentLogs!.reduce((acc, l) => acc + (l.response_time_ms || 0), 0) / totalCalls)
          : 0;

        result = {
          success: true,
          health: {
            api_reachable: !response.error,
            success_rate_1h: totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 100,
            avg_response_time_ms: avgResponseTime,
            total_calls_1h: totalCalls,
            last_check: new Date().toISOString(),
          },
        };
        break;
      }

      // ====================================================================
      // PRODUCTS/QUOTES
      // ====================================================================
      case 'list_products': {
        const params: Record<string, string> = {};
        if (data.page) params.page = String(data.page);
        if (data.per_page) params.perPage = String(data.per_page);
        
        const response = await vscoRequest(supabase, '/products', { params }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const products = response.data?.products || [];
          // Sync to local DB
          for (const product of products) {
            await supabase.from('vsco_products').upsert({
              vsco_id: product.id,
              name: product.name,
              description: product.description,
              price: product.price,
              cost: product.cost,
              tax_rate: product.taxRate,
              product_type_id: product.productTypeId,
              category: product.category,
              is_active: product.isActive !== false,
              raw_data: product,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'vsco_id' });
          }
          result = { success: true, products, synced: products.length };
        }
        break;
      }

      case 'get_product': {
        if (!data.product_id) {
          result = { success: false, error: 'product_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/products/${data.product_id}`, {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, product: response.data };
        break;
      }

      case 'create_product': {
        const productPayload: any = {
          name: data.name,
          price: data.price,
        };
        if (data.description) productPayload.description = data.description;
        if (data.cost) productPayload.cost = data.cost;
        if (data.tax_rate) productPayload.taxRate = data.tax_rate;
        if (data.category) productPayload.category = data.category;

        const response = await vscoRequest(supabase, '/products', {
          method: 'POST',
          body: productPayload,
        }, executive);

        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const product = response.data;
          await supabase.from('vsco_products').upsert({
            vsco_id: product.id,
            name: product.name,
            price: product.price,
            cost: product.cost,
            description: product.description,
            category: product.category,
            raw_data: product,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_id' });
          result = { success: true, product };
        }
        break;
      }

      case 'delete_product': {
        if (!data.product_id) {
          result = { success: false, error: 'product_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/products/${data.product_id}`, {
          method: 'DELETE',
        }, executive);
        
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          await supabase.from('vsco_products').delete().eq('vsco_id', data.product_id);
          result = { success: true, deleted: true };
        }
        break;
      }

      // ====================================================================
      // WORKSHEETS/QUOTE TEMPLATES
      // ====================================================================
      case 'get_job_worksheet': {
        if (!data.job_id) {
          result = { success: false, error: 'job_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/jobs/${data.job_id}/worksheet`, {}, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          // Store worksheet for reference
          await supabase.from('vsco_worksheets').upsert({
            vsco_job_id: data.job_id,
            events: response.data?.events || [],
            contacts: response.data?.contacts || [],
            products: response.data?.products || [],
            raw_data: response.data,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_job_id' });
          result = { success: true, worksheet: response.data };
        }
        break;
      }

      case 'create_job_from_worksheet': {
        // Create a new job using worksheet data (template-based creation)
        const worksheetPayload: any = {
          name: data.name,
          stage: data.stage || 'lead',
        };
        if (data.events) worksheetPayload.events = data.events;
        if (data.contacts) worksheetPayload.contacts = data.contacts;
        if (data.products) worksheetPayload.products = data.products;
        if (data.job_type) worksheetPayload.jobType = data.job_type;
        if (data.brand_id) worksheetPayload.brandId = data.brand_id;

        const response = await vscoRequest(supabase, '/jobs', {
          method: 'POST',
          body: worksheetPayload,
        }, executive);

        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const job = response.data;
          // Sync job
          await supabase.from('vsco_jobs').upsert({
            vsco_id: job.id,
            name: job.name,
            stage: job.stage,
            job_type: job.jobType,
            raw_data: job,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_id' });
          result = { success: true, job, created_with_worksheet: true };
        }
        break;
      }

      // ====================================================================
      // NOTES
      // ====================================================================
      case 'list_notes': {
        const params: Record<string, string> = {};
        if (data.job_id) params.jobId = data.job_id;
        if (data.contact_id) params.contactId = data.contact_id;
        if (data.page) params.page = String(data.page);

        const response = await vscoRequest(supabase, '/notes', { params }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const notes = response.data?.notes || [];
          for (const note of notes) {
            await supabase.from('vsco_notes').upsert({
              vsco_id: note.id,
              vsco_job_id: note.jobId,
              vsco_contact_id: note.contactId,
              content_html: note.contentHtml,
              content_text: note.contentText,
              note_date: note.date,
              author: note.author,
              raw_data: note,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'vsco_id' });
          }
          result = { success: true, notes, synced: notes.length };
        }
        break;
      }

      case 'create_note': {
        const notePayload: any = {
          contentHtml: data.content_html || data.content,
        };
        if (data.job_id) notePayload.jobId = data.job_id;
        if (data.contact_id) notePayload.contactId = data.contact_id;
        if (data.date) notePayload.date = data.date;

        const response = await vscoRequest(supabase, '/notes', {
          method: 'POST',
          body: notePayload,
        }, executive);

        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const note = response.data;
          await supabase.from('vsco_notes').upsert({
            vsco_id: note.id,
            vsco_job_id: note.jobId,
            vsco_contact_id: note.contactId,
            content_html: note.contentHtml,
            content_text: note.contentText,
            raw_data: note,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_id' });
          result = { success: true, note };
        }
        break;
      }

      case 'update_note': {
        if (!data.note_id) {
          result = { success: false, error: 'note_id required' };
          break;
        }
        const updatePayload: any = {};
        if (data.content_html || data.content) updatePayload.contentHtml = data.content_html || data.content;
        if (data.date) updatePayload.date = data.date;

        const response = await vscoRequest(supabase, `/notes/${data.note_id}`, {
          method: 'PATCH',
          body: updatePayload,
        }, executive);

        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const note = response.data;
          await supabase.from('vsco_notes').upsert({
            vsco_id: note.id,
            content_html: note.contentHtml,
            content_text: note.contentText,
            raw_data: note,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_id' });
          result = { success: true, note };
        }
        break;
      }

      case 'delete_note': {
        if (!data.note_id) {
          result = { success: false, error: 'note_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/notes/${data.note_id}`, {
          method: 'DELETE',
        }, executive);
        
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          await supabase.from('vsco_notes').delete().eq('vsco_id', data.note_id);
          result = { success: true, deleted: true };
        }
        break;
      }

      // ====================================================================
      // FILES & GALLERIES
      // ====================================================================
      case 'list_files': {
        const params: Record<string, string> = {};
        if (data.job_id) params.jobId = data.job_id;
        if (data.page) params.page = String(data.page);

        const response = await vscoRequest(supabase, '/files', { params }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const files = response.data?.files || [];
          for (const file of files) {
            await supabase.from('vsco_files').upsert({
              vsco_id: file.id,
              vsco_job_id: file.jobId,
              vsco_gallery_id: file.galleryId,
              filename: file.filename,
              file_type: file.fileType,
              file_size: file.fileSize,
              url: file.url,
              raw_data: file,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'vsco_id' });
          }
          result = { success: true, files, synced: files.length };
        }
        break;
      }

      case 'list_galleries': {
        const params: Record<string, string> = {};
        if (data.job_id) params.jobId = data.job_id;
        if (data.page) params.page = String(data.page);

        const response = await vscoRequest(supabase, '/galleries', { params }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, galleries: response.data?.galleries || [] };
        break;
      }

      case 'create_gallery': {
        const galleryPayload: any = {
          name: data.name,
        };
        if (data.job_id) galleryPayload.jobId = data.job_id;
        if (data.description) galleryPayload.description = data.description;

        const response = await vscoRequest(supabase, '/galleries', {
          method: 'POST',
          body: galleryPayload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, gallery: response.data };
        break;
      }

      // ====================================================================
      // CUSTOM FIELDS & DISCOUNTS
      // ====================================================================
      case 'list_custom_fields': {
        const response = await vscoRequest(supabase, '/custom-fields', {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, custom_fields: response.data?.customFields || [] };
        break;
      }

      case 'list_discounts': {
        const response = await vscoRequest(supabase, '/discounts', {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, discounts: response.data?.discounts || [] };
        break;
      }

      case 'create_discount': {
        const discountPayload: any = {
          name: data.name,
          amount: data.amount,
          discountType: data.discount_type || 'fixed', // fixed or percent
        };

        const response = await vscoRequest(supabase, '/discounts', {
          method: 'POST',
          body: discountPayload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, discount: response.data };
        break;
      }

      default:
        result = { success: false, error: `Unknown action: ${action}` };
    }

    console.log(`📸 [VSCO Workspace] Result:`, result);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ [VSCO Workspace] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
