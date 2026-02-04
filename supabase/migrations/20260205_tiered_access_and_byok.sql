-- Add role column to profiles if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin', 'superadmin'));
    END IF;
END $$;

-- Create user_api_connections table for BYOK
CREATE TABLE IF NOT EXISTS public.user_api_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'github', 'vercel', 'openai', etc.
    api_key TEXT NOT NULL, -- Encrypted or plain text depending on requirements (using plain for now with RLS)
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, provider)
);

-- RLS Policies for user_api_connections
ALTER TABLE public.user_api_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own connections" 
ON public.user_api_connections FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own connections" 
ON public.user_api_connections FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connections" 
ON public.user_api_connections FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connections" 
ON public.user_api_connections FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE TRIGGER update_user_api_connections_updated_at
    BEFORE UPDATE ON public.user_api_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
