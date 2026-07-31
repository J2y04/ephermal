/**
 * Every table that stores rows scoped to a Clerk user_id. Single source of truth for
 * delete-account and clerk-webhook (user.deleted) — both need to wipe the exact same set of
 * rows on account removal, and keeping two separate copies is exactly how ugc_video_credits,
 * ugc_video_topups, generation_cost_log, ai_usage, and ai_usage_topups went missing from
 * delete-account's list after being added elsewhere. Order doesn't matter — none of these
 * have foreign keys pointing at each other across tables.
 */
export const USER_OWNED_TABLES = [
  'ai_credits', 'ai_topups', 'ai_usage', 'ai_usage_topups', 'audiences',
  'budget_recommendations', 'campaigns', 'creative_briefs', 'creative_fatigue',
  'creatives', 'generation_cost_log', 'launched_campaigns', 'oauth_claims',
  'oauth_nonces', 'optimizer_rules', 'optimizer_runs', 'revenue_snapshots',
  'shopify_products', 'store_intelligence', 'ugc_credits', 'ugc_video_credits',
  'ugc_video_topups', 'user_integrations', 'user_plans',
];
