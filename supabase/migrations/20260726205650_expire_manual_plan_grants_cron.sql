-- ============================================================
-- Ephermal — Migration 025: auto-expire manual plan grants
--
-- admin-api's set_plan action can now attach an expiry (period_end) to a
-- manually-granted plan (e.g. "3 months free Growth" for beta testers).
-- This job is what actually enforces that expiry: once a day, any
-- non-Stripe row (stripe_sub_id IS NULL) whose period_end has passed gets
-- reverted to 'starter' and its period_end cleared.
--
-- Scope is intentionally narrow — stripe_sub_id IS NULL means this can
-- NEVER touch a real paying subscriber's row; Stripe webhooks own
-- period_end for those (see stripe-webhook/index.ts), and this job's WHERE
-- clause structurally cannot match them.
--
-- Known limitation: this updates user_plans (the source of truth every
-- edge function checks server-side for real feature gating — see
-- ai-assistant/index.ts's getUsage, dashboard.html's canAccess() is
-- UX-only per admin/layout.tsx's own comment) but does NOT also revert the
-- user's Clerk publicMetadata.plan, since that would require an
-- authenticated HTTP call out of Postgres (pg_net + a stored secret) for a
-- purely cosmetic staleness window. Worst case: the dashboard UI still
-- *shows* the expired tier until the user's next login refreshes their
-- Clerk session — every actual feature call still re-checks user_plans
-- and is correctly blocked immediately.
-- ============================================================

SELECT cron.schedule(
  'expire-manual-plan-grants',
  '0 3 * * *',  -- daily at 03:00 UTC
  $$
    UPDATE user_plans
    SET plan = 'starter', period_end = NULL
    WHERE stripe_sub_id IS NULL
      AND period_end IS NOT NULL
      AND period_end < NOW()
      AND plan <> 'starter';
  $$
);
