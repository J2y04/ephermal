-- Multi-store, phase 1 + 2: schema and backfill.
--
-- Until now "a store" and "a user" were the same thing: user_integrations is
-- one row per user holding a single Shopify shop and a single set of ad
-- platform tokens, and every other table is keyed on user_id alone. That works
-- for a merchant with one shop and breaks for an agency running Ephermal
-- across client stores.
--
-- This migration is deliberately ADDITIVE. It introduces the stores table,
-- gives every store-scoped table a nullable store_id, and backfills existing
-- rows so each current user ends up with exactly one store and behaves exactly
-- as before. No primary key is changed and nothing is made NOT NULL, because
-- the edge functions do not set store_id yet. Those changes belong to phase 3,
-- once every write path is updated. See the notes at the bottom.

-- ---------------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------------

create table if not exists public.stores (
  id                     uuid primary key default gen_random_uuid(),
  user_id                text not null,
  label                  text,

  shopify_shop           text,
  shopify_token          text,
  shopify_shop_name      text,
  shopify_synced_at      timestamptz,
  store_url              text,

  meta_token             text,
  meta_account           text,
  meta_page_id           text,
  meta_page_name         text,
  meta_page_token        text,

  google_refresh_token   text,
  google_ads_customer_id text,

  currency                text    not null default 'EUR',
  fee_payment_pct         numeric not null default 0,
  fee_payment_fixed_cents integer not null default 0,
  fee_shipping_cents      integer not null default 0,
  fee_other_pct           numeric not null default 0,

  is_default  boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,

  constraint stores_currency_check
    check (currency = any (array['EUR'::text, 'USD'::text])),
  constraint stores_fee_payment_pct_check
    check (fee_payment_pct >= 0 and fee_payment_pct <= 100),
  constraint stores_fee_other_pct_check
    check (fee_other_pct >= 0 and fee_other_pct <= 100),
  constraint stores_fee_pct_total_check
    check ((fee_payment_pct + fee_other_pct) <= 100),
  constraint stores_fee_payment_fixed_check
    check (fee_payment_fixed_cents >= 0 and fee_payment_fixed_cents <= 100000),
  constraint stores_fee_shipping_check
    check (fee_shipping_cents >= 0 and fee_shipping_cents <= 1000000)
);

create index if not exists stores_user_id_idx
  on public.stores (user_id) where archived_at is null;

-- At most one default store per user. Partial so archived stores never hold
-- the default slot hostage.
create unique index if not exists stores_one_default_per_user_idx
  on public.stores (user_id) where is_default and archived_at is null;

-- The same shop must not be connected twice under one account.
create unique index if not exists stores_user_shop_idx
  on public.stores (user_id, shopify_shop)
  where shopify_shop is not null and archived_at is null;

-- stores holds Shopify, Meta and Google OAuth tokens. user_integrations lets a
-- user SELECT their own row, which means their own tokens; that is not a
-- pattern to repeat for a table an agency will fill with client credentials.
-- RLS on with no policies, service_role only. Every read goes through an edge
-- function that has already verified the Clerk JWT.
alter table public.stores enable row level security;
grant all on public.stores to service_role;

-- ---------------------------------------------------------------------------
-- Backfill: one store per existing user, carrying their current connection
-- ---------------------------------------------------------------------------

insert into public.stores (
  user_id, label, is_default,
  shopify_shop, shopify_token, shopify_shop_name, shopify_synced_at, store_url,
  meta_token, meta_account, meta_page_id, meta_page_name, meta_page_token,
  google_refresh_token, google_ads_customer_id,
  currency, fee_payment_pct, fee_payment_fixed_cents, fee_shipping_cents, fee_other_pct
)
select
  ui.user_id,
  coalesce(ui.shopify_shop_name, ui.shopify_shop, 'My store'),
  true,
  ui.shopify_shop, ui.shopify_token, ui.shopify_shop_name, ui.shopify_synced_at, ui.store_url,
  ui.meta_token, ui.meta_account, ui.meta_page_id, ui.meta_page_name, ui.meta_page_token,
  ui.google_refresh_token, ui.google_ads_customer_id,
  ui.currency, ui.fee_payment_pct, ui.fee_payment_fixed_cents, ui.fee_shipping_cents, ui.fee_other_pct
from public.user_integrations ui
where not exists (
  select 1 from public.stores s where s.user_id = ui.user_id
);

-- ---------------------------------------------------------------------------
-- store_id on every store-scoped table
-- ---------------------------------------------------------------------------

alter table public.campaigns               add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.creatives               add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.shopify_products        add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.launched_campaigns      add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.revenue_snapshots       add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.store_intelligence      add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.audiences               add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.budget_recommendations  add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.creative_briefs         add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.creative_fatigue        add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.optimizer_rules         add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.optimizer_runs          add column if not exists store_id uuid references public.stores(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Backfill store_id to each user's single store
-- ---------------------------------------------------------------------------

do $mig$
declare
  t text;
begin
  foreach t in array array[
    'campaigns','creatives','shopify_products','launched_campaigns',
    'revenue_snapshots','store_intelligence','audiences',
    'budget_recommendations','creative_briefs','creative_fatigue',
    'optimizer_rules','optimizer_runs'
  ] loop
    execute format(
      'update public.%I tbl
          set store_id = s.id
         from public.stores s
        where s.user_id = tbl.user_id
          and s.is_default
          and s.archived_at is null
          and tbl.store_id is null', t);
  end loop;
end $mig$;

-- ---------------------------------------------------------------------------
-- Transition safety net
-- ---------------------------------------------------------------------------
-- The edge functions do not set store_id yet, so without this every row
-- written between now and phase 3 would land with store_id null and quietly
-- fall outside any store. This trigger fills it from the user's default store.
--
-- It is a bridge, not architecture. Once every write path sets store_id
-- explicitly, drop these triggers and make the column NOT NULL.

create or replace function public.fill_default_store_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.store_id is null then
    select s.id into new.store_id
      from public.stores s
     where s.user_id = new.user_id
       and s.is_default
       and s.archived_at is null
     limit 1;
  end if;
  return new;
end $fn$;

do $mig2$
declare
  t text;
begin
  foreach t in array array[
    'campaigns','creatives','shopify_products','launched_campaigns',
    'revenue_snapshots','store_intelligence','audiences',
    'budget_recommendations','creative_briefs','creative_fatigue',
    'optimizer_rules','optimizer_runs'
  ] loop
    execute format('drop trigger if exists fill_default_store_id_trg on public.%I', t);
    execute format(
      'create trigger fill_default_store_id_trg
         before insert on public.%I
         for each row execute function public.fill_default_store_id()', t);
  end loop;
end $mig2$;

-- ---------------------------------------------------------------------------
-- Lookup indexes for the store-filtered reads phase 3 will add
-- ---------------------------------------------------------------------------

create index if not exists campaigns_store_idx              on public.campaigns (user_id, store_id);
create index if not exists creatives_store_idx              on public.creatives (user_id, store_id);
create index if not exists shopify_products_store_idx       on public.shopify_products (user_id, store_id);
create index if not exists launched_campaigns_store_idx     on public.launched_campaigns (user_id, store_id);
create index if not exists revenue_snapshots_store_idx      on public.revenue_snapshots (user_id, store_id);
create index if not exists store_intelligence_store_idx     on public.store_intelligence (user_id, store_id);
create index if not exists audiences_store_idx              on public.audiences (user_id, store_id);
create index if not exists budget_recommendations_store_idx on public.budget_recommendations (user_id, store_id);
create index if not exists creative_briefs_store_idx        on public.creative_briefs (user_id, store_id);
create index if not exists creative_fatigue_store_idx       on public.creative_fatigue (user_id, store_id);
create index if not exists optimizer_rules_store_idx        on public.optimizer_rules (user_id, store_id);
create index if not exists optimizer_runs_store_idx         on public.optimizer_runs (user_id, store_id);

-- ---------------------------------------------------------------------------
-- Phase 3 blockers, recorded here so they are not rediscovered the hard way
-- ---------------------------------------------------------------------------
-- These primary keys and unique constraints encode one-store-per-user. Each
-- one silently collides the moment a second store exists, and none can be
-- widened until store_id is NOT NULL:
--
--   optimizer_rules      PK (user_id)               -> (user_id, store_id)
--   store_intelligence   PK (user_id)               -> (user_id, store_id)
--   revenue_snapshots    PK (user_id, snapshot_date)-> (user_id, store_id, snapshot_date)
--   shopify_products     UQ (shopify_id, user_id)   -> (shopify_id, user_id, store_id)
--   campaigns            PK (id, user_id)           -> id is already unique, review only
--   creatives            PK (id, user_id)           -> id is already unique, review only
--   audiences            PK (id, user_id)           -> id is already unique, review only
--   creative_fatigue     PK (creative_id, user_id)  -> review with creatives
--
-- revenue_snapshots is the sharpest: two stores syncing on the same day
-- collide on the primary key and one overwrites the other.
