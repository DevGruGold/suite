import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

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
    const body = await req.json();
    const { action, data: rawData = {}, executive } = body;
    // Merge any top-level keys (other than action/executive/data) into data.
    // This handles AI agents that send flat payloads like {action:'find_job', search:'...'} 
    // instead of the expected nested {action:'find_job', data:{search:'...'}}.
    const RESERVED = new Set(['action', 'executive', 'data']);
    const data: any = { ...rawData };
    Object.keys(body).forEach(k => { if (!RESERVED.has(k) && !(k in data)) data[k] = body[k]; });
    console.log(`📸 [VSCO Workspace] Action: ${action}`, JSON.stringify(data));

    let result: any;

    switch (action) {
      // ====================================================================
      // META: LIST ALL AVAILABLE ACTIONS
      // ====================================================================
      case 'list_actions': {
        const allActions = [
          // Studio & Brands
          { name: 'get_studio', category: 'studio', required: [], optional: [] },
          { name: 'list_brands', category: 'studio', required: [], optional: [] },
          { name: 'create_brand', category: 'studio', required: ['name'], optional: [] },
          { name: 'update_brand', category: 'studio', required: ['brand_id'], optional: ['name'] },
          { name: 'delete_brand', category: 'studio', required: ['brand_id'], optional: [] },
          // Jobs
          { name: 'list_jobs', category: 'jobs', required: [], optional: ['stage', 'closed', 'brand_id', 'page', 'per_page', 'search', 'name', 'event_date_start', 'event_date_end'] },
          { name: 'get_job', category: 'jobs', required: ['job_id'], optional: [] },
          { name: 'create_job', category: 'jobs', required: ['name'], optional: ['stage', 'job_type_id', 'lead_rating', 'event_date', 'booking_date', 'lead_source'] },
          { name: 'update_job', category: 'jobs', required: ['job_id'], optional: ['name', 'stage', 'lead_rating', 'event_date', 'booking_date', 'lead_source', 'brand_id', 'notes', 'custom_fields'] },
          { name: 'search_leads', category: 'jobs', required: [], optional: ['query', 'search', 'stage'] },
          { name: 'upsert_job', category: 'jobs', required: ['name'], optional: ['job_id', 'search_name', 'event_date', 'booking_date', 'stage', 'lead_source', 'brand_id', 'notes'] },
          { name: 'close_job', category: 'jobs', required: ['job_id'], optional: ['reason'] },
          { name: 'delete_job', category: 'jobs', required: ['job_id'], optional: [] },
          { name: 'get_job_worksheet', category: 'jobs', required: ['job_id'], optional: [] },
          { name: 'create_job_from_worksheet', category: 'jobs', required: ['worksheet_id'], optional: ['name'] },
          // Job Contacts
          { name: 'list_job_contacts', category: 'job_contacts', required: ['job_id'], optional: [] },
          { name: 'create_job_contact', category: 'job_contacts', required: ['job_id', 'contact_id'], optional: ['role', 'is_primary'] },
          { name: 'get_job_contact', category: 'job_contacts', required: ['job_id', 'job_contact_id'], optional: [] },
          { name: 'update_job_contact', category: 'job_contacts', required: ['job_id', 'job_contact_id'], optional: ['role'] },
          { name: 'delete_job_contact', category: 'job_contacts', required: ['job_id', 'job_contact_id'], optional: [] },
          // Contacts
          { name: 'list_contacts', category: 'contacts', required: [], optional: ['page', 'per_page', 'search'] },
          { name: 'get_contact', category: 'contacts', required: ['contact_id'], optional: [] },
          { name: 'create_contact', category: 'contacts', required: ['email'], optional: ['first_name', 'last_name', 'phone'] },
          { name: 'update_contact', category: 'contacts', required: ['contact_id'], optional: ['email', 'first_name', 'last_name'] },
          { name: 'delete_contact', category: 'contacts', required: ['contact_id'], optional: [] },
          // Events
          { name: 'list_events', category: 'events', required: [], optional: ['start_date', 'end_date', 'job_id'] },
          { name: 'get_event', category: 'events', required: ['event_id'], optional: [] },
          { name: 'create_event', category: 'events', required: ['title', 'start_date'], optional: ['end_date', 'job_id'] },
          { name: 'update_event', category: 'events', required: ['event_id'], optional: ['title', 'start_date'] },
          { name: 'delete_event', category: 'events', required: ['event_id'], optional: [] },
          // Orders
          { name: 'list_orders', category: 'orders', required: [], optional: ['job_id', 'status'] },
          { name: 'get_order', category: 'orders', required: ['order_id'], optional: [] },
          { name: 'create_order', category: 'orders', required: ['job_id'], optional: ['status'] },
          { name: 'update_order', category: 'orders', required: ['order_id'], optional: ['status'] },
          { name: 'delete_order', category: 'orders', required: ['order_id'], optional: [] },
          // Products
          { name: 'list_products', category: 'products', required: [], optional: ['page', 'per_page'] },
          { name: 'get_product', category: 'products', required: ['product_id'], optional: [] },
          { name: 'create_product', category: 'products', required: ['name', 'price'], optional: ['description'] },
          { name: 'update_product', category: 'products', required: ['product_id'], optional: ['name', 'price'] },
          { name: 'delete_product', category: 'products', required: ['product_id'], optional: [] },
          // Worksheets
          { name: 'list_worksheets', category: 'worksheets', required: [], optional: ['page'] },
          { name: 'get_worksheet', category: 'worksheets', required: ['worksheet_id'], optional: [] },
          { name: 'create_worksheet', category: 'worksheets', required: ['name'], optional: ['fields'] },
          { name: 'update_worksheet', category: 'worksheets', required: ['worksheet_id'], optional: ['name'] },
          { name: 'delete_worksheet', category: 'worksheets', required: ['worksheet_id'], optional: [] },
          // Notes
          { name: 'list_notes', category: 'notes', required: ['job_id'], optional: [] },
          { name: 'create_note', category: 'notes', required: ['job_id', 'contentHtml'], optional: ['title'] },
          { name: 'update_note', category: 'notes', required: ['note_id'], optional: ['contentHtml'] },
          { name: 'delete_note', category: 'notes', required: ['note_id'], optional: [] },
          // Files & Galleries
          { name: 'list_files', category: 'files', required: ['job_id'], optional: [] },
          { name: 'create_file', category: 'files', required: ['job_id', 'url'], optional: ['name'] },
          { name: 'update_file', category: 'files', required: ['file_id'], optional: ['name'] },
          { name: 'delete_file', category: 'files', required: ['file_id'], optional: [] },
          { name: 'list_galleries', category: 'galleries', required: [], optional: ['job_id'] },
          { name: 'create_gallery', category: 'galleries', required: ['name'], optional: ['job_id'] },
          { name: 'update_gallery', category: 'galleries', required: ['gallery_id'], optional: ['name'] },
          { name: 'delete_gallery', category: 'galleries', required: ['gallery_id'], optional: [] },
          // Financials
          { name: 'list_payment_methods', category: 'financials', required: [], optional: [] },
          { name: 'get_payment_method', category: 'financials', required: ['payment_method_id'], optional: [] },
          { name: 'create_payment_method', category: 'financials', required: ['name', 'type'], optional: [] },
          { name: 'update_payment_method', category: 'financials', required: ['payment_method_id'], optional: ['name'] },
          { name: 'delete_payment_method', category: 'financials', required: ['payment_method_id'], optional: [] },
          { name: 'list_profit_centers', category: 'financials', required: [], optional: [] },
          { name: 'create_profit_center', category: 'financials', required: ['name'], optional: [] },
          { name: 'update_profit_center', category: 'financials', required: ['profit_center_id'], optional: ['name'] },
          { name: 'delete_profit_center', category: 'financials', required: ['profit_center_id'], optional: [] },
          { name: 'list_tax_groups', category: 'financials', required: [], optional: [] },
          { name: 'create_tax_group', category: 'financials', required: ['name'], optional: ['rate'] },
          { name: 'update_tax_group', category: 'financials', required: ['tax_group_id'], optional: ['name'] },
          { name: 'delete_tax_group', category: 'financials', required: ['tax_group_id'], optional: [] },
          { name: 'list_tax_rates', category: 'financials', required: [], optional: [] },
          { name: 'create_tax_rate', category: 'financials', required: ['name', 'rate'], optional: [] },
          { name: 'update_tax_rate', category: 'financials', required: ['tax_rate_id'], optional: ['name'] },
          { name: 'delete_tax_rate', category: 'financials', required: ['tax_rate_id'], optional: [] },
          // Settings
          { name: 'list_custom_fields', category: 'settings', required: [], optional: ['entity_type'] },
          { name: 'create_custom_field', category: 'settings', required: ['name', 'field_type'], optional: [] },
          { name: 'update_custom_field', category: 'settings', required: ['custom_field_id'], optional: ['name'] },
          { name: 'delete_custom_field', category: 'settings', required: ['custom_field_id'], optional: [] },
          { name: 'list_discounts', category: 'settings', required: [], optional: [] },
          { name: 'create_discount', category: 'settings', required: ['name', 'type', 'value'], optional: [] },
          { name: 'delete_discount', category: 'settings', required: ['discount_id'], optional: [] },
          { name: 'list_event_types', category: 'settings', required: [], optional: [] },
          { name: 'list_job_types', category: 'settings', required: [], optional: [] },
          { name: 'list_lead_types', category: 'settings', required: [], optional: [] },
          { name: 'list_file_types', category: 'settings', required: [], optional: [] },
          // Users
          { name: 'list_users', category: 'users', required: [], optional: [] },
          { name: 'get_user', category: 'users', required: ['user_id'], optional: [] },
          { name: 'create_user', category: 'users', required: ['email'], optional: ['first_name', 'last_name'] },
          { name: 'update_user', category: 'users', required: ['user_id'], optional: ['first_name'] },
          { name: 'delete_user', category: 'users', required: ['user_id'], optional: [] },
          // Webhooks
          { name: 'list_webhooks', category: 'webhooks', required: [], optional: [] },
          { name: 'create_webhook', category: 'webhooks', required: ['url', 'events'], optional: [] },
          { name: 'update_webhook', category: 'webhooks', required: ['webhook_id'], optional: ['url', 'events'] },
          { name: 'delete_webhook', category: 'webhooks', required: ['webhook_id'], optional: [] },
          // Analytics
          { name: 'get_analytics', category: 'analytics', required: [], optional: ['start_date', 'end_date'] },
          { name: 'get_revenue_report', category: 'analytics', required: [], optional: ['start_date', 'end_date'] },
          // Utilities
          { name: 'sync_all', category: 'utilities', required: [], optional: [] },
          { name: 'sync_jobs', category: 'utilities', required: [], optional: ['since'] },
          { name: 'sync_contacts', category: 'utilities', required: [], optional: ['since'] },
          { name: 'get_api_health', category: 'utilities', required: [], optional: [] },
          { name: 'list_timezones', category: 'utilities', required: [], optional: [] },
          { name: 'health', category: 'utilities', required: [], optional: [] },
          { name: 'debug_api', category: 'utilities', required: [], optional: [] },
          { name: 'list_actions', category: 'utilities', required: [], optional: ['category'] },
        ];

        const filterCategory = data.category;
        const filteredActions = filterCategory
          ? allActions.filter(a => a.category === filterCategory)
          : allActions;

        const categories = [...new Set(allActions.map(a => a.category))];

        result = {
          success: true,
          total_actions: allActions.length,
          filtered_actions: filteredActions.length,
          categories,
          actions: filteredActions,
          usage: 'Call with { "action": "<action_name>", "data": { ...params } }'
        };
        break;
      }
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
        if (data.search || data.name) params.search = data.search || data.name;
        if (data.event_date_start) params.eventDateStart = data.event_date_start;
        if (data.event_date_end) params.eventDateEnd = data.event_date_end;

        const response = await vscoRequest(supabase, '/job', { params }, executive);

        // VSCO API returns: { meta, type, items } - items is the data array
        let jobs = response.data?.items || response.data?.jobs || response.data || [];
        jobs = Array.isArray(jobs) ? jobs : [];
        const pagination = response.data?.meta;

        // Client-side date filter fallback (in case API doesn't honour eventDateStart/End params)
        if (data.event_date_start || data.event_date_end) {
          const start = data.event_date_start ? new Date(data.event_date_start) : null;
          const end = data.event_date_end ? new Date(data.event_date_end) : null;
          jobs = jobs.filter((j: any) => {
            const d = j.eventDate ? new Date(j.eventDate) : null;
            if (!d) return false;
            if (start && d < start) return false;
            if (end && d > end) return false;
            return true;
          });
          console.log(`🔍 [list_jobs] After date filter (${data.event_date_start}→${data.event_date_end}): ${jobs.length} jobs`);
        }

        // Client-side text search fallback
        if (data.search || data.name) {
          const q = (data.search || data.name).toLowerCase();
          jobs = jobs.filter((j: any) =>
            (j.name || '').toLowerCase().includes(q) ||
            (j.clientName || '').toLowerCase().includes(q)
          );
          console.log(`🔍 [list_jobs] After search filter ("${q}"): ${jobs.length} jobs`);
        }

        console.log(`🔍 [list_jobs] Returning ${jobs.length} jobs, pagination: ${JSON.stringify(pagination)}`);
        result = response.error
          ? { success: false, error: response.error }
          : { success: true, jobs, pagination };
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
        if (data.job_type_id) jobPayload.jobTypeId = data.job_type_id; // Use ID for automation trigger
        if (data.job_type) jobPayload.jobType = data.job_type; // Keep for backward compat
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
        // Accept both job_id and id (Eliza sometimes passes the field as 'id' from job objects)
        const jobIdToUpdate = data.job_id || data.id;
        if (!jobIdToUpdate) {
          result = { success: false, error: 'job_id required (pass job_id or id)' };
          break;
        }

        // Normalize event_date to YYYY-MM-DD
        if (data.event_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.event_date)) {
          try { data.event_date = new Date(data.event_date).toISOString().split('T')[0]; } catch { }
        }

        const updatePayload: any = {};
        if (data.name) updatePayload.name = data.name;
        if (data.stage) updatePayload.stage = data.stage;
        if (data.lead_status) updatePayload.leadStatus = data.lead_status;
        if (data.lead_rating) updatePayload.leadRating = data.lead_rating;
        if (data.lead_confidence) updatePayload.leadConfidence = data.lead_confidence;
        if (data.job_type) updatePayload.jobType = data.job_type;
        if (data.job_type_id) updatePayload.jobTypeId = data.job_type_id;
        if (data.event_date) updatePayload.eventDate = data.event_date;
        if (data.booking_date) updatePayload.bookingDate = data.booking_date;
        if (data.lead_source) updatePayload.leadSource = data.lead_source;
        if (data.brand_id) updatePayload.brandId = data.brand_id;
        if (data.notes) updatePayload.notes = data.notes;
        if (data.custom_fields) updatePayload.customFields = data.custom_fields;

        console.log(`✏️ [update_job] PUT /job/${jobIdToUpdate}`, JSON.stringify(updatePayload));

        // Try PUT first (Táve standard), fall back to PATCH if PUT rejects
        let response = await vscoRequest(supabase, `/job/${jobIdToUpdate}`, {
          method: 'PUT',
          body: updatePayload,
        }, executive);

        if (response.error) {
          console.warn(`⚠️ [update_job] PUT failed (${response.status}): ${response.error} — retrying with PATCH`);
          response = await vscoRequest(supabase, `/job/${jobIdToUpdate}`, {
            method: 'PATCH',
            body: updatePayload,
          }, executive);
        }

        if (response.error) {
          result = { success: false, error: response.error, job_id_used: jobIdToUpdate };
        } else {
          const job = response.data;
          await supabase.from('vsco_jobs').upsert({
            vsco_id: job.id,
            name: job.name,
            stage: job.stage,
            lead_status: job.leadStatus,
            lead_rating: job.leadRating,
            lead_confidence: job.leadConfidence,
            lead_source: job.leadSource,
            event_date: job.eventDate,
            booking_date: job.bookingDate,
            brand_id: job.brandId,
            raw_data: job,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'vsco_id' });
          result = { success: true, job, job_id_used: jobIdToUpdate };
        }
        break;
      }

      // ====================================================================
      // FIND JOB — search for a job and return its internal VSCO ID
      // Use this BEFORE update_job when you don't know the exact job_id
      // ====================================================================
      case 'find_job': {
        const rawSearch = data.search || data.name || data.search_name || '';
        const sq = rawSearch.toLowerCase().trim();
        if (!sq) {
          result = { success: false, error: 'search, name, or search_name is required' };
          break;
        }

        const findResults: any[] = [];
        const searchStartMs = Date.now();
        const MAX_SCAN_MS = 25_000;

        // ── Tier 0: VSCO server-side job search + contact resolution ──
        // VSCO uses HAL-style links object: { links: { primaryContactId: { href: ".../address-book/{id}" } } }
        // Contact ID is NOT a flat field — it lives inside j.links under a contact-related key.
        try {
          const s0Resp = await vscoRequest(supabase, '/job', {
            params: { search: rawSearch, pageSize: '50', includeClosed: 'true' }
          }, executive);
          const s0Jobs = s0Resp.data?.items || [];

          if (Array.isArray(s0Jobs) && s0Jobs.length > 0) {
            console.log(`🔍 [find_job] T0: ${s0Jobs.length} candidate jobs for "${rawSearch}"`);

            // Helper: extract address-book ID from job's links object (HAL pattern)
            // Scans all link keys for one containing 'contact' or 'client',
            // then parses the address-book ID from the href URL.
            const extractContactId = (job: any): string | null => {
              const links = job.links || {};
              // Log all link keys on first job so we see the exact structure
              return Object.entries(links).reduce((found: string | null, [key, val]: [string, any]) => {
                if (found) return found;
                if (!/(contact|client)/i.test(key)) return null;
                const href: string = val?.href || '';
                // URL pattern ".../address-book/{id}" or ".../address-book/{id}/..."
                const m = href.match(/address-book\/([^/?]+)/);
                return m ? m[1] : null;
              }, null);
            };

            // Log link keys from first job for diagnostics
            if (s0Jobs[0]) {
              const j0 = s0Jobs[0];
              const linkKeys = Object.keys(j0.links || {}).join(', ') || 'none';
              const cid0 = extractContactId(j0);
              console.log(`🔍 [find_job] T0 job[0] eventDate="${j0.eventDate}" stage="${j0.stage}" linkKeys=[${linkKeys}] extractedContactId="${cid0}"`);
              // Also log all NON-link flat fields for discovery
              const flatKeys = Object.keys(j0).filter(k => k !== 'links' && k !== 'raw_data').join(', ');
              console.log(`🔍 [find_job] T0 job[0] flatFields=[${flatKeys}]`);
            }

            // Collect unique contact IDs from all T0 jobs
            const searchTokensT0 = sq.split(/\s+/).filter(Boolean);
            const contactIdMap = new Map<string, any>();
            for (const j of s0Jobs) {
              const cid = extractContactId(j);
              if (cid && !contactIdMap.has(cid)) contactIdMap.set(cid, null);
            }
            console.log(`🔍 [find_job] T0 unique contact IDs: ${contactIdMap.size}`);

            // Resolve each contact via /address-book/{id}
            const resolvedContacts: Record<string, any> = {};
            for (const [cid] of contactIdMap) {
              try {
                const cResp = await vscoRequest(supabase, `/address-book/${cid}`, {}, executive);
                const contact = cResp.data;
                if (contact) {
                  const cFirst = (contact.firstName || '').toLowerCase();
                  const cLast = (contact.lastName || '').toLowerCase();
                  const cName = (contact.name || '').toLowerCase();
                  const cEmail = (contact.email || '').toLowerCase();
                  const isMatch = searchTokensT0.every((tk: string) =>
                    cFirst.includes(tk) || cLast.includes(tk) ||
                    cName.includes(tk) || cEmail.includes(tk)
                  );
                  resolvedContacts[cid] = { id: cid, firstName: contact.firstName, lastName: contact.lastName, email: contact.email, isMatch };
                  if (isMatch) {
                    console.log(`✅ [find_job] T0 MATCH: contact ${cid} = "${contact.firstName} ${contact.lastName}"`);
                  }
                }
              } catch { /* keep going */ }
            }

            const matchedContactIds = new Set(
              Object.values(resolvedContacts).filter((c: any) => c.isMatch).map((c: any) => c.id)
            );

            // If contact resolution yielded matches, use those. Otherwise trust T0 server results.
            const useAllT0 = matchedContactIds.size === 0;
            if (useAllT0) {
              console.log(`🔍 [find_job] T0 no contact resolution match — returning all ${s0Jobs.length} server-filtered results`);
            }

            s0Jobs.forEach((j: any) => {
              const cid = extractContactId(j);
              const contact = cid ? resolvedContacts[cid] : null;
              if (useAllT0 || matchedContactIds.has(cid!)) {
                findResults.push({
                  source: 'vsco_search',
                  vsco_id: j.id,
                  name: j.name || `Job ${j.id}`,
                  stage: j.stage,
                  event_date: j.eventDate,
                  client_name: contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : '',
                  contact_id: cid || null,
                });
              }
            });
            console.log(`🔍 [find_job] T0 final: ${findResults.length} results`);

          } else {
            console.log(`🔍 [find_job] T0 server search: 0 results`);
          }
        } catch (t0e) {
          console.log(`🔍 [find_job] T0 failed: ${t0e}`);
        }



        // ── Tier 1: local vsco_jobs DB ──
        // IMPORTANT: only SELECT columns guaranteed to exist. 'client_*' columns may not
        // be in the schema yet — selecting them causes Supabase to reject the entire query.
        // We pull raw_data and extract primaryContact at runtime instead.
        const { data: localJobs, error: t1Error } = await supabase
          .from('vsco_jobs')
          .select('vsco_id, name, raw_data, event_date, stage')
          .limit(2000);

        if (t1Error) {
          console.error(`🔍 [find_job] T1 SELECT error: ${t1Error.message}`);
        }

        // Split search into tokens — 'christine brooks' → ['christine', 'brooks']
        const searchTokens = sq.split(/\s+/).filter(Boolean);

        (localJobs || []).forEach((j: any) => {
          const jobName = (j.name || '').toLowerCase();
          const pc = j.raw_data?.primaryContact || {};
          const pcFirst = (pc.firstName || '').toLowerCase();
          const pcLast = (pc.lastName || '').toLowerCase();
          const pcFull = `${pcFirst} ${pcLast}`.trim();
          const pcEmail = (pc.email || '').toLowerCase();

          // Match if ALL tokens appear across name/contact fields
          const allTokensMatch = searchTokens.length > 0 && searchTokens.every((token: string) =>
            jobName.includes(token) || pcFirst.includes(token) ||
            pcLast.includes(token) || pcFull.includes(token) || pcEmail.includes(token)
          );

          if (allTokensMatch) {
            findResults.push({
              source: 'local_db',
              vsco_id: j.vsco_id,
              name: j.name,
              stage: j.stage,
              event_date: j.event_date,
              client_name: pcFull,
            });
          }
        });
        console.log(`🔍 [find_job] T1 local_db: ${findResults.length} matches from ${(localJobs || []).length} rows (search="${sq}", tokens=${JSON.stringify(searchTokens)})`);

        // ── Tier 2: address-book contact lookup (ALL pages) ──
        if (findResults.length === 0 && Date.now() - searchStartMs < MAX_SCAN_MS) {
          let abPage = 1;
          let abTotalPages = 1;
          let matchedContact: any = null;

          while (abPage <= abTotalPages && !matchedContact && Date.now() - searchStartMs < MAX_SCAN_MS) {
            const cResp = await vscoRequest(supabase, '/address-book', {
              params: { search: data.search || data.search_name || data.name, pageSize: '100', page: String(abPage) }
            }, executive);

            const abMeta = cResp.data?.meta;
            if (abPage === 1 && abMeta?.totalPages) abTotalPages = abMeta.totalPages;

            const contacts = cResp.data?.items || [];
            console.log(`🔍 [find_job] T2 address-book page ${abPage}/${abTotalPages}: ${contacts.length} contacts`);

            // Debug: log actual field names of first contact so we know the real API shape
            if (abPage === 1 && contacts.length > 0) {
              const sample = contacts[0];
              console.log(`🔍 [find_job] T2 contact[0] keys: ${Object.keys(sample).join(', ')}`);
              console.log(`🔍 [find_job] T2 contact[0]: firstName=${sample.firstName}, lastName=${sample.lastName}, name=${sample.name}, email=${sample.email}`);
            }

            // Split into individual tokens so 'Christine Brooks' matches firstName+lastName separately
            const searchTokens = sq.split(/\s+/).filter(Boolean);

            for (const c of (Array.isArray(contacts) ? contacts : [])) {
              const firstName = (c.firstName || c.first_name || '').toLowerCase();
              const lastName = (c.lastName || c.last_name || '').toLowerCase();
              const full = `${firstName} ${lastName}`.trim();
              const email = (c.email || '').toLowerCase();
              const nameAlt = (c.name || '').toLowerCase(); // some APIs use 'name' instead

              // Match if ALL tokens appear somewhere across the contact's identifiers
              const allTokensMatch = searchTokens.length > 0 && searchTokens.every((token: string) =>
                firstName.includes(token) || lastName.includes(token) ||
                full.includes(token) || email.includes(token) || nameAlt.includes(token)
              );

              if (allTokensMatch) {
                matchedContact = c;
                console.log(`🔍 [find_job] T2 contact match: firstName=${c.firstName}, lastName=${c.lastName} id=${c.id} page=${abPage}`);
                break;
              }
            }
            abPage++;
          }

          if (matchedContact?.id) {
            const jResp = await vscoRequest(supabase, '/job', {
              params: { contactId: matchedContact.id, pageSize: '100', includeClosed: 'true' }
            }, executive);
            const linked = jResp.data?.items || [];
            (Array.isArray(linked) ? linked : []).forEach((j: any) => {
              findResults.push({
                source: 'contact_api',
                vsco_id: j.id,
                name: j.name,
                stage: j.stage,
                event_date: j.eventDate,
                client_name: `${matchedContact.firstName || ''} ${matchedContact.lastName || ''}`.trim()
              });
            });
            console.log(`🔍 [find_job] T2 linked jobs for contact ${matchedContact.id}: ${findResults.length}`);
          } else {
            console.log(`🔍 [find_job] T2: no contact match found in ${abTotalPages} pages`);
          }
        }

        // ── Tier 3: full paginated API job scan ──
        if (findResults.length === 0 && Date.now() - searchStartMs < MAX_SCAN_MS) {
          let pg = 1;
          let totalPages = 999;
          console.log(`🔍 [find_job] T3: starting full scan (budget: ${MAX_SCAN_MS - (Date.now() - searchStartMs)}ms remaining)`);

          while (pg <= totalPages && Date.now() - searchStartMs < MAX_SCAN_MS) {
            const sResp = await vscoRequest(supabase, '/job', {
              params: { pageSize: '100', page: String(pg), includeClosed: 'true' }
            }, executive);

            if (pg === 1 && sResp.data?.meta?.totalPages) {
              totalPages = sResp.data.meta.totalPages;
              console.log(`🔍 [find_job] T3: ${sResp.data.meta.totalItems} total jobs, ${totalPages} pages`);
            }

            const batch = sResp.data?.items || [];
            if (!Array.isArray(batch) || batch.length === 0) break;

            // Debug first job on first page — log raw fields to understand API structure
            if (pg === 1 && batch.length > 0) {
              const s = batch[0];
              console.log(`🔍 [find_job] T3 job[0] name="${s.name}" primaryContact=${JSON.stringify(s.primaryContact)?.slice(0, 200)} primaryContactId=${s.primaryContactId}`);
            }

            const t3SearchTokens = sq.split(/\s+/).filter(Boolean);
            const matchInBatch = batch.find((j: any) => {
              const jobName = (j.name || '').toLowerCase();
              const pc = (typeof j.primaryContact === 'object' && j.primaryContact !== null) ? j.primaryContact : {};
              const first = (pc.firstName || '').toLowerCase();
              const last = (pc.lastName || '').toLowerCase();
              const pcEmail = (pc.email || '').toLowerCase();
              const pcFull = `${first} ${last}`.trim();
              // Match if ALL tokens appear across job name or contact fields
              return t3SearchTokens.every((token: string) =>
                jobName.includes(token) || first.includes(token) ||
                last.includes(token) || pcFull.includes(token) || pcEmail.includes(token)
              );
            });

            if (matchInBatch) {
              const pc = (typeof matchInBatch.primaryContact === 'object' && matchInBatch.primaryContact !== null)
                ? matchInBatch.primaryContact : {};
              findResults.push({
                source: `api_scan_p${pg}`,
                vsco_id: matchInBatch.id,
                name: matchInBatch.name,
                stage: matchInBatch.stage,
                event_date: matchInBatch.eventDate,
                client_name: `${pc.firstName || ''} ${pc.lastName || ''}`.trim(),
              });
              console.log(`🔍 [find_job] T3 match on page ${pg}: ${matchInBatch.id} name="${matchInBatch.name}"`);
              break;
            }

            if (batch.length < 100) break;
            pg++;
          }

          if (findResults.length === 0) {
            const elapsed = Date.now() - searchStartMs;
            console.log(`🔍 [find_job] T3 exhausted after ${pg - 1} pages / ${elapsed}ms — no match`);
          }
        }

        // Sort results by event_date ascending (null dates last)
        findResults.sort((a: any, b: any) => {
          if (!a.event_date && !b.event_date) return 0;
          if (!a.event_date) return 1;
          if (!b.event_date) return -1;
          return a.event_date.localeCompare(b.event_date);
        });

        const dateList = [...new Set(findResults.map((r: any) => r.event_date).filter(Boolean))].join(', ');
        result = {
          success: true,
          matches: findResults,
          count: findResults.length,
          hint: findResults.length > 0
            ? `Found ${findResults.length} jobs. Event dates: [${dateList}]. Use update_job with the vsco_id matching the correct date.`
            : `No matches found after ${Math.round((Date.now() - searchStartMs) / 1000)}s of searching. Try sync_jobs then search again.`
        };
        break;
      }

      // ====================================================================
      // GET JOB — fetch complete raw structure of a single job by vsco_id
      // Use this to inspect all field names on a VSCO job object
      // ====================================================================
      case 'get_job': {
        const jobId = data.vsco_id || data.job_id || data.id;
        if (!jobId) {
          result = { success: false, error: 'vsco_id is required' };
          break;
        }
        const resp = await vscoRequest(supabase, `/job/${jobId}`, {}, executive);
        if (resp.error) {
          result = { success: false, error: resp.error };
          break;
        }
        const job = resp.data;
        const flatFields = job ? Object.keys(job) : [];
        const linkFields = job?.links ? Object.keys(job.links) : [];
        console.log(`🔍 [get_job] ${jobId} flatFields=[${flatFields.join(', ')}]`);
        console.log(`🔍 [get_job] ${jobId} linkFields=[${linkFields.join(', ')}]`);
        result = {
          success: true,
          vsco_id: jobId,
          flat_fields: flatFields,
          link_fields: linkFields,
          // Key fields surfaced for easy reading
          name: job?.name,
          stage: job?.stage,
          event_date: job?.eventDate,
          primaryContactId: job?.primaryContactId,
          contactId: job?.contactId,
          clientId: job?.clientId,
          links: job?.links,
          // Full raw data for complete inspection
          raw: job,
        };
        break;
      }

      // ====================================================================
      // SEARCH LEADS — search jobs/leads by name, email, or phone
      // ====================================================================
      case 'search_leads': {
        const params: Record<string, string> = { pageSize: '200' };
        // Restrict to lead stage by default (can override with data.stage)
        params.stage = data.stage || 'lead';
        if (data.page) params.page = String(data.page);

        const response = await vscoRequest(supabase, '/job', { params }, executive);
        let leads = response.data?.items || response.data?.jobs || response.data || [];
        leads = Array.isArray(leads) ? leads : [];

        // Client-side multi-field search
        const q = (data.query || data.search || '').toLowerCase().trim();
        if (q) {
          leads = leads.filter((j: any) => {
            const name = (j.name || '').toLowerCase();
            const pc = j.primaryContact || {};
            const firstName = (pc.firstName || '').toLowerCase();
            const lastName = (pc.lastName || '').toLowerCase();
            const email = (pc.email || j.email || '').toLowerCase();
            const phone = (pc.phone || j.phone || '').toLowerCase();
            return name.includes(q) || email.includes(q) || phone.includes(q) ||
              firstName.includes(q) || lastName.includes(q) ||
              `${firstName} ${lastName}`.includes(q);
          });
        }

        console.log(`🔍 [search_leads] Query "${q}" → ${leads.length} results (stage: ${params.stage})`);
        result = response.error
          ? { success: false, error: response.error }
          : { success: true, leads, count: leads.length };
        break;
      }

      // ====================================================================
      // UPSERT JOB — find by external ID or name, update if found, else create
      // ====================================================================
      case 'upsert_job': {
        let existingJobId: string | null = data.job_id || null;
        let searchLog: string[] = [];

        // Normalize event_date to YYYY-MM-DD if provided
        const normalizeDate = (d: string) => {
          if (!d) return d;
          // Already YYYY-MM-DD
          if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
          try { return new Date(d).toISOString().split('T')[0]; } catch { return d; }
        };
        if (data.event_date) data.event_date = normalizeDate(data.event_date);

        // ══════════════════════════════════════════════════
        // TIER 1: Local vsco_jobs DB — fastest, most reliable
        // ══════════════════════════════════════════════════
        if (!existingJobId && data.search_name) {
          const sq = data.search_name.toLowerCase();
          const { data: localJobs } = await supabase
            .from('vsco_jobs')
            .select('vsco_id, name, raw_data')
            .limit(200);

          const localMatch = (localJobs || []).find((j: any) => {
            const jobName = (j.name || '').toLowerCase();
            const rawData = j.raw_data || {};
            const clientName = (rawData.clientName || rawData.client_name || '').toLowerCase();
            const contacts = Array.isArray(rawData.contacts) ? rawData.contacts : [];
            const contactMatch = contacts.some((c: any) =>
              (c.name || c.firstName + ' ' + c.lastName || '').toLowerCase().includes(sq)
            );
            return jobName.includes(sq) || clientName.includes(sq) || contactMatch;
          });

          if (localMatch) {
            existingJobId = localMatch.vsco_id;
            searchLog.push(`T1:local_db_match:${existingJobId}`);
            console.log(`🔍 [upsert_job] TIER 1 match: "${data.search_name}" → ${existingJobId}`);
          } else {
            searchLog.push('T1:no_local_match');
          }
        }

        // ══════════════════════════════════════════════════════════
        // TIER 2: Contact lookup → find jobs linked to that contact
        // ══════════════════════════════════════════════════════════
        if (!existingJobId && data.search_name) {
          const sq = data.search_name.toLowerCase();
          const partsQ = sq.split(/\s+/).filter(Boolean);

          // Search contacts by name parts
          const contactResp = await vscoRequest(supabase, '/address-book', {
            params: { search: data.search_name, pageSize: '50' }
          }, executive);
          const contacts = contactResp.data?.items || contactResp.data?.contacts || contactResp.data || [];
          const matchedContact = Array.isArray(contacts) ? contacts.find((c: any) => {
            const full = `${c.firstName || ''} ${c.lastName || ''} ${c.name || ''}`.toLowerCase();
            return partsQ.every(p => full.includes(p));
          }) : null;

          if (matchedContact?.id) {
            // Get jobs linked to this contact
            const jobsResp = await vscoRequest(supabase, '/job', {
              params: { contactId: matchedContact.id, pageSize: '50' }
            }, executive);
            const linked = jobsResp.data?.items || jobsResp.data?.jobs || [];
            if (Array.isArray(linked) && linked.length > 0) {
              // Pick most recent (last created) non-closed job
              const open = linked.find((j: any) => !j.closed) || linked[0];
              existingJobId = open.id;
              searchLog.push(`T2:contact_link:${matchedContact.id}→${existingJobId}`);
              console.log(`🔍 [upsert_job] TIER 2 match via contact ${matchedContact.id} → job ${existingJobId}`);
            } else {
              searchLog.push(`T2:contact_found:${matchedContact.id}:no_linked_jobs`);
            }
          } else {
            searchLog.push('T2:no_contact_match');
          }
        }

        // ═══════════════════════════════════════════════════════════════
        // TIER 3: Full paginated API scan — exhaustive client-side match
        // ═══════════════════════════════════════════════════════════════
        if (!existingJobId && data.search_name) {
          const sq = data.search_name.toLowerCase();
          let found: any = null;
          let page = 1;
          let hasMore = true;

          while (hasMore && !found) {
            const scanResp = await vscoRequest(supabase, '/job', {
              params: { pageSize: '100', page: String(page) }
            }, executive);
            const batch = scanResp.data?.items || scanResp.data?.jobs || scanResp.data || [];
            if (!Array.isArray(batch) || batch.length === 0) { hasMore = false; break; }

            found = batch.find((j: any) => {
              const name = (j.name || '').toLowerCase();
              // API docs confirm client info is in primaryContact, not clientName
              const pc = j.primaryContact || {};
              const firstName = (pc.firstName || '').toLowerCase();
              const lastName = (pc.lastName || '').toLowerCase();
              const email = (pc.email || '').toLowerCase();
              const phone = (pc.phone || '').toLowerCase();
              return name.includes(sq) || email.includes(sq) || phone.includes(sq) ||
                firstName.includes(sq) || lastName.includes(sq) ||
                `${firstName} ${lastName}`.includes(sq);
            });

            hasMore = batch.length === 100;
            page++;
          }

          if (found) {
            existingJobId = found.id;
            searchLog.push(`T3:full_scan_match:page${page - 1}:${existingJobId}`);
            console.log(`🔍 [upsert_job] TIER 3 full-scan match: "${data.search_name}" → ${existingJobId}`);
          } else {
            searchLog.push(`T3:no_match_after_${page - 1}_pages`);
            console.log(`⚠️ [upsert_job] All 3 tiers exhausted — will CREATE new job`);
          }
        }

        console.log(`🔍 [upsert_job] Search log: ${searchLog.join(' | ')}`);

        if (existingJobId) {
          // ── UPDATE existing job ──
          const updatePayload: any = {};
          if (data.name) updatePayload.name = data.name;
          if (data.stage) updatePayload.stage = data.stage;
          if (data.event_date) updatePayload.eventDate = data.event_date;
          if (data.booking_date) updatePayload.bookingDate = data.booking_date;
          if (data.lead_source) updatePayload.leadSource = data.lead_source;
          if (data.brand_id) updatePayload.brandId = data.brand_id;
          if (data.notes) updatePayload.notes = data.notes;
          if (data.lead_rating) updatePayload.leadRating = data.lead_rating;

          console.log(`✏️ [upsert_job] Updating job ${existingJobId} with:`, JSON.stringify(updatePayload));

          const resp = await vscoRequest(supabase, `/job/${existingJobId}`, {
            method: 'PUT', body: updatePayload
          }, executive);

          if (resp.error) {
            result = { success: false, error: resp.error, operation: 'update', job_id: existingJobId, search_log: searchLog };
          } else {
            const job = resp.data;
            await supabase.from('vsco_jobs').upsert({
              vsco_id: job.id, name: job.name, stage: job.stage,
              event_date: job.eventDate, booking_date: job.bookingDate,
              lead_source: job.leadSource, raw_data: job,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'vsco_id' });
            result = { success: true, job, operation: 'updated', job_id: existingJobId, search_log: searchLog };
          }
        } else {
          // ── CREATE new job (all tiers failed to find existing) ──
          if (!data.name) {
            result = { success: false, error: 'Cannot create: name is required when no existing job found', search_log: searchLog };
            break;
          }
          const createPayload: any = { name: data.name, stage: data.stage || 'lead' };
          if (data.event_date) createPayload.eventDate = data.event_date;
          if (data.booking_date) createPayload.bookingDate = data.booking_date;
          if (data.lead_source) createPayload.leadSource = data.lead_source;
          if (data.brand_id) createPayload.brandId = data.brand_id;
          if (data.notes) createPayload.notes = data.notes;
          if (data.lead_rating) createPayload.leadRating = data.lead_rating;

          const resp = await vscoRequest(supabase, '/job', {
            method: 'POST', body: createPayload
          }, executive);

          if (resp.error) {
            result = { success: false, error: resp.error, operation: 'create', search_log: searchLog };
          } else {
            const job = resp.data;
            await supabase.from('vsco_jobs').upsert({
              vsco_id: job.id, name: job.name, stage: job.stage,
              event_date: job.eventDate, booking_date: job.bookingDate,
              lead_source: job.leadSource, raw_data: job,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'vsco_id' });
            result = { success: true, job, operation: 'created', search_log: searchLog };
          }
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
        // ✅ FIX: Táve v2 API uses 'start'/'end' not 'startDate'/'endDate'
        if (data.start_date) params.start = data.start_date;
        if (data.end_date) params.end = data.end_date;
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

        // Use nested endpoint: POST /job/{job_id}/order (not /order)
        const response = await vscoRequest(supabase, `/job/${data.job_id}/order`, {
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
      // SYNC STATUS - Check how much has been synced
      // ====================================================================
      case 'sync_status': {
        const { data: states } = await supabase
          .from('vsco_sync_state')
          .select('*')
          .order('entity');

        const { count: localJobCount } = await supabase
          .from('vsco_jobs')
          .select('*', { count: 'exact', head: true });

        const jobState = (states || []).find((s: any) => s.entity === 'jobs') || {};
        result = {
          success: true,
          sync_status: {
            jobs: {
              local_rows: localJobCount || 0,
              pages_synced: jobState.last_synced_page || 0,
              total_pages: jobState.total_pages || '?',
              items_synced: jobState.items_synced || 0,
              total_items: jobState.total_items || '?',
              is_complete: jobState.is_complete || false,
              last_synced_at: jobState.last_synced_at,
              percent_complete: jobState.total_pages
                ? Math.round(((jobState.last_synced_page || 0) / jobState.total_pages) * 100)
                : null,
            },
            all_states: states || [],
          },
          hint: jobState.is_complete
            ? 'Full sync complete. Future sync_jobs calls will only check for new/modified jobs.'
            : `Call sync_jobs again to continue. Will sync pages ${(jobState.last_synced_page || 0) + 1}–${(jobState.last_synced_page || 0) + 15}.`,
        };
        break;
      }

      // ====================================================================
      // SYNC JOBS / SYNC ALL — Resumable chunked sync
      // Each call syncs up to PAGES_PER_CALL pages, then saves state.
      // Call sync_jobs repeatedly until is_complete=true.
      // After full sync, subsequent calls only fetch page 1 (delta mode).
      // ====================================================================
      case 'sync_all':
      case 'sync_jobs':
      case 'sync_contacts': {
        const PAGES_PER_CALL = Number(data.pages_per_call) || 8; // 8 pages × avg 3s = ~24s, safe within 60s limit
        const syncResults: any = { jobs: 0, contacts: 0, events: 0, errors: [], pages_synced_this_call: 0 };

        // ── Sync jobs ──────────────────────────────────────────────────────
        if (action === 'sync_all' || action === 'sync_jobs') {
          try {
            // Read resume state from DB
            const { data: stateRow } = await supabase
              .from('vsco_sync_state')
              .select('*')
              .eq('entity', 'jobs')
              .single();

            const alreadyComplete = stateRow?.is_complete === true;
            let startPage: number;
            let knownTotalPages: number = stateRow?.total_pages || 999;

            if (alreadyComplete) {
              // Delta mode: only sync page 1 to capture the most recently modified jobs
              startPage = 1;
              console.log(`🔄 [sync_jobs] DELTA MODE — full sync previously completed. Checking page 1 for new/modified jobs.`);
            } else {
              startPage = (stateRow?.last_synced_page || 0) + 1;
              console.log(`🔄 [sync_jobs] RESUMING from page ${startPage} (${stateRow?.items_synced || 0} jobs synced so far, ${knownTotalPages} total pages)`);
            }

            const endPage = alreadyComplete ? 1 : startPage + PAGES_PER_CALL - 1;
            let lastPageSynced = startPage - 1;
            let chunkJobCount = 0;
            let firstPageMeta: any = null;

            for (let page = startPage; page <= endPage; page++) {
              const jobsResponse = await vscoRequest(supabase, '/job', {
                params: { page: String(page), pageSize: '100', includeClosed: 'true' }
              }, executive);

              if (jobsResponse.error) {
                syncResults.errors.push(`Jobs page ${page} error: ${jobsResponse.error}`);
                break;
              }

              const meta = jobsResponse.data?.meta;
              const jobsArray = Array.isArray(jobsResponse.data?.items) ? jobsResponse.data.items : [];

              if (page === startPage && meta) {
                firstPageMeta = meta;
                knownTotalPages = meta.totalPages || knownTotalPages;
                console.log(`🔄 [sync_jobs] API reports ${meta.totalItems} total jobs across ${meta.totalPages} pages`);
              }

              console.log(`🔄 [sync_jobs] Page ${page}/${knownTotalPages}: ${jobsArray.length} jobs`);

              if (jobsArray.length === 0) break;

              for (const job of jobsArray) {
                const pc = job.primaryContact || {};
                const { error: upsertErr } = await supabase.from('vsco_jobs').upsert({
                  vsco_id: job.id,
                  name: job.name,
                  stage: job.stage,
                  client_first_name: pc.firstName,
                  client_last_name: pc.lastName,
                  client_email: pc.email,
                  client_phone: pc.phone,
                  lead_status: job.leadStatus,
                  lead_rating: job.leadRating,
                  lead_confidence: job.leadConfidence,
                  lead_source: job.leadSource,
                  job_type: job.jobType,
                  brand_id: job.brandId,
                  event_date: job.eventDate,
                  booking_date: job.bookingDate,
                  total_revenue: job.total,
                  closed: job.closed ?? false,
                  closed_reason: job.closedReason,
                  raw_data: job,
                  synced_at: new Date().toISOString(),
                }, { onConflict: 'vsco_id' });

                if (upsertErr) {
                  if (syncResults.jobs === 0 && chunkJobCount === 0) {
                    console.error(`❌ [sync_jobs] UPSERT FAILED: ${upsertErr.message}`);
                  }
                  syncResults.errors.push(`Upsert ${job.id}: ${upsertErr.message}`);
                } else {
                  syncResults.jobs++;
                  chunkJobCount++;
                }
              }

              lastPageSynced = page;
              syncResults.pages_synced_this_call++;
              if (jobsArray.length < 100) break; // last partial page
            }

            // Save progress back to DB
            if (!alreadyComplete) {
              const newTotalSynced = (stateRow?.items_synced || 0) + chunkJobCount;
              const isNowComplete = lastPageSynced >= knownTotalPages;

              await supabase.from('vsco_sync_state').upsert({
                entity: 'jobs',
                last_synced_page: lastPageSynced,
                total_pages: knownTotalPages,
                total_items: firstPageMeta?.totalItems || stateRow?.total_items || 0,
                items_synced: newTotalSynced,
                is_complete: isNowComplete,
                last_synced_at: new Date().toISOString(),
                last_error: syncResults.errors.length > 0 ? syncResults.errors[syncResults.errors.length - 1] : null,
              }, { onConflict: 'entity' });

              if (isNowComplete) {
                console.log(`✅ [sync_jobs] FULL SYNC COMPLETE — ${newTotalSynced} jobs across ${knownTotalPages} pages`);
                syncResults.full_sync_complete = true;
              } else {
                const pagesRemaining = knownTotalPages - lastPageSynced;
                const callsRemaining = Math.ceil(pagesRemaining / PAGES_PER_CALL);
                syncResults.progress = `Pages ${lastPageSynced}/${knownTotalPages} synced (${Math.round(lastPageSynced / knownTotalPages * 100)}%). Call sync_jobs ${callsRemaining} more time(s) to complete.`;
                console.log(`🔄 [sync_jobs] Progress saved: page ${lastPageSynced}/${knownTotalPages}. ${callsRemaining} calls remaining.`);
              }
            } else {
              syncResults.delta_mode = true;
              syncResults.progress = `Delta sync: checked page 1 for new/modified jobs. ${chunkJobCount} records updated.`;
            }

          } catch (e) {
            syncResults.errors.push(`Jobs sync exception: ${e}`);
          }
        }

        // ── Sync contacts ──────────────────────────────────────────────────
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

              // API docs: contacts return {items:[], meta:{}} — NOT {contacts:[]}
              const contactsArray = Array.isArray(contactsResponse.data?.items) ? contactsResponse.data.items : [];
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
          contentHtml: data.content || data.contentHtml, // VSCO API requires contentHtml
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
