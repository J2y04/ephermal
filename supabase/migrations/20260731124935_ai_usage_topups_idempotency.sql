-- Idempotency key for webhook retries — Stripe can redeliver the same
-- payment_intent.succeeded event; without a unique constraint on stripe_pi,
-- a retry would double-credit the top-up.
alter table ai_usage_topups add column if not exists stripe_pi text;
create unique index if not exists ai_usage_topups_stripe_pi_key on ai_usage_topups (stripe_pi);
