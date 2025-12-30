-- Migration: Worker Claim System
-- Date: 2025-12-30
-- Description: Adds tables and functions for worker claiming

-- Table: pending_worker_claims
-- Stores workers waiting to be claimed by users
CREATE TABLE IF NOT EXISTS pending_worker_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    claim_token TEXT UNIQUE NOT NULL,
    wallet_address TEXT NOT NULL,
    device_info JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'expired')),
    claimed_by UUID REFERENCES auth.users(id),
    claimed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    last_ping TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_pending_claims_token ON pending_worker_claims(claim_token);
CREATE INDEX IF NOT EXISTS idx_pending_claims_worker ON pending_worker_claims(worker_id);
CREATE INDEX IF NOT EXISTS idx_pending_claims_status ON pending_worker_claims(status);
CREATE INDEX IF NOT EXISTS idx_pending_claims_expires ON pending_worker_claims(expires_at);

-- Function: Automatically expire old claims
CREATE OR REPLACE FUNCTION expire_old_worker_claims()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE pending_worker_claims
    SET status = 'expired'
    WHERE expires_at < now()
      AND status = 'pending';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Run expiration check periodically
DROP TRIGGER IF EXISTS trigger_expire_worker_claims ON pending_worker_claims;
CREATE TRIGGER trigger_expire_worker_claims
    AFTER INSERT OR UPDATE ON pending_worker_claims
    FOR EACH STATEMENT
    EXECUTE FUNCTION expire_old_worker_claims();

-- Update device_miner_associations to support claim method
ALTER TABLE device_miner_associations
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS device_info JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS claim_method TEXT DEFAULT 'manual' CHECK (claim_method IN ('manual', 'token', 'api'));

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_device_associations_user ON device_miner_associations(user_id);

-- RLS Policies for pending_worker_claims

-- Enable RLS
ALTER TABLE pending_worker_claims ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view pending (unclaimed) workers
CREATE POLICY "Anyone can view pending workers"
    ON pending_worker_claims
    FOR SELECT
    USING (status = 'pending' AND expires_at > now());

-- Policy: Workers can insert their own claims (via service role)
CREATE POLICY "Service role can manage claims"
    ON pending_worker_claims
    FOR ALL
    USING (auth.role() = 'service_role');

-- Policy: Users can view their own claimed workers
CREATE POLICY "Users can view their claimed workers"
    ON pending_worker_claims
    FOR SELECT
    USING (claimed_by = auth.uid());

-- RLS Policies for device_miner_associations

-- Policy: Users can view their own device associations
CREATE POLICY "Users can view own device associations"
    ON device_miner_associations
    FOR SELECT
    USING (user_id = auth.uid() OR user_id IS NULL);

-- Policy: Service role can manage all associations
CREATE POLICY "Service role can manage associations"
    ON device_miner_associations
    FOR ALL
    USING (auth.role() = 'service_role');

-- Function: Get claimable workers with stats
CREATE OR REPLACE FUNCTION get_claimable_workers()
RETURNS TABLE (
    worker_id TEXT,
    username TEXT,
    hashrate NUMERIC,
    valid_shares INTEGER,
    invalid_shares INTEGER,
    last_ping TIMESTAMPTZ,
    is_active BOOLEAN,
    device_info JSONB,
    expires_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pwc.worker_id,
        pwc.username,
        COALESCE(wr.hashrate, 0) as hashrate,
        COALESCE(wr.valid_shares, 0) as valid_shares,
        COALESCE(wr.invalid_shares, 0) as invalid_shares,
        pwc.last_ping,
        COALESCE(wr.is_active, false) as is_active,
        pwc.device_info,
        pwc.expires_at
    FROM pending_worker_claims pwc
    LEFT JOIN worker_registrations wr ON pwc.worker_id = wr.worker_id
    WHERE pwc.status = 'pending'
      AND pwc.expires_at > now()
    ORDER BY pwc.last_ping DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get user's claimed workers
CREATE OR REPLACE FUNCTION get_my_claimed_workers(p_user_id UUID)
RETURNS TABLE (
    worker_id TEXT,
    device_id TEXT,
    hashrate NUMERIC,
    valid_shares INTEGER,
    invalid_shares INTEGER,
    last_seen TIMESTAMPTZ,
    is_active BOOLEAN,
    device_info JSONB,
    linked_at TIMESTAMPTZ,
    claim_method TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dma.worker_id,
        dma.device_id,
        COALESCE(wr.hashrate, 0) as hashrate,
        COALESCE(wr.valid_shares, 0) as valid_shares,
        COALESCE(wr.invalid_shares, 0) as invalid_shares,
        COALESCE(wr.last_seen, dma.linked_at) as last_seen,
        COALESCE(wr.is_active, false) as is_active,
        dma.device_info,
        dma.linked_at,
        dma.claim_method
    FROM device_miner_associations dma
    LEFT JOIN worker_registrations wr ON dma.worker_id = wr.worker_id
    WHERE dma.user_id = p_user_id
    ORDER BY dma.linked_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_claimable_workers() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_claimed_workers(UUID) TO authenticated;

-- Comments
COMMENT ON TABLE pending_worker_claims IS 'Workers waiting to be claimed by users via token';
COMMENT ON COLUMN pending_worker_claims.claim_token IS '6-character token for claiming worker';
COMMENT ON COLUMN pending_worker_claims.expires_at IS 'Token expiration time (24 hours from creation)';
COMMENT ON COLUMN pending_worker_claims.last_ping IS 'Last heartbeat from worker';
COMMENT ON FUNCTION get_claimable_workers() IS 'Returns all pending workers with their current stats';
COMMENT ON FUNCTION get_my_claimed_workers(UUID) IS 'Returns all workers claimed by a specific user';
