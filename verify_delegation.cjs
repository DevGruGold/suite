const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './supabase/functions/.env' }); // Adjust path if needed

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vawouugtzwmejxqkeqqj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY is missing. Please check your .env file.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runVerification() {
    console.log("🚀 Starting Agent Delegation Verification...");

    // 1. Create a dummy task
    const taskId = `task_${Date.now()}`;
    const userId = 'user_test_' + Date.now(); // Dummy user ID, expecting inbox insert to fail FK if not exists, so we might need real user.
    // Actually, to test inbox, we need a valid user ID ideally, or we rely on the code handling invalid user gracefully.
    // Let's try to fetch a real user if possible, or skip inbox verification if no user found.
    let validUserId = null;
    const { data: users } = await supabase.auth.admin.listUsers();
    if (users?.users?.length > 0) {
        validUserId = users.users[0].id;
        console.log(`👤 Using valid User ID: ${validUserId}`);
    } else {
        console.warn("⚠️ No users found. Inbox verification might fail.");
    }

    // Create task in DB
    const { error: taskError } = await supabase.from('tasks').insert({
        id: taskId, // Assuming ID is text, if UUID let db generate
        title: "Test Delegation Task",
        description: "Please say hello from the SuperDuper agent via delegation.",
        status: "PENDING",
        assignee_agent_id: "Echo"
    });

    if (taskError && !taskError.message.includes('invalid input syntax for type uuid')) {
        // If ID is UUID, let's retry without ID or generate UUID
        console.log("⚠️ Task creation failed (likely UUID issue), proceeding without pre-creating task record...");
    } else {
        console.log(`✅ Created test task: ${taskId}`);
    }

    // 2. Call ai-chat with "Echo"
    console.log("📞 Calling ai-chat with executive_name='Echo'...");

    const payload = {
        messages: [
            { role: "user", content: "Say 'DELEGATION SUCCESSFUL' and complete this task." }
        ],
        executive_name: "Echo",
        task_id: taskId,
        user_id: validUserId
    };

    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log("📨 Response received:", JSON.stringify(data, null, 2));

        if (data.provider === 'delegated_specialist' || data.model === 'superduper-social-viral') {
            console.log("✅ SUCCESS: Delegation to Specialist confirmed!");
        } else {
            console.error("❌ FAILURE: Response did not indicate delegation.");
            console.log("Provider:", data.provider);
        }

        // 3. Check Inbox
        if (validUserId) {
            // Wait a small bit for async inbox insert
            await new Promise(r => setTimeout(r, 2000));
            const { data: messages } = await supabase
                .from('inbox_messages')
                .select('*')
                .eq('user_id', validUserId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (messages && messages.length > 0) {
                console.log("✅ Inbox message found:", messages[0].title);
            } else {
                console.warn("⚠️ No new inbox message found.");
            }
        }

    } catch (err) {
        console.error("💥 Error during verification request:", err);
    }
}

runVerification();
