-- ============================================================
-- Ephermal — Initial Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. USER PLANS
-- Stores subscription tier per Clerk user ID.
-- Updated by the stripe-webhook Edge Function on payment events.
create table if not exists user_plans (
  user_id             text primary key,        -- Clerk user ID (user_xxx)
  plan                text not null default 'starter' check (plan in ('starter','growth','scale')),
  stripe_customer_id  text unique,
  stripe_sub_id       text unique,
  period_end          timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- 2. UGC CREDITS
-- Tracks how many UGC videos each user has generated per calendar month.
-- month column is YYYY-MM (e.g. '2026-05').
create table if not exists ugc_credits (
  user_id   text not null,
  month     text not null,
  used      int  not null default 0,
  primary key (user_id, month)
);

-- 3. USER INTEGRATIONS
-- Stores Meta Ads credentials server-side.
-- Protected by RLS — each user can only read/write their own row.
-- Supabase encrypts the DB at rest; enable Vault for column-level encryption in production.
create table if not exists user_integrations (
  user_id        text primary key,
  meta_token     text,       -- Meta Ads access token (treat as secret)
  meta_account   text,       -- act_xxxxxxxxxx
  store_url      text,
  updated_at     timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Supabase must be configured to accept Clerk JWTs.
-- See: https://supabase.com/docs/guides/auth/third-party/clerk
-- The JWT sub claim = Clerk user ID.
-- ============================================================

alter table user_plans        enable row level security;
alter table ugc_credits        enable row level security;
alter table user_integrations  enable row level security;

-- user_plans: users read own row; only service role writes (via webhook)
create policy "users read own plan"
  on user_plans for select
  using ( user_id = (auth.jwt()->>'sub') );

-- ugc_credits: users read own rows
create policy "users read own credits"
  on ugc_credits for select
  using ( user_id = (auth.jwt()->>'sub') );

-- user_integrations: users read AND write own row
create policy "users read own integrations"
  on user_integrations for select
  using ( user_id = (auth.jwt()->>'sub') );

create policy "users write own integrations"
  on user_integrations for insert
  with check ( user_id = (auth.jwt()->>'sub') );

create policy "users update own integrations"
  on user_integrations for update
  using ( user_id = (auth.jwt()->>'sub') );

-- ============================================================
-- HELPER FUNCTION: auto-update updated_at timestamp
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_user_plans_updated_at
  before update on user_plans
  for each row execute function set_updated_at();

create trigger trg_user_integrations_updated_at
  before update on user_integrations
  for each row execute function set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists ugc_credits_user_month on ugc_credits(user_id, month);
