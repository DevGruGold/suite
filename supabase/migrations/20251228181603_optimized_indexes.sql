-- Add optimized indexes for frequently queried tables

-- Mining updates indexes
CREATE INDEX IF NOT EXISTS idx_mining_updates_miner_created 
ON public.mining_updates(miner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mining_updates_status_created 
ON public.mining_updates(status, created_at DESC);

-- Conversation messages indexes
CREATE INDEX IF NOT EXISTS idx_conversation_messages_session_timestamp 
ON public.conversation_messages(session_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_type_timestamp 
ON public.conversation_messages(message_type, timestamp DESC);

-- Agent activities indexes
CREATE INDEX IF NOT EXISTS idx_agent_activities_agent_level_created 
ON public.agent_activities(agent_id, level, created_at DESC);

-- Eliza activity log indexes (large table optimization)
CREATE INDEX IF NOT EXISTS idx_eliza_activity_log_agent_created 
ON public.eliza_activity_log(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eliza_activity_log_created 
ON public.eliza_activity_log(created_at DESC) 
WHERE created_at > NOW() - INTERVAL '30 days';

-- Device activity log indexes
CREATE INDEX IF NOT EXISTS idx_device_activity_log_device_created 
ON public.device_activity_log(device_id, created_at DESC);

-- Treasury operations indexes
CREATE INDEX IF NOT EXISTS idx_treasury_operations_type_executed 
ON public.treasury_operations(operation_type, executed_at DESC) 
WHERE executed_at IS NOT NULL;

-- User profiles indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_session_key 
ON public.user_profiles(session_key) 
WHERE session_key IS NOT NULL;

-- XMRT transactions indexes
CREATE INDEX IF NOT EXISTS idx_xmrt_transactions_user_created 
ON public.xmrt_transactions(user_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xmrt_transactions_type_created 
ON public.xmrt_transactions(transaction_type, created_at DESC);

-- Agents indexes
CREATE INDEX IF NOT EXISTS idx_agents_status_last_seen 
ON public.agents(status, last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_agents_superduper 
ON public.agents(is_superduper) 
WHERE is_superduper = true;

-- Workflow executions indexes
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status_started 
ON public.workflow_executions(status, started_at DESC);

-- Comments
COMMENT ON INDEX idx_mining_updates_miner_created IS 'Optimizes miner-specific queries';
COMMENT ON INDEX idx_conversation_messages_session_timestamp IS 'Optimizes conversation history retrieval';
COMMENT ON INDEX idx_agent_activities_agent_level_created IS 'Optimizes agent activity queries';
COMMENT ON INDEX idx_eliza_activity_log_agent_created IS 'Optimizes Eliza log queries';
