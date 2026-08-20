-- Migration 018: Security fixes v2
-- ─────────────────────────────────────────────────────────────────────────────
-- H1: Fix increment_ai_usage — atomic upsert handles new users (row-missing)
-- H2: Add missing cron job to purge stripe_processed_events older than 48h
-- H3: Remove oauth_claims SELECT for authenticated users (raw token exposure)
-- ─────────────────────────────────────────────────────────────────────────────


-- ── H1: Atomic upsert in increment_ai_usage ─────────────────────────────────
-- The original UPDATE-only version returns NULL for two distinct cases:
--   (a) limit already hit (used >= p_limit)
--   (b) row doesn't exist yet (new user, first ever AI call)
-- Case (b) causes the Edge Function to incorrectly block the first message.
-- Fix: INSERT with ON CONFLICT upsert so the row is created atomically.
-- The WHERE clause on DO UPDATE still enforces the limit.
CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_user_id TEXT,
  p_month   TEXT,
  p_limit   INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  INSERT INTO ai_credits (user_id, month, used)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month) DO UPDATE
    SET used = ai_credits.used + 1
    WHERE ai_credits.used < p_limit
  RETURNING used INTO v_new_count;

  -- NULL means the WHERE clause filtered out the update (limit already hit).
  RETURN v_new_count;
END;
$$;

REVOKE ALL ON FUNCTION increment_ai_usage(TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION increment_ai_usage(TEXT, TEXT, INTEGER) TO service_role;


-- ── H2: Cron job for stripe_processed_events 48h purge ──────────────────────
-- Migration 014 created the table with a comment "Auto-purge events older than
-- 48 hours" but never created the cron job. Add it now.
SELECT cron.schedule(
  'purge-stripe-events',
  '0 * * * *',
  $$
    DELETE FROM stripe_processed_events
    WHERE processed_at < NOW() - INTERVAL '48 hours';
  $$
);


-- ── H3: Remove oauth_claims SELECT for authenticated users ───────────────────
-- Migration 011 granted authenticated users SELECT on oauth_claims, which
-- exposes the raw access_token inside the payload JSONB column.
-- oauth_claims is a server-side handshake table; clients never need to read it.
-- Edge Functions read it via service_role which bypasses RLS.
DROP POLICY IF EXISTS "users read own claims" ON public.oauth_claims;
REVOKE SELECT ON public.oauth_claims FROM authenticated;
