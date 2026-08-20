-- 7 tables were created without granting service_role any DML privileges,
-- despite having RLS enabled (service_role bypasses RLS by default, but still
-- needs the underlying GRANT). Every edge function connects as service_role,
-- so every write/read to these tables has been silently failing with
-- "permission denied for table X" since each table's creation - confirmed via
-- recurring Postgres error logs for all 7 tables throughout normal operation.
-- This is the actual root cause of oauth-state-init's "Server error" on the
-- nonce insert (blocking every OAuth connect flow), plus silent breakage of
-- revenue_snapshots (MRR tracker), the UGC video credit/topup system,
-- store_intelligence, public_store_scans, and generation_cost_log.
GRANT ALL ON TABLE public.generation_cost_log TO service_role;
GRANT ALL ON TABLE public.oauth_nonces        TO service_role;
GRANT ALL ON TABLE public.public_store_scans  TO service_role;
GRANT ALL ON TABLE public.revenue_snapshots   TO service_role;
GRANT ALL ON TABLE public.store_intelligence  TO service_role;
GRANT ALL ON TABLE public.ugc_video_credits   TO service_role;
GRANT ALL ON TABLE public.ugc_video_topups    TO service_role;
