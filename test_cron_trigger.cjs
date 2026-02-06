const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables manually
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        env[key.trim()] = value.trim().replace(/"/g, '');
    }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY; // Using Anon key for test

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key in .env');
    process.exit(1);
}

console.log(`Testing Agent Work Executor at: ${supabaseUrl}/functions/v1/agent-work-executor`);

async function testTrigger() {
    try {
        const response = await fetch(`${supabaseUrl}/functions/v1/agent-work-executor`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
                action: 'get_pending_work', // Safe read-only action
                max_tasks: 1
            })
        });

        const text = await response.text();
        console.log(`Status: ${response.status}`);
        console.log(`Response: ${text.substring(0, 500)}`); // Print first 500 chars

        if (response.ok) {
            console.log("SUCCESS: Function is reachable with Anon key.");
        } else {
            console.log("FAILURE: Function rejected the request.");
        }
    } catch (error) {
        console.error("EXCEPTION:", error);
    }
}

testTrigger();
