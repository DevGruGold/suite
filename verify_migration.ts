
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY');

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing env vars");
    Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifyMigration() {
    console.log('Testing superduper_execution_log schema...');

    // 1. Create a dummy task to link to
    const taskId = crypto.randomUUID();
    const { error: taskError } = await supabase.from('tasks').insert({
        id: taskId,
        title: 'Migration Verification Task',
        status: 'PENDING',
        assigned_agent_id: 'test-agent'
    });

    if (taskError) {
        console.error('Failed to create test task:', taskError);
        return;
    }
    console.log('Test task created:', taskId);

    // 2. Try to insert a log with task_id
    const { data, error } = await supabase.from('superduper_execution_log').insert({
        agent_id: 'test-agent',
        task_id: taskId,
        action: 'test_migration',
        status: 'info',
        result: { msg: 'Schema check' }
    }).select();

    if (error) {
        console.error('Migration verification FAILED:', error);
    } else {
        console.log('Migration verification PASSED. Log inserted with task_id:', data);
    }
}

verifyMigration();
