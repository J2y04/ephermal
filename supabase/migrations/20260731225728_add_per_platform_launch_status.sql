ALTER TABLE public.launched_campaigns
  ADD COLUMN IF NOT EXISTS meta_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS google_status text NOT NULL DEFAULT 'draft';

-- Backfill from existing shared status column so already-launched rows aren't misread as drafts.
UPDATE public.launched_campaigns
SET meta_status = CASE WHEN platform_campaign_id IS NOT NULL THEN 'active' WHEN status = 'failed' THEN 'failed' ELSE 'draft' END,
    google_status = CASE WHEN google_campaign_id IS NOT NULL THEN 'active' WHEN status = 'failed' THEN 'failed' ELSE 'draft' END
WHERE meta_status = 'draft' AND google_status = 'draft';
