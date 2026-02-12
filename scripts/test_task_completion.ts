
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { config } from "https://deno.land/x/dotenv@v3.2.0/mod.ts";

// Load environment variables
const env = config({ safe: true });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testTaskCompletion() {
    console.log("🧪 Starting Task Completion Notification Test...");

    // 1. Create a test task
    const testTaskTitle = `Test Task ${Date.now()}`;
    console.log(`\n1. Creating test task: "${testTaskTitle}"...`);

    const { data: task, error: createError } = await supabase
        .from("tasks")
        .insert({
            title: testTaskTitle,
            status: "TODO",
            priority: 1,
            // Assign to a dummy agent if needed or leave null
            assignee_agent_id: "test-agent-007"
        })
        .select()
        .single();

    if (createError) {
        console.error("❌ Failed to create test task:", createError);
        return;
    }
    console.log(`✅ Task created with ID: ${task.id}`);

    // 2. Update task to COMPLETED with proof_of_work_link
    console.log("\n2. Updating task to COMPLETED...");
    const proofLink = "https://example.com/proof-of-work";

    const { error: updateError } = await supabase
        .from("tasks")
        .update({
            status: "COMPLETED",
            proof_of_work_link: proofLink,
            completed_at: new Date().toISOString()
        })
        .eq("id", task.id);

    if (updateError) {
        console.error("❌ Failed to update task:", updateError);
        return;
    }
    console.log("✅ Task updated to COMPLETED.");

    // 3. Wait for Webhook and Edge Function processing
    console.log("\n3. Waiting 10 seconds for async processing...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // 4. Verify Knowledge Entity creation
    console.log("\n4. Verifying Knowledge Entity creation...");
    const { data: knowledge, error: knowledgeError } = await supabase
        .from("knowledge_entities")
        .select("*")
        .ilike("entity_name", `Task Completed: ${testTaskTitle}`)
        .order("created_at", { ascending: false })
        .limit(1);

    if (knowledgeError) {
        console.error("❌ Failed to query knowledge entities:", knowledgeError);
        return;
    }

    if (knowledge && knowledge.length > 0) {
        const entity = knowledge[0];
        console.log("✅ Success! Knowledge Entity found:");
        console.log(`   ID: ${entity.id}`);
        console.log(`   Name: ${entity.entity_name}`);
        console.log(`   Description: ${entity.description}`);

        if (entity.description.includes(proofLink)) {
            console.log("✅ Proof of work link verified in description.");
        } else {
            console.warn("⚠️ Proof of work link NOT found in description.");
        }
    } else {
        console.error("❌ Notification verification FAILED. No matching knowledge entity found.");
        console.log("   Please check Edge Function logs for 'task-completion-notifier' and 'knowledge-manager'.");
    }

    // Cleanup (optional)
    // console.log("\nCleaning up test data...");
    // await supabase.from("tasks").delete().eq("id", task.id);
    // if (knowledge && knowledge.length > 0) {
    //   await supabase.from("knowledge_entities").delete().eq("id", knowledge[0].id);
    // }
}

testTaskCompletion();
