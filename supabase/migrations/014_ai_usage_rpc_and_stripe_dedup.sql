-- Migration 014: atomic AI usage increment RPC + Stripe event deduplication
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Atomic AI usage increment ────────────────────────────────────────────
-- Called by ai-assistant Edge Function to prevent race conditions.
-- Returns the new used count, or NULL if the limit has already been reached.
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
  UPDATE ai_credits
  SET    used = used + 1
  WHERE  user_id = p_user_id
    AND  month   = p_month
    AND  used    < p_limit
  RETURNING used INTO v_new_count;

  -- NULL means the row didn't match (limit already hit or row missing)
  RETURN v_new_count;
END;
$$;

-- Grant execute only to service_role (called from Edge Functions, not client)
REVOKE ALL ON FUNCTION increment_ai_usage(TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION increment_ai_usage(TEXT, TEXT, INTEGER) TO service_role;


-- ── 2. Stripe webhook event deduplication table ──────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_processed_events (
  event_id   TEXT        PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-purge events older than 48 hours (replay window is ~24h)
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON stripe_processed_events (processed_at);

-- Enable RLS (no user can query this table directly)
ALTER TABLE stripe_processed_events ENABLE ROW LEVEL SECURITY;

-- Only service_role can insert/select
GRANT INSERT, SELECT ON stripe_processed_events TO service_role;
