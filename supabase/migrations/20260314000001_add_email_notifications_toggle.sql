-- Add email_notifications_enabled to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT false;

-- Add a comment for documentation
COMMENT ON COLUMN public.profiles.email_notifications_enabled IS 'Toggle to enable email notifications for inbox messages';

-- Ensure it is visible in the profile view if there is one
-- (Profiles are usually public but this field should probably be private/protected)
-- The existing RLS for profiles likely allows users to update their own.
