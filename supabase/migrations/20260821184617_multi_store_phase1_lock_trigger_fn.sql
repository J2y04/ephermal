-- fill_default_store_id is a trigger function, but SECURITY DEFINER functions
-- in the public schema are also exposed as RPC endpoints. Supabase's linter
-- flagged it as callable by anon and authenticated via
-- /rest/v1/rpc/fill_default_store_id.
--
-- Calling it that way would fail anyway (no trigger context, so NEW is not
-- defined), but an unauthenticated caller should not be able to reach a
-- SECURITY DEFINER function at all. Triggers run as the table owner and do not
-- consult the caller's EXECUTE privilege, so revoking costs nothing.

revoke all on function public.fill_default_store_id() from public;
revoke all on function public.fill_default_store_id() from anon;
revoke all on function public.fill_default_store_id() from authenticated;
