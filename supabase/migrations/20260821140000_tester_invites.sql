-- Tester invite links.
--
-- Before this, onboarding a tester meant Jamal creating or finding the account,
-- then manually setting role='testuser' (which auto-grants Growth). That is a
-- step he has to remember, after a conversation that may have happened days
-- earlier, and it cannot be handed to someone else.
--
-- An invite link moves the grant to the moment of signup: the tester follows a
-- one-time URL, signs up normally through Clerk, and redeem-invite applies the
-- exact same role + plan grant server-side. It also answers the question he
-- actually needs answered, which is who has and has not accepted.

create table if not exists public.tester_invites (
  id            uuid primary key default gen_random_uuid(),
  -- URL-safe random, generated in the edge function with crypto.getRandomValues.
  token         text        not null unique,
  -- Free text so the row is recognisable in the admin list before it is used:
  -- a name, a company, where the conversation happened.
  label         text,
  -- Set when the invite was emailed, so a later signup can be matched back.
  email         text,
  created_by    text        not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  -- Redemption. used_at is the single source of truth for "was this used", and
  -- the atomic claim in redeem-invite keys off it being null.
  used_at       timestamptz,
  used_by_user_id text,
  used_by_email   text,
  revoked_at    timestamptz
);

comment on table public.tester_invites is
  'One-time signup links that grant role=testuser and the Growth plan on redemption.';

-- The admin list is always "newest first", and redemption always looks up by token.
create index if not exists tester_invites_created_at_idx on public.tester_invites (created_at desc);

-- Service-role only. No end user ever selects from this table directly: the
-- redeem path looks a token up by equality inside an edge function, and the
-- admin list goes through admin-api behind requireAdmin().
alter table public.tester_invites enable row level security;

-- RLS is on and there are deliberately no policies, so anon/authenticated get
-- nothing. service_role bypasses RLS but still needs the underlying GRANT --
-- omitting this is what silently broke seven tables in July, so it is explicit.
grant all on table public.tester_invites to service_role;
