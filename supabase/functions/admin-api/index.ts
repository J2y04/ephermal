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
 * POST { action: 'set_plan', target_user_id, plan }
 * POST { action: 'ban_user',   target_user_id }
 * POST { action: 'unban_user', target_user_id }
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
  const stripe = getStripe();

  let mrrCents = 0;
  let activeSubscriptionCount = 0;
  const byTier: Record<string, TierStat> = {
    starter: { count: 0, mrr_cents: 0 },
    growth:  { count: 0, mrr_cents: 0 },
    scale:   { count: 0, mrr_cents: 0 },
    other:   { count: 0, mrr_cents: 0 },
  };

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

  // Signups-over-time: zero-filled daily series from Clerk's created_at timestamps,
  // same zero-fill discipline mrr-tracker already uses so the chart has a continuous axis.
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
  };
}

// ── set_plan ──────────────────────────────────────────────────────────────────
async function handleSetPlan(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const targetUserId = String(body.target_user_id ?? '').trim();
  const plan = String(body.plan ?? '').trim();
  if (!targetUserId) throw new Error('target_user_id is required');
  if (!VALID_PLANS.has(plan)) throw new Error('Invalid plan');

  await updateClerkMetadata(targetUserId, plan);

  // Only user_id/plan are set — stripe_customer_id/stripe_sub_id are intentionally
  // left untouched so a manual override doesn't clobber a real paying user's Stripe
  // linkage. A subsequent Stripe webhook for that user can still overwrite this
  // override later — that's the expected trade-off for a manual "grant/comp" action.
  const { error } = await supabase.from('user_plans').upsert(
    { user_id: targetUserId, plan },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`Failed to update user_plans: ${error.message}`);

  return { ok: true, user_id: targetUserId, plan };
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
      case 'set_plan':
        return okResponse(await handleSetPlan(body), origin);
      case 'ban_user':
        return okResponse(await handleBanToggle(userId, String(body.target_user_id ?? ''), true), origin);
      case 'unban_user':
        return okResponse(await handleBanToggle(userId, String(body.target_user_id ?? ''), false), origin);
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
