-- ============================================================
-- Ephermal — Migration 008: Google OAuth Support
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================
--
-- 1. Add Google Ads columns to user_integrations
-- 2. Expand oauth_claims.platform to include 'google'
-- 3. Add RLS policy for new columns (covered by existing ALL policy)
-- ============================================================

-- ── 1. Google columns on user_integrations ────────────────
ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS google_refresh_token  text,
  ADD COLUMN IF NOT EXISTS google_ads_customer_id text;

-- ── 2. Expand platform check to include google ────────────
-- Drop existing constraint (name may vary — use DO block)
DO $$ BEGIN
  ALTER TABLE oauth_claims
    DROP CONSTRAINT oauth_claims_platform_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE oauth_claims
  ADD CONSTRAINT oauth_claims_platform_check
  CHECK (platform = ANY (ARRAY['meta'::text, 'shopify'::text, 'google'::text]));
