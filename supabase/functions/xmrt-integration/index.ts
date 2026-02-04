console.info('xmrt-integration public mode');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Connection': 'keep-alive',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  let body: unknown = null; try { body = await req.json(); } catch (_) {}
  return new Response(JSON.stringify({ ok: true, public: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
});