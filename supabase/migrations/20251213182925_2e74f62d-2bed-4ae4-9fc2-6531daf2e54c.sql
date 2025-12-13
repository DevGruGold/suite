-- Add earnings columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_xmrt_earned NUMERIC DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_pop_points NUMERIC DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_mining_shares BIGINT DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS github_contributions_count INTEGER DEFAULT 0;

-- Create function to aggregate user earnings from all sources
CREATE OR REPLACE FUNCTION public.get_user_earnings(user_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  profile_record record;
  github_earnings numeric := 0;
  github_contributions integer := 0;
  mining_shares bigint := 0;
  pop_points numeric := 0;
BEGIN
  -- Get profile data
  SELECT * INTO profile_record FROM profiles WHERE id = user_profile_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;
  
  -- Get GitHub earnings if username is linked
  IF profile_record.github_username IS NOT NULL THEN
    SELECT COALESCE(SUM(total_xmrt_earned), 0), COALESCE(SUM(total_contributions), 0)
    INTO github_earnings, github_contributions
    FROM github_contributors
    WHERE github_username = profile_record.github_username;
  END IF;
  
  -- Get charger PoP points if wallet is linked
  IF profile_record.wallet_address IS NOT NULL THEN
    SELECT COALESCE(SUM(pop_points), 0)
    INTO pop_points
    FROM pop_events_ledger
    WHERE wallet_address = profile_record.wallet_address;
  END IF;
  
  -- Get mining shares if wallet is linked
  IF profile_record.wallet_address IS NOT NULL THEN
    SELECT COALESCE(SUM(valid_shares), 0)
    INTO mining_shares
    FROM devices
    WHERE wallet_address = profile_record.wallet_address;
  END IF;
  
  result := jsonb_build_object(
    'github_xmrt', github_earnings,
    'github_contributions', github_contributions,
    'pop_points', pop_points,
    'mining_shares', mining_shares,
    'total_xmrt', github_earnings + pop_points,
    'wallet_address', profile_record.wallet_address
  );
  
  RETURN result;
END;
$$;

-- Create trigger to sync earnings to profile when contributions are made
CREATE OR REPLACE FUNCTION public.sync_profile_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  profile_id uuid;
BEGIN
  -- Find profile by github username
  SELECT id INTO profile_id 
  FROM profiles 
  WHERE github_username = NEW.github_username;
  
  IF profile_id IS NOT NULL THEN
    UPDATE profiles 
    SET 
      total_xmrt_earned = (
        SELECT COALESCE(SUM(total_xmrt_earned), 0) 
        FROM github_contributors 
        WHERE github_username = NEW.github_username
      ),
      github_contributions_count = (
        SELECT COALESCE(SUM(total_contributions), 0)
        FROM github_contributors
        WHERE github_username = NEW.github_username
      ),
      updated_at = NOW()
    WHERE id = profile_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger on github_contributors updates
DROP TRIGGER IF EXISTS sync_profile_on_contribution ON github_contributors;
CREATE TRIGGER sync_profile_on_contribution
  AFTER INSERT OR UPDATE ON github_contributors
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_earnings();