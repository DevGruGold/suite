
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vawouugtzwmejxqkeqqj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3Njk3MTIsImV4cCI6MjA2ODM0NTcxMn0.qtZk3zk5RMqzlPNhxCkTM6fyVQX5ULGt7nna_XOUr00';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTaskStages() {
    console.log("Fetching distinct task stages...");
    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('id, title, stage, status, assignee_agent_id, created_by_user_id, organization_id')
        .limit(100);

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }

    console.log(`Found ${tasks.length} tasks total (subject to RLS limit)`);

    const stageCounts = {};
    const statusCounts = {};

    tasks.forEach(t => {
        const stage = t.stage || 'NULL';
        stageCounts[stage] = (stageCounts[stage] || 0) + 1;
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;

        // Log typical legacy names
        if (['planning', 'implementation', 'research', 'testing', 'review'].includes(stage.toLowerCase())) {
            console.log(`[LEGACY STAGE] Task: "${t.title}" (ID: ${t.id}) has stage: "${stage}"`);
        }
    });

    console.log("\nIN_PROGRESS Tasks Details:");
    const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS');
    inProgressTasks.forEach(t => {
        console.log(JSON.stringify(t, null, 2));
    });

    console.log("\nStage Distribution:", JSON.stringify(stageCounts, null, 2));
    console.log("\nStatus Distribution:", JSON.stringify(statusCounts, null, 2));
}

checkTaskStages();
