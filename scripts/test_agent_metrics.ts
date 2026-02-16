
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Load .env as well for VITE keys
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase credentials in .env.local or .env');
    console.error('URL:', SUPABASE_URL);
    console.error('KEY:', SUPABASE_KEY ? '******' : 'MISSING');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function callAgentManager(action: string, data: any = {}) {
    const { data: result, error } = await supabase.functions.invoke('agent-manager', {
        body: { action, data }
    });

    if (error) {
        throw new Error(`Agent Manager Error: ${error.message}`);
    }

    if (!result.ok) {
        throw new Error(`Agent Manager Operation Failed: ${result.error}`);
    }

    return result.data;
}

async function runTest() {
    const testId = Date.now();
    const agentName = `MetricTestBot_${testId}`;

    console.log(`\n🚀 Starting Metrics Verification Test (${testId})`);

    try {
        // 1. Spawn Agent
        console.log(`\n1. Spawning Agent: ${agentName}...`);
        const agent = await callAgentManager('spawn_agent', {
            name: agentName,
            role: 'generic',
            spawned_by: 'test_script',
            rationale: 'Testing metrics collection'
        });
        console.log(`✅ Agent Created: ${agent.id}`);

        // 2. Assign Task
        console.log(`\n2. Assigning Task...`);
        const task = await callAgentManager('assign_task', {
            title: `Test Metric Task ${testId}`,
            description: 'A temporary task to verify metrics',
            category: 'code',
            assignee_agent_id: agent.id,
            priority: 1
        });
        console.log(`✅ Task Assigned: ${task.id}`);

        // 3. Complete Task
        console.log(`\n3. Completing Task...`);
        // Simulate some work time
        await new Promise(r => setTimeout(r, 1000));

        await callAgentManager('update_task_status', {
            task_id: task.id,
            status: 'COMPLETED',
            resolution_notes: 'Verified via test script',
            completion_data: {
                started_at: new Date(Date.now() - 5000).toISOString() // Fake start time 5s ago
            }
        });
        console.log(`✅ Task Completed`);

        // 4. Verify Metrics
        console.log(`\n4. Verifying Metrics...`);
        // Give a moment for async DB writes if any (though ours are awaited in edge function)
        await new Promise(r => setTimeout(r, 2000));

        const metrics = await callAgentManager('get_agent_metrics', {
            agent_id: agent.id
        });

        console.log('Metrics Response:', JSON.stringify(metrics, null, 2));

        const specializations = metrics.specializations;
        const recentActivity = metrics.recent_activity;

        // Checks
        const hasSpec = specializations.some((s: any) => s.specialization_area === 'code');
        const hasActivity = recentActivity.some((a: any) => a.metadata.task_id === task.id);

        if (hasSpec && hasActivity) {
            console.log(`\n✅ SUCCESS: Metrics verified!`);
            console.log(`- Specialization 'code' found: ${hasSpec}`);
            console.log(`- Activity log found: ${hasActivity}`);
        } else {
            console.error(`\n❌ FAILURE: Metrics missing.`);
            console.error(`- Specialization 'code' found: ${hasSpec}`);
            console.error(`- Activity log found: ${hasActivity}`);
            process.exit(1);
        }

        // Cleanup (Optional - keep for audit or delete?)
        // Converting agent to ARCHIVED to verify status update too
        await callAgentManager('update_agent_status', {
            agent_id: agent.id,
            status: 'ARCHIVED'
        });
        console.log(`\n🧹 Cleanup: Agent archived.`);

    } catch (error: any) {
        console.error('\n❌ TEST FAILED:', error.message);
        if (error.cause) console.error('Cause:', error.cause);
        process.exit(1);
    }
}

runTest();
