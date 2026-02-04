
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://vawouugtzwmejxqkeqqj.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3Njk3MTIsImV4cCI6MjA2ODM0NTcxMn0.qtZk3zk5RMqzlPNhxCkTM6fyVQX5ULGt7nna_XOUr00";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectSchema() {
    console.log('Inspecting Tasks Table...');
    const { data: tasks, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .limit(1);

    if (taskError) console.error(taskError);
    else if (tasks.length > 0) console.log('Tasks Keys:', Object.keys(tasks[0]));
    else console.log('Tasks table empty or no access');

    console.log('\nInspecting SuperDuper Log Table...');
    // Try to insert a dummy log to trigger error with column hint, or just select all and see keys if any exist
    // Since we know 0 rows exist from previous check, we can't select to see keys.
    // We'll try to select columns that "might" exist or catch the error which usually lists columns

    // Actually, we can just look at the code where we implemented it! 
    // checking previous file views...
    // But let's try to infer from error or just try standard names.

    const { data: logs, error: logError } = await supabase
        .from('superduper_execution_log')
        .select('*')
        .limit(1);

    if (logError) console.error(logError);
    else if (logs.length > 0) console.log('SD Log Keys:', Object.keys(logs[0]));
    else console.log('SD Log empty.');
}

inspectSchema();
