// validate-cross-repo-data
// Summarizes sync status, inconsistencies, and latency. GET returns summary; POST can trigger a no-op validation placeholder.
// Uses Web APIs and Deno. Assumes SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/ANON_KEY exist.

interface Summary {
  sync: {
    total: number
    latest_per_repo: Array<{ repo_name: string; last_sync_at: string; status: string; error_message: string | null }>
  }
  inconsistencies: {
    total_open: number
    by_severity: Array<{ severity: string; count: number }>
    latest: Array<{ id: string; category: string; severity: string; detected_at: string }>
  }
  latency: {
    recent_count: number
    p50_ms: number | null
    p95_ms: number | null
    latest: Array<{ repo_name: string; endpoint: string; latency_ms: number; status_code: number | null; measured_at: string }>
  }
}

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-store',
      ...init.headers,
    },
    status: init.status,
  })
}

function cors(res: Response) {
  const headers = new Headers(res.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'authorization,content-type')
  return new Response(res.body, { status: res.status, headers })
}

async function getClient(req: Request) {
  // Prefer service key if provided in Authorization for POST; otherwise anon for GET
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anonKey) throw new Error('Supabase environment not configured')

  // Lazy import to avoid cold start cost if OPTIONS
  const { createClient } = await import('npm:@supabase/supabase-js@2.45.4')

  const authHeader = req.headers.get('authorization') || ''
  const isService = authHeader.toLowerCase().startsWith('bearer ') && !!serviceKey && authHeader.slice(7) === serviceKey
  const key = isService && serviceKey ? serviceKey : anonKey
  const client = createClient(url, key, { auth: { persistSession: false } })
  return { client, isService }
}

async function fetchSummary(client: any): Promise<Summary> {
  // Latest per repo from sync_status
  const latestPerRepoSql = `
    with ranked as (
      select repo_name, last_sync_at, status, error_message,
             row_number() over (partition by repo_name order by last_sync_at desc) as rn
      from public.sync_status
    )
    select repo_name, last_sync_at, status, error_message
    from ranked where rn = 1
    order by last_sync_at desc nulls last
    limit 50;
  `

  const [{ data: syncLatest, error: syncLatestErr }, { count: inconsistenciesOpenCount, data: inconsistenciesOpenData, error: inconsistenciesOpenErr }, { data: inconsistenciesBySeverity, error: sevErr }, { data: latestIncons, error: latestInconsErr }, { data: latencyRecent, error: latencyErr }, { data: ptiles, error: ptilesErr }] = await Promise.all([
    client.rpc('exec_sql', { sql: latestPerRepoSql }).select(), // Will fall back if helper not available
    client.from('data_inconsistencies').select('id', { count: 'exact', head: true }).is('resolved_at', null),
    client.from('data_inconsistencies').select('severity, count:severity').is('resolved_at', null).group('severity'),
    client.from('data_inconsistencies').select('id, category, severity, detected_at').order('detected_at', { ascending: false }).limit(25),
    client.from('cross_repo_latency').select('repo_name, endpoint, latency_ms, status_code, measured_at').order('measured_at', { ascending: false }).limit(50),
    client.rpc('percentiles_cross_repo_latency')
  ])

  // Handle absence of helper RPCs gracefully
  let latestPerRepo: Array<{ repo_name: string; last_sync_at: string; status: string; error_message: string | null }> = []
  if (syncLatestErr) {
    // Fallback: naive selection (may include duplicates by repo)
    const { data, error } = await client.from('sync_status').select('repo_name, last_sync_at, status, error_message').order('last_sync_at', { ascending: false }).limit(50)
    if (!error && data) latestPerRepo = data
  } else if (syncLatest) {
    latestPerRepo = syncLatest
  }

  const p50 = ptiles?.p50 ?? null
  const p95 = ptiles?.p95 ?? null

  // Get totals for sync_status quickly
  const { count: syncTotal } = await client.from('sync_status').select('id', { count: 'exact', head: true })

  return {
    sync: {
      total: syncTotal ?? 0,
      latest_per_repo: latestPerRepo,
    },
    inconsistencies: {
      total_open: inconsistenciesOpenCount ?? 0,
      by_severity: (inconsistenciesBySeverity || []).map((r: any) => ({ severity: r.severity, count: Number(r.count) })),
      latest: latestIncons || [],
    },
    latency: {
      recent_count: (latencyRecent || []).length,
      p50_ms: p50,
      p95_ms: p95,
      latest: latencyRecent || [],
    },
  }
}

// Optional RPCs creation on first POST with service role
async function ensureHelpers(client: any) {
  // Create percentiles function if missing
  const percentilesSQL = `
    create or replace function public.percentiles_cross_repo_latency()
    returns table (p50 int, p95 int)
    language sql
    stable
    as $$
      select
        percentile_cont(0.5) within group (order by latency_ms)::int as p50,
        percentile_cont(0.95) within group (order by latency_ms)::int as p95
      from public.cross_repo_latency;
    $$;
    grant execute on function public.percentiles_cross_repo_latency() to anon, authenticated, service_role;
  `

  // Best-effort: attempt to create; ignore errors due to permissions.
  await client.rpc('exec_sql', { sql: percentilesSQL }).select().catch(() => {})
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return cors(new Response(null, { status: 204 }))
  }

  try {
    const { client, isService } = await getClient(req)

    if (req.method === 'GET') {
      const summary = await fetchSummary(client)
      return cors(json({ ok: true, summary }))
    }

    if (req.method === 'POST') {
      if (!isService) {
        return cors(json({ ok: false, error: 'Service role required' }, { status: 401 }))
      }
      // Ensure helpers and return refreshed summary
      await ensureHelpers(client)
      const summary = await fetchSummary(client)
      return cors(json({ ok: true, summary }))
    }

    return cors(json({ ok: false, error: 'Method not allowed' }, { status: 405 }))
  } catch (e) {
    return cors(json({ ok: false, error: (e as Error).message }, { status: 500 }))
  }
})