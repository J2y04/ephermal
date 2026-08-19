-- Auren approval gate: recover pending actions stranded mid-execution.
--
-- handleActionResolution atomically claims a row (pending -> processing) BEFORE calling
-- Meta/Google, then writes a terminal status after. If the edge function's isolate is
-- killed between those two writes -- platform timeout, worker recycle -- the terminal
-- write never runs and the row sits at 'processing' forever. It can never be resolved
-- again either, because the claim's WHERE clause requires status='pending'. Nothing
-- swept these up: none of the 6 existing cron jobs referenced ai_pending_actions.
--
-- 'unknown' is a new terminal status, deliberately distinct from 'failed'. When a write
-- is interrupted after the ad-platform call was already in flight, we genuinely do not
-- know whether Meta/Google applied it. Recording that as 'failed' would assert something
-- untrue and invite the user to re-run a non-idempotent change (a budget multiplier
-- applied twice is real money). 'unknown' says what is actually known.

ALTER TABLE public.ai_pending_actions DROP CONSTRAINT IF EXISTS ai_pending_actions_status_check;
ALTER TABLE public.ai_pending_actions ADD CONSTRAINT ai_pending_actions_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'processing'::text, 'denied'::text,
    'expired'::text, 'executed'::text, 'failed'::text, 'unknown'::text
  ]));

-- Partial index so the sweep only ever scans non-terminal rows.
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_unresolved
  ON public.ai_pending_actions (status, created_at)
  WHERE status IN ('pending', 'processing');

-- 15 minutes is far beyond any legitimate in-flight window: callInternal is now bounded
-- at 60s, so a real execution resolves inside ~a minute. Anything still 'processing' a
-- quarter of an hour later is stranded, not slow.
CREATE OR REPLACE FUNCTION public.reap_stranded_ai_pending_actions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_pending_actions
     SET status = 'unknown',
         error = 'Execution was interrupted before it could be confirmed. This change may or may not have been applied to the ad account -- check the campaign on Meta/Google before retrying.',
         resolved_at = now()
   WHERE status = 'processing'
     AND created_at < now() - interval '15 minutes';

  -- Cards the user simply never clicked. Harmless, but leaving them 'pending' forever
  -- makes the table lie about what is actually still awaiting a decision.
  UPDATE public.ai_pending_actions
     SET status = 'expired',
         resolved_at = now()
   WHERE status = 'pending'
     AND expires_at < now();
END;
$$;

REVOKE ALL ON FUNCTION public.reap_stranded_ai_pending_actions() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'reap-stranded-ai-pending-actions',
  '*/15 * * * *',
  $$SELECT public.reap_stranded_ai_pending_actions();$$
);
