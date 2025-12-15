-- Add device claiming columns to devices table
ALTER TABLE devices ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES profiles(id);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS claim_verification_code text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS claim_code_expires_at timestamptz;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_known_location jsonb DEFAULT '{}';

-- Add location/IP columns to device_connection_sessions
ALTER TABLE device_connection_sessions ADD COLUMN IF NOT EXISTS location_data jsonb DEFAULT '{}';

-- Add linked_device_ids to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linked_device_ids uuid[] DEFAULT '{}';

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_devices_claimed_by ON devices(claimed_by);
CREATE INDEX IF NOT EXISTS idx_devices_claim_code ON devices(claim_verification_code) WHERE claim_verification_code IS NOT NULL;

-- RLS policies for device claiming (drop if exists first)
DROP POLICY IF EXISTS "users_can_claim_devices" ON devices;
CREATE POLICY "users_can_claim_devices" ON devices
FOR UPDATE USING (claimed_by IS NULL OR claimed_by = auth.uid())
WITH CHECK (claimed_by = auth.uid());

DROP POLICY IF EXISTS "users_can_view_own_claimed_devices" ON devices;
CREATE POLICY "users_can_view_own_claimed_devices" ON devices
FOR SELECT USING (claimed_by = auth.uid() OR claimed_by IS NULL);