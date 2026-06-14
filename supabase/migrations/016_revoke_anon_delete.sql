-- Migration 016: Revoke anon DELETE on launched_campaigns
-- The anon role should never be able to delete campaigns.
-- RLS protects it today, but the grant itself is an asymmetric risk.
REVOKE DELETE ON TABLE public.launched_campaigns FROM anon;
