
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY');

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_KEY env vars");
    Deno.exit(1);
}

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
        console.log(`Task [${t.id}] Status: ${t.status} | Assigned: ${t.assigned_to}`);
        console.log(`   Desc: ${t.task_description?.substring(0, 50)}...`);
    });

    if (tasks.length > 0) {
        // Find a task assigned to Echo or social-viral if possible, else take the top one
        const echoTask = tasks.find(t =>
            (t.assigned_to && t.assigned_to.toLowerCase().includes('echo')) ||
            (t.assigned_to && t.assigned_to.toLowerCase().includes('social'))
        ) || tasks[0];

        const taskId = echoTask.id;
        console.log(`\nChecking logs for Task ${taskId} (Assigned: ${echoTask.assigned_to})...`);

        // Check superduper_execution_log
        const { data: logs, error: logError } = await supabase
            .from('superduper_execution_log')
            .select('*')
            .eq('task_id', taskId);

        if (logError) console.error('Error fetching logs:', logError);
        else {
            if (logs.length === 0) console.log("No execution logs found for this task yet.");
            else console.log('Execution Logs:', logs);
        }

        // Check eliza_activity_log for delegation events related to this task
        const { data: activity, error: activityError } = await supabase
            .from('eliza_activity_log')
            .select('*')
            .ilike('notes', `%${taskId}%`)
            .limit(5);

        if (activityError) console.error('Error fetching activity:', activityError);
        else {
            if (activity.length === 0) console.log("No activity logs found for this task ID.");
            else console.log('Activity Logs:', activity);
        }
    }
}

trackTask();
