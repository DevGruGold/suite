import { join } from "https://deno.land/std@0.168.0/path/mod.ts";

const MIGRATION_FILE = "supabase/migrations/20260212000001_add_workflow_templates.sql";
const FUNCTION_URL = "https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/admin-db-tool";

async function main() {
    const sql = await Deno.readTextFile(MIGRATION_FILE);
    console.log(`Read migration file: ${sql.length} bytes`);

    console.log("Sending to admin-db-tool...");
    const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql }),
    });

    const text = await response.text();
    console.log(`Response status: ${response.status}`);
    console.log(`Response body: ${text}`);

    if (response.ok) {
        console.log("✅ Migration applied successfully!");
    } else {
        console.error("❌ Migration failed!");
        Deno.exit(1);
    }
}

main();
