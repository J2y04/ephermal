-- ============================================================
-- Ephermal — Migration 004: pg_cron cleanup jobs
--
-- Prerequisites:
--   1. Enable pg_cron in Supabase Dashboard → Database → Extensions
--   2. Run this migration in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Enable pg_cron extension ─────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Grant cron schema usage to postgres role ─────────────────
GRANT USAGE ON SCHEMA cron TO postgres;

-- ── 1. Clean up expired/used OAuth claims every 30 minutes ──
-- Keeps the oauth_claims table lean. Removes records that are
-- either expired (more than 1 hour ago) or already used.
SELECT cron.schedule(
  'cleanup-oauth-claims',
  '*/30 * * * *',
  $$
    DELETE FROM oauth_claims
    WHERE expires_at < NOW() - INTERVAL '1 hour'
       OR (used = true AND created_at < NOW() - INTERVAL '24 hours');
  $$
);

-- ── 2. Reset monthly AI credits on the 1st of each month ─────
-- Ensures the ai_credits table doesn't accumulate stale months.
-- Each month column is YYYY-MM, so old months can be pruned.
SELECT cron.schedule(
  'cleanup-old-ai-credits',
  '0 0 1 * *',
  $$
    DELETE FROM ai_credits
    WHERE month < TO_CHAR(NOW() - INTERVAL '2 months', 'YYYY-MM');
  $$
);

-- ── 3. Clean up stale UGC credits (older than 3 months) ──────
SELECT cron.schedule(
  'cleanup-old-ugc-credits',
  '0 1 1 * *',
  $$
    DELETE FROM ugc_credits
    WHERE month < TO_CHAR(NOW() - INTERVAL '3 months', 'YYYY-MM');
  $$
);
