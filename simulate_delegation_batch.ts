
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.2";

// Define the 3 tasks requested by user
const TASKS = [
    {
        role: 'social-viral',
        description: 'Create a viral tweet about our new 1.8K execution milestone. Make it punchy and use emojis.'
    },
    {
        role: 'code-architect',
        description: 'Design a scalable database schema for the new user loyalty system. Include points, tiers, and rewards.'
    },
    {
        role: 'finance-investment',
        description: 'Analyze the ROI of adding a new Nvidia H100 server for local inference vs renting cloud GPUs.'
    }
];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY');

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing env vars");
    Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function delegateTasks() {
    console.log(`Starting Batch Delegation of ${TASKS.length} tasks...`);

    for (const task of TASKS) {
        console.log(`\n--------------------------------------------`);
        console.log(`Delegating to [${task.role}]: "${task.description}"`);

        // Map friendly role to function name (logic duplicated from toolExecutor for simulation)
        const agentMap = {
            'social-viral': 'superduper-social-viral',
            'code-architect': 'superduper-code-architect',
            'finance-investment': 'superduper-finance-investment'
        };
        const functionName = agentMap[task.role];

        console.log(`> Invoking Edge Function: ${functionName}`);

        try {
            // Simulate the call that toolExecutor makes
            const { data, error } = await supabase.functions.invoke(functionName, {
                body: {
                    action: 'process_task',
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
                console.log(JSON.stringify(data.data?.result || data, null, 2));
            }
        } catch (e) {
            console.error(`> EXCEPTION:`, e);
        }
    }
    console.log(`\n--------------------------------------------`);
    console.log("Batch Delegation Complete.");
}

delegateTasks();
