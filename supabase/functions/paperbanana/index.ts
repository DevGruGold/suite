
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.2";

const PAPERBANANA_API_URL = Deno.env.get("PAPERBANANA_API_URL");

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { action, ...payload } = await req.json();

        if (!PAPERBANANA_API_URL) {
            throw new Error("PAPERBANANA_API_URL is not configured");
        }

        let endpoint = "";
        if (action === "generate_diagram") {
            endpoint = "/generate";
        } else if (action === "generate_plot") {
            endpoint = "/plot";
        } else if (action === "evaluate_diagram") {
            endpoint = "/evaluate";
        } else {
            throw new Error(`Unknown action: ${action}`);
        }

        // Forward request to Python service
        const response = await fetch(`${PAPERBANANA_API_URL}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return new Response(JSON.stringify({ error: `PaperBanana Service Error: ${errorText}` }), {
                status: response.status,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const data = await response.json();

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
