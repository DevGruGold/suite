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
    console.error('❌ VSCO_API_KEY not configured');
    return { error: 'VSCO_API_KEY not configured', status: 500 };
  }

  let url = `${BASE_URL}${endpoint}`;
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  console.log(`📸 [VSCO API] ${method} ${url}`);

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
    console.log(`📸 [VSCO API] Response: ${response.status} (${responseTime}ms)`);

    // Log API call
    try {
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
    } catch (logErr) {
      console.warn('Failed to log API call:', logErr);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      return { error: `Rate limited. Retry after ${retryAfter} seconds`, status: 429 };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [VSCO API] Error: ${errorText || `HTTP ${response.status}`}`);
      return { error: errorText || `HTTP ${response.status}`, status: response.status };
    }

    const data = await response.json();
    
    // 🔍 DIAGNOSTIC: Log raw response structure for debugging
    console.log(`🔍 [VSCO API] Raw Response Type: ${typeof data}`);
    console.log(`🔍 [VSCO API] Raw Response IsArray: ${Array.isArray(data)}`);
    console.log(`🔍 [VSCO API] Raw Response Keys: ${data ? Object.keys(data).join(', ') : 'null'}`);
    console.log(`🔍 [VSCO API] Raw Response Preview: ${data ? JSON.stringify(data).slice(0, 800) : 'null/undefined'}`);
    
    return { data, status: response.status };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [VSCO API] Exception: ${errorMessage}`);

    try {
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
    } catch (logErr) {
      console.warn('Failed to log API error:', logErr);
    }

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
    console.log(`📸 [VSCO Workspace] Action: ${action}`, JSON.stringify(data));

    let result: any;

    switch (action) {
      // ====================================================================
      // STUDIO & BRANDS (Táve uses singular /brand)
      // ====================================================================
      case 'get_studio': {
        const response = await vscoRequest(supabase, '/studio', {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, studio: response.data };
        break;
      }

      case 'list_brands': {
        // Táve API uses /brand (singular) for listing
        const response = await vscoRequest(supabase, '/brand', {}, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          // Sync brands to local DB
          const brands = response.data?.brands || response.data || [];
          const brandsArray = Array.isArray(brands) ? brands : [brands];
          for (const brand of brandsArray) {
            await supabase.from('vsco_brands').upsert({
              vsco_id: brand.id,
              name: brand.name,
              is_default: brand.isDefault || false,
              raw_data: brand,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'vsco_id' });
          }
          result = { success: true, brands: brandsArray, synced: brandsArray.length };
        }
        break;
      }

      case 'create_brand': {
        const response = await vscoRequest(supabase, '/brand', {
          method: 'POST',
          body: { name: data.name },
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, brand: response.data };
        break;
      }

      // ====================================================================
      // JOBS/LEADS MANAGEMENT (Táve uses /job singular)
      // ====================================================================
      case 'list_jobs': {
        const params: Record<string, string> = {};
        if (data.stage) params.stage = data.stage;
        if (data.closed !== undefined) params.closed = String(data.closed);
        if (data.brand_id) params.brandId = data.brand_id;
        if (data.page) params.page = String(data.page);
        if (data.per_page) params.pageSize = String(data.per_page); // Táve uses pageSize

        const response = await vscoRequest(supabase, '/job', { params }, executive);
        
        // VSCO API returns: { meta, type, items } - items is the data array
        const jobs = response.data?.items || response.data?.jobs || response.data || [];
        const pagination = response.data?.meta;
        console.log(`🔍 [list_jobs] Found ${Array.isArray(jobs) ? jobs.length : 0} jobs, pagination: ${JSON.stringify(pagination)}`);
        
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, jobs: Array.isArray(jobs) ? jobs : [], pagination };
        break;
      }

      case 'get_job': {
        if (!data.job_id) {
          result = { success: false, error: 'job_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/job/${data.job_id}`, {}, executive);
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

        const response = await vscoRequest(supabase, '/job', {
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

        const response = await vscoRequest(supabase, `/job/${data.job_id}`, {
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
        const response = await vscoRequest(supabase, `/job/${data.job_id}`, {
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
      // CONTACTS/CRM (Táve uses /address-book)
      // ====================================================================
      case 'list_contacts': {
        const params: Record<string, string> = {};
        if (data.kind) params.kind = data.kind;
        if (data.brand_id) params.brandId = data.brand_id;
        if (data.page) params.page = String(data.page);
        if (data.per_page) params.pageSize = String(data.per_page);

        const response = await vscoRequest(supabase, '/address-book', { params }, executive);
        
        // VSCO API returns: { meta, type, items } - items is the data array
        const contacts = response.data?.items || response.data?.contacts || response.data || [];
        const pagination = response.data?.meta;
        console.log(`🔍 [list_contacts] Found ${Array.isArray(contacts) ? contacts.length : 0} contacts, pagination: ${JSON.stringify(pagination)}`);
        
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, contacts: Array.isArray(contacts) ? contacts : [], pagination };
        break;
      }

      case 'get_contact': {
        if (!data.contact_id) {
          result = { success: false, error: 'contact_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/address-book/${data.contact_id}`, {}, executive);
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

        const response = await vscoRequest(supabase, '/address-book', {
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

        const response = await vscoRequest(supabase, `/address-book/${data.contact_id}`, {
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
      // EVENTS/CALENDAR (Táve uses /event singular)
      // ====================================================================
      case 'list_events': {
        const params: Record<string, string> = {};
        if (data.job_id) params.jobId = data.job_id;
        if (data.start_date) params.startDate = data.start_date;
        if (data.end_date) params.endDate = data.end_date;
        if (data.page) params.page = String(data.page);
        
        // Try to request sorted by startDate descending (newest first)
        // Common API patterns: -startDate, sort=-startDate, order=desc
        if (data.sort) params.sort = data.sort;
        else params.sort = '-startDate';

        const response = await vscoRequest(supabase, '/event', { params }, executive);
        
        // VSCO API returns: { meta, type, items } - items is the data array
        let events = response.data?.items || response.data?.events || response.data || [];
        const pagination = response.data?.meta;
        
        // Client-side fallback sort: newest first (descending by startDate)
        // In case the API doesn't support the sort parameter
        if (Array.isArray(events) && events.length > 1) {
          const sortOrder = data.sort_order || 'desc'; // default: newest first
          events = events.sort((a: any, b: any) => {
            const dateA = new Date(a.startDate || a.start_date || a.created || 0).getTime();
            const dateB = new Date(b.startDate || b.start_date || b.created || 0).getTime();
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
          });
        }
        
        console.log(`🔍 [list_events] Found ${Array.isArray(events) ? events.length : 0} events (sorted ${data.sort_order || 'desc'}), pagination: ${JSON.stringify(pagination)}`);
        
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, events: Array.isArray(events) ? events : [], pagination };
        break;
      }

      case 'get_event': {
        if (!data.event_id) {
          result = { success: false, error: 'event_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/event/${data.event_id}`, {}, executive);
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

        const response = await vscoRequest(supabase, '/event', {
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

        const response = await vscoRequest(supabase, `/event/${data.event_id}`, {
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
      // ORDERS/FINANCIALS (Táve uses /order singular)
      // ====================================================================
      case 'list_orders': {
        if (!data.job_id) {
          result = { success: false, error: 'job_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/job/${data.job_id}/order`, {}, executive);
        const orders = response.data?.orders || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, orders: Array.isArray(orders) ? orders : [] };
        break;
      }

      case 'get_order': {
        if (!data.order_id) {
          result = { success: false, error: 'order_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/order/${data.order_id}`, {}, executive);
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

        const response = await vscoRequest(supabase, '/order', {
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
      // WEBHOOKS/AUTOMATION (Táve uses /rest-hook)
      // ====================================================================
      case 'list_webhooks': {
        const response = await vscoRequest(supabase, '/rest-hook', {}, executive);
        const webhooks = response.data?.webhooks || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, webhooks: Array.isArray(webhooks) ? webhooks : [] };
        break;
      }

      case 'create_webhook': {
        const webhookPayload: any = {
          url: data.url,
          events: data.events || ['*'],
        };
        if (data.brand_id) webhookPayload.brandId = data.brand_id;

        const response = await vscoRequest(supabase, '/rest-hook', {
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
        const response = await vscoRequest(supabase, `/rest-hook/${data.webhook_id}`, {
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

        // Sync jobs (using /job singular)
        try {
          let page = 1;
          let hasMore = true;
          while (hasMore) {
            const jobsResponse = await vscoRequest(supabase, '/job', { 
              params: { page: String(page), pageSize: '100' } 
            }, executive);
            
            if (jobsResponse.error) {
              syncResults.errors.push(`Jobs sync error: ${jobsResponse.error}`);
              break;
            }
            
            const jobs = jobsResponse.data?.jobs || jobsResponse.data || [];
            const jobsArray = Array.isArray(jobs) ? jobs : [];
            for (const job of jobsArray) {
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
            
            hasMore = jobsArray.length === 100;
            page++;
          }
        } catch (e) {
          syncResults.errors.push(`Jobs sync exception: ${e}`);
        }

        // Sync contacts (using /address-book)
        if (action === 'sync_all' || action === 'sync_contacts') {
          try {
            let page = 1;
            let hasMore = true;
            while (hasMore) {
              const contactsResponse = await vscoRequest(supabase, '/address-book', { 
                params: { page: String(page), pageSize: '100' } 
              }, executive);
              
              if (contactsResponse.error) {
                syncResults.errors.push(`Contacts sync error: ${contactsResponse.error}`);
                break;
              }
              
              const contacts = contactsResponse.data?.contacts || contactsResponse.data || [];
              const contactsArray = Array.isArray(contacts) ? contacts : [];
              for (const contact of contactsArray) {
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
              
              hasMore = contactsArray.length === 100;
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
      // PRODUCTS/QUOTES (Táve uses /product singular)
      // ====================================================================
      case 'list_products': {
        const params: Record<string, string> = {};
        if (data.page) params.page = String(data.page);
        if (data.per_page) params.pageSize = String(data.per_page);
        
        const response = await vscoRequest(supabase, '/product', { params }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const products = response.data?.products || response.data || [];
          const productsArray = Array.isArray(products) ? products : [];
          // Sync to local DB
          for (const product of productsArray) {
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
          result = { success: true, products: productsArray, synced: productsArray.length };
        }
        break;
      }

      case 'get_product': {
        if (!data.product_id) {
          result = { success: false, error: 'product_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/product/${data.product_id}`, {}, executive);
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

        const response = await vscoRequest(supabase, '/product', {
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
        const response = await vscoRequest(supabase, `/product/${data.product_id}`, {
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
        const response = await vscoRequest(supabase, `/job/${data.job_id}/worksheet`, {}, executive);
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

        const response = await vscoRequest(supabase, '/job', {
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
      // NOTES (Táve uses /note singular)
      // ====================================================================
      case 'list_notes': {
        const params: Record<string, string> = {};
        if (data.job_id) params.jobId = data.job_id;
        if (data.contact_id) params.contactId = data.contact_id;
        if (data.page) params.page = String(data.page);

        const response = await vscoRequest(supabase, '/note', { params }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          const notes = response.data?.notes || response.data || [];
          const notesArray = Array.isArray(notes) ? notes : [];
          for (const note of notesArray) {
            await supabase.from('vsco_notes').upsert({
              vsco_id: note.id,
              vsco_job_id: note.jobId,
              vsco_contact_id: note.contactId,
              content: note.content,
              note_type: note.noteType,
              raw_data: note,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'vsco_id' });
          }
          result = { success: true, notes: notesArray, synced: notesArray.length };
        }
        break;
      }

      case 'create_note': {
        const notePayload: any = {
          content: data.content,
        };
        if (data.job_id) notePayload.jobId = data.job_id;
        if (data.contact_id) notePayload.contactId = data.contact_id;
        if (data.note_type) notePayload.noteType = data.note_type;

        const response = await vscoRequest(supabase, '/note', {
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
            content: note.content,
            note_type: note.noteType,
            raw_data: note,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_id' });
          result = { success: true, note };
        }
        break;
      }

      // ====================================================================
      // FILES & GALLERIES (Táve uses /file and /gallery singular)
      // ====================================================================
      case 'list_files': {
        const params: Record<string, string> = {};
        if (data.job_id) params.jobId = data.job_id;
        if (data.page) params.page = String(data.page);

        const response = await vscoRequest(supabase, '/file', { params }, executive);
        const files = response.data?.files || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, files: Array.isArray(files) ? files : [] };
        break;
      }

      case 'list_galleries': {
        const params: Record<string, string> = {};
        if (data.job_id) params.jobId = data.job_id;
        if (data.page) params.page = String(data.page);

        const response = await vscoRequest(supabase, '/gallery', { params }, executive);
        const galleries = response.data?.galleries || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, galleries: Array.isArray(galleries) ? galleries : [] };
        break;
      }

      // ====================================================================
      // CUSTOM FIELDS & DISCOUNTS (EXPANDED)
      // ====================================================================
      case 'list_custom_fields': {
        const response = await vscoRequest(supabase, '/custom-field', {}, executive);
        const customFields = response.data?.items || response.data?.customFields || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, custom_fields: Array.isArray(customFields) ? customFields : [] };
        break;
      }

      case 'create_custom_field': {
        const payload: any = {
          name: data.name,
          fieldType: data.field_type || 'text',
        };
        if (data.entity_type) payload.entityType = data.entity_type;
        if (data.options) payload.options = data.options;
        if (data.required !== undefined) payload.required = data.required;

        const response = await vscoRequest(supabase, '/custom-field', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, custom_field: response.data };
        break;
      }

      case 'update_custom_field': {
        if (!data.custom_field_id) {
          result = { success: false, error: 'custom_field_id required' };
          break;
        }
        const payload: any = {};
        if (data.name) payload.name = data.name;
        if (data.options) payload.options = data.options;
        if (data.required !== undefined) payload.required = data.required;

        const response = await vscoRequest(supabase, `/custom-field/${data.custom_field_id}`, {
          method: 'PATCH',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, custom_field: response.data };
        break;
      }

      case 'delete_custom_field': {
        if (!data.custom_field_id) {
          result = { success: false, error: 'custom_field_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/custom-field/${data.custom_field_id}`, {
          method: 'DELETE',
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, deleted: true };
        break;
      }

      case 'list_discounts': {
        const response = await vscoRequest(supabase, '/discount', {}, executive);
        const discounts = response.data?.items || response.data?.discounts || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, discounts: Array.isArray(discounts) ? discounts : [] };
        break;
      }

      case 'create_discount': {
        const payload: any = {
          name: data.name,
          amount: data.amount,
          discountType: data.discount_type || 'fixed',
        };
        if (data.percent) payload.percent = data.percent;
        if (data.brand_id) payload.brandId = data.brand_id;

        const response = await vscoRequest(supabase, '/discount', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, discount: response.data };
        break;
      }

      case 'delete_discount': {
        if (!data.discount_id) {
          result = { success: false, error: 'discount_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/discount/${data.discount_id}`, {
          method: 'DELETE',
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, deleted: true };
        break;
      }

      // ====================================================================
      // DELETE OPERATIONS (MISSING FROM ORIGINAL)
      // ====================================================================
      case 'delete_job': {
        if (!data.job_id) {
          result = { success: false, error: 'job_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/job/${data.job_id}`, {
          method: 'DELETE',
        }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          await supabase.from('vsco_jobs').delete().eq('vsco_id', data.job_id);
          result = { success: true, deleted: true };
        }
        break;
      }

      case 'delete_contact': {
        if (!data.contact_id) {
          result = { success: false, error: 'contact_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/address-book/${data.contact_id}`, {
          method: 'DELETE',
        }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          await supabase.from('vsco_contacts').delete().eq('vsco_id', data.contact_id);
          result = { success: true, deleted: true };
        }
        break;
      }

      case 'delete_event': {
        if (!data.event_id) {
          result = { success: false, error: 'event_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/event/${data.event_id}`, {
          method: 'DELETE',
        }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          await supabase.from('vsco_events').delete().eq('vsco_id', data.event_id);
          result = { success: true, deleted: true };
        }
        break;
      }

      case 'update_note': {
        if (!data.note_id) {
          result = { success: false, error: 'note_id required' };
          break;
        }
        const payload: any = {};
        if (data.content) payload.content = data.content;
        if (data.note_type) payload.noteType = data.note_type;

        const response = await vscoRequest(supabase, `/note/${data.note_id}`, {
          method: 'PATCH',
          body: payload,
        }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          await supabase.from('vsco_notes').update({
            content: data.content,
            note_type: data.note_type,
            synced_at: new Date().toISOString(),
          }).eq('vsco_id', data.note_id);
          result = { success: true, note: response.data };
        }
        break;
      }

      case 'delete_note': {
        if (!data.note_id) {
          result = { success: false, error: 'note_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/note/${data.note_id}`, {
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
      // JOB CONTACTS (Contacts specific to a job)
      // ====================================================================
      case 'list_job_contacts': {
        if (!data.job_id) {
          result = { success: false, error: 'job_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/job/${data.job_id}/contact`, {}, executive);
        const contacts = response.data?.items || response.data?.contacts || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, job_contacts: Array.isArray(contacts) ? contacts : [] };
        break;
      }

      case 'create_job_contact': {
        if (!data.job_id) {
          result = { success: false, error: 'job_id required' };
          break;
        }
        const payload: any = {};
        if (data.contact_id) payload.contactId = data.contact_id;
        if (data.role) payload.role = data.role;
        if (data.is_primary !== undefined) payload.isPrimary = data.is_primary;

        const response = await vscoRequest(supabase, `/job/${data.job_id}/contact`, {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, job_contact: response.data };
        break;
      }

      case 'get_job_contact': {
        if (!data.job_id || !data.job_contact_id) {
          result = { success: false, error: 'job_id and job_contact_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/job/${data.job_id}/contact/${data.job_contact_id}`, {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, job_contact: response.data };
        break;
      }

      case 'update_job_contact': {
        if (!data.job_id || !data.job_contact_id) {
          result = { success: false, error: 'job_id and job_contact_id required' };
          break;
        }
        const payload: any = {};
        if (data.role) payload.role = data.role;
        if (data.is_primary !== undefined) payload.isPrimary = data.is_primary;

        const response = await vscoRequest(supabase, `/job/${data.job_id}/contact/${data.job_contact_id}`, {
          method: 'PATCH',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, job_contact: response.data };
        break;
      }

      case 'delete_job_contact': {
        if (!data.job_id || !data.job_contact_id) {
          result = { success: false, error: 'job_id and job_contact_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/job/${data.job_id}/contact/${data.job_contact_id}`, {
          method: 'DELETE',
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, deleted: true };
        break;
      }

      // ====================================================================
      // FINANCIAL/ACCOUNTING MODULE
      // ====================================================================
      case 'update_order': {
        if (!data.order_id) {
          result = { success: false, error: 'order_id required' };
          break;
        }
        const payload: any = {};
        if (data.order_date) payload.orderDate = data.order_date;
        if (data.status) payload.status = data.status;
        if (data.notes) payload.notes = data.notes;

        const response = await vscoRequest(supabase, `/order/${data.order_id}`, {
          method: 'PATCH',
          body: payload,
        }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          await supabase.from('vsco_orders').update({
            status: data.status,
            synced_at: new Date().toISOString(),
          }).eq('vsco_id', data.order_id);
          result = { success: true, order: response.data };
        }
        break;
      }

      case 'delete_order': {
        if (!data.order_id) {
          result = { success: false, error: 'order_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/order/${data.order_id}`, {
          method: 'DELETE',
        }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          await supabase.from('vsco_orders').delete().eq('vsco_id', data.order_id);
          result = { success: true, deleted: true };
        }
        break;
      }

      case 'list_payment_methods': {
        const response = await vscoRequest(supabase, '/payment-method', {}, executive);
        const methods = response.data?.items || response.data?.paymentMethods || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, payment_methods: Array.isArray(methods) ? methods : [] };
        break;
      }

      case 'get_payment_method': {
        if (!data.payment_method_id) {
          result = { success: false, error: 'payment_method_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/payment-method/${data.payment_method_id}`, {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, payment_method: response.data };
        break;
      }

      case 'list_profit_centers': {
        const response = await vscoRequest(supabase, '/profit-center', {}, executive);
        const centers = response.data?.items || response.data?.profitCenters || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, profit_centers: Array.isArray(centers) ? centers : [] };
        break;
      }

      case 'create_profit_center': {
        const payload: any = { name: data.name };
        if (data.description) payload.description = data.description;

        const response = await vscoRequest(supabase, '/profit-center', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, profit_center: response.data };
        break;
      }

      case 'get_profit_center': {
        if (!data.profit_center_id) {
          result = { success: false, error: 'profit_center_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/profit-center/${data.profit_center_id}`, {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, profit_center: response.data };
        break;
      }

      case 'update_profit_center': {
        if (!data.profit_center_id) {
          result = { success: false, error: 'profit_center_id required' };
          break;
        }
        const payload: any = {};
        if (data.name) payload.name = data.name;
        if (data.description) payload.description = data.description;

        const response = await vscoRequest(supabase, `/profit-center/${data.profit_center_id}`, {
          method: 'PATCH',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, profit_center: response.data };
        break;
      }

      case 'delete_profit_center': {
        if (!data.profit_center_id) {
          result = { success: false, error: 'profit_center_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/profit-center/${data.profit_center_id}`, {
          method: 'DELETE',
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, deleted: true };
        break;
      }

      case 'list_tax_groups': {
        const response = await vscoRequest(supabase, '/tax-group', {}, executive);
        const groups = response.data?.items || response.data?.taxGroups || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, tax_groups: Array.isArray(groups) ? groups : [] };
        break;
      }

      case 'create_tax_group': {
        const payload: any = { name: data.name };
        if (data.tax_rates) payload.taxRates = data.tax_rates;

        const response = await vscoRequest(supabase, '/tax-group', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, tax_group: response.data };
        break;
      }

      case 'list_tax_rates': {
        const response = await vscoRequest(supabase, '/tax-rate', {}, executive);
        const rates = response.data?.items || response.data?.taxRates || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, tax_rates: Array.isArray(rates) ? rates : [] };
        break;
      }

      case 'create_tax_rate': {
        const payload: any = {
          name: data.name,
          rate: data.rate,
        };
        if (data.is_compound !== undefined) payload.isCompound = data.is_compound;

        const response = await vscoRequest(supabase, '/tax-rate', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, tax_rate: response.data };
        break;
      }

      case 'delete_tax_rate': {
        if (!data.tax_rate_id) {
          result = { success: false, error: 'tax_rate_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/tax-rate/${data.tax_rate_id}`, {
          method: 'DELETE',
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, deleted: true };
        break;
      }

      // ====================================================================
      // STUDIO SETTINGS & TYPES
      // ====================================================================
      case 'update_studio': {
        const payload: any = {};
        if (data.readonly !== undefined) payload.readonly = data.readonly;
        if (data.name) payload.name = data.name;

        const response = await vscoRequest(supabase, '/studio', {
          method: 'PATCH',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, studio: response.data };
        break;
      }

      case 'update_brand': {
        if (!data.brand_id) {
          result = { success: false, error: 'brand_id required' };
          break;
        }
        const payload: any = {};
        if (data.name) payload.name = data.name;
        if (data.is_default !== undefined) payload.isDefault = data.is_default;

        const response = await vscoRequest(supabase, `/brand/${data.brand_id}`, {
          method: 'PATCH',
          body: payload,
        }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          await supabase.from('vsco_brands').update({
            name: data.name,
            is_default: data.is_default,
            synced_at: new Date().toISOString(),
          }).eq('vsco_id', data.brand_id);
          result = { success: true, brand: response.data };
        }
        break;
      }

      case 'delete_brand': {
        if (!data.brand_id) {
          result = { success: false, error: 'brand_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/brand/${data.brand_id}`, {
          method: 'DELETE',
        }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          await supabase.from('vsco_brands').delete().eq('vsco_id', data.brand_id);
          result = { success: true, deleted: true };
        }
        break;
      }

      case 'list_discount_types': {
        const response = await vscoRequest(supabase, '/discount-type', {}, executive);
        const types = response.data?.items || response.data?.discountTypes || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, discount_types: Array.isArray(types) ? types : [] };
        break;
      }

      case 'create_discount_type': {
        const payload: any = { name: data.name };

        const response = await vscoRequest(supabase, '/discount-type', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, discount_type: response.data };
        break;
      }

      case 'delete_discount_type': {
        if (!data.discount_type_id) {
          result = { success: false, error: 'discount_type_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/discount-type/${data.discount_type_id}`, {
          method: 'DELETE',
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, deleted: true };
        break;
      }

      case 'list_event_types': {
        const response = await vscoRequest(supabase, '/event-type', {}, executive);
        const types = response.data?.items || response.data?.eventTypes || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, event_types: Array.isArray(types) ? types : [] };
        break;
      }

      case 'create_event_type': {
        const payload: any = { name: data.name };
        if (data.color) payload.color = data.color;
        if (data.default_duration) payload.defaultDuration = data.default_duration;

        const response = await vscoRequest(supabase, '/event-type', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, event_type: response.data };
        break;
      }

      case 'update_event_type': {
        if (!data.event_type_id) {
          result = { success: false, error: 'event_type_id required' };
          break;
        }
        const payload: any = {};
        if (data.name) payload.name = data.name;
        if (data.color) payload.color = data.color;
        if (data.default_duration) payload.defaultDuration = data.default_duration;

        const response = await vscoRequest(supabase, `/event-type/${data.event_type_id}`, {
          method: 'PATCH',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, event_type: response.data };
        break;
      }

      case 'delete_event_type': {
        if (!data.event_type_id) {
          result = { success: false, error: 'event_type_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/event-type/${data.event_type_id}`, {
          method: 'DELETE',
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, deleted: true };
        break;
      }

      case 'list_file_types': {
        const response = await vscoRequest(supabase, '/file-type', {}, executive);
        const types = response.data?.items || response.data?.fileTypes || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, file_types: Array.isArray(types) ? types : [] };
        break;
      }

      case 'list_job_closed_reasons': {
        const response = await vscoRequest(supabase, '/job-closed-reason', {}, executive);
        const reasons = response.data?.items || response.data?.jobClosedReasons || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, job_closed_reasons: Array.isArray(reasons) ? reasons : [] };
        break;
      }

      case 'create_job_closed_reason': {
        const payload: any = { name: data.name };
        if (data.won !== undefined) payload.won = data.won;

        const response = await vscoRequest(supabase, '/job-closed-reason', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, job_closed_reason: response.data };
        break;
      }

      case 'list_job_roles': {
        const response = await vscoRequest(supabase, '/job-role', {}, executive);
        const roles = response.data?.items || response.data?.jobRoles || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, job_roles: Array.isArray(roles) ? roles : [] };
        break;
      }

      case 'create_job_role': {
        const payload: any = { name: data.name };

        const response = await vscoRequest(supabase, '/job-role', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, job_role: response.data };
        break;
      }

      case 'list_job_types': {
        const response = await vscoRequest(supabase, '/job-type', {}, executive);
        const types = response.data?.items || response.data?.jobTypes || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, job_types: Array.isArray(types) ? types : [] };
        break;
      }

      case 'create_job_type': {
        const payload: any = { name: data.name };
        if (data.brand_id) payload.brandId = data.brand_id;

        const response = await vscoRequest(supabase, '/job-type', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, job_type: response.data };
        break;
      }

      case 'list_lead_sources': {
        const response = await vscoRequest(supabase, '/lead-source', {}, executive);
        const sources = response.data?.items || response.data?.leadSources || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, lead_sources: Array.isArray(sources) ? sources : [] };
        break;
      }

      case 'create_lead_source': {
        const payload: any = { name: data.name };
        if (data.is_active !== undefined) payload.isActive = data.is_active;

        const response = await vscoRequest(supabase, '/lead-source', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, lead_source: response.data };
        break;
      }

      case 'list_lead_statuses': {
        const response = await vscoRequest(supabase, '/lead-status', {}, executive);
        const statuses = response.data?.items || response.data?.leadStatuses || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, lead_statuses: Array.isArray(statuses) ? statuses : [] };
        break;
      }

      case 'create_lead_status': {
        const payload: any = { name: data.name };
        if (data.color) payload.color = data.color;

        const response = await vscoRequest(supabase, '/lead-status', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, lead_status: response.data };
        break;
      }

      case 'list_product_types': {
        const response = await vscoRequest(supabase, '/product-type', {}, executive);
        const types = response.data?.items || response.data?.productTypes || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, product_types: Array.isArray(types) ? types : [] };
        break;
      }

      case 'create_product_type': {
        const payload: any = { name: data.name };
        if (data.category) payload.category = data.category;

        const response = await vscoRequest(supabase, '/product-type', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, product_type: response.data };
        break;
      }

      // ====================================================================
      // USER MANAGEMENT
      // ====================================================================
      case 'list_users': {
        const response = await vscoRequest(supabase, '/user', {}, executive);
        const users = response.data?.items || response.data?.users || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, users: Array.isArray(users) ? users : [] };
        break;
      }

      case 'create_user': {
        const payload: any = {
          email: data.email,
          firstName: data.first_name,
          lastName: data.last_name,
        };
        if (data.role) payload.role = data.role;

        const response = await vscoRequest(supabase, '/user', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, user: response.data };
        break;
      }

      case 'get_user': {
        if (!data.user_id) {
          result = { success: false, error: 'user_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/user/${data.user_id}`, {}, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, user: response.data };
        break;
      }

      case 'update_user': {
        if (!data.user_id) {
          result = { success: false, error: 'user_id required' };
          break;
        }
        const payload: any = {};
        if (data.first_name) payload.firstName = data.first_name;
        if (data.last_name) payload.lastName = data.last_name;
        if (data.email) payload.email = data.email;
        if (data.role) payload.role = data.role;

        const response = await vscoRequest(supabase, `/user/${data.user_id}`, {
          method: 'PATCH',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, user: response.data };
        break;
      }

      case 'delete_user': {
        if (!data.user_id) {
          result = { success: false, error: 'user_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/user/${data.user_id}`, {
          method: 'DELETE',
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, deleted: true };
        break;
      }

      // ====================================================================
      // FILES & GALLERIES (EXPANDED)
      // ====================================================================
      case 'create_file': {
        if (!data.job_id || !data.file_url) {
          result = { success: false, error: 'job_id and file_url required' };
          break;
        }
        const payload: any = {
          jobId: data.job_id,
          url: data.file_url,
        };
        if (data.name) payload.name = data.name;
        if (data.file_type_id) payload.fileTypeId = data.file_type_id;

        const response = await vscoRequest(supabase, '/file', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, file: response.data };
        break;
      }

      case 'update_file': {
        if (!data.file_id) {
          result = { success: false, error: 'file_id required' };
          break;
        }
        const payload: any = {};
        if (data.name) payload.name = data.name;
        if (data.file_type_id) payload.fileTypeId = data.file_type_id;

        const response = await vscoRequest(supabase, `/file/${data.file_id}`, {
          method: 'PATCH',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, file: response.data };
        break;
      }

      case 'delete_file': {
        if (!data.file_id) {
          result = { success: false, error: 'file_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/file/${data.file_id}`, {
          method: 'DELETE',
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, deleted: true };
        break;
      }

      case 'create_gallery': {
        if (!data.job_id) {
          result = { success: false, error: 'job_id required' };
          break;
        }
        const payload: any = {
          jobId: data.job_id,
          name: data.name || 'Gallery',
        };
        if (data.is_proofing !== undefined) payload.isProofing = data.is_proofing;

        const response = await vscoRequest(supabase, '/gallery', {
          method: 'POST',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, gallery: response.data };
        break;
      }

      case 'update_gallery': {
        if (!data.gallery_id) {
          result = { success: false, error: 'gallery_id required' };
          break;
        }
        const payload: any = {};
        if (data.name) payload.name = data.name;
        if (data.is_proofing !== undefined) payload.isProofing = data.is_proofing;

        const response = await vscoRequest(supabase, `/gallery/${data.gallery_id}`, {
          method: 'PATCH',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, gallery: response.data };
        break;
      }

      case 'delete_gallery': {
        if (!data.gallery_id) {
          result = { success: false, error: 'gallery_id required' };
          break;
        }
        const response = await vscoRequest(supabase, `/gallery/${data.gallery_id}`, {
          method: 'DELETE',
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, deleted: true };
        break;
      }

      // ====================================================================
      // UTILITY ACTIONS (EXPANDED)
      // ====================================================================
      case 'list_timezones': {
        const response = await vscoRequest(supabase, '/timezone', {}, executive);
        const timezones = response.data?.items || response.data?.timezones || response.data || [];
        result = response.error 
          ? { success: false, error: response.error } 
          : { success: true, timezones: Array.isArray(timezones) ? timezones : [] };
        break;
      }

      case 'update_webhook': {
        if (!data.webhook_id) {
          result = { success: false, error: 'webhook_id required' };
          break;
        }
        const payload: any = {};
        if (data.url) payload.url = data.url;
        if (data.events) payload.events = data.events;
        if (data.active !== undefined) payload.active = data.active;

        const response = await vscoRequest(supabase, `/rest-hook/${data.webhook_id}`, {
          method: 'PATCH',
          body: payload,
        }, executive);
        result = response.error ? { success: false, error: response.error } : { success: true, webhook: response.data };
        break;
      }

      case 'update_product': {
        if (!data.product_id) {
          result = { success: false, error: 'product_id required' };
          break;
        }
        const payload: any = {};
        if (data.name) payload.name = data.name;
        if (data.price !== undefined) payload.price = data.price;
        if (data.cost !== undefined) payload.cost = data.cost;
        if (data.description) payload.description = data.description;
        if (data.tax_rate !== undefined) payload.taxRate = data.tax_rate;
        if (data.is_active !== undefined) payload.isActive = data.is_active;

        const response = await vscoRequest(supabase, `/product/${data.product_id}`, {
          method: 'PATCH',
          body: payload,
        }, executive);
        if (response.error) {
          result = { success: false, error: response.error };
        } else {
          await supabase.from('vsco_products').update({
            name: data.name,
            price: data.price,
            cost: data.cost,
            description: data.description,
            is_active: data.is_active,
            synced_at: new Date().toISOString(),
          }).eq('vsco_id', data.product_id);
          result = { success: true, product: response.data };
        }
        break;
      }

      case 'list_actions': {
        result = {
          success: true,
          total_actions: 89,
          available_actions: {
            studio_brands: ['get_studio', 'update_studio', 'list_brands', 'create_brand', 'update_brand', 'delete_brand'],
            jobs_leads: ['list_jobs', 'get_job', 'create_job', 'update_job', 'close_job', 'delete_job'],
            job_contacts: ['list_job_contacts', 'create_job_contact', 'get_job_contact', 'update_job_contact', 'delete_job_contact'],
            contacts_crm: ['list_contacts', 'get_contact', 'create_contact', 'update_contact', 'delete_contact'],
            events_calendar: ['list_events', 'get_event', 'create_event', 'update_event', 'delete_event'],
            orders_financials: ['list_orders', 'get_order', 'create_order', 'update_order', 'delete_order'],
            payment_accounting: ['list_payment_methods', 'get_payment_method', 'list_profit_centers', 'create_profit_center', 'get_profit_center', 'update_profit_center', 'delete_profit_center', 'list_tax_groups', 'create_tax_group', 'list_tax_rates', 'create_tax_rate', 'delete_tax_rate'],
            products_pricing: ['list_products', 'get_product', 'create_product', 'update_product', 'delete_product', 'list_product_types', 'create_product_type'],
            notes: ['list_notes', 'create_note', 'update_note', 'delete_note'],
            files_galleries: ['list_files', 'create_file', 'update_file', 'delete_file', 'list_galleries', 'create_gallery', 'update_gallery', 'delete_gallery', 'list_file_types'],
            custom_fields_discounts: ['list_custom_fields', 'create_custom_field', 'update_custom_field', 'delete_custom_field', 'list_discounts', 'create_discount', 'delete_discount', 'list_discount_types', 'create_discount_type', 'delete_discount_type'],
            types_config: ['list_event_types', 'create_event_type', 'update_event_type', 'delete_event_type', 'list_job_closed_reasons', 'create_job_closed_reason', 'list_job_roles', 'create_job_role', 'list_job_types', 'create_job_type', 'list_lead_sources', 'create_lead_source', 'list_lead_statuses', 'create_lead_status'],
            users: ['list_users', 'create_user', 'get_user', 'update_user', 'delete_user'],
            webhooks: ['list_webhooks', 'create_webhook', 'update_webhook', 'delete_webhook'],
            worksheets: ['get_job_worksheet', 'create_job_from_worksheet'],
            analytics: ['get_analytics', 'get_revenue_report'],
            sync_health: ['sync_all', 'sync_jobs', 'sync_contacts', 'get_api_health'],
            utility: ['list_actions', 'health', 'debug_api', 'list_timezones'],
          },
        };
        break;
      }

      case 'health': {
        result = {
          success: true,
          status: 'healthy',
          api_configured: !!VSCO_API_KEY,
          timestamp: new Date().toISOString(),
          version: '2.0.0',
          total_actions: 89,
        };
        break;
      }

      // ====================================================================
      // 🔍 DEBUG/DIAGNOSTIC ACTION
      // ====================================================================
      case 'debug_api': {
        console.log('🔍 [debug_api] Starting comprehensive API diagnostics...');
        
        const endpoints = [
          { name: 'studio', path: '/studio' },
          { name: 'brand', path: '/brand' },
          { name: 'address-book', path: '/address-book' },
          { name: 'event', path: '/event' },
          { name: 'job', path: '/job' },
          { name: 'product', path: '/product' },
          { name: 'order', path: '/order' },
          { name: 'user', path: '/user' },
          { name: 'custom-field', path: '/custom-field' },
          { name: 'discount', path: '/discount' },
          { name: 'job-type', path: '/job-type' },
          { name: 'lead-source', path: '/lead-source' },
          { name: 'event-type', path: '/event-type' },
        ];
        
        const diagnostics: Record<string, any> = {};
        
        for (const ep of endpoints) {
          console.log(`🔍 [debug_api] Testing endpoint: ${ep.path}`);
          const response = await vscoRequest(supabase, ep.path, {}, executive);
          
          diagnostics[ep.name] = {
            endpoint: ep.path,
            status: response.status,
            hasError: !!response.error,
            error: response.error,
            dataType: typeof response.data,
            isArray: Array.isArray(response.data),
            isNull: response.data === null,
            isUndefined: response.data === undefined,
            topLevelKeys: response.data && typeof response.data === 'object' ? Object.keys(response.data) : [],
            arrayLength: Array.isArray(response.data) ? response.data.length : null,
            nestedDataCheck: {
              hasItemsKey: !!response.data?.items,
              hasDataKey: !!response.data?.data,
              hasResultsKey: !!response.data?.results,
              hasMetaKey: !!response.data?.meta,
            },
            rawPreview: response.data ? JSON.stringify(response.data).slice(0, 400) : 'null/undefined',
          };
        }
        
        const keyTest = await fetch(`${BASE_URL}/studio`, {
          headers: {
            'X-Api-Key': VSCO_API_KEY || '',
            'Accept': 'application/json',
          },
        });
        
        result = {
          success: true,
          api_key_configured: !!VSCO_API_KEY,
          api_key_preview: VSCO_API_KEY ? `${VSCO_API_KEY.slice(0, 4)}...${VSCO_API_KEY.slice(-4)}` : 'NOT SET',
          base_url: BASE_URL,
          key_test_status: keyTest.status,
          diagnostics,
          timestamp: new Date().toISOString(),
          total_endpoints_tested: endpoints.length,
        };
        break;
      }

      default:
        result = { success: false, error: `Unknown action: ${action}` };
    }

    console.log(`📸 [VSCO Workspace] Result:`, result ? JSON.stringify(result).slice(0, 500) : 'undefined');

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [VSCO Workspace] Error: ${errorMessage}`);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
