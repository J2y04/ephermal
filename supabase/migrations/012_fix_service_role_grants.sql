-- Fix: service_role lacked INSERT/SELECT/UPDATE/DELETE on core tables.
-- Edge functions (meta-oauth-callback, clerk-webhook, claim-oauth) were
-- silently failing because grants were never applied at table creation.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_claims      TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_integrations TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_plans        TO service_role, authenticated;

-- anon had INSERT on user_integrations which is dangerous — revoke it
REVOKE INSERT, UPDATE, DELETE ON public.user_integrations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_plans        FROM anon;
