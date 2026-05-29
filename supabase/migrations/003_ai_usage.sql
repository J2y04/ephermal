-- ============================================================
-- Ephermal — Migration 003: AI Usage Tracking
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- AI message credits per user per calendar month.
-- Same pattern as ugc_credits — simple counter with upsert.
CREATE TABLE IF NOT EXISTS ai_credits (
  user_id   TEXT NOT NULL,
  month     TEXT NOT NULL,           -- YYYY-MM
  used      INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

CREATE INDEX IF NOT EXISTS ai_credits_user_month ON ai_credits (user_id, month);

-- ── Row Level Security ─────────────────────────────────────
ALTER TABLE ai_credits ENABLE ROW LEVEL SECURITY;

-- Users can read their own rows (to show remaining credits in UI)
CREATE POLICY "users read own ai credits"
  ON ai_credits FOR SELECT
  USING ( user_id = (auth.jwt()->>'sub') );

-- Only service role (n8n / Edge Functions) may insert or update.
-- No user-level write policy — prevents spoofing.

-- ── Top-up ledger ─────────────────────────────────────────
-- Records extra AI message packs purchased via Stripe.
-- The stripe-webhook Edge Function inserts rows here on payment.
-- n8n sums this table when checking the effective monthly limit.
CREATE TABLE IF NOT EXISTS ai_topups (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL,
  month        TEXT        NOT NULL,    -- applies to this month only
  messages     INT         NOT NULL,    -- extra messages granted
  stripe_pi    TEXT,                    -- Stripe PaymentIntent ID
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_topups_user_month ON ai_topups (user_id, month);

ALTER TABLE ai_topups ENABLE ROW LEVEL SECURITY;

-- Users can read their own top-up rows (for UI display)
CREATE POLICY "users read own ai topups"
  ON ai_topups FOR SELECT
  USING ( user_id = (auth.jwt()->>'sub') );
