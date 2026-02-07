
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://vawouugtzwmejxqkeqqj.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY is required");
    Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function seedAgents() {
    console.log("🌱 Seeding essential agents...");

    const agentsToSeed = [
        { name: 'Antigravity', role: 'system_admin', status: 'IDLE', current_workload: 0, max_concurrent_tasks: 10 },
        { name: 'Eliza', role: 'orchestrator', status: 'IDLE', current_workload: 0, max_concurrent_tasks: 10 }
    ];

    for (const agent of agentsToSeed) {
        // Check if exists
        const { data: existing } = await supabase
            .from('agents')
            .select('id')
            .eq('name', agent.name)
            .single();

        if (!existing) {
            console.log(`   Creating agent: ${agent.name}...`);
            const { error } = await supabase.from('agents').insert(agent);
            if (error) {
                console.error(`❌ Failed to create ${agent.name}:`, error.message);
            } else {
                console.log(`✅ Created ${agent.name}`);
            }
        } else {
            console.log(`   Agent ${agent.name} already exists.`);
        }
    }
}

seedAgents();
