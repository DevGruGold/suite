
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://vawouugtzwmejxqkeqqj.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc2OTcxMiwiZXhwIjoyMDY4MzQ1NzEyfQ.QH0k26R2xbf4U5z6BmdYG1h_lkeNQ41zDjqL2zWxzxU";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log("Searching for ghost tasks...");

    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('id, title, status, stage, progress_percentage, completed_checklist_items, metadata')
        .gte('progress_percentage', 100)
        .neq('status', 'COMPLETED');

    if (error) {
        console.error("Error fetching tasks:", error);
        return;
    }

    console.log(`Found ${tasks.length} tasks with >= 100% progress but not COMPLETED:`);

    for (const task of tasks) {
        console.log("---------------------------------------------------");
        console.log(`ID: ${task.id}`);
        console.log(`Title: ${task.title}`);
        console.log(`Status: ${task.status}`);
        console.log(`Stage: ${task.stage}`);
        console.log(`Progress: ${task.progress_percentage}%`);
        console.log(`Checklist Length: ${task.metadata?.checklist?.length || 0}`);
        console.log(`Completed Items: ${task.completed_checklist_items?.length || 0}`);

        // Check for "checklist overflow"
        const checklist = task.metadata?.checklist || [];
        const completed = task.completed_checklist_items || [];

        // Simple length check
        if (completed.length > checklist.length) {
            console.log("WARNING: More completed items than checklist items!");
        }
    }
}

main();
