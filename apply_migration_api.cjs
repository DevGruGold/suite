
const https = require('https');

const PROJECT_REF = 'vawouugtzwmejxqkeqqj';
const TOKEN = 'sbp_a0df3948bfb062c2f388210b57d5b0ae6481c494';
const QUERY = `
-- 20260205_user_scoping_and_messages.sql

-- 1. Add created_by_user_id to tasks table
alter table if exists tasks 
add column if not exists created_by_user_id uuid references auth.users(id);

-- 2. Create inbox_messages table
create table if not exists inbox_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) not null,
    task_id text references tasks(id),
    title text not null,
    content text,
    is_read boolean default false,
    created_at timestamptz default now()
);

-- 3. Enable RLS on inbox_messages
alter table inbox_messages enable row level security;

-- 4. Create Policy for Inbox: Users can only see their own messages
create policy "Users can view their own inbox messages"
on inbox_messages for select
using (auth.uid() = user_id);
`;

const options = {
    hostname: 'api.supabase.com',
    port: 443,
    path: `/v1/projects/${PROJECT_REF}/database/query`,
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
    }
};

const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log(`Status Code: ${res.statusCode}`);
        console.log('Response:', data);
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.write(JSON.stringify({ query: QUERY }));
req.end();
