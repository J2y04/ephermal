-- Migration 024: OAuth State Nonces
-- ─────────────────────────────────────────────────────────────────────────────
-- Server-side single-use storage for the nonce embedded in the HMAC-signed OAuth
-- state (see oauth-state-init and _shared/auth.ts::signOAuthState). The HMAC
-- already prevents an attacker from forging a state for someone else's userId,
-- but without this table a captured, still-valid state string could be replayed
-- against the callback more than once. oauth-state-init INSERTs the nonce when
-- it mints a state; each *-oauth-callback function DELETEs it (single-use) right
-- after HMAC verification passes and rejects the callback if no row was deleted
-- (already used, or minted more than 15 minutes ago).
-- No RLS policies — only the edge functions (service_role) ever touch this table.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oauth_nonces (
  nonce      TEXT        PRIMARY KEY,
  user_id    TEXT        NOT NULL,
  platform   TEXT        NOT NULL CHECK (platform IN ('meta', 'shopify', 'google')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_nonces_created_at ON oauth_nonces (created_at);

ALTER TABLE oauth_nonces ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — service_role (used only by the edge functions) bypasses RLS;
-- anon/authenticated get zero access since callers never query this table directly.

-- Auto-cleanup of stale/abandoned nonces (started but never completed an OAuth flow).
-- Enable pg_cron in Supabase Dashboard → Database → Extensions, then uncomment:

-- SELECT cron.schedule(
--   'cleanup-oauth-nonces',
--   '*/30 * * * *',
--   $$DELETE FROM oauth_nonces WHERE created_at < NOW() - INTERVAL '1 hour'$$
-- );
