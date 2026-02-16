const fs = require('fs');
const path = require('path');

const MIGRATION_FILE = path.join(__dirname, '../supabase/migrations/20260212000001_add_workflow_templates.sql');
const FUNCTION_URL = "https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/admin-db-tool";

async function main() {
    try {
        const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
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
            process.exit(1);
        }
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

main();
