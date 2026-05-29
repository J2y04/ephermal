-- ============================================================
-- Ephermal — Migration 007: RLS Performance + Security Fixes
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================
--
-- Fixes two classes of warnings from supabase db advisors:
--
-- 1. auth_rls_initplan (PERFORMANCE)
--    auth.jwt() was called once per row in every RLS policy.
--    Wrapping in (select ...) caches it once per query —
--    critical at scale.
--
-- 2. function_search_path_mutable (SECURITY)
--    set_updated_at() had no fixed search_path, allowing a
--    search_path injection attack. Fixed with SET search_path = ''.
-- ============================================================

-- ── 1. Fix set_updated_at security ───────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- ── 2. Fix RLS performance — user_plans ──────────────────────
DROP POLICY IF EXISTS "users read own plan" ON user_plans;
CREATE POLICY "users read own plan"
  ON user_plans FOR SELECT
  USING (user_id = (SELECT auth.jwt()->>'sub'));

-- ── 3. Fix RLS performance — ugc_credits ─────────────────────
DROP POLICY IF EXISTS "users read own credits" ON ugc_credits;
CREATE POLICY "users read own credits"
  ON ugc_credits FOR SELECT
  USING (user_id = (SELECT auth.jwt()->>'sub'));

-- ── 4. Fix RLS performance — user_integrations ───────────────
DROP POLICY IF EXISTS "users read own integrations"  ON user_integrations;
DROP POLICY IF EXISTS "users write own integrations" ON user_integrations;
DROP POLICY IF EXISTS "users update own integrations" ON user_integrations;

CREATE POLICY "users read own integrations"
  ON user_integrations FOR SELECT
  USING (user_id = (SELECT auth.jwt()->>'sub'));

CREATE POLICY "users write own integrations"
  ON user_integrations FOR INSERT
  WITH CHECK (user_id = (SELECT auth.jwt()->>'sub'));

CREATE POLICY "users update own integrations"
  ON user_integrations FOR UPDATE
  USING (user_id = (SELECT auth.jwt()->>'sub'));

-- ── 5. Fix RLS performance — ai_credits ──────────────────────
DROP POLICY IF EXISTS "users read own ai credits" ON ai_credits;
CREATE POLICY "users read own ai credits"
  ON ai_credits FOR SELECT
  USING (user_id = (SELECT auth.jwt()->>'sub'));

-- ── 6. Fix RLS performance — ai_topups ───────────────────────
DROP POLICY IF EXISTS "users read own ai topups" ON ai_topups;
CREATE POLICY "users read own ai topups"
  ON ai_topups FOR SELECT
  USING (user_id = (SELECT auth.jwt()->>'sub'));

-- ── 7. Fix RLS performance — campaigns ───────────────────────
DROP POLICY IF EXISTS "users read own campaigns" ON campaigns;
CREATE POLICY "users read own campaigns"
  ON campaigns FOR ALL
  USING (user_id = (SELECT auth.jwt()->>'sub'));

-- ── 8. Fix RLS performance — creatives ───────────────────────
DROP POLICY IF EXISTS "users read own creatives"   ON creatives;
DROP POLICY IF EXISTS "users update own creatives" ON creatives;
CREATE POLICY "users manage own creatives"
  ON creatives FOR ALL
  USING (user_id = (SELECT auth.jwt()->>'sub'));

-- ── 9. Fix RLS performance — audiences ───────────────────────
DROP POLICY IF EXISTS "users read own audiences" ON audiences;
CREATE POLICY "users read own audiences"
  ON audiences FOR ALL
  USING (user_id = (SELECT auth.jwt()->>'sub'));

-- ── 10. Fix RLS performance — creative_fatigue ───────────────
DROP POLICY IF EXISTS "users read own fatigue" ON creative_fatigue;
CREATE POLICY "users read own fatigue"
  ON creative_fatigue FOR ALL
  USING (user_id = (SELECT auth.jwt()->>'sub'));

-- ── 11. Fix RLS performance — shopify_products ───────────────
DROP POLICY IF EXISTS "Users see own products" ON shopify_products;
CREATE POLICY "Users see own products"
  ON shopify_products FOR ALL
  USING (user_id = (SELECT auth.jwt()->>'sub'));

-- ── 12. Fix RLS performance — optimizer_rules ────────────────
DROP POLICY IF EXISTS "Users manage own rules" ON optimizer_rules;
CREATE POLICY "Users manage own rules"
  ON optimizer_rules FOR ALL
  USING (user_id = (SELECT auth.jwt()->>'sub'));

-- ── 13. Fix RLS performance — optimizer_runs ─────────────────
DROP POLICY IF EXISTS "Users see own runs" ON optimizer_runs;
CREATE POLICY "Users see own runs"
  ON optimizer_runs FOR SELECT
  USING (user_id = (SELECT auth.jwt()->>'sub'));
