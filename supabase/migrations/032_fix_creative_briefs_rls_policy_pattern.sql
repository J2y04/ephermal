-- creative_briefs had two undocumented policies (created directly against the live DB,
-- never committed here) using auth.uid()::text instead of the auth.jwt() ->> 'sub'
-- pattern every other user-scoped table in this app uses. auth.uid() casts to ::uuid,
-- which doesn't match Clerk's non-UUID user id format -- not exploitable today since
-- creative_briefs is only ever touched via the service_role key, but would break (not
-- leak) the moment a future feature reads it directly from the client.

DROP POLICY IF EXISTS creative_briefs_user_select ON public.creative_briefs;
DROP POLICY IF EXISTS creative_briefs_user_insert ON public.creative_briefs;

CREATE POLICY creative_briefs_user_select ON public.creative_briefs
  FOR SELECT
  USING (user_id = (SELECT auth.jwt() ->> 'sub'));

CREATE POLICY creative_briefs_user_insert ON public.creative_briefs
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.jwt() ->> 'sub'));
