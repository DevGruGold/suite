-- Migration: Create treasury_stats view
-- Date: 2025-12-31
-- Purpose: Provide real-time treasury statistics from mining data

-- Drop view if exists
DROP VIEW IF EXISTS public.treasury_stats;

-- Create treasury_stats view
CREATE VIEW public.treasury_stats AS
SELECT 
  wallet_address,
  SUM(COALESCE((metadata->>'total_hashes')::bigint, 0)) as total_hashes,
  SUM(COALESCE((metadata->>'valid_shares')::bigint, 0)) as valid_shares,
  SUM(COALESCE((metadata->>'invalid_shares')::bigint, 0)) as invalid_shares,
  SUM(COALESCE((metadata->>'amt_paid')::bigint, 0)) as amt_paid_atomic,
  SUM(COALESCE((metadata->>'amt_due')::bigint, 0)) as amt_due_atomic,
  -- Convert atomic units to XMR (1 XMR = 1e12 piconeros)
  ROUND(SUM(COALESCE((metadata->>'amt_paid')::bigint, 0)) / 1000000000000.0, 12) as amt_paid_xmr,
  ROUND(SUM(COALESCE((metadata->>'amt_due')::bigint, 0)) / 1000000000000.0, 12) as amt_due_xmr,
  COUNT(*) FILTER (WHERE is_active = true) as active_workers,
  COUNT(*) as total_workers,
  MAX(last_seen_at) as last_activity_at,
  NOW() as updated_at
FROM xmr_workers
WHERE wallet_address IS NOT NULL
GROUP BY wallet_address;

-- Grant access to the view
GRANT SELECT ON public.treasury_stats TO anon, authenticated;

-- Add comment
COMMENT ON VIEW public.treasury_stats IS 'Real-time treasury statistics aggregated from XMR mining workers';
