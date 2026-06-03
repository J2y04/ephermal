-- ============================================================
-- Ephermal — Migration 010: Budget AI + Campaign Launcher
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- AI budget recommendations (all plans can read; Scale can auto-apply)
CREATE TABLE IF NOT EXISTS budget_recommendations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL,
  recommendation JSONB NOT NULL,
  applied        BOOLEAN DEFAULT false,
  auto_applied   BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE budget_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own budget recs"
  ON budget_recommendations FOR ALL
  USING (user_id = (SELECT auth.jwt()->>'sub'));

-- Zero-ad-manager campaign tracking
CREATE TABLE IF NOT EXISTS launched_campaigns (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  platform             TEXT NOT NULL CHECK (platform IN ('meta','google','both')),
  platform_campaign_id TEXT,
  google_campaign_id   TEXT,
  name                 TEXT NOT NULL DEFAULT '',
  status               TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','paused','failed')),
  objective            TEXT,
  budget_daily         NUMERIC,
  audience             JSONB,
  copy                 JSONB,
  creative_urls        JSONB,
  launched_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE launched_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own launched campaigns"
  ON launched_campaigns FOR ALL
  USING (user_id = (SELECT auth.jwt()->>'sub'));

-- GRANT anon role access (Clerk JWTs map to anon PostgreSQL role)
GRANT SELECT, INSERT, UPDATE ON budget_recommendations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON launched_campaigns TO anon;

-- updated_at trigger
CREATE TRIGGER set_launched_campaigns_updated_at
  BEFORE UPDATE ON launched_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
