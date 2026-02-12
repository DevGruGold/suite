ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS membership_tier text DEFAULT 'user';
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