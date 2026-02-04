// xmrt_integration Edge Function
// Routes:
// - GET /xmrt_integration/repos?prefix=xmrt
// - GET /xmrt_integration/repo/:name/files?path=...
// - POST /xmrt_integration/webhook (optional, accepts unsigned payloads unless secret added)
// Guidelines: Uses Deno.serve, Web APIs only, no external deps.

const GITHUB_OWNER = 'DevGruGold'
const DEFAULT_PREFIX = 'xmrt'

interface Repo {
  name: string
  full_name: string
  private: boolean
  html_url: string
  description: string | null
  archived: boolean
}

async function githubRequest(path: string, init?: RequestInit) {
  const url = new URL(`https://api.github.com${path}`)
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('User-Agent', 'supabase-edge-fn-xmrt-integration')
  // No token required for public repos; if rate-limited, you can add GITHUB_TOKEN as a secret.
  // const token = Deno.env.get('GITHUB_TOKEN')
  // if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(url, { ...init, headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Response(JSON.stringify({ error: 'github_error', status: res.status, details: text }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return res
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
    ...init,
  })
}

function notFound(message = 'Not found') {
  return json({ error: 'not_found', message }, { status: 404 })
}

function badRequest(message: string) {
  return json({ error: 'bad_request', message }, { status: 400 })
}

function methodNotAllowed(method: string) {
  return json({ error: 'method_not_allowed', method }, { status: 405 })
}

async function listRepos(prefix: string) {
  // GitHub API: List user repos (public)
  // Paginate if needed; fetch up to 100 per page
  const per_page = 100
  let page = 1
  const repos: Repo[] = []
  while (true) {
    const res = await githubRequest(`/users/${GITHUB_OWNER}/repos?per_page=${per_page}&page=${page}&type=all&sort=updated`)
    const chunk = (await res.json()) as Repo[]
    if (!Array.isArray(chunk) || chunk.length === 0) break
    repos.push(...chunk)
    if (chunk.length < per_page) break
    page += 1
    if (page > 10) break // safety cap
  }
  const filtered = repos.filter(r => r.name.toLowerCase().startsWith(prefix.toLowerCase()))
  return filtered.map(r => ({
    name: r.name,
    full_name: r.full_name,
    private: r.private,
    html_url: r.html_url,
    description: r.description,
    archived: r.archived,
  }))
}

async function getRepoFile(repo: string, path: string) {
  // Use GitHub contents API
  const res = await githubRequest(`/repos/${GITHUB_OWNER}/${repo}/contents/${encodeURIComponent(path)}`)
  const data = await res.json()
  return data
}

async function handleGetRepos(req: Request) {
  const url = new URL(req.url)
  const prefix = url.searchParams.get('prefix') || DEFAULT_PREFIX
  const repos = await listRepos(prefix)
  return json({ owner: GITHUB_OWNER, prefix, count: repos.length, repos })
}

async function handleGetRepoFiles(req: Request, repo: string) {
  const url = new URL(req.url)
  const path = url.searchParams.get('path')
  if (!path) return badRequest('Missing path parameter')
  const data = await getRepoFile(repo, path)
  return json({ repo, path, data })
}

async function handleWebhook(req: Request) {
  if (req.method !== 'POST') return methodNotAllowed(req.method)
  // For public repos and demo purposes, accept unsigned payloads.
  // You can set GITHUB_WEBHOOK_SECRET and implement HMAC verification later.
  const event = req.headers.get('X-GitHub-Event') || 'unknown'
  const payload = await req.json().catch(() => ({}))
  // No-op processing; echo back
  return json({ received: true, event, payload })
}

console.info('xmrt_integration function started')
Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url)
    const { pathname } = url

    // Normalize trailing slashes
    let path = pathname.replace(/\/$/, '')

    // Routes must be prefixed with /xmrt_integration
    if (!path.startsWith('/xmrt_integration')) return notFound('Route must start with /xmrt_integration')

    // Route: GET /xmrt_integration/repos
    if (req.method === 'GET' && path === '/xmrt_integration/repos') {
      return await handleGetRepos(req)
    }

    // Route: GET /xmrt_integration/repo/:name/files
    const filesMatch = path.match(/^\/xmrt_integration\/repo\/([^/]+)\/files$/)
    if (req.method === 'GET' && filesMatch) {
      const repo = decodeURIComponent(filesMatch[1])
      return await handleGetRepoFiles(req, repo)
    }

    // Route: POST /xmrt_integration/webhook
    if (path === '/xmrt_integration/webhook') {
      return await handleWebhook(req)
    }

    return notFound()
  } catch (err) {
    if (err instanceof Response) return err
    console.error('Unhandled error', err)
    return json({ error: 'internal_error' }, { status: 500 })
  }
})