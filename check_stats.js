
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://vawouugtzwmejxqkeqqj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3Njk3MTIsImV4cCI6MjA2ODM0NTcxMn0.qtZk3zk5RMqzlPNhxCkTM6fyVQX5ULGt7nna_XOUr00";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkStats() {
    console.log("Checking Eliza Activity Log Execution Count...");

    // Check estimated count (what the dashboard uses)
    const { count: estimatedCount, error: estError } = await supabase
        .from('eliza_activity_log')
        .select('*', { count: 'estimated', head: true });

    if (estError) console.error("Error getting estimated count:", estError);
    else console.log("Estimated Count (Dashboard):", estimatedCount);

    // Check exact count (what we might want)
    // Warning: Could be slow if table is huge
    const { count: exactCount, error: exactError } = await supabase
        .from('eliza_activity_log')
        .select('*', { count: 'exact', head: true });

    if (exactError) console.error("Error getting exact count:", exactError);
    else console.log("Exact Count (Real):", exactCount);

    // Check superduper_execution_log count
    const { count: superduperCount, error: sdError } = await supabase
        .from('superduper_execution_log')
        .select('*', { count: 'exact', head: true });

    if (sdError) console.error("Error getting SuperDuper count:", sdError);
    else console.log("SuperDuper Log Count:", superduperCount);

    const { count: functionCount, error: fnError } = await supabase
        .from('function_usage_logs')
        .select('*', { count: 'exact', head: true }); // Estimated for speed if needed

    if (fnError) console.error("Error getting Function Usage count:", fnError);
    else console.log("Function Usage Count:", functionCount);

    const { count: taskCount, error: taskError } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true });

    if (taskError) console.error("Error getting Task count:", taskError);
    else console.log("Total Tasks:", taskCount);
}

checkStats();
