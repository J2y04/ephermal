-- Migration 020: MRR Tracker
-- ─────────────────────────────────────────────────────────────────────────────
-- Daily revenue + ad spend snapshots combining Shopify orders, Meta spend, and
-- Google Ads spend into one time series per user. Populated by the
-- mrr-tracker Edge Function's 'sync' action; read back by 'get_report'.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS revenue_snapshots (
  user_id               TEXT        NOT NULL,
  snapshot_date         DATE        NOT NULL,
  shopify_revenue_cents BIGINT      NOT NULL DEFAULT 0,
  shopify_orders_count  INT         NOT NULL DEFAULT 0,
  meta_spend_cents      BIGINT      NOT NULL DEFAULT 0,
  google_spend_cents    BIGINT      NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, snapshot_date)
);

ALTER TABLE revenue_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own revenue snapshots"
  ON revenue_snapshots FOR SELECT
  USING (user_id = auth.jwt()->>'sub');

REVOKE INSERT, UPDATE, DELETE ON revenue_snapshots FROM authenticated;

CREATE INDEX IF NOT EXISTS revenue_snapshots_user_date_idx
  ON revenue_snapshots (user_id, snapshot_date DESC);
