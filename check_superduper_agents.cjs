const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSuperDuperAgents() {
    console.log('Checking superduper_agents table...');
    const { data: agents, error } = await supabase
        .from('superduper_agents')
        .select('*');

    if (error) {
        console.error('Error fetching superduper_agents:', error);
        return;
    }

    console.log('Total SuperDuper agents found:', agents.length);
    console.table(agents.map(a => ({
        name: a.agent_name,
        display: a.display_name,
        edge_function: a.edge_function_name,
        status: a.status
    })));
}

checkSuperDuperAgents();
