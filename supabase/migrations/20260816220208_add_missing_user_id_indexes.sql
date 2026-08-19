-- Video 8 (todo's.md): "database indexes so your key queries stay fast" — these 5
-- user-owned tables had no index on user_id at all, meaning any WHERE user_id = X
-- query (which is how every one of them is actually queried) would require a full
-- table scan. Harmless today at near-zero row counts, but free to fix now.
CREATE INDEX idx_budget_recommendations_user_id ON public.budget_recommendations (user_id);
CREATE INDEX idx_creative_briefs_user_id ON public.creative_briefs (user_id);
CREATE INDEX idx_launched_campaigns_user_id ON public.launched_campaigns (user_id);
CREATE INDEX idx_ai_usage_topups_user_id ON public.ai_usage_topups (user_id);
CREATE INDEX idx_oauth_nonces_user_id ON public.oauth_nonces (user_id);
