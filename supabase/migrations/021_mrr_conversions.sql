-- Migration 021: add conversions to revenue_snapshots
ALTER TABLE revenue_snapshots
  ADD COLUMN IF NOT EXISTS conversions INT NOT NULL DEFAULT 0;
