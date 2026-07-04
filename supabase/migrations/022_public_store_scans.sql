-- Migration 022: Public Store Scans
-- ─────────────────────────────────────────────────────────────────────────────
-- Cache for the free, no-login "Analyse Your Store" landing-page tool. Keyed by
-- domain so repeated visits/shares of the same store don't re-trigger a Claude
-- call. No RLS policies — only the public-store-scan Edge Function (service_role)
-- ever reads or writes this table; there is no end-user session to scope by.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public_store_scans (
  domain        TEXT        PRIMARY KEY,
  result        JSONB       NOT NULL,
  model_version TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public_store_scans ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — service_role (used only by the edge function) bypasses RLS;
-- anon/authenticated get zero access since this table has no per-user scope.
