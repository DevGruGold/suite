-- Ensure the column exists (safe retry of previous migration)
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'profiles'
        AND column_name = 'membership_tier'
) THEN
ALTER TABLE public.profiles
ADD COLUMN membership_tier text DEFAULT 'user';
-- Drop constraint if exists to avoid error on recreation
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_membership_tier_check;
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_membership_tier_check CHECK (
        membership_tier IN (
            'user',
            'contributor',
            'moderator',
            'admin',
            'super_admin'
        )
    );
END IF;
END $$;
-- Promote the specific user to super_admin
UPDATE public.profiles
SET membership_tier = 'super_admin'
WHERE id IN (
        SELECT id
        FROM auth.users
        WHERE email = 'xmrtnet@gmail.com'
    );