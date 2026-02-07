
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Try to load env vars manually since we can't depend on Deno.env.get completely locally without --env-file often or if .env isn't loaded by the runner
const supabaseUrl = 'https://vawouugtzwmejxqkeqqj.supabase.co'
// Using public key for investigation - assuming we can read public tasks or if I need a service key I'll try to find it. 
// actually I should ask the user for it if I need it, but let's try reading with the anon key and see if RLS blocks me.
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3Njk3MTIsImV4cCI6MjA2ODM0NTcxMn0.qtZk3zk5RMqzlPNhxCkTM6fyVQX5ULGt7nna_XOUr00'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkTaskStages() {
    console.log("Fetching distinct task stages...")
    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('id, title, stage, status, assignee_agent_id')

    if (error) {
        console.error('Error fetching tasks:', error)
        return
    }

    console.log(`Found ${tasks.length} tasks total (subject to RLS limit)`)

    const stageCounts = {}
    const statusCounts = {}

    tasks.forEach(t => {
        stageCounts[t.stage] = (stageCounts[t.stage] || 0) + 1
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1

        if (['planning', 'implementation', 'research', 'testing'].includes(t.stage?.toLowerCase())) {
            console.log(`[LEGACY STAGE DETECTED] Task: "${t.title}" (ID: ${t.id}) has stage: "${t.stage}"`)
        }
    })

    console.log("\nStage Distribution:", JSON.stringify(stageCounts, null, 2))
    console.log("\nStatus Distribution:", JSON.stringify(statusCounts, null, 2))
}

checkTaskStages()
