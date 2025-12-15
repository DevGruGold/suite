import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { startUsageTrackingWithRequest } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'get-function-actions';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// ACTION SCHEMAS FOR MULTI-ACTION EDGE FUNCTIONS
// ============================================================================

interface ActionSchema {
  name: string;
  category: string;
  description: string;
  required_params: string[];
  optional_params: string[];
  example?: Record<string, any>;
}

// VSCO Workspace - 89 actions organized by category
const VSCO_ACTION_SCHEMA: ActionSchema[] = [
  // ======================== STUDIO & BRANDS ========================
  { name: 'get_studio', category: 'studio', description: 'Get studio/account details', required_params: [], optional_params: [] },
  { name: 'list_brands', category: 'studio', description: 'List all brands in the studio', required_params: [], optional_params: [] },
  { name: 'create_brand', category: 'studio', description: 'Create a new brand', required_params: ['name'], optional_params: [] },
  { name: 'update_brand', category: 'studio', description: 'Update a brand', required_params: ['brand_id'], optional_params: ['name'] },
  { name: 'delete_brand', category: 'studio', description: 'Delete a brand', required_params: ['brand_id'], optional_params: [] },

  // ======================== JOBS/LEADS ========================
  { name: 'list_jobs', category: 'jobs', description: 'List all jobs with filters', required_params: [], optional_params: ['stage', 'closed', 'brand_id', 'page', 'per_page', 'sort'] },
  { name: 'get_job', category: 'jobs', description: 'Get details for a specific job', required_params: ['job_id'], optional_params: [] },
  { name: 'create_job', category: 'jobs', description: 'Create a new job/lead', required_params: ['name'], optional_params: ['stage', 'job_type_id', 'lead_rating', 'event_date', 'brand_id'] },
  { name: 'update_job', category: 'jobs', description: 'Update an existing job', required_params: ['job_id'], optional_params: ['name', 'stage', 'lead_rating', 'event_date'] },
  { name: 'close_job', category: 'jobs', description: 'Close/archive a job', required_params: ['job_id'], optional_params: ['reason'] },
  { name: 'delete_job', category: 'jobs', description: 'Delete a job', required_params: ['job_id'], optional_params: [] },
  { name: 'get_job_worksheet', category: 'jobs', description: 'Get worksheet for a job', required_params: ['job_id'], optional_params: [] },
  { name: 'create_job_from_worksheet', category: 'jobs', description: 'Create job from worksheet template', required_params: ['worksheet_id'], optional_params: ['name', 'event_date'] },

  // ======================== JOB CONTACTS ========================
  { name: 'list_job_contacts', category: 'job_contacts', description: 'List contacts linked to a job', required_params: ['job_id'], optional_params: [] },
  { name: 'create_job_contact', category: 'job_contacts', description: 'Link a contact to a job', required_params: ['job_id', 'contact_id'], optional_params: ['role', 'is_primary'] },
  { name: 'get_job_contact', category: 'job_contacts', description: 'Get job-contact link details', required_params: ['job_id', 'job_contact_id'], optional_params: [] },
  { name: 'update_job_contact', category: 'job_contacts', description: 'Update job-contact link', required_params: ['job_id', 'job_contact_id'], optional_params: ['role', 'is_primary'] },
  { name: 'delete_job_contact', category: 'job_contacts', description: 'Unlink contact from job', required_params: ['job_id', 'job_contact_id'], optional_params: [] },

  // ======================== CONTACTS/CRM ========================
  { name: 'list_contacts', category: 'contacts', description: 'List all contacts', required_params: [], optional_params: ['page', 'per_page', 'search'] },
  { name: 'get_contact', category: 'contacts', description: 'Get contact details', required_params: ['contact_id'], optional_params: [] },
  { name: 'create_contact', category: 'contacts', description: 'Create a new contact', required_params: ['email'], optional_params: ['first_name', 'last_name', 'phone', 'company_name', 'address'] },
  { name: 'update_contact', category: 'contacts', description: 'Update contact info', required_params: ['contact_id'], optional_params: ['email', 'first_name', 'last_name', 'phone', 'company_name'] },
  { name: 'delete_contact', category: 'contacts', description: 'Delete a contact', required_params: ['contact_id'], optional_params: [] },

  // ======================== EVENTS/CALENDAR ========================
  { name: 'list_events', category: 'events', description: 'List calendar events', required_params: [], optional_params: ['start_date', 'end_date', 'job_id', 'sort_order'] },
  { name: 'get_event', category: 'events', description: 'Get event details', required_params: ['event_id'], optional_params: [] },
  { name: 'create_event', category: 'events', description: 'Create calendar event', required_params: ['title', 'start_date'], optional_params: ['end_date', 'job_id', 'location', 'description'] },
  { name: 'update_event', category: 'events', description: 'Update event', required_params: ['event_id'], optional_params: ['title', 'start_date', 'end_date', 'location'] },
  { name: 'delete_event', category: 'events', description: 'Delete event', required_params: ['event_id'], optional_params: [] },

  // ======================== ORDERS/FINANCIALS ========================
  { name: 'list_orders', category: 'orders', description: 'List all orders', required_params: [], optional_params: ['job_id', 'status', 'page', 'per_page'] },
  { name: 'get_order', category: 'orders', description: 'Get order details', required_params: ['order_id'], optional_params: [] },
  { name: 'create_order', category: 'orders', description: 'Create order on a job', required_params: ['job_id'], optional_params: ['status', 'notes'] },
  { name: 'update_order', category: 'orders', description: 'Update order', required_params: ['order_id'], optional_params: ['status', 'notes'] },
  { name: 'delete_order', category: 'orders', description: 'Delete order', required_params: ['order_id'], optional_params: [] },

  // ======================== PRODUCTS/SERVICES ========================
  { name: 'list_products', category: 'products', description: 'List all products/services', required_params: [], optional_params: ['page', 'per_page'] },
  { name: 'get_product', category: 'products', description: 'Get product details', required_params: ['product_id'], optional_params: [] },
  { name: 'create_product', category: 'products', description: 'Create product/service', required_params: ['name', 'price'], optional_params: ['description', 'category'] },
  { name: 'update_product', category: 'products', description: 'Update product', required_params: ['product_id'], optional_params: ['name', 'price', 'description'] },
  { name: 'delete_product', category: 'products', description: 'Delete product', required_params: ['product_id'], optional_params: [] },

  // ======================== WORKSHEETS/TEMPLATES ========================
  { name: 'list_worksheets', category: 'worksheets', description: 'List worksheet templates', required_params: [], optional_params: ['page', 'per_page'] },
  { name: 'get_worksheet', category: 'worksheets', description: 'Get worksheet details', required_params: ['worksheet_id'], optional_params: [] },
  { name: 'create_worksheet', category: 'worksheets', description: 'Create worksheet template', required_params: ['name'], optional_params: ['fields', 'description'] },
  { name: 'update_worksheet', category: 'worksheets', description: 'Update worksheet', required_params: ['worksheet_id'], optional_params: ['name', 'fields'] },
  { name: 'delete_worksheet', category: 'worksheets', description: 'Delete worksheet', required_params: ['worksheet_id'], optional_params: [] },

  // ======================== NOTES ========================
  { name: 'list_notes', category: 'notes', description: 'List notes for a job', required_params: ['job_id'], optional_params: [] },
  { name: 'create_note', category: 'notes', description: 'Create note on a job', required_params: ['job_id', 'contentHtml'], optional_params: ['title'] },
  { name: 'update_note', category: 'notes', description: 'Update a note', required_params: ['note_id'], optional_params: ['contentHtml', 'title'] },
  { name: 'delete_note', category: 'notes', description: 'Delete a note', required_params: ['note_id'], optional_params: [] },

  // ======================== FILES & GALLERIES ========================
  { name: 'list_files', category: 'files', description: 'List files for a job', required_params: ['job_id'], optional_params: [] },
  { name: 'create_file', category: 'files', description: 'Upload/create file reference', required_params: ['job_id', 'url'], optional_params: ['name', 'type'] },
  { name: 'update_file', category: 'files', description: 'Update file metadata', required_params: ['file_id'], optional_params: ['name'] },
  { name: 'delete_file', category: 'files', description: 'Delete file', required_params: ['file_id'], optional_params: [] },
  { name: 'list_galleries', category: 'galleries', description: 'List galleries', required_params: [], optional_params: ['job_id'] },
  { name: 'create_gallery', category: 'galleries', description: 'Create gallery', required_params: ['name'], optional_params: ['job_id', 'description'] },
  { name: 'update_gallery', category: 'galleries', description: 'Update gallery', required_params: ['gallery_id'], optional_params: ['name', 'description'] },
  { name: 'delete_gallery', category: 'galleries', description: 'Delete gallery', required_params: ['gallery_id'], optional_params: [] },

  // ======================== FINANCIAL MODULE ========================
  { name: 'list_payment_methods', category: 'financials', description: 'List payment methods', required_params: [], optional_params: [] },
  { name: 'get_payment_method', category: 'financials', description: 'Get payment method details', required_params: ['payment_method_id'], optional_params: [] },
  { name: 'create_payment_method', category: 'financials', description: 'Create payment method', required_params: ['name', 'type'], optional_params: [] },
  { name: 'update_payment_method', category: 'financials', description: 'Update payment method', required_params: ['payment_method_id'], optional_params: ['name'] },
  { name: 'delete_payment_method', category: 'financials', description: 'Delete payment method', required_params: ['payment_method_id'], optional_params: [] },
  { name: 'list_profit_centers', category: 'financials', description: 'List profit centers', required_params: [], optional_params: [] },
  { name: 'create_profit_center', category: 'financials', description: 'Create profit center', required_params: ['name'], optional_params: [] },
  { name: 'update_profit_center', category: 'financials', description: 'Update profit center', required_params: ['profit_center_id'], optional_params: ['name'] },
  { name: 'delete_profit_center', category: 'financials', description: 'Delete profit center', required_params: ['profit_center_id'], optional_params: [] },
  { name: 'list_tax_groups', category: 'financials', description: 'List tax groups', required_params: [], optional_params: [] },
  { name: 'create_tax_group', category: 'financials', description: 'Create tax group', required_params: ['name'], optional_params: ['rate'] },
  { name: 'update_tax_group', category: 'financials', description: 'Update tax group', required_params: ['tax_group_id'], optional_params: ['name', 'rate'] },
  { name: 'delete_tax_group', category: 'financials', description: 'Delete tax group', required_params: ['tax_group_id'], optional_params: [] },
  { name: 'list_tax_rates', category: 'financials', description: 'List tax rates', required_params: [], optional_params: [] },
  { name: 'create_tax_rate', category: 'financials', description: 'Create tax rate', required_params: ['name', 'rate'], optional_params: [] },
  { name: 'update_tax_rate', category: 'financials', description: 'Update tax rate', required_params: ['tax_rate_id'], optional_params: ['name', 'rate'] },
  { name: 'delete_tax_rate', category: 'financials', description: 'Delete tax rate', required_params: ['tax_rate_id'], optional_params: [] },

  // ======================== STUDIO SETTINGS ========================
  { name: 'list_custom_fields', category: 'settings', description: 'List custom fields', required_params: [], optional_params: ['entity_type'] },
  { name: 'create_custom_field', category: 'settings', description: 'Create custom field', required_params: ['name', 'field_type'], optional_params: ['entity_type', 'options'] },
  { name: 'update_custom_field', category: 'settings', description: 'Update custom field', required_params: ['custom_field_id'], optional_params: ['name'] },
  { name: 'delete_custom_field', category: 'settings', description: 'Delete custom field', required_params: ['custom_field_id'], optional_params: [] },
  { name: 'list_discounts', category: 'settings', description: 'List discounts', required_params: [], optional_params: [] },
  { name: 'create_discount', category: 'settings', description: 'Create discount', required_params: ['name', 'type', 'value'], optional_params: [] },
  { name: 'delete_discount', category: 'settings', description: 'Delete discount', required_params: ['discount_id'], optional_params: [] },
  { name: 'list_event_types', category: 'settings', description: 'List event types', required_params: [], optional_params: [] },
  { name: 'list_job_types', category: 'settings', description: 'List job types', required_params: [], optional_params: [] },
  { name: 'list_lead_types', category: 'settings', description: 'List lead types', required_params: [], optional_params: [] },
  { name: 'list_file_types', category: 'settings', description: 'List file types', required_params: [], optional_params: [] },

  // ======================== USER MANAGEMENT ========================
  { name: 'list_users', category: 'users', description: 'List studio users', required_params: [], optional_params: [] },
  { name: 'get_user', category: 'users', description: 'Get user details', required_params: ['user_id'], optional_params: [] },
  { name: 'create_user', category: 'users', description: 'Create/invite user', required_params: ['email'], optional_params: ['first_name', 'last_name', 'role'] },
  { name: 'update_user', category: 'users', description: 'Update user', required_params: ['user_id'], optional_params: ['first_name', 'last_name', 'role'] },
  { name: 'delete_user', category: 'users', description: 'Delete/remove user', required_params: ['user_id'], optional_params: [] },

  // ======================== WEBHOOKS ========================
  { name: 'list_webhooks', category: 'webhooks', description: 'List webhooks', required_params: [], optional_params: [] },
  { name: 'create_webhook', category: 'webhooks', description: 'Create webhook', required_params: ['url', 'events'], optional_params: [] },
  { name: 'update_webhook', category: 'webhooks', description: 'Update webhook', required_params: ['webhook_id'], optional_params: ['url', 'events', 'enabled'] },
  { name: 'delete_webhook', category: 'webhooks', description: 'Delete webhook', required_params: ['webhook_id'], optional_params: [] },

  // ======================== ANALYTICS ========================
  { name: 'get_analytics', category: 'analytics', description: 'Get studio analytics', required_params: [], optional_params: ['start_date', 'end_date', 'metrics'] },
  { name: 'get_revenue_report', category: 'analytics', description: 'Get revenue report', required_params: [], optional_params: ['start_date', 'end_date', 'group_by'] },

  // ======================== SYNC & UTILITIES ========================
  { name: 'sync_all', category: 'utilities', description: 'Full sync of all VSCO data to local DB', required_params: [], optional_params: [] },
  { name: 'sync_jobs', category: 'utilities', description: 'Sync jobs to local DB', required_params: [], optional_params: ['since'] },
  { name: 'sync_contacts', category: 'utilities', description: 'Sync contacts to local DB', required_params: [], optional_params: ['since'] },
  { name: 'get_api_health', category: 'utilities', description: 'Check VSCO API health', required_params: [], optional_params: [] },
  { name: 'list_timezones', category: 'utilities', description: 'List available timezones', required_params: [], optional_params: [] },
  { name: 'health', category: 'utilities', description: 'Health check', required_params: [], optional_params: [] },
  { name: 'debug_api', category: 'utilities', description: 'Debug API connectivity', required_params: [], optional_params: [] },
  { name: 'list_actions', category: 'utilities', description: 'List all available actions (this action)', required_params: [], optional_params: ['category'] },
];

// GitHub Integration - 25+ actions
const GITHUB_ACTION_SCHEMA: ActionSchema[] = [
  { name: 'list_repos', category: 'repos', description: 'List repositories', required_params: [], optional_params: ['owner', 'type'] },
  { name: 'get_repo', category: 'repos', description: 'Get repository details', required_params: ['owner', 'repo'], optional_params: [] },
  { name: 'list_issues', category: 'issues', description: 'List issues', required_params: ['owner', 'repo'], optional_params: ['state', 'labels'] },
  { name: 'get_issue', category: 'issues', description: 'Get issue details', required_params: ['owner', 'repo', 'issue_number'], optional_params: [] },
  { name: 'create_issue', category: 'issues', description: 'Create new issue', required_params: ['owner', 'repo', 'title'], optional_params: ['body', 'labels', 'assignees'] },
  { name: 'update_issue', category: 'issues', description: 'Update issue', required_params: ['owner', 'repo', 'issue_number'], optional_params: ['title', 'body', 'state', 'labels'] },
  { name: 'comment_on_issue', category: 'issues', description: 'Add comment to issue', required_params: ['owner', 'repo', 'issue_number', 'body'], optional_params: [] },
  { name: 'list_commits', category: 'commits', description: 'List commits', required_params: ['owner', 'repo'], optional_params: ['sha', 'path', 'per_page'] },
  { name: 'list_pull_requests', category: 'prs', description: 'List pull requests', required_params: ['owner', 'repo'], optional_params: ['state', 'head', 'base'] },
  { name: 'create_pull_request', category: 'prs', description: 'Create pull request', required_params: ['owner', 'repo', 'title', 'head', 'base'], optional_params: ['body', 'draft'] },
  { name: 'merge_pull_request', category: 'prs', description: 'Merge pull request', required_params: ['owner', 'repo', 'pull_number'], optional_params: ['commit_title', 'merge_method'] },
  { name: 'list_branches', category: 'branches', description: 'List branches', required_params: ['owner', 'repo'], optional_params: [] },
  { name: 'create_branch', category: 'branches', description: 'Create branch', required_params: ['owner', 'repo', 'branch', 'from_ref'], optional_params: [] },
  { name: 'get_file_content', category: 'files', description: 'Get file content', required_params: ['owner', 'repo', 'path'], optional_params: ['ref'] },
  { name: 'commit_file', category: 'files', description: 'Commit file changes', required_params: ['owner', 'repo', 'path', 'content', 'message'], optional_params: ['branch', 'sha'] },
  { name: 'search_code', category: 'search', description: 'Search code', required_params: ['query'], optional_params: ['owner', 'repo'] },
  { name: 'list_discussions', category: 'discussions', description: 'List discussions', required_params: ['owner', 'repo'], optional_params: [] },
  { name: 'create_discussion', category: 'discussions', description: 'Create discussion', required_params: ['owner', 'repo', 'title', 'body', 'category_id'], optional_params: [] },
  { name: 'trigger_workflow', category: 'workflows', description: 'Trigger workflow dispatch', required_params: ['owner', 'repo', 'workflow_id', 'ref'], optional_params: ['inputs'] },
  { name: 'list_workflows', category: 'workflows', description: 'List workflows', required_params: ['owner', 'repo'], optional_params: [] },
];

// Agent Manager - 27+ actions
const AGENT_MANAGER_ACTION_SCHEMA: ActionSchema[] = [
  { name: 'list_agents', category: 'agents', description: 'List all agents', required_params: [], optional_params: ['status', 'role'] },
  { name: 'get_agent', category: 'agents', description: 'Get agent details', required_params: ['agent_id'], optional_params: [] },
  { name: 'get_agent_by_name', category: 'agents', description: 'Find agent by name', required_params: ['name'], optional_params: [] },
  { name: 'spawn_agent', category: 'agents', description: 'Create new agent', required_params: ['name', 'role'], optional_params: ['skills', 'metadata', 'spawn_reason'] },
  { name: 'batch_spawn_agents', category: 'agents', description: 'Create multiple agents', required_params: ['agents'], optional_params: [] },
  { name: 'update_agent_status', category: 'agents', description: 'Update agent status', required_params: ['agent_id', 'status'], optional_params: [] },
  { name: 'archive_agent', category: 'agents', description: 'Archive/deactivate agent', required_params: ['agent_id'], optional_params: ['reason'] },
  { name: 'get_agent_stats', category: 'agents', description: 'Get agent performance metrics', required_params: ['agent_id'], optional_params: ['time_window_days'] },
  { name: 'list_tasks', category: 'tasks', description: 'List tasks', required_params: [], optional_params: ['status', 'stage', 'agent_id', 'category'] },
  { name: 'get_task', category: 'tasks', description: 'Get task details', required_params: ['task_id'], optional_params: [] },
  { name: 'create_task', category: 'tasks', description: 'Create new task', required_params: ['title'], optional_params: ['description', 'category', 'priority', 'stage', 'assignee_agent_id'] },
  { name: 'assign_task', category: 'tasks', description: 'Assign task to agent', required_params: ['task_id'], optional_params: ['assignee_agent_id', 'auto_assign'] },
  { name: 'update_task_status', category: 'tasks', description: 'Update task status', required_params: ['task_id', 'status'], optional_params: ['resolution_notes', 'items_completed'] },
  { name: 'report_progress', category: 'tasks', description: 'Report task progress', required_params: ['task_id'], optional_params: ['progress', 'work_summary', 'items_completed'] },
  { name: 'delegate_task', category: 'tasks', description: 'Delegate task to another agent', required_params: ['task_id', 'from_agent_id', 'to_agent_id'], optional_params: ['rationale'] },
  { name: 'record_decision', category: 'decisions', description: 'Log agent decision', required_params: ['decision', 'rationale'], optional_params: ['agent_id', 'task_id'] },
  { name: 'claim_task', category: 'tasks', description: 'Agent claims a task', required_params: ['agent_id', 'task_id'], optional_params: [] },
  { name: 'complete_task', category: 'tasks', description: 'Mark task completed', required_params: ['task_id'], optional_params: ['notes'] },
  { name: 'fail_task', category: 'tasks', description: 'Mark task failed', required_params: ['task_id'], optional_params: ['reason'] },
  { name: 'get_pipeline_status', category: 'pipeline', description: 'Get task pipeline overview', required_params: [], optional_params: [] },
  { name: 'heartbeat', category: 'health', description: 'Agent heartbeat', required_params: ['agent_id'], optional_params: ['metadata'] },
];

// Workflow Template Manager
const WORKFLOW_TEMPLATE_MANAGER_SCHEMA: ActionSchema[] = [
  { name: 'list_templates', category: 'templates', description: 'List all workflow templates', required_params: [], optional_params: ['category', 'is_active'] },
  { name: 'get_template', category: 'templates', description: 'Get template details', required_params: ['template_id'], optional_params: [] },
  { name: 'execute_template', category: 'execution', description: 'Execute a workflow template', required_params: ['template_name'], optional_params: ['params', 'context'] },
  { name: 'create_template', category: 'templates', description: 'Create new template', required_params: ['template_name', 'steps'], optional_params: ['category', 'description'] },
  { name: 'update_template', category: 'templates', description: 'Update template', required_params: ['template_id'], optional_params: ['template_name', 'steps', 'is_active'] },
  { name: 'delete_template', category: 'templates', description: 'Delete template', required_params: ['template_id'], optional_params: [] },
  { name: 'list_executions', category: 'execution', description: 'List recent executions', required_params: [], optional_params: ['template_name', 'status', 'limit'] },
  { name: 'get_execution', category: 'execution', description: 'Get execution details', required_params: ['execution_id'], optional_params: [] },
];

// Map of all function schemas
const FUNCTION_SCHEMAS: Record<string, ActionSchema[]> = {
  'vsco-workspace': VSCO_ACTION_SCHEMA,
  'github-integration': GITHUB_ACTION_SCHEMA,
  'agent-manager': AGENT_MANAGER_ACTION_SCHEMA,
  'workflow-template-manager': WORKFLOW_TEMPLATE_MANAGER_SCHEMA,
};

const SUPPORTED_FUNCTIONS = Object.keys(FUNCTION_SCHEMAS);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  
  const usageTracker = startUsageTrackingWithRequest(FUNCTION_NAME, req, body);

  try {
    const { function_name, category } = body;
    console.log(`🔍 [get-function-actions] Function: ${function_name}, Category: ${category || 'all'}`);

    // If no function specified, list all supported functions
    if (!function_name) {
      await usageTracker.success({ result_summary: 'Listed all functions' });
      return new Response(JSON.stringify({
        success: true,
        supported_functions: SUPPORTED_FUNCTIONS.map(fn => ({
          name: fn,
          action_count: FUNCTION_SCHEMAS[fn].length,
          categories: [...new Set(FUNCTION_SCHEMAS[fn].map(a => a.category))]
        })),
        usage: 'Provide function_name to get action details. Example: { "function_name": "vsco-workspace" }'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const schema = FUNCTION_SCHEMAS[function_name];
    if (!schema) {
      await usageTracker.failure(`Unknown function: ${function_name}`, 400);
      return new Response(JSON.stringify({
        success: false,
        error: `Unknown function: ${function_name}`,
        supported_functions: SUPPORTED_FUNCTIONS
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Filter by category if provided
    const actions = category 
      ? schema.filter(a => a.category === category)
      : schema;

    const categories = [...new Set(schema.map(a => a.category))];

    await usageTracker.success({ result_summary: `${function_name}: ${actions.length} actions` });
    return new Response(JSON.stringify({
      success: true,
      function_name,
      total_actions: schema.length,
      filtered_actions: actions.length,
      categories,
      actions: actions.map(a => ({
        action: a.name,
        category: a.category,
        description: a.description,
        required: a.required_params,
        optional: a.optional_params,
        example_payload: {
          action: a.name,
          data: Object.fromEntries([
            ...a.required_params.map(p => [p, `<${p}>`]),
            ...a.optional_params.slice(0, 2).map(p => [p, `<optional:${p}>`])
          ])
        }
      })),
      usage_hint: `Call vsco-workspace with: { "action": "<action_name>", "data": { <params> } }`
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('❌ [get-function-actions] Error:', error);
    await usageTracker.failure(error instanceof Error ? error.message : 'Unknown error', 500);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      supported_functions: SUPPORTED_FUNCTIONS
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
