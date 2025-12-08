-- Update user_profiles to set founder: true for IP 190.211.120.214
UPDATE user_profiles 
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"founder": true}'::jsonb,
    updated_at = now()
WHERE ip_address = '190.211.120.214';