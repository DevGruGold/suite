-- Treasury Stats and MobileMonero $1M Lock System
-- This migration creates tables to track mining statistics and implement
-- the automatic lock of first $1M XMR earned by MobileMonero workers

-- Create mining_sessions table if it doesn't exist
CREATE TABLE IF NOT EXISTS mining_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id text,
  is_mobile_worker boolean DEFAULT false,
  xmr_earned numeric DEFAULT 0,
  hashrate bigint DEFAULT 0,
  shares_submitted bigint DEFAULT 0,
  session_start timestamptz DEFAULT now(),
  session_end timestamptz,
  device_info jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_mining_sessions_user_id ON mining_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_mobile ON mining_sessions(is_mobile_worker);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_created ON mining_sessions(created_at DESC);

-- Create treasury_stats table for aggregated data
CREATE TABLE IF NOT EXISTS treasury_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_xmr_mined numeric DEFAULT 0,
  mobile_workers_xmr numeric DEFAULT 0,
  locked_xmr numeric DEFAULT 0,
  locked_value_usd numeric DEFAULT 0,
  xmr_price_usd numeric DEFAULT 0,
  lock_threshold_usd numeric DEFAULT 1000000, -- $1M threshold
  lock_achieved boolean DEFAULT false,
  active_mobile_miners_24h integer DEFAULT 0,
  total_contributors integer DEFAULT 0,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Insert initial record if table is empty
INSERT INTO treasury_stats (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM treasury_stats);

-- Create treasury_lock_history table to track lock milestones
CREATE TABLE IF NOT EXISTS treasury_lock_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locked_xmr numeric NOT NULL,
  locked_value_usd numeric NOT NULL,
  xmr_price_at_lock numeric NOT NULL,
  mobile_worker_id text,
  user_id uuid REFERENCES auth.users(id),
  lock_reason text DEFAULT 'Mobile worker $1M threshold',
  created_at timestamptz DEFAULT now()
);

-- Create index for lock history
CREATE INDEX IF NOT EXISTS idx_treasury_lock_history_created ON treasury_lock_history(created_at DESC);

-- Function to update treasury stats
CREATE OR REPLACE FUNCTION update_treasury_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_xmr numeric;
  v_mobile_xmr numeric;
  v_contributor_count integer;
  v_active_mobile_count integer;
BEGIN
  -- Calculate total XMR mined
  SELECT COALESCE(SUM(xmr_earned), 0)
  INTO v_total_xmr
  FROM mining_sessions;

  -- Calculate XMR from mobile workers
  SELECT COALESCE(SUM(xmr_earned), 0)
  INTO v_mobile_xmr
  FROM mining_sessions
  WHERE is_mobile_worker = true;

  -- Count unique contributors (users with GitHub)
  SELECT COUNT(DISTINCT id)
  INTO v_contributor_count
  FROM profiles
  WHERE github_username IS NOT NULL;

  -- Count active mobile miners in last 24 hours
  SELECT COUNT(DISTINCT user_id)
  INTO v_active_mobile_count
  FROM mining_sessions
  WHERE is_mobile_worker = true
  AND created_at > (now() - interval '24 hours');

  -- Update or insert treasury stats
  UPDATE treasury_stats
  SET 
    total_xmr_mined = v_total_xmr,
    mobile_workers_xmr = v_mobile_xmr,
    active_mobile_miners_24h = v_active_mobile_count,
    total_contributors = v_contributor_count,
    last_updated = now()
  WHERE id = (SELECT id FROM treasury_stats LIMIT 1);

  -- If no record exists, insert one
  IF NOT FOUND THEN
    INSERT INTO treasury_stats (
      total_xmr_mined,
      mobile_workers_xmr,
      active_mobile_miners_24h,
      total_contributors
    ) VALUES (
      v_total_xmr,
      v_mobile_xmr,
      v_active_mobile_count,
      v_contributor_count
    );
  END IF;
END;
$$;

-- Function to process lock when $1M threshold is reached
CREATE OR REPLACE FUNCTION check_and_process_lock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mobile_xmr numeric;
  v_xmr_price numeric;
  v_mobile_value numeric;
  v_lock_threshold numeric := 1000000; -- $1M
  v_locked_xmr numeric;
  v_already_locked boolean;
BEGIN
  -- Check if already locked
  SELECT lock_achieved INTO v_already_locked
  FROM treasury_stats
  LIMIT 1;

  IF v_already_locked THEN
    RETURN;
  END IF;

  -- Get mobile workers XMR
  SELECT mobile_workers_xmr, xmr_price_usd
  INTO v_mobile_xmr, v_xmr_price
  FROM treasury_stats
  LIMIT 1;

  -- Calculate value
  v_mobile_value := v_mobile_xmr * v_xmr_price;

  -- If threshold reached, process lock
  IF v_mobile_value >= v_lock_threshold THEN
    -- Calculate exact XMR to lock (first $1M worth)
    v_locked_xmr := v_lock_threshold / v_xmr_price;

    -- Update treasury stats
    UPDATE treasury_stats
    SET 
      locked_xmr = v_locked_xmr,
      locked_value_usd = v_lock_threshold,
      lock_achieved = true,
      last_updated = now()
    WHERE id = (SELECT id FROM treasury_stats LIMIT 1);

    -- Log the lock event
    INSERT INTO treasury_lock_history (
      locked_xmr,
      locked_value_usd,
      xmr_price_at_lock,
      lock_reason
    ) VALUES (
      v_locked_xmr,
      v_lock_threshold,
      v_xmr_price,
      'MobileMonero $1M threshold achieved'
    );
  ELSE
    -- Update locked amount proportionally if not yet reached
    v_locked_xmr := v_mobile_xmr; -- Lock all mobile XMR until threshold
    
    UPDATE treasury_stats
    SET 
      locked_xmr = v_locked_xmr,
      locked_value_usd = v_mobile_value,
      last_updated = now()
    WHERE id = (SELECT id FROM treasury_stats LIMIT 1);
  END IF;
END;
$$;

-- Trigger to update treasury stats when mining session is added/updated
CREATE OR REPLACE FUNCTION trigger_update_treasury_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM update_treasury_stats();
  PERFORM check_and_process_lock();
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS mining_session_treasury_update ON mining_sessions;

-- Create trigger
CREATE TRIGGER mining_session_treasury_update
AFTER INSERT OR UPDATE OR DELETE ON mining_sessions
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_update_treasury_stats();

-- Enable Row Level Security
ALTER TABLE mining_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_lock_history ENABLE ROW LEVEL SECURITY;

-- Policies for mining_sessions
CREATE POLICY "Users can view their own mining sessions"
ON mining_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own mining sessions"
ON mining_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mining sessions"
ON mining_sessions FOR UPDATE
USING (auth.uid() = user_id);

-- Policies for treasury_stats (public read)
CREATE POLICY "Anyone can view treasury stats"
ON treasury_stats FOR SELECT
TO authenticated, anon
USING (true);

-- Policies for treasury_lock_history (public read)
CREATE POLICY "Anyone can view lock history"
ON treasury_lock_history FOR SELECT
TO authenticated, anon
USING (true);

-- Grant permissions
GRANT SELECT ON mining_sessions TO authenticated;
GRANT INSERT ON mining_sessions TO authenticated;
GRANT UPDATE ON mining_sessions TO authenticated;
GRANT SELECT ON treasury_stats TO authenticated, anon;
GRANT SELECT ON treasury_lock_history TO authenticated, anon;

-- Run initial stats update
SELECT update_treasury_stats();
SELECT check_and_process_lock();

-- Comment for documentation
COMMENT ON TABLE treasury_stats IS 'Aggregated treasury statistics including MobileMonero $1M lock tracking';
COMMENT ON TABLE treasury_lock_history IS 'Historical record of treasury lock milestones';
COMMENT ON COLUMN treasury_stats.lock_threshold_usd IS 'The $1M USD threshold for locking mobile worker XMR';
COMMENT ON COLUMN treasury_stats.locked_xmr IS 'Amount of XMR permanently locked from mobile workers (first $1M worth)';
