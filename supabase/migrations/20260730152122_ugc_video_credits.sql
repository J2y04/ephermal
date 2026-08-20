-- ============================================================
-- Ephermal — Migration 027: UGC Video Credit Pool + Cost Instrumentation
-- ============================================================
-- Adds a second, independent credit pool for real Higgsfield-generated UGC
-- video ads, separate from the existing `ugc_credits` table (which despite
-- its name only tracks text/script generations — script, hooks, copy, etc.
-- via Claude Haiku). Mirrors ugc_credits' shape and reset behavior exactly:
-- primary key includes the calendar month, so a new month starts at 0 with
-- no explicit reset job needed.

-- ── 1. Monthly UGC video credit usage ──────────────────────────────────────
create table if not exists ugc_video_credits (
  user_id   text not null,
  month     text not null,           -- YYYY-MM, calendar month (UTC)
  used      int  not null default 0,
  primary key (user_id, month)
);

create index if not exists ugc_video_credits_user_month on ugc_video_credits(user_id, month);

alter table ugc_video_credits enable row level security;

create policy "users read own ugc video credits"
  on ugc_video_credits for select
  using ( user_id = (auth.jwt()->>'sub') );

-- Only service role (Edge Functions) may insert/update — prevents spoofing.

-- ── 2. UGC video top-up ledger ──────────────────────────────────────────────
-- Records extra UGC video credit packs purchased via Stripe (€7/credit,
-- sold in packs of 5 and 15). Mirrors ai_topups. The stripe-webhook Edge
-- Function inserts a row here on payment_intent.succeeded; ugc-generate
-- sums this table (minus what's already been consumed from it) when a
-- user's monthly allowance is exhausted.
create table if not exists ugc_video_topups (
  id           uuid        primary key default gen_random_uuid(),
  user_id      text        not null,
  month        text        not null,    -- month the credits were purchased in (informational)
  credits      int         not null,    -- extra UGC video credits granted
  used         int         not null default 0,  -- how many of these top-up credits have been spent
  stripe_pi    text        unique,      -- Stripe PaymentIntent ID — also enforces idempotency
  created_at   timestamptz not null default now()
);

create index if not exists ugc_video_topups_user on ugc_video_topups(user_id, created_at);

alter table ugc_video_topups enable row level security;

create policy "users read own ugc video topups"
  on ugc_video_topups for select
  using ( user_id = (auth.jwt()->>'sub') );

-- ── 3. Generation cost log ──────────────────────────────────────────────────
-- Every script and UGC video generation logs its real underlying provider
-- cost here so margin can be calculated from actual data instead of hand
-- estimates. Not user-readable — internal margin tracking only.
create table if not exists generation_cost_log (
  id              uuid        primary key default gen_random_uuid(),
  user_id         text        not null,
  plan            text        not null,               -- starter|growth|scale at time of generation
  credit_type     text        not null check (credit_type in ('script', 'ugc_video')),
  provider        text        not null,                -- 'anthropic' | 'higgsfield'
  provider_model  text,                                 -- e.g. claude-haiku-4-5-20251001, marketing_studio_video
  provider_units  numeric,                               -- tokens (script) or Higgsfield credits (video)
  cost_eur        numeric     not null default 0,        -- our actual cost in EUR for this generation
  action          text,                                  -- ugc-generate action name (script, generate_video, ...)
  created_at      timestamptz not null default now()
);

create index if not exists generation_cost_log_user on generation_cost_log(user_id, created_at);
create index if not exists generation_cost_log_type on generation_cost_log(credit_type, created_at);

alter table generation_cost_log enable row level security;

-- No user-facing read policy — this is internal margin data, not shown in UI.
-- Only service_role can insert/select (default via service role bypassing RLS).
