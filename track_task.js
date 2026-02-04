
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://vawouugtzwmejxqkeqqj.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3Njk3MTIsImV4cCI6MjA2ODM0NTcxMn0.qtZk3zk5RMqzlPNhxCkTM6fyVQX5ULGt7nna_XOUr00";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function trackTask() {
    console.log('Searching for recent tasks...');

    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }

    console.log('Recent Tasks Found:', tasks.length);
    tasks.forEach(t => {
        console.log(`Task [${t.id}] Status: ${t.status} | Assigned ID: ${t.assigned_agent_id} | Title: ${t.title}`);
    });

    if (tasks.length > 0) {
        // Find a task assigned to Echo/social-viral by checking metadata or ID
        const echoTask = tasks.find(t =>
            (t.assigned_agent_id && t.assigned_agent_id.includes('social')) ||
            (t.metadata && JSON.stringify(t.metadata).toLowerCase().includes('social'))
        ) || tasks[0];

        const taskId = echoTask.id;
        console.log(`\nChecking logs for Task ${taskId} (Assigned: ${echoTask.assigned_agent_id})...`);

        // Check superduper_execution_log - SELECT * to avoid explicit column error if possible, or try-catch
        try {
            const { data: logs, error: logError } = await supabase
                .from('superduper_execution_log')
                .select('*') // If this fails due to missing column in underlying query, we catch it
                .eq('agent_id', echoTask.assigned_agent_id || 'superduper-social-viral')
                //.eq('task_id', taskId) // Skip this as we know it fails
                .limit(5);

            if (logError) console.error('Error fetching logs (likely schema mismatch):', logError.message);
            else {
                if (logs.length === 0) console.log("No execution logs found for this agent.");
                else console.log('Execution Logs (Recent for Agent):', logs);
            }
        } catch (e) {
            console.error("Exception checking logs:", e);
        }
    }
}

trackTask();
