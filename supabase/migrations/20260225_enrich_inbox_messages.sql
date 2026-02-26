-- 20260225_enrich_inbox_messages.sql
-- Adds richer metadata columns to inbox_messages to support the full
-- Antigravity-like Inbox: type, agent_id, channel, priority, action_url, metadata.
-- 1. Add new columns (all additive, no breaking changes)
ALTER TABLE inbox_messages
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'system' CHECK (
        type IN (
            'task_complete',
            'task_failed',
            'task_blocked',
            'agent_message',
            'system',
            'whatsapp',
            'email',
            'channel'
        )
    ),
    ADD COLUMN IF NOT EXISTS agent_id TEXT,
    ADD COLUMN IF NOT EXISTS agent_name TEXT,
    ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'internal' CHECK (
        channel IN (
            'internal',
            'whatsapp',
            'email',
            'openclaw',
            'system'
        )
    ),
    ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 2 CHECK (
        priority BETWEEN 1 AND 5
    ),
    ADD COLUMN IF NOT EXISTS action_url TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
-- 2. Add an index on user_id + is_read for the bell-count query
CREATE INDEX IF NOT EXISTS idx_inbox_messages_user_unread ON inbox_messages(user_id, is_read)
WHERE is_read = false;
-- 3. Add index on created_at for ordering
CREATE INDEX IF NOT EXISTS idx_inbox_messages_created_at ON inbox_messages(user_id, created_at DESC);
-- 4. RLS INSERT policy: service_role can always write (bypasses RLS by default),
--    but also allow authenticated users to insert their own messages (for UI-level sending)
CREATE POLICY IF NOT EXISTS "Service role can insert inbox messages" ON inbox_messages FOR
INSERT WITH CHECK (true);
-- 5. RLS DELETE/UPDATE policies: users can manage their own messages
CREATE POLICY IF NOT EXISTS "Users can update their own inbox messages" ON inbox_messages FOR
UPDATE USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can delete their own inbox messages" ON inbox_messages FOR DELETE USING (auth.uid() = user_id);
-- 6. Add a comment for clarity
COMMENT ON TABLE inbox_messages IS 'Unified inbox for all agent, task, and channel communications per user.';