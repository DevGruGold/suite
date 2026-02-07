
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vawouugtzwmejxqkeqqj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3Njk3MTIsImV4cCI6MjA2ODM0NTcxMn0.qtZk3zk5RMqzlPNhxCkTM6fyVQX5ULGt7nna_XOUr00';

const supabase = createClient(supabaseUrl, supabaseKey);

async function monitorSystem() {
  console.log("🔍 Starting End-to-End System Monitor...");
  console.log("Waiting for user activity (Chat System or Task Updates)...");
  console.log("----------------------------------------------------------------");

  let lastTaskId = null;
  let lastTaskStatus = null;
  let lastMessageId = null;

  setInterval(async () => {
    // 1. Check for recent Chat Messages (Trigger)
    const { data: msgs, error: msgError } = await supabase
      .from('inbox_messages')
      .select('id, content, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(1);

    if (msgs && msgs.length > 0) {
      const msg = msgs[0];
      if (msg.id !== lastMessageId) {
        console.log(`\n[CHAT INBOX] New Message Detected:`);
        console.log(`From (User ID): ${msg.user_id}`);
        console.log(`Content:        "${msg.content ? msg.content.substring(0, 50) + '...' : '[No Content]'}"`);
        console.log(`Time:           ${new Date(msg.created_at).toLocaleTimeString()}`);
        lastMessageId = msg.id;
      }
    }

    // 2. Check for Task Updates (Result)
    const { data: tasks, error: taskError } = await supabase
      .from('tasks')
      .select('id, title, status, stage, assignee_agent_id, created_at, updated_at, created_by_user_id, organization_id')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (tasks && tasks.length > 0) {
      const task = tasks[0];

      // If we see a new task or a change in status/stage
      if (task.id !== lastTaskId || task.status !== lastTaskStatus) {
        console.log(`\n[TASK UPDATE] Task Changed:`);
        console.log(`Title:       "${task.title}"`);
        console.log(`Status:      ${task.status} (Stage: ${task.stage})`);
        console.log(`Assigned To: ${task.assignee_agent_id || 'Waiting for STAE...'}`);
        console.log(`Owner ID:    ${task.created_by_user_id || 'SYSTEM'}`);
        console.log(`Org ID:      ${task.organization_id || 'NULL'}`);
        console.log(`Time:        ${new Date().toLocaleTimeString()}`);

        lastTaskId = task.id;
        lastTaskStatus = task.status;
      }
    }
  }, 2000); // Poll every 2 seconds
}

monitorSystem();
