import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// ============= USAGE LOGGER TYPES =============

export type ExecutionSource = 'supabase_native' | 'pg_cron' | 'github_actions' | 'vercel_cron' | 'api' | 'tool_call';

interface UsageLogEntry {
  function_name: string;
  executive_name?: string;
  success: boolean;
  execution_time_ms: number;
  error_message?: string;
  parameters?: any;
  result_summary?: string;
  provider?: string;
  model?: string;
  tool_calls?: number;
  fallback?: string;
  status_code?: number;
  execution_source?: ExecutionSource;
}

// ============= USAGE LOGGER IMPLEMENTATION =============

/**
 * Detect execution source from request headers and body
 */
function detectExecutionSource(req: Request, body?: any): ExecutionSource {
  const schedulerHeader = req.headers.get('x-supabase-scheduler');
  if (schedulerHeader === 'true' || schedulerHeader === '1') {
    return 'supabase_native';
  }
  
  const vercelCron = req.headers.get('x-vercel-cron');
  if (vercelCron === '1' || vercelCron === 'true') {
    return 'vercel_cron';
  }
  
  if (body?.source === 'github_actions' || body?.source === 'github_action') {
    return 'github_actions';
  }
  const githubHeader = req.headers.get('x-github-action');
  if (githubHeader) {
    return 'github_actions';
  }
  
  const userAgent = req.headers.get('user-agent') || '';
  if (userAgent.includes('pg_net') || userAgent.includes('PostgreSQL')) {
    return 'pg_cron';
  }
  
  if (body?.invoked_by === 'tool_call' || body?.source === 'tool_call') {
    return 'tool_call';
  }
  
  return 'api';
}

/**
 * Get or create a Supabase client for logging
 */
function getLoggingClient() {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.warn('⚠️ Missing Supabase credentials for usage logging');
      return null;
    }
    
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  } catch (e) {
    console.error('❌ Failed to create logging client:', e);
    return null;
  }
}

/**
 * Categorize function for analytics grouping
 */
function categorizeFunction(functionName: string): string {
  const categories: Record<string, string[]> = {
    'ai_executive': ['gemini-chat', 'deepseek-chat', 'openai-chat', 'lovable-chat', 'kimi-chat', 'vercel-ai-chat', 'vercel-ai-chat-stream', 'ai-chat'],
    'system': ['system-status', 'system-health', 'system-diagnostics', 'ecosystem-monitor', 'list-available-functions', 'get-edge-function-logs', 'prometheus-metrics', 'api-key-health-monitor', 'check-frontend-health', 'sync-function-logs', 'get-cron-registry'],
    'agent': ['agent-manager', 'task-orchestrator', 'task-auto-advance', 'suite-task-automation-engine', 'eliza-self-evaluation', 'eliza-intelligence-coordinator'],
    'workflow': ['workflow-template-manager', 'multi-step-orchestrator', 'workflow-optimizer', 'diagnose-workflow-failure', 'n8n-workflow-generator', 'execute-scheduled-actions'],
    'github': ['github-integration', 'sync-github-contributions', 'ingest-github-contribution', 'validate-github-contribution', 'morning-discussion-post', 'daily-discussion-post', 'evening-summary-post', 'weekly-retrospective-post', 'community-spotlight-post', 'progress-update-post'],
    'governance': ['vote-on-proposal', 'governance-phase-manager', 'list-function-proposals', 'propose-new-edge-function', 'execute-approved-proposal', 'handle-rejected-proposal', 'request-executive-votes', 'deploy-approved-edge-function', 'evaluate-community-idea'],
    'analytics': ['function-usage-analytics', 'get-my-feedback', 'get-function-version-analytics', 'tool-usage-analytics', 'query-edge-analytics', 'debug-analytics-data-flow', 'get-code-execution-lessons', 'get-function-actions'],
    'integration': ['vsco-workspace', 'vsco-webhook-handler', 'create-suite-quote', 'stripe-payment-webhook', 'vercel-ecosystem-api', 'vercel-manager', 'hume-access-token', 'hume-tts', 'hume-expression-measurement', 'google-gmail', 'google-drive', 'google-sheets', 'google-calendar', 'google-cloud-auth'],
    'mining': ['mining-proxy', 'mobile-miner-config', 'mobile-miner-register', 'mobile-miner-script', 'aggregate-device-metrics', 'monitor-device-connections', 'validate-pop-event'],
    'business': ['identify-service-interest', 'qualify-lead', 'process-license-application', 'generate-stripe-link', 'service-monetization-engine', 'usage-monitor', 'convert-session-to-user', 'correlate-user-identity'],
    'knowledge': ['knowledge-manager', 'extract-knowledge', 'vectorize-memory', 'get-embedding', 'system-knowledge-builder', 'summarize-conversation'],
    'python': ['python-executor', 'python-db-bridge', 'python-network-proxy', 'eliza-python-runtime', 'enhanced-learning', 'predictive-analytics'],
    'autonomous': ['autonomous-code-fixer', 'autonomous-decision-maker', 'code-monitor-daemon', 'gemini-agent-creator', 'agent-deployment-coordinator', 'self-optimizing-agent-architecture'],
    'superduper': ['superduper-router', 'superduper-integration', 'superduper-business-growth', 'superduper-code-architect', 'superduper-communication-outreach', 'superduper-content-media', 'superduper-design-brand', 'superduper-development-coach', 'superduper-domain-experts', 'superduper-finance-investment', 'superduper-research-intelligence', 'superduper-social-viral'],
    'mcp': ['xmrt-mcp-server', 'uspto-patent-mcp']
  };

  for (const [category, functions] of Object.entries(categories)) {
    if (functions.includes(functionName)) {
      return category;
    }
  }

  return 'general';
}

/**
 * Log edge function usage directly to eliza_function_usage table
 */
async function logEdgeFunctionUsage(entry: UsageLogEntry): Promise<void> {
  try {
    const supabase = getLoggingClient();
    if (!supabase) return;

    const { error } = await supabase
      .from('eliza_function_usage')
      .insert({
        function_name: entry.function_name,
        executive_name: entry.executive_name,
        success: entry.success,
        execution_time_ms: entry.execution_time_ms,
        error_message: entry.error_message,
        parameters: entry.parameters || {},
        result_summary: entry.result_summary,
        execution_source: entry.execution_source || 'api',
        metadata: {
          provider: entry.provider,
          model: entry.model,
          tool_calls: entry.tool_calls,
          fallback: entry.fallback,
          status_code: entry.status_code,
          logged_at: new Date().toISOString()
        },
        tool_category: categorizeFunction(entry.function_name),
        deployment_version: new Date().toISOString().split('T')[0]
      });

    if (error) {
      console.error(`⚠️ Failed to log usage for ${entry.function_name}:`, error.message);
    } else {
      console.log(`📊 Logged usage: ${entry.function_name} [${entry.execution_source || 'api'}] (${entry.success ? 'success' : 'failure'})`);
    }
  } catch (e) {
    console.error('❌ Usage logging exception:', e);
  }
}

/**
 * Usage tracker class
 */
class UsageTracker {
  private functionName: string;
  private executiveName?: string;
  private startTime: number;
  private parameters?: any;
  private executionSource: ExecutionSource;

  constructor(functionName: string, executiveName?: string, parameters?: any, executionSource: ExecutionSource = 'api') {
    this.functionName = functionName;
    this.executiveName = executiveName;
    this.startTime = Date.now();
    this.parameters = parameters;
    this.executionSource = executionSource;
  }

  setExecutionSource(source: ExecutionSource): void {
    this.executionSource = source;
  }

  async success(details?: {
    result_summary?: string;
    provider?: string;
    model?: string;
    tool_calls?: number;
    fallback?: string;
  }): Promise<void> {
    await logEdgeFunctionUsage({
      function_name: this.functionName,
      executive_name: this.executiveName,
      success: true,
      execution_time_ms: Date.now() - this.startTime,
      parameters: this.parameters,
      execution_source: this.executionSource,
      ...details
    });
  }

  async failure(error_message: string, status_code?: number): Promise<void> {
    await logEdgeFunctionUsage({
      function_name: this.functionName,
      executive_name: this.executiveName,
      success: false,
      execution_time_ms: Date.now() - this.startTime,
      error_message,
      parameters: this.parameters,
      execution_source: this.executionSource,
      status_code
    });
  }
}

/**
 * Create a usage tracker with request-based source detection
 */
function startUsageTrackingWithRequest(
  functionName: string,
  req: Request,
  body?: any,
  executiveName?: string
): UsageTracker {
  const executionSource = detectExecutionSource(req, body);
  return new UsageTracker(functionName, executiveName, body, executionSource);
}

// ============= GOOGLE AUTH HELPER (CORRECT IMPLEMENTATION) =============

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-executive-name, x-source',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

/**
 * Get refresh token from database oauth_connections table
 */
async function getRefreshTokenFromDatabase(): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials for database lookup');
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the most recent active Google Cloud connection
    const { data, error } = await supabase
      .from('oauth_connections')
      .select('refresh_token')
      .eq('provider', 'google_cloud')
      .eq('is_active', true)
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('❌ Error fetching refresh token from database:', error);
      return null;
    }

    if (data?.refresh_token) {
      console.log('✅ Found refresh token in oauth_connections table');
      return data.refresh_token;
    }

    console.log('⚠️ No active Google Cloud connection found in database');
    return null;
  } catch (err) {
    console.error('❌ Exception fetching refresh token:', err);
    return null;
  }
}

/**
 * Get a fresh access token using the stored refresh token
 * First checks environment variable, then falls back to database
 * Returns null if credentials are not configured
 */
async function getGoogleAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  // First try environment variables (check both naming conventions)
  let refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN') || Deno.env.get('GMAIL_REFRESH_TOKEN');

  // If not in env, fetch from oauth_connections table
  if (!refreshToken) {
    console.log('🔍 GOOGLE_REFRESH_TOKEN not in env, checking database...');
    refreshToken = await getRefreshTokenFromDatabase();
  }

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('❌ Missing Google OAuth credentials:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasRefreshToken: !!refreshToken,
      source: Deno.env.get('GOOGLE_REFRESH_TOKEN') ? 'env' : (refreshToken ? 'database' : 'none')
    });
    return null;
  }

  console.log('🔄 Refreshing Google access token...');

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    const responseText = await tokenResponse.text();
    
    if (!tokenResponse.ok) {
      console.error('❌ Token refresh failed:', responseText);
      return null;
    }

    const tokens: TokenResponse = JSON.parse(responseText);
    console.log('✅ Successfully obtained Google access token');
    console.log(`   Expires in: ${tokens.expires_in} seconds`);
    return tokens.access_token;
  } catch (error) {
    console.error('❌ Error during token refresh:', error);
    return null;
  }
}

/**
 * Check if Google Cloud credentials are configured
 * Checks both environment variables and database
 */
async function isGoogleConfigured(): Promise<boolean> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  const hasClientCredentials = !!(clientId && clientSecret);

  if (!hasClientCredentials) {
    console.log('⚠️ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    return false;
  }

  // Check env first (both naming conventions)
  if (Deno.env.get('GOOGLE_REFRESH_TOKEN') || Deno.env.get('GMAIL_REFRESH_TOKEN')) {
    console.log('✅ Google configured via environment variables');
    return true;
  }

  // Check database for refresh token
  const dbToken = await getRefreshTokenFromDatabase();
  if (dbToken) {
    console.log('✅ Google configured via database oauth_connections');
    return true;
  }

  console.log('❌ No refresh token found in env or database');
  return false;
}

// ============= GMAIL FUNCTION CONSTANTS =============

const FUNCTION_NAME = 'google-gmail';
const GMAIL_API_URL = 'https://gmail.googleapis.com/gmail/v1';

// ============= TYPES =============

interface InlineImage {
  cid: string;
  data: string;
  mimeType: string;
}

interface VideoEmbed {
  url: string;
  thumbnailUrl?: string;
  title?: string;
}

// ============= MIME BUILDER =============

function makeBoundary(): string {
  return `boundary_${crypto.randomUUID().replace(/-/g, '')}`;
}

function toBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function wrapBase64(data: string): string {
  return data.replace(/(.{76})/g, '$1\r\n');
}

function buildVideoBlock(video: VideoEmbed): string {
  const title = video.title ?? 'Click to play video';
  if (video.thumbnailUrl) {
    return `
<table align="center" cellpadding="0" cellspacing="0" style="margin:20px auto;border-radius:8px;overflow:hidden;max-width:560px;">
  <tr>
    <td style="position:relative;">
      <a href="${video.url}" target="_blank" style="display:block;text-decoration:none;">
        <img src="${video.thumbnailUrl}" alt="${title}"
             style="display:block;width:100%;max-width:560px;border:0;" />
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                    width:72px;height:72px;border-radius:50%;
                    background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;">
          <div style="width:0;height:0;border-style:solid;border-width:18px 0 18px 36px;
                      border-color:transparent transparent transparent #ffffff;margin-left:6px;"></div>
        </div>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center"
        style="background:#f4f4f4;padding:10px 16px;font-family:Arial,sans-serif;font-size:14px;color:#555;">
      <a href="${video.url}" target="_blank" style="color:#0077cc;text-decoration:none;">▶ ${title}</a>
    </td>
  </tr>
</table>`;
  }

  return `
<table align="center" cellpadding="0" cellspacing="0" style="margin:20px auto;">
  <tr>
    <td align="center" style="border-radius:6px;background:#0077cc;">
      <a href="${video.url}" target="_blank"
         style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;
                font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">
        ▶ ${title}
      </a>
    </td>
  </tr>
</table>`;
}

function buildMimeMessage(
  to: string,
  subject: string,
  body: string,
  options: {
    isHtml?: boolean;
    images?: InlineImage[];
    video?: VideoEmbed;
    plainFallback?: string;
    cc?: string;
  } = {}
): string {
  const { isHtml = false, images = [], video, cc } = options;
  const needsMultipart = images.length > 0;
  const needsHtml = isHtml || !!video || needsMultipart;

  if (!needsHtml) {
    const msg = [
      `To: ${to}`,
      ...(cc ? [`Cc: ${cc}`] : []),
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      body
    ].join('\r\n');
    return toBase64Url(msg);
  }

  let htmlBody = body;
  if (video) {
    htmlBody += buildVideoBlock(video);
  }

  if (!needsMultipart) {
    const htmlEncoded = wrapBase64(btoa(unescape(encodeURIComponent(htmlBody))));
    const msg = [
      `To: ${to}`,
      ...(cc ? [`Cc: ${cc}`] : []),
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      htmlEncoded
    ].join('\r\n');
    return toBase64Url(msg);
  }

  const boundaryRelated = makeBoundary();

  const lines: string[] = [];

  lines.push(`To: ${to}`);
  if (cc) lines.push(`Cc: ${cc}`);
  lines.push(`Subject: ${subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: multipart/related; boundary="${boundaryRelated}"`);
  lines.push('');

  if (images.length > 0) {
    lines.push(`--${boundaryRelated}`);
    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(wrapBase64(btoa(unescape(encodeURIComponent(htmlBody)))));

    for (const img of images) {
      lines.push(`--${boundaryRelated}`);
      lines.push(`Content-Type: ${img.mimeType}; name="${img.cid}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push(`Content-Disposition: inline; filename="${img.cid}"`);
      lines.push(`Content-ID: <${img.cid}>`);
      lines.push('X-Attachment-Id: ' + img.cid);
      lines.push('');
      lines.push(wrapBase64(img.data));
    }

    lines.push(`--${boundaryRelated}--`);
  }

  const rawMessage = lines.join('\r\n');
  return toBase64Url(rawMessage);
}

// ============= GMAIL ACTIONS =============

async function sendEmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  isHtml = false,
  images: InlineImage[] = [],
  video?: VideoEmbed,
  cc?: string
) {
  const encodedMessage = buildMimeMessage(to, subject, body, { isHtml, images, video, cc });

  const response = await fetch(`${GMAIL_API_URL}/users/me/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodedMessage })
  });

  return response.json();
}

async function listEmails(accessToken: string, query = '', maxResults = 20) {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (query) params.set('q', query);

  const response = await fetch(`${GMAIL_API_URL}/users/me/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const data = await response.json();
  if (!data.messages) return { messages: [], count: 0 };

  const previews = await Promise.all(
    data.messages.slice(0, 5).map(async (msg: any) => {
      const detailResponse = await fetch(`${GMAIL_API_URL}/users/me/messages/${msg.id}?format=metadata`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const detail = await detailResponse.json();
      const headers = detail.payload?.headers || [];
      return {
        id: msg.id,
        threadId: msg.threadId,
        subject: headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)',
        from: headers.find((h: any) => h.name === 'From')?.value || 'unknown',
        date: headers.find((h: any) => h.name === 'Date')?.value || ''
      };
    })
  );

  return { messages: previews, total: data.resultSizeEstimate || data.messages.length };
}

async function modifyMessage(accessToken: string, messageId: string, addLabelIds: string[] = [], removeLabelIds: string[] = []) {
  const response = await fetch(`${GMAIL_API_URL}/users/me/messages/${messageId}/modify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      addLabelIds,
      removeLabelIds
    })
  });
  return response.json();
}

async function getEmail(accessToken: string, messageId: string) {
  console.log(`🔍 Fetching email with ID: ${messageId}`);
  
  if (!messageId || typeof messageId !== 'string') {
    throw new Error(`Invalid message ID: ${messageId} - must be a non-empty string`);
  }
  
  const cleanMessageId = messageId.trim();
  
  if (cleanMessageId !== messageId) {
    console.log(`⚠️ Message ID had whitespace, cleaned from "${messageId}" to "${cleanMessageId}"`);
  }
  
  try {
    const url = `${GMAIL_API_URL}/users/me/messages/${encodeURIComponent(cleanMessageId)}?format=full`;
    console.log(`📡 Gmail API URL: ${url}`);
    
    const response = await fetch(url, {
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const responseText = await response.text();
    console.log(`📥 Gmail API response status: ${response.status}`);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error(`❌ Failed to parse Gmail API response as JSON:`, responseText.substring(0, 200));
      throw new Error(`Invalid JSON response from Gmail API: ${response.status}`);
    }

    if (!response.ok) {
      console.error(`❌ Gmail API error:`, data);
      
      const errorMessage = data.error?.message || data.error || `HTTP ${response.status}`;
      
      if (response.status === 404) {
        throw new Error(`Message not found with ID: ${cleanMessageId}. It may have been deleted or moved.`);
      } else if (response.status === 400 && errorMessage.includes('Invalid id')) {
        throw new Error(`Invalid message ID format: "${cleanMessageId}". Gmail API expects a valid message ID.`);
      } else if (response.status === 401 || response.status === 403) {
        throw new Error(`Authentication failed. Token may be expired or lacks required permissions for 'format=full'.`);
      }
      
      throw new Error(`Gmail API error: ${errorMessage}`);
    }

    console.log(`✅ Successfully retrieved email ${cleanMessageId}`);
    return data;
  } catch (error) {
    console.error(`❌ Error in get_email for ID ${messageId}:`, error);
    throw error;
  }
}

async function createDraft(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  isHtml = false,
  images: InlineImage[] = [],
  video?: VideoEmbed,
  cc?: string
) {
  const encodedMessage = buildMimeMessage(to, subject, body, { isHtml, images, video, cc });

  const response = await fetch(`${GMAIL_API_URL}/users/me/drafts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: { raw: encodedMessage } })
  });

  return response.json();
}

// ============= HANDLER =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let body: any = {};
  let usageTracker: UsageTracker;

  try {
    body = await req.json();
    usageTracker = startUsageTrackingWithRequest(FUNCTION_NAME, req, body);
  } catch (e) {
    usageTracker = startUsageTrackingWithRequest(FUNCTION_NAME, req, {});
    body = {};
  }

  try {
    if (!(await isGoogleConfigured())) {
      await usageTracker.failure('Google Cloud not configured - no refresh token found', 401);
      return new Response(JSON.stringify({
        success: false,
        error: 'Google Cloud not configured',
        credential_required: true,
        message: 'Please configure Google OAuth credentials. The system attempted to find a refresh token in environment variables (GOOGLE_REFRESH_TOKEN or GMAIL_REFRESH_TOKEN) or in the oauth_connections table with provider = "google_cloud" and is_active = true.'
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const action = body.action;
    console.log(`📧 google-gmail: action=${action}`);

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      await usageTracker.failure('Failed to get access token', 401);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to get access token',
        credential_required: true,
        message: 'Unable to obtain a valid Google access token. This could be due to an expired refresh token or invalid credentials.'
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let result;

    switch (action) {
      case 'send_email':
        result = await sendEmail(
          accessToken,
          body.to,
          body.subject,
          body.body,
          body.is_html ?? false,
          body.images ?? [],
          body.video,
          body.cc
        );
        break;

      case 'list_emails':
        result = await listEmails(accessToken, body.query, body.max_results);
        break;

      case 'get_email':
        result = await getEmail(accessToken, body.message_id);
        break;

      case 'create_draft':
        result = await createDraft(
          accessToken,
          body.to,
          body.subject,
          body.body,
          body.is_html ?? false,
          body.images ?? [],
          body.video,
          body.cc
        );
        break;

      case 'modify_message':
        result = await modifyMessage(
          accessToken,
          body.message_id,
          body.add_labels ?? [],
          body.remove_labels ?? []
        );
        break;

      case 'list_actions':
        result = {
          service: 'google-gmail',
          actions: [
            {
              name: 'send_email',
              params: [
                'to',
                'subject',
                'body',
                'is_html?',
                'images? [{cid, data (base64), mimeType}]',
                'video? {url, thumbnailUrl?, title?}',
                'cc?'
              ],
              description: 'Send an email. Supports plain text, HTML, inline embedded images (via CID), and video thumbnail blocks.'
            },
            {
              name: 'list_emails',
              params: ['query?', 'max_results?'],
              description: 'List emails with optional search. Returns preview of first 5 messages with IDs you can use for get_email.'
            },
            {
              name: 'get_email',
              params: ['message_id'],
              description: 'Get full email content including body, attachments, and headers. Use message IDs from list_emails.'
            },
            {
              name: 'create_draft',
              params: [
                'to',
                'subject',
                'body',
                'is_html?',
                'images? [{cid, data (base64), mimeType}]',
                'video? {url, thumbnailUrl?, title?}',
                'cc?'
              ],
              description: 'Create an email draft. Supports the same rich media options as send_email.'
            },
            {
              name: 'modify_message',
              params: ['message_id', 'add_labels?', 'remove_labels?'],
              description: 'Add or remove labels from a message (e.g., mark as read/unread, add to inbox/archive)'
            }
          ]
        };
        break;

      default:
        await usageTracker.failure(`Unknown action: ${action}`, 400);
        return new Response(JSON.stringify({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: ['send_email', 'list_emails', 'get_email', 'create_draft', 'modify_message', 'list_actions']
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await usageTracker.success({ result_summary: `${action} completed` });
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ google-gmail error:', error);
    
    const errorMessage = error.message || 'Unknown error occurred';
    const statusCode = error.status || 500;
    
    await usageTracker.failure(errorMessage, statusCode);
    
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      details: {
        action: body.action,
        message_id: body.message_id
      }
    }), { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
