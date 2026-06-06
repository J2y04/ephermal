-- Security: wrap jwt() calls in subquery to avoid RLS re-evaluation per row
-- and revoke dangerous public function access

CREATE POLICY "users read own claims"
  ON public.oauth_claims FOR SELECT
  USING (user_id = (SELECT (auth.jwt() ->> 'sub'::text)));

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
