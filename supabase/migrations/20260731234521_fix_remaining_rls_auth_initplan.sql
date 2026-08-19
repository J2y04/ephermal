ALTER POLICY "creative_briefs_user_select" ON public.creative_briefs
  USING (user_id = (select auth.uid())::text);

ALTER POLICY "creative_briefs_user_insert" ON public.creative_briefs
  WITH CHECK (user_id = (select auth.uid())::text);

ALTER POLICY "Users see own revenue snapshots" ON public.revenue_snapshots
  USING (user_id = (select auth.jwt() ->> 'sub'));

ALTER POLICY "Users see own store intelligence" ON public.store_intelligence
  USING (user_id = (select auth.jwt() ->> 'sub'));

ALTER POLICY "users read own ugc video credits" ON public.ugc_video_credits
  USING (user_id = (select auth.jwt() ->> 'sub'));

ALTER POLICY "users read own ugc video topups" ON public.ugc_video_topups
  USING (user_id = (select auth.jwt() ->> 'sub'));
