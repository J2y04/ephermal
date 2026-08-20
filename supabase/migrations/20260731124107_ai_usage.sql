-- Real, cost-based AI usage tracking — replaces the old ai_credits/ai_topups
-- message-count system entirely. Tracks actual $ cost per Anthropic call
-- (computed from real per-model token pricing) against a weekly per-plan
-- budget, shown to the user as a Claude-style percentage meter.

create table if not exists ai_usage (
  user_id           text not null,
  period            text not null, -- ISO week key, e.g. "2026-W05" — same format as the old ai_credits.month
  tokens_used       bigint not null default 0,
  cost_used_micros  bigint not null default 0, -- USD * 1,000,000 (integer, avoids float rounding)
  updated_at        timestamptz not null default now(),
  primary key (user_id, period)
);

create table if not exists ai_usage_topups (
  id                 uuid primary key default gen_random_uuid(),
  user_id            text not null,
  period             text not null,
  extra_cost_micros  bigint not null,
  percent            integer not null, -- 25 | 50 | 75 | 100, for display only
  created_at         timestamptz not null default now()
);

alter table ai_usage enable row level security;
alter table ai_usage_topups enable row level security;

-- Service-role only (all access goes through edge functions) — granting
-- immediately, not as an afterthought, since the exact "table exists but
-- service_role has no GRANT" bug just cost an entire night to root-cause
-- on 7 other tables (see project_oauth_grants_root_cause_2026-07-30).
grant all on table ai_usage        to service_role;
grant all on table ai_usage_topups to service_role;

-- Atomic conditional increment (mirrors the existing increment_ai_usage RPC
-- pattern) — insert-or-add, single round trip, race-safe under concurrent
-- calls from the same user.
create or replace function increment_ai_usage_cost(
  p_user_id text, p_period text, p_tokens bigint, p_cost_micros bigint
) returns void
language sql
as $$
  insert into ai_usage (user_id, period, tokens_used, cost_used_micros, updated_at)
  values (p_user_id, p_period, p_tokens, p_cost_micros, now())
  on conflict (user_id, period)
  do update set
    tokens_used      = ai_usage.tokens_used + excluded.tokens_used,
    cost_used_micros = ai_usage.cost_used_micros + excluded.cost_used_micros,
    updated_at       = now();
$$;

grant execute on function increment_ai_usage_cost(text, text, bigint, bigint) to service_role;
