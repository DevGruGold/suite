-- Create oauth_connections table for storing Google Cloud tokens
CREATE TABLE IF NOT EXISTS public.oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  account_email TEXT,
  refresh_token TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_verified TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;

-- Users can view their own connections
CREATE POLICY "Users can view own oauth connections"
  ON public.oauth_connections FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own connections
CREATE POLICY "Users can insert own oauth connections"
  ON public.oauth_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own connections
CREATE POLICY "Users can update own oauth connections"
  ON public.oauth_connections FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own connections
CREATE POLICY "Users can delete own oauth connections"
  ON public.oauth_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_oauth_connections_updated_at
  BEFORE UPDATE ON public.oauth_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();