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
import { USER_OWNED_TABLES, RETENTION_TABLES } from '../_shared/user-owned-tables.ts';

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

async function cancelStripeSubscription(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: plan } = await supabase
    .from('user_plans')
    .select('stripe_sub_id')
    .eq('user_id', userId)
    .single();

  const subId = plan?.stripe_sub_id as string | undefined;
  if (!subId) return { ok: true };

  try {
    await getStripe().subscriptions.cancel(subId);
    console.log(`✓ Stripe subscription ${subId} cancelled for account deletion (${userId})`);
  } catch (e) {
    // "resource_missing" means the subscription is already cancelled/gone — safe to
    // proceed. Any other error (network, auth, rate limit, Stripe outage) must block
    // deletion: proceeding anyway would wipe the account and delete the Clerk identity
    // while a real, still-live subscription keeps billing a now-unreachable account.
    if ((e as { code?: string })?.code === 'resource_missing') {
      console.log(`Stripe subscription ${subId} already gone for ${userId}, proceeding with deletion`);
    } else {
      console.error(`Stripe cancel failed during account deletion for ${userId}:`, e);
      return { ok: false, error: e instanceof Error ? e.message : 'Stripe cancellation failed' };
    }
  }

  // Clear stripe_sub_id now, before the row-delete loop below runs. That loop deletes
  // user_plans too, but if a transient failure elsewhere in it leaves this row stranded, a
  // retry's cancelStripeSubscription() call must never re-attempt cancelling a subscription
  // that's already gone — Stripe rejects that with a non-resource_missing error ("already
  // canceled"), which would otherwise hard-block deletion permanently on every future retry.
  // Nulling it here means a retry sees no subId at all and correctly treats it as nothing left
  // to cancel, regardless of what happens to the rest of this request.
  await supabase.from('user_plans').update({ stripe_sub_id: null }).eq('user_id', userId);

  return { ok: true };
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
    const stripeResult = await cancelStripeSubscription(userId);
    if (!stripeResult.ok) {
      return errResponse(
        `Could not cancel your active subscription (${stripeResult.error}). Please try again or contact support before your account can be deleted.`,
        500,
        origin,
      );
    }

    const failures: string[] = [];
    for (const table of USER_OWNED_TABLES) {
      // Financial/cost-history tables get a 30-day soft-delete window (retention
      // policy, task #94) instead of an immediate hard delete — the
      // purge-expired-soft-deletes cron job hard-deletes them after 30 days.
      const { error } = RETENTION_TABLES.has(table)
        ? await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('user_id', userId)
        : await supabase.from(table).delete().eq('user_id', userId);
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
