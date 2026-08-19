-- Disaster-recovery correctness fix. No-op against live production, which already holds
-- exactly these definitions (verified against pg_policies before writing this).
--
-- The migrations directory mixes two naming schemes: hand-numbered (001..034) and
-- Supabase's real timestamp form (20260718...). Migrations replay in lexicographic
-- filename order, and '0' sorts before '2', so EVERY numbered file replays before EVERY
-- timestamped one -- regardless of when it actually ran in production.
--
-- That inverts one specific pair. In real time, 20260731234521 (31 Jul) set
-- creative_briefs to the auth.uid()::text pattern, and 032 (17 Aug, ledger entry
-- 20260817233538) later corrected it to auth.jwt() ->> 'sub'. On a fresh replay the order
-- flips: 032 runs early in the numbered block, then 20260731234521 runs afterwards and
-- re-applies the broken predicate. auth.uid() is always NULL for Clerk-issued JWTs, so
-- `user_id = (select auth.uid())::text` is never true -- every authenticated read of
-- creative_briefs returns zero rows.
--
-- That fails closed (no cross-user leak) but it is still a real bug: a restored or newly
-- provisioned environment would silently diverge from production. Rather than renumber
-- historical files -- which would desynchronise them from the live schema_migrations
-- ledger -- this migration simply sorts last and re-asserts the correct end state, so a
-- replay converges no matter how the earlier files order themselves.

DROP POLICY IF EXISTS creative_briefs_user_select ON public.creative_briefs;
DROP POLICY IF EXISTS creative_briefs_user_insert ON public.creative_briefs;

CREATE POLICY creative_briefs_user_select ON public.creative_briefs
  FOR SELECT
  USING (user_id = (SELECT auth.jwt() ->> 'sub'));

CREATE POLICY creative_briefs_user_insert ON public.creative_briefs
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.jwt() ->> 'sub'));
