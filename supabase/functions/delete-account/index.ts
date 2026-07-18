/**
 * Ephermal — Delete Account (Supabase Edge Function)
 *
 * Permanently deletes a user's Ephermal account: cancels any active Stripe
 * subscription immediately (not just scheduled for period end — the account
 * is going away, billing must stop now), wipes every user-owned row across
 * the app, then deletes the Clerk identity itself so the user can't log
 * back in and find a ghost account.
 *
 * POST { confirm: 'DELETE' }
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   CLERK_SECRET_KEY
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';

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

// Every table that stores rows scoped to a Clerk user_id. Order doesn't matter —
// none of these have foreign keys pointing at each other across tables.
const USER_OWNED_TABLES = [
  'ai_credits', 'ai_topups', 'audiences', 'budget_recommendations', 'campaigns',
  'creative_briefs', 'creative_fatigue', 'creatives', 'launched_campaigns',
  'oauth_claims', 'oauth_nonces', 'optimizer_rules', 'optimizer_runs',
  'revenue_snapshots', 'shopify_products', 'store_intelligence', 'ugc_credits',
  'user_integrations', 'user_plans',
];

async function cancelStripeSubscription(userId: string): Promise<void> {
  const { data: plan } = await supabase
    .from('user_plans')
    .select('stripe_sub_id')
    .eq('user_id', userId)
    .single();

  const subId = plan?.stripe_sub_id as string | undefined;
  if (!subId) return;

  try {
    await getStripe().subscriptions.cancel(subId);
    console.log(`✓ Stripe subscription ${subId} cancelled for account deletion (${userId})`);
  } catch (e) {
    // Log but don't block deletion — an already-cancelled or missing subscription
    // shouldn't stop the user from deleting their account.
    console.error(`Stripe cancel failed during account deletion for ${userId}:`, e);
  }
}

async function deleteClerkUser(userId: string): Promise<void> {
  const secret = Deno.env.get('CLERK_SECRET_KEY');
  if (!secret) {
    console.error('CLERK_SECRET_KEY not configured — Clerk identity not deleted for', userId);
    return;
  }
  const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${secret}` },
  });
  if (!res.ok) {
    console.error(`Clerk user deletion failed for ${userId}:`, res.status, await res.text());
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  // Tight rate limit — this is a one-shot destructive action, not a normal API call.
  const rl = await rateLimitTiered(userId, 'delete-account', [
    { max: 3, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  // Require an explicit confirmation string — a defense-in-depth guard against
  // this endpoint ever being hit by anything other than a deliberate, confirmed
  // user action (the frontend also requires typed confirmation before calling this).
  if (String(body.confirm ?? '') !== 'DELETE') {
    return errResponse('Confirmation required', 400, origin);
  }

  try {
    await cancelStripeSubscription(userId);

    const failures: string[] = [];
    for (const table of USER_OWNED_TABLES) {
      const { error } = await supabase.from(table).delete().eq('user_id', userId);
      if (error) {
        console.error(`delete-account: failed to clear ${table} for ${userId}:`, error.message);
        failures.push(table);
      }
    }

    if (failures.length > 0) {
      // Partial failure — don't delete the Clerk identity, so the user (or support)
      // can retry rather than being locked out with orphaned data still on record.
      return errResponse(
        `Account data could not be fully deleted (${failures.join(', ')}). Please try again or contact support.`,
        500,
        origin,
      );
    }

    await deleteClerkUser(userId);

    return okResponse({ success: true }, origin);
  } catch (err) {
    console.error('delete-account error:', err);
    return errResponse('Account deletion failed', 500, origin);
  }
});
