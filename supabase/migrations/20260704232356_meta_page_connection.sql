-- Migration 023: Meta Page connection
-- ─────────────────────────────────────────────────────────────────────────────
-- Closes the Meta automation gap: creating a real Meta ad object (not just the
-- campaign/ad set shell) requires an ad creative with an object_story_spec
-- referencing a Facebook Page + that page's own access token.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS meta_page_id    TEXT,
  ADD COLUMN IF NOT EXISTS meta_page_name  TEXT,
  ADD COLUMN IF NOT EXISTS meta_page_token TEXT;
