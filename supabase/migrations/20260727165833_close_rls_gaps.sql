-- Security audit 2026-07-28: two gaps found in production that migration 011
-- (never applied — not in the tracked migration history) was supposed to close.
--
-- 1. rls_auto_enable() is a SECURITY DEFINER event-trigger function. An earlier
--    attempt revoked EXECUTE from anon/authenticated, but Postgres grants EXECUTE
--    to PUBLIC by default at creation time and role-specific REVOKEs don't touch
--    that — every role still inherits it through PUBLIC. Practical exploitability
--    is low (Postgres refuses to invoke event-trigger-typed functions outside the
--    trigger context), but the grant should be closed properly regardless.
--
-- 2. oauth_claims has RLS enabled but no policy, so it defaults to deny-all for
--    anon/authenticated (safe — only the claim-oauth edge function, using the
--    service-role key, ever touches this table). Adding the intended read policy
--    anyway for defense-in-depth and to match documented intent.

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;

DROP POLICY IF EXISTS "users read own claims" ON public.oauth_claims;
CREATE POLICY "users read own claims"
  ON public.oauth_claims FOR SELECT
  USING (user_id = (SELECT (auth.jwt() ->> 'sub'::text)));
