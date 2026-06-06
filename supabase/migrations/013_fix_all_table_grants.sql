-- Fix: service_role and authenticated lack DML on all core tables.
-- Same root cause as migration 012 — applies to every table created after the initial schema.
-- anon retains SELECT where the frontend reads directly; dangerous anon mutations are revoked.

-- ── AI credits & topups ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_credits  TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_topups   TO service_role, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ai_credits  FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ai_topups   FROM anon;

-- ── UGC credits ──────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ugc_credits TO service_role, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ugc_credits FROM anon;

-- ── Ad data tables ───────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns        TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creatives        TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audiences        TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_fatigue TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopify_products TO service_role, authenticated;

-- anon needs SELECT on these so the dashboard can render data directly
GRANT SELECT ON public.campaigns        TO anon;
GRANT SELECT ON public.creatives        TO anon;
GRANT SELECT ON public.audiences        TO anon;
GRANT SELECT ON public.creative_fatigue TO anon;
GRANT SELECT ON public.shopify_products TO anon;

-- ── Optimizer ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.optimizer_rules TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.optimizer_runs  TO service_role, authenticated;
GRANT SELECT ON public.optimizer_rules TO anon;
GRANT SELECT ON public.optimizer_runs  TO anon;

-- ── Budget AI ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_recommendations TO service_role, authenticated;
-- anon had INSERT/UPDATE — revoke (dangerous: unauthenticated users could inject recommendations)
REVOKE INSERT, UPDATE, DELETE ON public.budget_recommendations FROM anon;
GRANT SELECT ON public.budget_recommendations TO anon;

-- ── Campaign launcher ────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.launched_campaigns TO service_role, authenticated;
-- anon had full DML — revoke (dangerous)
REVOKE INSERT, UPDATE, DELETE ON public.launched_campaigns FROM anon;
GRANT SELECT ON public.launched_campaigns TO anon;
