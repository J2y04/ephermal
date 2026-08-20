-- Add cancelling_at to user_plans so the dashboard can show "Cancels on [date]"
-- before the Stripe webhook fires. Written by the cancel-subscription edge function.

ALTER TABLE public.user_plans
  ADD COLUMN IF NOT EXISTS cancelling_at TIMESTAMPTZ;

-- Grant service_role write access (already has it, but be explicit)
GRANT SELECT, INSERT, UPDATE ON public.user_plans TO service_role;
