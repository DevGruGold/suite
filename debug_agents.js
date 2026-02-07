
const SUPABASE_URL = "https://vawouugtzwmejxqkeqqj.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc2OTcxMiwiZXhwIjoyMDY4MzQ1NzEyfQ.QH0k26R2xbf4U5z6BmdYG1h_lkeNQ41zDjqL2zWxzxU";

async function debugAgents() {
    console.log("Fetching agents...");

    const headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
    };

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/agents?select=id,name,status,current_workload`, { headers });

        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            console.error(await response.text());
            return;
        }

        const agents = await response.json();
        console.log(`Total Agents: ${agents.length}`);

        // Group by status
        const byStatus = {};
        let busyCount = 0;
        let workloadCount = 0;

        agents.forEach(agent => {
            byStatus[agent.status] = (byStatus[agent.status] || 0) + 1;

            if (agent.status === 'BUSY') busyCount++;
            if (agent.current_workload > 0) workloadCount++;

            if (agent.status === 'BUSY' || agent.current_workload > 0) {
                console.log(`[WORKING] ${agent.name} (Status: ${agent.status}, Workload: ${agent.current_workload})`);
            }
        });

        console.log("\n--- Summary ---");
        console.log("Status Breakdown:", JSON.stringify(byStatus, null, 2));
        console.log(`Busy (status='BUSY'): ${busyCount}`);
        console.log(`Has Workload (>0): ${workloadCount}`);

    } catch (error) {
        console.error("Fetch error:", error);
    }
}

debugAgents();
