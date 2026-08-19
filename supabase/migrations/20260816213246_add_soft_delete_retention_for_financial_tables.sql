-- Retention policy for account deletion (Ephermal todo #94): financial/cost-history
-- tables get a 30-day soft-delete window before hard delete, instead of being wiped
-- immediately like the rest of USER_OWNED_TABLES. Gives room for a billing dispute
-- or compliance review before the data is gone for good, per the retention pattern
-- decided with the founder.

ALTER TABLE public.generation_cost_log ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.ai_usage ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.ai_usage_topups ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.ugc_video_credits ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.ugc_video_topups ADD COLUMN deleted_at timestamptz;

-- Partial indexes so the daily cleanup sweep only ever scans soft-deleted rows,
-- not the whole table.
CREATE INDEX idx_generation_cost_log_deleted_at ON public.generation_cost_log (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_ai_usage_deleted_at ON public.ai_usage (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_ai_usage_topups_deleted_at ON public.ai_usage_topups (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_ugc_video_credits_deleted_at ON public.ugc_video_credits (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_ugc_video_topups_deleted_at ON public.ugc_video_topups (deleted_at) WHERE deleted_at IS NOT NULL;

-- Daily sweep: hard-delete rows that were soft-deleted more than 30 days ago.
-- SECURITY DEFINER so it can run as a scheduled job regardless of RLS; locked down
-- to nobody but the job scheduler itself (same hardening pattern already used for
-- increment_ai_usage_cost — revoke PUBLIC/anon/authenticated execute, pin search_path).
CREATE OR REPLACE FUNCTION public.purge_expired_soft_deletes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.generation_cost_log WHERE deleted_at < now() - interval '30 days';
  DELETE FROM public.ai_usage WHERE deleted_at < now() - interval '30 days';
  DELETE FROM public.ai_usage_topups WHERE deleted_at < now() - interval '30 days';
  DELETE FROM public.ugc_video_credits WHERE deleted_at < now() - interval '30 days';
  DELETE FROM public.ugc_video_topups WHERE deleted_at < now() - interval '30 days';
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_soft_deletes() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'purge-expired-soft-deletes',
  '0 3 * * *',
  $$SELECT public.purge_expired_soft_deletes();$$
);
