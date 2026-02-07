import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

async function logActivity(
  activity_type: string,
  description: string,
  metadata: any = {},
  status: string = "completed"
) {
  await supabase.from("eliza_activity_log").insert({
    activity_type,
    description,
    metadata,
    status,
    created_at: new Date().toISOString(),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const { function_name, payload } = await req.json();

    if (!function_name) {
      return new Response(
        JSON.stringify({ error: "function_name is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    await logActivity(
      "mcp_invocation",
      `📡 MCP invoking: ${function_name}`,
      {
        function_name,
        payload_preview: JSON.stringify(payload).substring(0, 200),
      },
      "in_progress"
    );

    // Call the target edge function
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/${function_name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(payload || {}),
      }
    );

    const result = await response.json();

    await logActivity(
      "mcp_invocation",
      response.ok
        ? `✅ MCP success: ${function_name}`
        : `❌ MCP failed: ${function_name}`,
      {
        function_name,
        success: response.ok,
        status: response.status,
        result_preview: JSON.stringify(result).substring(0, 200),
      },
      response.ok ? "completed" : "failed"
    );

    return new Response(
      JSON.stringify({
        success: response.ok,
        status: response.status,
        function_name,
        result,
      }),
      {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    await logActivity(
      "mcp_invocation",
      `❌ MCP error: ${error.message}`,
      { error: error.message, stack: error.stack },
      "failed"
    );

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
