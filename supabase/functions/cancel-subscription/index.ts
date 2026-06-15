/**
 * Ephermal — Cancel / Reactivate Subscription (Supabase Edge Function)
 *
 * POST /cancel-subscription           — sets cancel_at_period_end = true
 * POST /cancel-subscription/reactivate — removes the scheduled cancellation
 *
 * Required by EU consumer law (as-easy-to-cancel-as-to-subscribe).
 * Auth: Clerk JWT in Authorization header.
 *
 * Deploy: supabase functions deploy cancel-subscription --no-verify-jwt
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';

const stripe   = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function loadPlan(userId: string) {
  const { data, error } = await supabase
    .from('user_plans')
    .select('stripe_sub_id, plan, period_end')
    .eq('user_id', userId)
    .single();
  return { data, error };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const url = new URL(req.url);
  const isReactivate = url.pathname.endsWith('/reactivate');

  const { data: plan, error } = await loadPlan(userId);
  if (error || !plan) return errResponse('No active plan found', 404, origin);
  if (!plan.stripe_sub_id) return errResponse('No active subscription found', 404, origin);

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(plan.stripe_sub_id as string);
  } catch {
    return errResponse('Subscription not found in Stripe', 404, origin);
  }

  if (subscription.status === 'canceled') {
    return errResponse('Subscription is already cancelled', 400, origin);
  }

  if (isReactivate) {
    // Remove scheduled cancellation
    if (!subscription.cancel_at_period_end) {
      return okResponse({ reactivated: true, already_active: true }, origin);
    }
    const updated = await stripe.subscriptions.update(plan.stripe_sub_id as string, {
      cancel_at_period_end: false,
    });
    await supabase.from('user_plans')
      .update({ cancelling_at: null })
      .eq('user_id', userId);
    console.log(`✓ Subscription reactivated for ${userId}`);
    return okResponse({ reactivated: true, current_period_end: new Date(updated.current_period_end * 1000).toISOString() }, origin);
  }

  // ── Cancel at period end ───────────────────────────────────────────────────
  if (plan.plan === 'starter') return errResponse('No paid subscription to cancel', 400, origin);

  if (subscription.cancel_at_period_end) {
    const cancelAt = new Date(subscription.current_period_end * 1000).toISOString();
    return okResponse({ cancel_at: cancelAt, period_end: cancelAt, already_scheduled: true }, origin);
  }

  const updated = await stripe.subscriptions.update(plan.stripe_sub_id as string, {
    cancel_at_period_end: true,
  });

  const cancelAt = new Date(updated.current_period_end * 1000).toISOString();
  await supabase.from('user_plans')
    .update({ cancelling_at: cancelAt })
    .eq('user_id', userId);

  console.log(`✓ Subscription cancel scheduled for ${userId} at ${cancelAt}`);
  return okResponse({ cancel_at: cancelAt, period_end: cancelAt }, origin);
});
