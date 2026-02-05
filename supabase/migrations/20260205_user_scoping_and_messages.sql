
-- 20260205_user_scoping_and_messages.sql

-- 1. Add created_by_user_id to tasks table
alter table if exists tasks 
add column if not exists created_by_user_id uuid references auth.users(id);

-- 2. Create inbox_messages table
create table if not exists inbox_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) not null,
    task_id text references tasks(id), -- Use text to match tasks.id type if currently text, or uuid if changed. Assuming text based on previous logs showing UUID-like strings but type needs sync. Let's use text to be safe as tasks.id is text in previous scripts.
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

-- 5. Create Policy for Tasks: Users can only see tasks they created (Optional, user requested filter, but RLS is safer)
-- We might want to keep public visibility for now to avoid breaking existing flows, but let's add the policy but maybe not enable RLS on tasks fully if it breaks agents.
-- For now, we will just add the column and use frontend filtering as requested ("users should only be able to view..."). 
-- RLS on tasks might break the agents if they use service role (which bypasses RLS), so it's safe for agents, but might hide tasks from other users.
-- Let's enable RLS on tasks for select if created_by_user_id matches OR if it's null (legacy).

-- (Skipping strict RLS on tasks for this step to prevent breaking "View All" for admins, trusting frontend filter first as per plan)
