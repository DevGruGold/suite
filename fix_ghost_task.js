
const SUPABASE_URL = "https://vawouugtzwmejxqkeqqj.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc2OTcxMiwiZXhwIjoyMDY4MzQ1NzEyfQ.QH0k26R2xbf4U5z6BmdYG1h_lkeNQ41zDjqL2zWxzxU";

const TARGET_TASK_ID = "fe076b33-559f-46e6-84c7-19f0bbbbe36c";

async function fixTask() {
    console.log(`Attempting to fix task ${TARGET_TASK_ID}...`);

    const headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    };

    try {
        // 1. Fetch current state
        const fetchUrl = `${SUPABASE_URL}/rest/v1/tasks?id=eq.${TARGET_TASK_ID}&select=metadata,completed_checklist_items`;
        const response = await fetch(fetchUrl, { headers });

        if (!response.ok) throw new Error(await response.text());

        const tasks = await response.json();
        if (tasks.length === 0) {
            console.log("Task not found.");
            return;
        }

        const task = tasks[0];
        const checklist = task.metadata?.checklist || [];
        const completed = task.completed_checklist_items || [];

        console.log(`Current state: Checklist Length=${checklist.length}, Completed Items=${completed.length}`);

        if (completed.length <= checklist.length) {
            console.log("No overflow detected. Task might have been fixed already.");
            return;
        }

        // 2. Fix: Slice completed items to match checklist length
        // We assume the first N items are valid.
        const newCompleted = completed.slice(0, checklist.length);
        console.log(`Truncating completed items to ${newCompleted.length}...`);

        // 3. Update task
        const updateUrl = `${SUPABASE_URL}/rest/v1/tasks?id=eq.${TARGET_TASK_ID}`;
        const updateResponse = await fetch(updateUrl, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                completed_checklist_items: newCompleted,
                // Also force recalculation of progress?
                // Let's just set progress to 100 explicitly since it's full now
                progress_percentage: 100,
                updated_at: new Date().toISOString()
            })
        });

        if (!updateResponse.ok) throw new Error(await updateResponse.text());

        console.log("Task successfully patched.");

    } catch (error) {
        console.error("Error fixing task:", error);
    }
}

fixTask();
