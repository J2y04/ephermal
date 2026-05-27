-- ============================================================
-- Ephermal — Migration 002: OAuth tables
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. Extend user_integrations for Shopify ──────────────────
-- The table already exists from migration 001. We add Shopify
-- columns so the Edge Function can store tokens server-side.
-- user_integrations has user_id as PRIMARY KEY (one row per user).

ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS shopify_token     TEXT,
  ADD COLUMN IF NOT EXISTS shopify_shop      TEXT,   -- e.g. mystore.myshopify.com
  ADD COLUMN IF NOT EXISTS shopify_shop_name TEXT;   -- display name from Shopify API

-- ── 2. OAuth claims table ─────────────────────────────────────
-- One-time, short-lived records created by the Edge Function
-- after a successful OAuth token exchange.
-- The frontend exchanges the claim code for the token via the
-- claim-oauth Edge Function. The token itself never appears in
-- a redirect URL.
CREATE TABLE IF NOT EXISTS oauth_claims (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL,
  platform    TEXT        NOT NULL CHECK (platform IN ('meta', 'shopify')),
  payload     JSONB       NOT NULL,   -- { access_token, account_id, ... }
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup used by the claim-oauth Edge Function
CREATE INDEX IF NOT EXISTS idx_oauth_claims_lookup
  ON oauth_claims (id, user_id, platform, used, expires_at);

-- ── 3. Row Level Security ─────────────────────────────────────
-- Only the service role (Edge Functions) may read/write claims.
-- No end-user RLS policies — users never query this table directly.
ALTER TABLE oauth_claims ENABLE ROW LEVEL SECURITY;

-- ── 4. Auto-cleanup ───────────────────────────────────────────
-- Prevents the table from growing unbounded.
-- Enable pg_cron in Supabase Dashboard → Database → Extensions,
-- then uncomment the line below.

-- SELECT cron.schedule(
--   'cleanup-oauth-claims',
--   '*/30 * * * *',
--   $$DELETE FROM oauth_claims WHERE expires_at < NOW() - INTERVAL '1 hour'$$
-- );
