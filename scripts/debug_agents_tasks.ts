
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase configuration");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectState() {
    console.log("--- AGENTS ---");
    const { data: agents, error: agentError } = await supabase
        .from('agents')
        .select('*');

    if (agentError) console.error(agentError);
    else console.table(agents?.map(a => ({ id: a.id, name: a.name, status: a.status, capabilities: a.capabilities })));

    console.log("\n--- RECENT PENDING TASKS ---");
    const { data: tasks, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false })
        .limit(10);

    if (taskError) console.error(taskError);
    else console.table(tasks?.map(t => ({ id: t.id, title: t.title, priority: t.priority, category: t.category })));

    console.log("\n--- RECENT ACTIVITY LOGS ---");
    const { data: logs, error: logError } = await supabase
        .from('eliza_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (logError) console.error(logError);
    else console.log(logs);
}

inspectState();
