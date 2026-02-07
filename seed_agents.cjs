
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = "https://vawouugtzwmejxqkeqqj.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY is required");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function seedAgents() {
    console.log("🌱 Seeding essential agents...");


    // Inspect enum values
    console.log("🔍 Inspecting 'agent_role' enum values...");
    // const { data: enumValues, error: enumError } = await supabase.rpc('get_enum_values', { enum_name: 'agent_role' });

    // Confirmed 'manager' exists from previous run output

    const agentsToSeed = [
        { id: crypto.randomUUID(), name: 'Antigravity', role: 'manager', status: 'IDLE', current_workload: 0, max_concurrent_tasks: 10 },
        { id: crypto.randomUUID(), name: 'Eliza', role: 'manager', status: 'IDLE', current_workload: 0, max_concurrent_tasks: 10 }
    ];

    for (const agent of agentsToSeed) {
        // Check if exists
        const { data: existing, error: fetchError } = await supabase
            .from('agents')
            .select('id')
            .eq('name', agent.name)
            .maybeSingle();

        if (fetchError) {
            console.error(`❌ Error checking ${agent.name}:`, fetchError.message);
            continue;
        }

        if (!existing) {
            console.log(`   Creating agent: ${agent.name} with role ${agent.role}...`);
            const { error } = await supabase.from('agents').insert(agent);
            if (error) {
                console.error(`❌ Failed to create ${agent.name} with role ${agent.role}:`, error.message);
            } else {
                console.log(`✅ Created ${agent.name} (ID: ${agent.id})`);
            }
        } else {
            console.log(`   Agent ${agent.name} already exists (ID: ${existing.id}).`);
        }
    }
}

seedAgents();
