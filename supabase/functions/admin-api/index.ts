/**
 * Ephermal — Admin API (Supabase Edge Function)
 *
 * Backs the admin panel at admin.ephermal.app. Every action requires the
 * caller to pass requireAdmin() (../_shared/admin.ts) — role AND email must
 * both match, checked fresh against Clerk on every request (short-cached).
 * This is the only function in the app allowed to change another user's
 * plan or ban/unban them; it replaces the disposable one-off
 * onetime-admin-grant script and the client-only "Dev Tools" plan override
 * (which never touched Clerk or the database — see dashboard.html history).
 *
 * POST { action: 'list_users', query? }
 * POST { action: 'get_revenue', days? }
 * POST { action: 'get_platform_stats' }
 * POST { action: 'set_plan', target_user_id, plan, expires_in_days? }
 * POST { action: 'set_role', target_user_id, role }   — role:'testuser' auto-grants Growth
 * POST { action: 'ban_user',   target_user_id }
 * POST { action: 'unban_user', target_user_id }
 * POST { action: 'get_user_detail', target_user_id }
 * POST { action: 'disconnect_integration', target_user_id, platform: 'meta'|'shopify'|'google' }
 * POST { action: 'grant_ugc_video_credits', target_user_id, credits }
 * POST { action: 'cancel_subscription', target_user_id }
 *
 * Required env vars:
 *   CLERK_SECRET_KEY, STRIPE_SECRET_KEY
 *   STRIPE_PRICE_STARTER / GROWTH / SCALE
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse, bodyTooLarge } from '../_shared/rate-limit.ts';
import { requireAdmin } from '../_shared/admin.ts';

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
    _stripe = new Stripe(key, { apiVersion: '2024-04-10' });
  }
  return _stripe;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CLERK_API = 'https://api.clerk.com/v1';

// Same construction as stripe-webhook/index.ts — identifies which Stripe
// price ID corresponds to which plan tier, driven by env vars so it never
// drifts from whatever prices are actually configured in Stripe.
const PRICE_TO_PLAN: Record<string, string> = {};
const _pStarter = Deno.env.get('STRIPE_PRICE_STARTER');
const _pGrowth  = Deno.env.get('STRIPE_PRICE_GROWTH');
const _pScale   = Deno.env.get('STRIPE_PRICE_SCALE');
if (_pStarter) PRICE_TO_PLAN[_pStarter] = 'starter';
if (_pGrowth)  PRICE_TO_PLAN[_pGrowth]  = 'growth';
if (_pScale)   PRICE_TO_PLAN[_pScale]   = 'scale';

const VALID_PLANS = new Set(['starter', 'growth', 'scale']);

/** Exact PATCH pattern already used in stripe-webhook/index.ts's updateClerkMetadata. */
async function updateClerkMetadata(clerkUserId: string, plan: string): Promise<void> {
  const res = await fetch(`${CLERK_API}/users/${clerkUserId}/metadata`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('CLERK_SECRET_KEY')}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ public_metadata: { plan } }),
  });
  if (!res.ok) {
    console.error('Clerk metadata update failed:', res.status, await res.text());
    throw new Error('Clerk metadata update failed');
  }
}

/** Clerk's metadata PATCH is a deep merge, not a replace (confirmed against Clerk's own docs) —
 *  sending only `{role}` here never touches `plan` (written separately by updateClerkMetadata
 *  above), and vice versa. */
async function updateClerkRole(clerkUserId: string, role: string | null): Promise<void> {
  const res = await fetch(`${CLERK_API}/users/${clerkUserId}/metadata`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('CLERK_SECRET_KEY')}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ public_metadata: { role } }),
  });
  if (!res.ok) {
    console.error('Clerk role update failed:', res.status, await res.text());
    throw new Error('Clerk role update failed');
  }
}

interface ClerkUserRecord {
  id: string;
  email_addresses?: { id: string; email_address: string }[];
  primary_email_address_id?: string | null;
  created_at: number;       // ms since epoch
  last_active_at?: number | null;
  banned?: boolean;
  public_metadata?: { role?: string };
}

function primaryEmail(u: ClerkUserRecord): string {
  return u.email_addresses?.find(e => e.id === u.primary_email_address_id)?.email_address ?? '';
}

async function clerkFetch(path: string): Promise<Response> {
  return fetch(`${CLERK_API}${path}`, {
    headers: { 'Authorization': `Bearer ${Deno.env.get('CLERK_SECRET_KEY')}` },
  });
}

/** Paginated fetch of every Clerk user (100/page). Capped at 5,000 users — plenty of
 *  headroom for a single-operator panel; if the platform ever gets that large this
 *  action should move to background sync + a table instead of a live fetch anyway. */
async function fetchAllClerkUsers(): Promise<ClerkUserRecord[]> {
  const all: ClerkUserRecord[] = [];
  const pageSize = 100;
  const maxUsers = 5000;
  let offset = 0;
  while (all.length < maxUsers) {
    const res = await clerkFetch(`/users?limit=${pageSize}&offset=${offset}&order_by=-created_at`);
    if (!res.ok) throw new Error(`Clerk users list failed: ${res.status}`);
    const page = await res.json() as ClerkUserRecord[];
    if (!page.length) break;
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function clerkUserCount(): Promise<number> {
  const res = await clerkFetch('/users/count');
  if (!res.ok) throw new Error(`Clerk user count failed: ${res.status}`);
  const data = await res.json() as { total_count?: number };
  return data.total_count ?? 0;
}

// ── list_users ────────────────────────────────────────────────────────────────
async function handleListUsers(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const query = String(body.query ?? '').trim().toLowerCase();

  const [users, total, plansRes] = await Promise.all([
    fetchAllClerkUsers(),
    clerkUserCount(),
    supabase.from('user_plans').select('user_id,plan,stripe_sub_id,period_end,cancelling_at'),
  ]);

  const planMap = new Map((plansRes.data ?? []).map(p => [p.user_id as string, p]));

  let rows = users.map(u => {
    const planRow = planMap.get(u.id);
    return {
      id:             u.id,
      email:          primaryEmail(u),
      plan:           planRow?.plan ?? 'starter',
      is_paying:      !!planRow?.stripe_sub_id,
      period_end:     planRow?.period_end ?? null,
      cancelling_at:  planRow?.cancelling_at ?? null,
      created_at:     new Date(u.created_at).toISOString(),
      last_active_at: u.last_active_at ? new Date(u.last_active_at).toISOString() : null,
      banned:         !!u.banned,
      role:           u.public_metadata?.role ?? null,
    };
  });

  if (query) rows = rows.filter(r => r.email.toLowerCase().includes(query));

  return { users: rows, total };
}

// ── get_revenue ───────────────────────────────────────────────────────────────
interface TierStat { count: number; mrr_cents: number }

async function handleGetRevenue(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const days = Math.min(90, Math.max(1, Number(body.days ?? 30) || 30));

  let mrrCents = 0;
  let activeSubscriptionCount = 0;
  const byTier: Record<string, TierStat> = {
    starter: { count: 0, mrr_cents: 0 },
    growth:  { count: 0, mrr_cents: 0 },
    scale:   { count: 0, mrr_cents: 0 },
    other:   { count: 0, mrr_cents: 0 },
  };

  // Stripe is optional for this action — if it's not configured yet (e.g. before
  // Jamal has signed up for a Stripe account), the rest of the admin panel
  // (user counts, signups) must still load. Only the Stripe-derived fields
  // degrade to zero/empty, flagged via stripe_available so the frontend can
  // show an honest "not connected" state instead of pretending MRR is $0.
  let stripeAvailable = true;
  let stripeError: string | null = null;
  try {
    const stripe = getStripe();
    // Live from Stripe's real active subscriptions — this naturally excludes any
    // manually-granted user_plans row (like the owner's own dev account), since
    // those correspond to no Stripe subscription and simply never appear here.
    for await (const sub of stripe.subscriptions.list({ status: 'active', limit: 100 })) {
      activeSubscriptionCount++;
      let subMonthlyCents = 0;
      let tierKey = 'other';
      for (const item of sub.items.data) {
        const price = item.price;
        if (!price?.unit_amount) continue;
        const qty = item.quantity ?? 1;
        let cents = price.unit_amount * qty;
        if (price.recurring?.interval === 'year') cents = Math.round(cents / 12);
        subMonthlyCents += cents;
        const mapped = PRICE_TO_PLAN[price.id];
        if (mapped) tierKey = mapped;
      }
      mrrCents += subMonthlyCents;
      byTier[tierKey].count += 1;
      byTier[tierKey].mrr_cents += subMonthlyCents;
    }
  } catch (e) {
    stripeAvailable = false;
    stripeError = e instanceof Error ? e.message : 'Stripe unavailable';
    console.warn('[admin-api] get_revenue: Stripe unavailable, degrading gracefully:', stripeError);
  }

  // Signups-over-time: zero-filled daily series from Clerk's created_at timestamps,
  // same zero-fill discipline mrr-tracker already uses so the chart has a continuous axis.
  // Independent of Stripe — always computed even when the block above fails.
  const users = await fetchAllClerkUsers();
  const dayBuckets = new Map<string, number>();
  const now = Date.now();
  for (let i = 0; i < days; i++) {
    dayBuckets.set(new Date(now - i * 86_400_000).toISOString().slice(0, 10), 0);
  }
  for (const u of users) {
    const d = new Date(u.created_at).toISOString().slice(0, 10);
    if (dayBuckets.has(d)) dayBuckets.set(d, (dayBuckets.get(d) ?? 0) + 1);
  }
  const signups = [...dayBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return {
    mrr_cents: mrrCents,
    active_subscription_count: activeSubscriptionCount,
    by_tier: byTier,
    signups,
    generated_at: new Date().toISOString(),
    stripe_available: stripeAvailable,
    stripe_error: stripeError,
  };
}

// ── get_platform_stats ───────────────────────────────────────────────────────
/**
 * Everything Stripe-independent that isn't already covered by list_users /
 * get_revenue: plan mix, connected integrations, Auren usage, Shopify catalog
 * health, campaign activity, and top-of-funnel signals (public store scans
 * happen before signup, so they're the earliest interest signal we have).
 * Every query here reads real tables directly with the service-role client —
 * no caching, no Stripe dependency, so this always loads even if Stripe is
 * unconfigured. Tables are small pre-launch, so aggregation happens in JS
 * after a plain select rather than hand-rolled SQL aggregates; revisit with
 * real Postgres aggregates if any of these tables grow past a few thousand rows.
 */
function isoWeekKeyAdmin(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(
    ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

async function handleGetPlatformStats(): Promise<Record<string, unknown>> {
  const nowIso = new Date().toISOString();
  const in7dIso = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const thisWeek = isoWeekKeyAdmin();
  const thisMonth = nowIso.slice(0, 7);

  const [
    clerkUsers,
    plansRes,
    expiringRes,
    integrationsRes,
    aiCreditsWeekRes,
    aiCreditsAllRes,
    topupsRes,
    productsRes,
    campaignsRes,
    briefsRes,
    storeIntelRes,
    publicScansRes,
    ugcRes,
    optimizerRunsRes,
  ] = await Promise.all([
    fetchAllClerkUsers(),
    supabase.from('user_plans').select('user_id, plan, stripe_sub_id'),
    supabase.from('user_plans')
      .select('user_id, plan, period_end')
      .is('stripe_sub_id', null)
      .not('period_end', 'is', null)
      .lte('period_end', in7dIso)
      .gte('period_end', nowIso)
      .order('period_end', { ascending: true }),
    supabase.from('user_integrations').select('shopify_token, meta_token, meta_page_id, google_refresh_token'),
    supabase.from('ai_credits').select('user_id, used').eq('month', thisWeek),
    supabase.from('ai_credits').select('used'),
    supabase.from('ai_topups').select('user_id, messages'),
    supabase.from('shopify_products').select('user_id, cogs_cents, price_cents'),
    supabase.from('launched_campaigns').select('status, platform, budget_daily, launched_at'),
    supabase.from('creative_briefs').select('user_id'),
    supabase.from('store_intelligence').select('user_id'),
    supabase.from('public_store_scans').select('domain, created_at'),
    supabase.from('ugc_credits').select('user_id, used').eq('month', thisMonth),
    supabase.from('optimizer_runs').select('user_id'),
  ]);

  // user_plans rows are Ephermal's own source of truth, but a row can outlive its Clerk
  // identity: clerk-webhook's cleanupDeletedUser() deliberately PRESERVES this row (rather than
  // deleting it) when it can't confirm the Stripe subscription was actually cancelled, so there
  // is no automatic path that ever removes it afterward. Unlike handleListUsers() (which is
  // keyed off Clerk's live user list and so naturally excludes these), this plan-mix count
  // previously read every raw row with no such check, permanently inflating growth/scale counts
  // for accounts that no longer exist.
  const clerkUserIds = new Set(clerkUsers.map(u => u.id));
  const plans = (plansRes.data ?? []).filter(p => clerkUserIds.has(p.user_id as string));
  const planCounts: Record<string, number> = { starter: 0, growth: 0, scale: 0 };
  let manualGrants = 0;
  for (const p of plans) {
    const plan = (p.plan as string) ?? 'starter';
    if (plan in planCounts) planCounts[plan] += 1;
    if (!p.stripe_sub_id && plan !== 'starter') manualGrants += 1;
  }

  const integrations = integrationsRes.data ?? [];
  const integrationCounts = {
    total_users_with_row: integrations.length,
    shopify_connected: integrations.filter(r => r.shopify_token).length,
    meta_connected:    integrations.filter(r => r.meta_token).length,
    meta_page_linked:  integrations.filter(r => r.meta_page_id).length,
    google_connected:  integrations.filter(r => r.google_refresh_token).length,
  };

  const aiWeek = aiCreditsWeekRes.data ?? [];
  const aiAll = aiCreditsAllRes.data ?? [];
  const topups = topupsRes.data ?? [];
  const auren = {
    messages_this_week:  aiWeek.reduce((s, r) => s + (r.used ?? 0), 0),
    active_users_this_week: aiWeek.filter(r => (r.used ?? 0) > 0).length,
    messages_all_time:   aiAll.reduce((s, r) => s + (r.used ?? 0), 0),
    topups_purchased:    topups.length,
    topup_messages_granted: topups.reduce((s, r) => s + (r.messages ?? 0), 0),
    topup_distinct_users: new Set(topups.map(r => r.user_id)).size,
  };

  const products = productsRes.data ?? [];
  const withCogs = products.filter(p => p.cogs_cents != null).length;
  const shopify = {
    products_synced: products.length,
    stores_with_products: new Set(products.map(p => p.user_id)).size,
    cogs_coverage_pct: products.length > 0 ? Math.round((withCogs / products.length) * 1000) / 10 : 0,
    avg_price_cents: products.length > 0
      ? Math.round(products.reduce((s, p) => s + (p.price_cents ?? 0), 0) / products.length)
      : 0,
  };

  const campaignRows = campaignsRes.data ?? [];
  const statusCounts: Record<string, number> = { draft: 0, active: 0, paused: 0, failed: 0 };
  const platformCounts: Record<string, number> = { meta: 0, google: 0, both: 0 };
  let totalDailyBudget = 0;
  for (const c of campaignRows) {
    const status = (c.status as string) ?? 'draft';
    if (status in statusCounts) statusCounts[status] += 1;
    const platform = (c.platform as string) ?? 'meta';
    if (platform in platformCounts) platformCounts[platform] += 1;
    totalDailyBudget += Number(c.budget_daily ?? 0);
  }
  const campaigns = {
    total: campaignRows.length,
    by_status: statusCounts,
    by_platform: platformCounts,
    launched_count: campaignRows.filter(c => c.launched_at).length,
    total_daily_budget: Math.round(totalDailyBudget * 100) / 100,
  };

  const funnel = {
    public_store_scans: (publicScansRes.data ?? []).length,
    store_intelligence_runs: (storeIntelRes.data ?? []).length,
    creative_briefs_generated: (briefsRes.data ?? []).length,
    optimizer_runs: (optimizerRunsRes.data ?? []).length,
  };

  const ugcRows = ugcRes.data ?? [];
  const ugc = {
    credits_used_this_month: ugcRows.reduce((s, r) => s + (r.used ?? 0), 0),
    active_users_this_month: ugcRows.filter(r => (r.used ?? 0) > 0).length,
  };

  return {
    generated_at: nowIso,
    plans: { by_tier: planCounts, manual_grants: manualGrants, expiring_soon: expiringRes.data ?? [] },
    integrations: integrationCounts,
    auren,
    shopify,
    campaigns,
    funnel,
    ugc,
  };
}

// ── set_plan ──────────────────────────────────────────────────────────────────
/**
 * expires_in_days: optional. When given, the grant auto-reverts to 'starter' once
 * period_end passes — enforced by the manual_grant_expiry cron job (see migration
 * 025_manual_grant_expiry.sql), which only ever touches rows with stripe_sub_id
 * IS NULL, so it can never clobber a real paying subscriber. Omit (or pass 0/null)
 * for a permanent grant, which also clears any previously-set expiry.
 */
async function handleSetPlan(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const targetUserId = String(body.target_user_id ?? '').trim();
  const plan = String(body.plan ?? '').trim();
  if (!targetUserId) throw new Error('target_user_id is required');
  if (!VALID_PLANS.has(plan)) throw new Error('Invalid plan');

  const expiresInDaysRaw = body.expires_in_days;
  let periodEnd: string | null = null;
  if (expiresInDaysRaw != null && expiresInDaysRaw !== '') {
    const days = Number(expiresInDaysRaw);
    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
      throw new Error('expires_in_days must be a positive number of days (max 3650)');
    }
    periodEnd = new Date(Date.now() + days * 86_400_000).toISOString();
  }

  // Supabase is the source of truth every plan check reads from (_shared/plan.ts), so write it
  // first: if this upsert fails, nothing has changed anywhere and the admin's 500 is accurate.
  // Previously Clerk metadata was updated first — a subsequent DB failure left Clerk already
  // showing the new plan while Supabase (and every server-side gate) still had the old one, with
  // no rollback, silently diverging the two systems on every partial failure.
  //
  // Only user_id/plan/period_end are set — stripe_customer_id/stripe_sub_id are
  // intentionally left untouched so a manual override doesn't clobber a real
  // paying user's Stripe linkage. A subsequent Stripe webhook for that user can
  // still overwrite this override later — that's the expected trade-off for a
  // manual "grant/comp" action. period_end here is ONLY the comp-expiry date for
  // manual grants (see cron job above) — for a real Stripe subscriber it would be
  // overwritten again by the next webhook-driven billing-period update anyway.
  const { error } = await supabase.from('user_plans').upsert(
    { user_id: targetUserId, plan, period_end: periodEnd },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`Failed to update user_plans: ${error.message}`);

  await updateClerkMetadata(targetUserId, plan);

  return { ok: true, user_id: targetUserId, plan, period_end: periodEnd };
}

// ── set_role ──────────────────────────────────────────────────────────────────
const VALID_ROLE_RE = /^[a-z][a-z0-9_]{1,31}$/;

/**
 * Sets a Clerk user's public_metadata.role. role:'testuser' auto-grants the Growth plan (same
 * write path as handleSetPlan, Supabase written before Clerk) so a tester can immediately use
 * every Growth-gated feature without a separate manual plan grant — but only when the target
 * doesn't already have a live Stripe subscription, so this can never silently downgrade or
 * reprice a real paying customer. Pass role: null (or '') to clear a role without touching plan.
 */
async function handleSetRole(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const targetUserId = String(body.target_user_id ?? '').trim();
  if (!targetUserId) throw new Error('target_user_id is required');

  const roleRaw = body.role;
  const role = (roleRaw === null || roleRaw === undefined || roleRaw === '') ? null : String(roleRaw).trim().toLowerCase();
  if (role !== null && !VALID_ROLE_RE.test(role)) {
    throw new Error('role must be lowercase letters/numbers/underscores, starting with a letter, 2-32 chars (or empty to clear)');
  }

  await updateClerkRole(targetUserId, role);

  let grantedPlan: string | null = null;
  if (role === 'testuser') {
    const { data: existingPlan } = await supabase
      .from('user_plans').select('stripe_sub_id').eq('user_id', targetUserId).maybeSingle();
    if (!existingPlan?.stripe_sub_id) {
      const { error } = await supabase.from('user_plans').upsert(
        { user_id: targetUserId, plan: 'growth', period_end: null },
        { onConflict: 'user_id' },
      );
      if (error) throw new Error(`Role set, but failed to grant Growth plan: ${error.message}`);
      await updateClerkMetadata(targetUserId, 'growth');
      grantedPlan = 'growth';
    }
  }

  return { ok: true, user_id: targetUserId, role, granted_plan: grantedPlan };
}

// ── ban_user / unban_user ─────────────────────────────────────────────────────
async function handleBanToggle(callerId: string, targetUserId: string, ban: boolean): Promise<Record<string, unknown>> {
  if (!targetUserId) throw new Error('target_user_id is required');
  if (targetUserId === callerId) throw new Error("You can't ban your own account");

  const res = await fetch(`${CLERK_API}/users/${targetUserId}/${ban ? 'ban' : 'unban'}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${Deno.env.get('CLERK_SECRET_KEY')}` },
  });
  if (!res.ok) {
    console.error('Clerk ban/unban failed:', res.status, await res.text());
    throw new Error(`${ban ? 'Ban' : 'Unban'} failed`);
  }

  return { ok: true, user_id: targetUserId, banned: ban };
}

// ── get_user_detail ──────────────────────────────────────────────────────────
/** Everything about ONE user in one call — the list view only shows plan/status,
 *  this is the "click into a user" view: integrations, credits (script + video +
 *  top-ups), recent campaigns, and real Stripe subscription state if they have one. */
async function handleGetUserDetail(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const targetUserId = String(body.target_user_id ?? '').trim();
  if (!targetUserId) throw new Error('target_user_id is required');

  const month = new Date().toISOString().slice(0, 7);

  const [
    clerkRes,
    planRes,
    integrationsRes,
    ugcCreditsRes,
    ugcVideoCreditsRes,
    ugcVideoTopupsRes,
    campaignsRes,
    costLogRes,
  ] = await Promise.all([
    clerkFetch(`/users/${targetUserId}`),
    supabase.from('user_plans').select('*').eq('user_id', targetUserId).maybeSingle(),
    supabase.from('user_integrations').select('*').eq('user_id', targetUserId).maybeSingle(),
    supabase.from('ugc_credits').select('used').eq('user_id', targetUserId).eq('month', month).maybeSingle(),
    supabase.from('ugc_video_credits').select('used').eq('user_id', targetUserId).eq('month', month).maybeSingle(),
    supabase.from('ugc_video_topups').select('id, credits, used, created_at').eq('user_id', targetUserId).order('created_at', { ascending: false }),
    supabase.from('launched_campaigns').select('id, platform, status, budget_daily, launched_at').eq('user_id', targetUserId).order('launched_at', { ascending: false }).limit(20),
    supabase.from('generation_cost_log').select('credit_type, provider, cost_eur, created_at').eq('user_id', targetUserId).order('created_at', { ascending: false }).limit(50),
  ]);

  if (!clerkRes.ok) throw new Error(`Clerk user lookup failed: ${clerkRes.status}`);
  const clerkUser = await clerkRes.json() as ClerkUserRecord;

  const plan = planRes.data as Record<string, unknown> | null;
  const integrations = integrationsRes.data as Record<string, unknown> | null;
  const topups = ugcVideoTopupsRes.data ?? [];
  const topupRemaining = topups.reduce((s, t) => s + Math.max(0, (t.credits as number) - (t.used as number)), 0);
  const costRows = costLogRes.data ?? [];
  const totalCostEur = costRows.reduce((s, r) => s + Number(r.cost_eur ?? 0), 0);

  return {
    id: targetUserId,
    email: primaryEmail(clerkUser),
    created_at: new Date(clerkUser.created_at).toISOString(),
    last_active_at: clerkUser.last_active_at ? new Date(clerkUser.last_active_at).toISOString() : null,
    banned: !!clerkUser.banned,
    role: clerkUser.public_metadata?.role ?? null,
    plan: plan ?? { plan: 'starter', stripe_sub_id: null, period_end: null },
    integrations: integrations ? {
      shopify_connected: !!integrations.shopify_token,
      shopify_shop: integrations.shopify_shop ?? null,
      meta_connected: !!integrations.meta_token,
      meta_account: integrations.meta_account ?? null,
      meta_page_linked: !!integrations.meta_page_id,
      google_connected: !!integrations.google_refresh_token,
      google_customer_id: integrations.google_ads_customer_id ?? null,
    } : { shopify_connected: false, meta_connected: false, google_connected: false },
    credits: {
      script_used_this_month: ugcCreditsRes.data?.used ?? 0,
      video_used_this_month: ugcVideoCreditsRes.data?.used ?? 0,
      video_topup_remaining: topupRemaining,
      video_topup_packs: topups,
    },
    campaigns: campaignsRes.data ?? [],
    cost_log_recent: costRows,
    cost_log_total_eur: Math.round(totalCostEur * 100) / 100,
  };
}

// ── disconnect_integration (admin-triggered) ────────────────────────────────
const ADMIN_PLATFORM_COLUMNS: Record<string, Record<string, null>> = {
  meta: { meta_token: null, meta_account: null, meta_page_id: null, meta_page_name: null, meta_page_token: null },
  shopify: { shopify_token: null, shopify_shop: null, shopify_shop_name: null },
  google: { google_refresh_token: null, google_ads_customer_id: null },
};

async function handleDisconnectIntegration(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const targetUserId = String(body.target_user_id ?? '').trim();
  const platform = String(body.platform ?? '');
  if (!targetUserId) throw new Error('target_user_id is required');
  const columns = ADMIN_PLATFORM_COLUMNS[platform];
  if (!columns) throw new Error('platform must be meta, shopify, or google');

  const { error } = await supabase.from('user_integrations').update(columns).eq('user_id', targetUserId);
  if (error) throw new Error(`Failed to disconnect: ${error.message}`);

  return { ok: true, user_id: targetUserId, platform };
}

// ── grant_ugc_video_credits (comp extra video credits, e.g. thank a beta tester) ──
async function handleGrantUgcVideoCredits(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const targetUserId = String(body.target_user_id ?? '').trim();
  const credits = Number(body.credits ?? 0);
  if (!targetUserId) throw new Error('target_user_id is required');
  if (!Number.isFinite(credits) || credits <= 0 || credits > 1000) {
    throw new Error('credits must be a positive number (max 1000)');
  }

  const month = new Date().toISOString().slice(0, 7);
  // stripe_pi is left NULL for admin comps — the column's UNIQUE constraint allows
  // multiple NULLs in Postgres, so this can never collide with a real top-up purchase.
  const { error } = await supabase.from('ugc_video_topups').insert({
    user_id: targetUserId, month, credits,
  });
  if (error) throw new Error(`Failed to grant credits: ${error.message}`);

  return { ok: true, user_id: targetUserId, credits_granted: credits };
}

// ── cancel_subscription (admin-triggered, immediate) ────────────────────────
async function handleCancelSubscription(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const targetUserId = String(body.target_user_id ?? '').trim();
  if (!targetUserId) throw new Error('target_user_id is required');

  const { data: plan } = await supabase.from('user_plans').select('stripe_sub_id').eq('user_id', targetUserId).maybeSingle();
  const subId = plan?.stripe_sub_id as string | undefined;
  if (!subId) throw new Error('This user has no active Stripe subscription to cancel');

  await getStripe().subscriptions.cancel(subId);
  // stripe-webhook's customer.subscription.deleted handler will independently revert
  // this to 'starter' too, but we don't want the admin panel showing stale data until
  // that webhook round-trips, so update it here as well.
  const { error } = await supabase.from('user_plans')
    .update({ plan: 'starter', period_end: null })
    .eq('user_id', targetUserId);
  if (error) console.warn('[admin-api] cancel_subscription: local plan revert failed (webhook will still catch it):', error.message);

  return { ok: true, user_id: targetUserId, cancelled_subscription: subId };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const rl = await rateLimitTiered(userId, 'admin-api', [
    { max: 30,  window: 60   },
    { max: 300, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  if (bodyTooLarge(req, 65_536)) return errResponse('Request body too large', 413, origin);

  // Server-side admin gate — the only real enforcement. Any client-side gating
  // in the /admin Next.js pages is UX only and must never be trusted alone.
  const admin = await requireAdmin(userId);
  if (!admin.ok) return errResponse('Forbidden', 403, origin);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? '');

  try {
    switch (action) {
      case 'list_users':
        return okResponse(await handleListUsers(body), origin);
      case 'get_revenue':
        return okResponse(await handleGetRevenue(body), origin);
      case 'get_platform_stats':
        return okResponse(await handleGetPlatformStats(), origin);
      case 'set_plan':
        return okResponse(await handleSetPlan(body), origin);
      case 'set_role':
        return okResponse(await handleSetRole(body), origin);
      case 'ban_user':
        return okResponse(await handleBanToggle(userId, String(body.target_user_id ?? ''), true), origin);
      case 'unban_user':
        return okResponse(await handleBanToggle(userId, String(body.target_user_id ?? ''), false), origin);
      case 'get_user_detail':
        return okResponse(await handleGetUserDetail(body), origin);
      case 'disconnect_integration':
        return okResponse(await handleDisconnectIntegration(body), origin);
      case 'grant_ugc_video_credits':
        return okResponse(await handleGrantUgcVideoCredits(body), origin);
      case 'cancel_subscription':
        return okResponse(await handleCancelSubscription(body), origin);
      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }
  } catch (err) {
    // This function is admin-only (already gated above), so surfacing the real
    // error message back is useful for debugging rather than a leak risk.
    console.error('admin-api error:', err);
    const msg = err instanceof Error ? err.message : 'Admin API error';
    return errResponse(msg, 500, origin);
  }
});
