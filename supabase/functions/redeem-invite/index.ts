/**
 * Ephermal — Redeem tester invite (Supabase Edge Function)
 *
 * POST { token }  — with the signer's Clerk JWT in Authorization.
 *
 * Applies exactly what an admin's set_role('testuser') applies: Clerk
 * public_metadata.role = 'testuser', plus the Growth plan when the account is
 * not already on a paid Stripe subscription. The difference is who triggers it.
 * A tester follows a one-time link, signs up normally, and the grant happens at
 * signup instead of waiting on Jamal to remember.
 *
 * Trust model. The token is the only secret, exactly like a password-reset link,
 * so everything that matters is enforced here rather than in the browser:
 *
 *   - the caller must present a valid Clerk session, so the grant can only ever
 *     land on a real signed-in account and the redeemer is recorded
 *   - the claim is a single conditional UPDATE, so two tabs racing the same link
 *     produce one winner and one "already used"
 *   - expiry and revocation are checked server-side on the row, not on anything
 *     the client sent
 *   - a wrong or already-used token returns the same generic failure, so the
 *     endpoint cannot be used to probe which tokens exist
 *
 * Idempotent for the same user: re-running with a token they already redeemed
 * returns ok rather than an error, because the dashboard calls this on load and
 * a refresh should not look like a failure.
 *
 * Deploy: supabase functions deploy redeem-invite
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, errResponse, okResponse, extractUserId } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';
import { captureError } from '../_shared/sentry.ts';
const CLERK_API = 'https://api.clerk.com/v1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/** Clerk's metadata PATCH is a deep merge, so writing `role` here leaves `plan`
 *  untouched and vice versa. Same call admin-api makes for set_role. */
async function patchClerkMetadata(userId: string, publicMetadata: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${CLERK_API}/users/${userId}/metadata`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('CLERK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ public_metadata: publicMetadata }),
  });
  if (!res.ok) {
    captureError('redeem-invite', '[redeem-invite] Clerk metadata patch failed:', res.status, await res.text());
    throw new Error('Could not apply tester access to your account');
  }
}

async function fetchClerkEmail(userId: string): Promise<string | null> {
  try {
    const res = await fetch(`${CLERK_API}/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${Deno.env.get('CLERK_SECRET_KEY')}` },
    });
    if (!res.ok) return null;
    const u = await res.json() as {
      email_addresses?: { id: string; email_address: string }[];
      primary_email_address_id?: string;
    };
    const primary = u.email_addresses?.find(e => e.id === u.primary_email_address_id);
    return primary?.email_address ?? u.email_addresses?.[0]?.email_address ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  // Tight, because this endpoint takes a guessable-shaped secret. A token is 32
  // URL-safe characters, so brute force is not realistic regardless, but there is
  // no legitimate reason for one account to try more than a handful.
  const rl = await rateLimitTiered(userId, 'redeem-invite', [
    { max: 5,  window: 60   },
    { max: 20, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const token = String(body.token ?? '').trim();
  if (!token || token.length > 128) return errResponse('Invalid invite', 400, origin);

  try {
    const { data: invite, error: lookupErr } = await supabase
      .from('tester_invites')
      .select('id, token, expires_at, used_at, used_by_user_id, revoked_at')
      .eq('token', token)
      .maybeSingle();

    if (lookupErr) throw new Error(lookupErr.message);

    // Same message for "no such token" and "already taken by someone else", so a
    // caller cannot use the response to learn which tokens are real.
    const GENERIC = 'This invite link is not valid. It may have already been used, or expired.';

    if (!invite) return errResponse(GENERIC, 400, origin);

    // Already redeemed by THIS user: report success. setup.html calls this on
    // every load until it clears the stored token, and a reload is not an error.
    if (invite.used_at && invite.used_by_user_id === userId) {
      return okResponse({ ok: true, already_redeemed: true, role: 'testuser' }, origin);
    }
    if (invite.used_at) return errResponse(GENERIC, 400, origin);
    if (invite.revoked_at) return errResponse(GENERIC, 400, origin);
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return errResponse('This invite link has expired. Ask for a fresh one.', 400, origin);
    }

    // Atomic claim. Two tabs opening the same link race here and exactly one
    // gets a row back, because the filter and the write are one statement.
    const { data: claimed, error: claimErr } = await supabase
      .from('tester_invites')
      .update({
        used_at: new Date().toISOString(),
        used_by_user_id: userId,
        used_by_email: await fetchClerkEmail(userId),
      })
      .eq('id', invite.id)
      .is('used_at', null)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle();

    if (claimErr) throw new Error(claimErr.message);
    if (!claimed) return errResponse(GENERIC, 400, origin);

    // Grant. Role first: if the plan write below fails, the account is still
    // flagged as a tester and shows up in the admin list to be fixed, which is
    // better than a silently ordinary account holding a burnt invite.
    await patchClerkMetadata(userId, { role: 'testuser' });

    let grantedPlan: string | null = null;
    const { data: existingPlan } = await supabase
      .from('user_plans').select('stripe_sub_id').eq('user_id', userId).maybeSingle();

    // Never overwrite a real paying subscription. Someone who already pays and
    // then follows an invite keeps what they bought.
    if (!existingPlan?.stripe_sub_id) {
      const { error: planErr } = await supabase.from('user_plans').upsert(
        // is_tester mirrors the Clerk role into the row the AI budget check and
        // the UGC gate already read, so neither has to call Clerk on a hot path.
        // It is what caps lifetime AI spend and blocks paid video renders.
        { user_id: userId, plan: 'growth', period_end: null, is_tester: true },
        { onConflict: 'user_id' },
      );
      if (planErr) throw new Error(`Tester access applied, but the plan grant failed: ${planErr.message}`);
      await patchClerkMetadata(userId, { plan: 'growth' });
      grantedPlan = 'growth';
    } else {
      // Already paying, so the plan is left alone, but they still redeemed a
      // tester invite and should carry the flag.
      await supabase.from('user_plans').update({ is_tester: true }).eq('user_id', userId);
    }

    return okResponse({ ok: true, role: 'testuser', granted_plan: grantedPlan }, origin);
  } catch (e) {
    captureError('redeem-invite', e);
    return errResponse((e as Error).message || 'Could not redeem invite', 500, origin);
  }
});
