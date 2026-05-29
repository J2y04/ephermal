-- ============================================================
-- Ephermal — Campaigns, Creatives, Audiences, Creative Fatigue
-- Run after 001-004 migrations
-- ============================================================

-- 1. CAMPAIGNS
-- Server-side cache of Meta campaign data per user.
-- Updated by meta-api Edge Function on every fetch.
create table if not exists campaigns (
  id              text        not null,   -- Meta campaign ID
  user_id         text        not null,   -- Clerk user ID
  account_id      text        not null,   -- Meta ad account ID
  name            text        not null,
  status          text        not null default 'draft',
  platform        text        not null default 'meta',
  objective       text,
  daily_budget    bigint,                 -- cents
  total_spend     numeric(12,2) default 0,
  roas            numeric(6,2),
  ctr             numeric(6,2),
  impressions     bigint      default 0,
  clicks          bigint      default 0,
  conversions     bigint      default 0,
  placement       text,
  meta_data       jsonb,                  -- raw Meta API response
  synced_at       timestamptz default now(),
  created_at      timestamptz default now(),
  primary key (id, user_id)
);

-- 2. CREATIVES
-- Stores creative metadata + review status.
create table if not exists creatives (
  id              text        not null,   -- Meta creative ID or internal UUID
  user_id         text        not null,
  account_id      text,
  campaign_id     text,
  headline        text,
  body            text,
  type            text        not null default 'image', -- image | video | ugc
  status          text        not null default 'pending_review',
  thumbnail_url   text,
  asset_url       text,
  platform        text        default 'meta',
  impressions     bigint      default 0,
  clicks          bigint      default 0,
  ctr             numeric(6,2),
  roas            numeric(6,2),
  frequency       numeric(6,2),
  fatigue_score   int         check (fatigue_score between 0 and 100),
  meta_data       jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  primary key (id, user_id)
);

-- 3. AUDIENCES
-- Meta Custom Audience records per user.
create table if not exists audiences (
  id              text        not null,   -- Meta audience ID
  user_id         text        not null,
  account_id      text,
  name            text        not null,
  type            text        default 'CUSTOM',
  subtype         text,                   -- CUSTOMER_FILE | WEBSITE | LOOKALIKE etc.
  approximate_count bigint,
  delivery_status text,
  meta_data       jsonb,
  created_at      timestamptz default now(),
  synced_at       timestamptz default now(),
  primary key (id, user_id)
);

-- 4. CREATIVE FATIGUE
-- Computed fatigue scores — updated by creative-fatigue Edge Function.
create table if not exists creative_fatigue (
  creative_id     text        not null,
  user_id         text        not null,
  score           int         not null check (score between 0 and 100),
  level           text        not null check (level in ('ok','warn','critical')),
  signals         jsonb       default '[]',   -- array of signal strings
  recommendation  text,
  computed_at     timestamptz default now(),
  primary key (creative_id, user_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table campaigns         enable row level security;
alter table creatives         enable row level security;
alter table audiences         enable row level security;
alter table creative_fatigue  enable row level security;

-- Campaigns: users read own rows
create policy "users read own campaigns"
  on campaigns for select using ( user_id = (auth.jwt()->>'sub') );

-- Creatives: users read own rows
create policy "users read own creatives"
  on creatives for select using ( user_id = (auth.jwt()->>'sub') );

create policy "users update own creatives"
  on creatives for update using ( user_id = (auth.jwt()->>'sub') );

-- Audiences: users read own rows
create policy "users read own audiences"
  on audiences for select using ( user_id = (auth.jwt()->>'sub') );

-- Creative fatigue: users read own rows
create policy "users read own fatigue"
  on creative_fatigue for select using ( user_id = (auth.jwt()->>'sub') );

-- ============================================================
-- TRIGGERS
-- ============================================================
create trigger trg_creatives_updated_at
  before update on creatives
  for each row execute function set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists campaigns_user_id         on campaigns(user_id);
create index if not exists campaigns_user_status      on campaigns(user_id, status);
create index if not exists creatives_user_id          on creatives(user_id);
create index if not exists creatives_user_status      on creatives(user_id, status);
create index if not exists audiences_user_id          on audiences(user_id);
create index if not exists creative_fatigue_user_id   on creative_fatigue(user_id);
create index if not exists creative_fatigue_score     on creative_fatigue(user_id, score desc);
