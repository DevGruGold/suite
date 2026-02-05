const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = 'c:\\Users\\PureTrek\\Desktop\\DevGruGold\\suite\\.env';
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        let cleanValue = value.trim();
        if (cleanValue.startsWith('"') && cleanValue.endsWith('"')) {
            cleanValue = cleanValue.slice(1, -1);
        }
        env[key.trim()] = cleanValue;
    }
});

const supabaseUrl = env['SUPABASE_URL'] || env['VITE_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['VITE_SUPABASE_PUBLISHABLE_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function auditAgents() {
    console.log('--- Auditing Agents ---');

    // 1. Named Agents (agents table)
    const { data: namedAgents, error: agentsError } = await supabase.from('agents').select('*');
    if (agentsError) console.error('Error fetching agents:', agentsError.message);
    else {
        console.log(`\nNamed Agents (Count: ${namedAgents.length}):`);
        console.table(namedAgents.map(a => ({ id: a.id, name: a.name, role: a.role, status: a.status })));
    }

    // 2. SuperDuper Specialists (superduper_agents table)
    const { data: specialists, error: sdError } = await supabase.from('superduper_agents').select('*');
    if (sdError) console.error('Error fetching superduper_agents:', sdError.message);
    else {
        console.log(`\nSuperDuper Specialists (Count: ${specialists.length}):`);
        console.table(specialists.map(a => ({ name: a.agent_name, display: a.display_name, edge_fn: a.edge_function_name })));
    }

    // 3. Check for Executives (users table with specific roles? or just hardcoded?)
    // This part is heuristic, checking checking 'users' or 'user_roles' if allowed, otherwise we assume code-driven.
    // We'll skip users table for privacy/permissions unless specifically needed, relying on codebase analysis for Execs.
}

auditAgents();
