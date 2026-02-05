
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://vawouugtzwmejxqkeqqj.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3Njk3MTIsImV4cCI6MjA2ODM0NTcxMn0.qtZk3zk5RMqzlPNhxCkTM6fyVQX5ULGt7nna_XOUr00";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifyMigration() {
    console.log('Testing superduper_execution_log schema...');

    // 1. Create a dummy task to link to
    // const taskId = crypto.randomUUID(); // Node 19+ or polyfill, let's use a simple string for demo or import crypto

    const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    const taskId = generateUUID();

    // Create task first to avoid foreign key violation
    const { error: taskError } = await supabase.from('tasks').insert({
        id: taskId,
        title: 'Migration Verification Task',
        status: 'PENDING',
        assignee_agent_id: 'test-agent'
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
        result: { msg: 'Schema check' },
        tool_usage: []
    }).select();

    if (error) {
        console.error('Migration verification FAILED:', error);
    } else {
        console.log('Migration verification PASSED. Log inserted with task_id:', data);
    }
}

verifyMigration();
