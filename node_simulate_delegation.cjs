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

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Define the 3 tasks requested by user
const TASKS = [
    {
        role: 'social-viral',
        description: 'Create a viral tweet about our new 1.8K execution milestone. Make it punchy and use emojis.',
        functionName: 'superduper-social-viral'
    },
    {
        role: 'code-architect',
        description: 'Design a scalable database schema for the new user loyalty system. Include points, tiers, and rewards.',
        functionName: 'superduper-code-architect'
    },
    {
        role: 'finance-investment',
        description: 'Analyze the ROI of adding a new Nvidia H100 server for local inference vs renting cloud GPUs.',
        functionName: 'superduper-finance-investment'
    }
];

async function delegateTasks() {
    console.log(`Starting Batch Delegation of ${TASKS.length} tasks...`);

    for (const task of TASKS) {
        console.log(`\n--------------------------------------------`);
        console.log(`Delegating to [${task.role}]: "${task.description}"`);

        console.log(`> Invoking Edge Function: ${task.functionName}`);

        try {
            // Simulate the call that toolExecutor makes
            const { data, error } = await supabase.functions.invoke(task.functionName, {
                body: {
                    action: 'process_task', // Matches superduperAgent.ts expectation
                    params: {
                        instruction: task.description,
                        context: { source: 'simulation_script' }
                    },
                    context: {
                        manager: 'BrowserSimulation',
                        delegated_at: new Date().toISOString()
                    }
                }
            });

            if (error) {
                console.error(`> FAILED to delegate:`, error);
            } else {
                console.log(`> SUCCESS. Agent Response:`);
                // The agent response structure
                const result = data.data?.result || data;
                console.log(JSON.stringify(result, null, 2));
            }
        } catch (e) {
            console.error(`> EXCEPTION:`, e);
        }
    }
    console.log(`\n--------------------------------------------`);
    console.log("Batch Delegation Complete.");
}

delegateTasks();
