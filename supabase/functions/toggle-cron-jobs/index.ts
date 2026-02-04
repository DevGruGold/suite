// supabase/functions/toggle-cron-jobs/index.ts
// Assumptions:
// - Runs with SUPABASE_SERVICE_ROLE_KEY for elevated DB access.
// - Uses Postgres connection via PostgREST RPC to a SQL function we create here inline via a one-time bootstrap.
// - Because pg_cron tables require superuser in Supabase, we use the internal PostgREST role with service key to call a SECURITY DEFINER function owned by postgres that performs the updates.
// Limitations:
// - First request will attempt to create helper SQL function if missing; subsequent calls reuse it.
// - All routes are prefixed with /toggle-cron-jobs per Supabase Edge routing.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
for (const k of requiredEnv) {
  if (!Deno.env.get(k)) {
    console.error(`Missing env: ${k}`);
  }
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// SQL helpers
const ensureFnSQL = `
create schema if not exists util;

create or replace function util.toggle_pg_cron_jobs(jobnames text[], enable boolean default false)
returns table(jobid bigint, jobname text, active boolean)
language plpgsql
security definer
as $$
begin
  -- Only allow service role to execute
  if current_user <> 'service_role' then
    raise exception 'unauthorized';
  end if;

  return query
  update cron.job j
     set active = enable
   where j.jobname = any(jobnames)
  returning j.jobid, j.jobname, j.active;
end;
$$;

revoke all on function util.toggle_pg_cron_jobs(text[], boolean) from public, anon, authenticated;
grant execute on function util.toggle_pg_cron_jobs(text[], boolean) to service_role;
`;

async function bootstrap() {
  // Use SQL over REST to create helper function
  const { error } = await supabase.rpc("_", {} as any, {
    // @ts-ignore: postgrest allows /sql endpoint via rest
    // We call the SQL endpoint via fetch because supabase-js doesn't expose it directly.
  });
  // Fallback to direct HTTP to /rest/v1/rpc? or use /sql endpoint which isn't public.
  // Instead we will attempt creating via pg net extension call.
}

async function execSQL(sql: string) {
  const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    },
    body: JSON.stringify({ sql }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`exec_sql failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

async function ensureHelper() {
  try {
    await execSQL(ensureFnSQL);
  } catch (e) {
    // If exec_sql function doesn't exist, create it using pg_net wrapper.
    // Create minimal exec_sql function via SECURITY DEFINER to run arbitrary SQL is unsafe,
    // so we strictly create only our target helper if exec_sql is unavailable.
    console.error("ensureHelper error:", e);
    throw e;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/toggle-cron-jobs")) {
    return new Response("Not found", { status: 404 });
  }

  try {
    if (req.method === "POST" && url.pathname === "/toggle-cron-jobs/bootstrap") {
      await ensureHelper();
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (req.method === "POST" && url.pathname === "/toggle-cron-jobs/toggle") {
      const body = await req.json().catch(() => ({}));
      const jobnames: string[] = body.jobnames ?? [];
      const enable: boolean = body.enable ?? false;
      if (!Array.isArray(jobnames) || jobnames.length === 0) {
        return new Response(JSON.stringify({ error: "jobnames[] required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      // Ensure helper exists
      await ensureHelper();

      const { data, error } = await supabase.rpc("toggle_pg_cron_jobs", { jobnames, enable }, { head: false, count: "exact" });
      if (error) throw error;
      return new Response(JSON.stringify({ updated: data }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});