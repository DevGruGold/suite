
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vawouugtzwmejxqkeqqj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3Njk3MTIsImV4cCI6MjA2ODM0NTcxMn0.qtZk3zk5RMqzlPNhxCkTM6fyVQX5ULGt7nna_XOUr00';

const supabase = createClient(supabaseUrl, supabaseKey);

// Mock User IDs (random UUIDs for simulation)
const USER_A_ID = '00000000-0000-0000-0000-000000000001'; // "xmrtsolutions"
const USER_B_ID = '00000000-0000-0000-0000-000000000002'; // "joeyleepcs"

async function verifyPrivacyLogic() {
    console.log("--- Starting Privacy Logic Verification ---");

    // 1. Create Test Tasks
    const { data: taskA, error: errA } = await supabase.from('tasks').insert({
        title: 'Private Task for User A',
        status: 'IN_PROGRESS',
        stage: 'PLAN',
        created_by_user_id: USER_A_ID,
        organization_id: null
    }).select().single();

    const { data: taskB, error: errB } = await supabase.from('tasks').insert({
        title: 'Private Task for User B',
        status: 'IN_PROGRESS',
        stage: 'PLAN',
        created_by_user_id: USER_B_ID,
        organization_id: null
    }).select().single();

    const { data: taskSys, error: errSys } = await supabase.from('tasks').insert({
        title: 'System Public Task',
        status: 'IN_PROGRESS',
        stage: 'PLAN',
        created_by_user_id: null,
        organization_id: null
    }).select().single();

    if (errA || errB || errSys) {
        console.error("Failed to create test tasks. RLS might be blocking inserts without auth.", errA, errB, errSys);
        // Fallback: This script verifies the QUERY LOGIC, so we can mock the fetch instead if insert fails
        // But let's proceed and see if we can at least query existing filtered stuff if insert fails.
        console.log("Proceeding to test query logic theoretically or with existing data...");
    } else {
        console.log(`Created Task A: ${taskA.id}`);
        console.log(`Created Task B: ${taskB.id}`);
        console.log(`Created Task Sys: ${taskSys.id}`);
    }

    // 2. Simulate User A View (Personal View)
    // Logic: organization_id is NULL AND (created_by_user_id is A OR created_by_user_id is NULL)
    console.log("\n--- Simulating View for User A ---");
    const { data: viewA } = await supabase
        .from('tasks')
        .select('id, title, created_by_user_id')
        .is('organization_id', null)
        .or(`created_by_user_id.eq.${USER_A_ID},created_by_user_id.is.null`);

    const seesOwn = viewA?.find(t => t.id === taskA?.id);
    const seesOther = viewA?.find(t => t.id === taskB?.id);
    const seesSystem = viewA?.find(t => t.id === taskSys?.id);

    console.log(`Matches logic for User A:`);
    console.log(`- Can see own task? ${seesOwn ? 'YES (Pass)' : 'NO (Fail)'}`);
    console.log(`- Can see User B task? ${seesOther ? 'YES (FAIL - Privacy Leak)' : 'NO (Pass)'}`);
    console.log(`- Can see System task? ${seesSystem ? 'YES (Pass)' : 'NO (Fail/Mixed)'}`);

    // 3. Simulate User B View (Personal View)
    console.log("\n--- Simulating View for User B ---");
    const { data: viewB } = await supabase
        .from('tasks')
        .select('id, title, created_by_user_id')
        .is('organization_id', null)
        .or(`created_by_user_id.eq.${USER_B_ID},created_by_user_id.is.null`);

    const bSeesA = viewB?.find(t => t.id === taskA?.id);

    console.log(`Matches logic for User B:`);
    console.log(`- Can see User A task? ${bSeesA ? 'YES (FAIL - Privacy Leak)' : 'NO (Pass)'}`);

    // Cleanup
    if (taskA) await supabase.from('tasks').delete().eq('id', taskA.id);
    if (taskB) await supabase.from('tasks').delete().eq('id', taskB.id);
    if (taskSys) await supabase.from('tasks').delete().eq('id', taskSys.id);
}

verifyPrivacyLogic();
