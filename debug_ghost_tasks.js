
const SUPABASE_URL = "https://vawouugtzwmejxqkeqqj.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc2OTcxMiwiZXhwIjoyMDY4MzQ1NzEyfQ.QH0k26R2xbf4U5z6BmdYG1h_lkeNQ41zDjqL2zWxzxU";

async function main() {
    console.log("Fetching all tasks...");

    // Fetch up to 1000 tasks
    const url = `${SUPABASE_URL}/rest/v1/tasks?select=id,title,status,stage,progress_percentage,completed_checklist_items,metadata&limit=1000`;

    try {
        const response = await fetch(url, {
            headers: {
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            console.error(await response.text());
            return;
        }

        const tasks = await response.json();
        console.log(`Analyzed ${tasks.length} tasks.`);

        let anomalies = 0;

        tasks.forEach(task => {
            const checklist = task.metadata?.checklist || [];
            const completed = task.completed_checklist_items || [];
            const progress = task.progress_percentage || 0;

            let issue = false;
            let msg = "";

            if (progress > 100) {
                issue = true;
                msg += `[PROGRESS > 100%: ${progress}%] `;
            }

            if (completed.length && checklist.length && completed.length > checklist.length) {
                issue = true;
                msg += `[CHECKLIST OVERFLOW: ${completed.length}/${checklist.length}] `;
            }

            if (task.status !== 'COMPLETED' && progress >= 100) {
                issue = true;
                msg += `[STUCK AT 100%: Status=${task.status}] `;
            }

            if (issue) {
                anomalies++;
                console.log("---------------------------------------------------");
                console.log(`ID: ${task.id}`);
                console.log(`Title: ${task.title}`);
                console.log(`Status: ${task.status}`);
                console.log(`Stage: ${task.stage}`);
                console.log(`Progress: ${progress}%`);
                console.log(`Checklist: ${completed.length}/${checklist.length}`);
                console.log(`Issue Detected: ${msg}`);
            }
        });

        if (anomalies === 0) {
            console.log("No anomalies found in active tasks.");
        } else {
            console.log(`Found ${anomalies} anomalies.`);
        }

    } catch (error) {
        console.error("Fetch error:", error);
    }
}

main();
