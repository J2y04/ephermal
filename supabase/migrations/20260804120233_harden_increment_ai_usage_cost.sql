-- Harden increment_ai_usage_cost the same way its sibling increment_ai_usage already is:
-- revoke the default PUBLIC execute grant and lock search_path against hijacking. This was
-- applied live via a manual migration (harden_increment_ai_usage_cost, 2026-08-04) but never
-- checked into this migrations folder — without this file, a fresh DB built by replaying
-- supabase/migrations/ (disaster recovery, a new preview branch, `supabase db reset`) would
-- silently recreate the function without the hardening.
REVOKE EXECUTE ON FUNCTION public.increment_ai_usage_cost(text,text,bigint,bigint) FROM PUBLIC;
ALTER FUNCTION public.increment_ai_usage_cost(text,text,bigint,bigint) SET search_path = public, pg_temp;
