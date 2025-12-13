-- Add linked_worker_ids array to profiles for mining worker tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linked_worker_ids TEXT[] DEFAULT '{}';

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_profiles_linked_worker_ids ON profiles USING GIN(linked_worker_ids);

-- Comment for documentation
COMMENT ON COLUMN profiles.linked_worker_ids IS 'Array of 8-digit XMRig worker IDs linked to this user profile';