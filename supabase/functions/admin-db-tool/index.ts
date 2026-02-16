import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { sql } = await req.json();
        if (!sql) throw new Error('Missing SQL');

        // Use SUPABASE_DB_URL if available, or construct from individual envs if needed
        // Supabase Edge Functions environment typically has SUPABASE_DB_URL
        const dbUrl = Deno.env.get('SUPABASE_DB_URL');
        if (!dbUrl) {
            throw new Error('SUPABASE_DB_URL not set');
        }

        const client = new Client(dbUrl);
        await client.connect();

        let result;
        try {
            result = await client.queryArray(sql);
        } finally {
            await client.end();
        }

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        return new Response(
            JSON.stringify({ error: err.message, stack: err.stack }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
