-- ============================================================
-- Ephermal — Shopify Products + ROAS Optimizer Tables
-- Run after 001-005 migrations
-- ============================================================

-- 1. SHOPIFY PRODUCTS
-- Server-side cache of Shopify product catalog per user.
-- Updated by shopify-api Edge Function on sync.
create table if not exists shopify_products (
  id              uuid        primary key default gen_random_uuid(),
  shopify_id      text        not null,
  user_id         text        not null,
  shop            text        not null,
  title           text        not null,
  handle          text,
  vendor          text,
  product_type    text,
  status          text        not null default 'active',
  image_url       text,
  variants        jsonb       default '[]',
  meta_data       jsonb,
  synced_at       timestamptz default now(),
  created_at      timestamptz default now(),
  unique (shopify_id, user_id)
);

alter table shopify_products enable row level security;

create policy "Users see own products"
  on shopify_products for all
  using (user_id = auth.jwt()->>'sub');

create index if not exists shopify_products_user_idx
  on shopify_products (user_id, status);

-- 2. OPTIMIZER RULES
-- Per-user configuration for the ROAS optimizer.
-- Falls back to defaults if no row exists.
create table if not exists optimizer_rules (
  user_id           text    primary key,
  pause_below_roas  numeric(5,2) not null default 1.0,
  scale_above_roas  numeric(5,2) not null default 3.0,
  scale_multiplier  numeric(5,2) not null default 1.25,
  max_daily_budget  numeric(10,2) not null default 500,
  min_spend         numeric(10,2) not null default 20,
  lookback_days     int     not null default 7,
  auto_apply        boolean not null default false,  -- true = apply without manual review
  updated_at        timestamptz default now()
);

alter table optimizer_rules enable row level security;

create policy "Users manage own rules"
  on optimizer_rules for all
  using (user_id = auth.jwt()->>'sub');

-- 3. OPTIMIZER RUNS
-- Audit log of every optimization run (analyze + apply).
create table if not exists optimizer_runs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  actions     jsonb       not null default '[]',   -- array of {id, action, success, error}
  summary     jsonb       not null default '{}',   -- {applied, failed}
  ran_at      timestamptz not null default now()
);

alter table optimizer_runs enable row level security;

create policy "Users see own runs"
  on optimizer_runs for select
  using (user_id = auth.jwt()->>'sub');

create index if not exists optimizer_runs_user_idx
  on optimizer_runs (user_id, ran_at desc);

-- 4. ADD shopify_synced_at to user_integrations if missing
alter table user_integrations
  add column if not exists shopify_synced_at timestamptz;

-- 5. ADD shopify_shop_name to user_integrations if missing
alter table user_integrations
  add column if not exists shopify_shop_name text;
