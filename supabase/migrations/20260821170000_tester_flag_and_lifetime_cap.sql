-- Test users are on Growth free for three months. Without a ceiling that is an
-- open tab on real Anthropic and Higgsfield spend, and the weekly AI budget
-- resets every Monday forever, so "free for three months" quietly means
-- thirteen full weekly budgets per tester.
--
-- The role itself lives in Clerk public_metadata, which is the right home for
-- it, but checking Clerk on every AI call would add a network hop to the hot
-- path. This mirrors the flag into the row the budget check already reads.
alter table public.user_plans
  add column if not exists is_tester boolean not null default false;

comment on column public.user_plans.is_tester is
  'Mirror of Clerk public_metadata.role = testuser. Set by redeem-invite and admin set_role. Drives the lifetime AI ceiling and the UGC block, both of which cost real money per call.';

-- Backfill: anyone already holding a comped Growth plan with no Stripe
-- subscription is, in practice, a tester. Narrow on purpose: a real paying
-- Growth customer has a stripe_sub_id and is untouched.
update public.user_plans
   set is_tester = true
 where stripe_sub_id is null
   and plan in ('growth', 'scale')
   and user_id <> 'user_3EH26KeoJKXqRhbIvLrAMkWCkvi';

create index if not exists user_plans_is_tester_idx on public.user_plans (is_tester) where is_tester;
