/**
 * Ephermal — Stores (Supabase Edge Function)
 *
 * Managing the stores under one account. This is what makes Ephermal usable by
 * an agency running it across client stores rather than by a single merchant.
 *
 * POST { action: 'list' }
 * POST { action: 'create',      label, shopify_shop? }
 * POST { action: 'rename',      store_id, label }
 * POST { action: 'set_default', store_id }
 * POST { action: 'archive',     store_id }
 *
 * Tokens are never returned to the client. The stores table holds Shopify,
 * Meta and Google credentials, and for an agency those are their clients'
 * credentials, so the list here is deliberately a summary of what is connected
 * rather than the connection itself.
 *
 * Required env vars:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';
import { getPlan } from '../_shared/plan.ts';
import { listStores, resolveStore, countStores, storeLimitFor } from '../_shared/store.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const MAX_LABEL = 60;

/** A store as the client is allowed to see it: what is connected, never the credentials. */
function toSummary(s: Record<string, unknown>) {
  return {
    id:           s.id,
    label:        s.label,
    is_default:   s.is_default,
    currency:     s.currency,
    shopify_shop: s.shopify_shop,
    connected: {
      shopify: !!s.shopify_token,
      meta:    !!s.meta_token,
      google:  !!s.google_refresh_token,
    },
  };
}

function cleanLabel(raw: unknown): string | null {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s || s.length > MAX_LABEL) return null;
  return s;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const rl = await rateLimitTiered(userId, 'stores', [
    { max: 30,  window: 60   },
    { max: 200, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action  = String(body.action ?? '');
  const storeId = body.store_id ? String(body.store_id) : null;

  if (action === 'list') {
    const [stores, plan] = await Promise.all([listStores(userId), getPlan(userId)]);
    return okResponse({
      stores: stores.map(s => toSummary(s as unknown as Record<string, unknown>)),
      limit:  storeLimitFor(plan),
      plan,
    }, origin);
  }

  if (action === 'create') {
    const label = cleanLabel(body.label);
    if (!label) return errResponse(`Give the store a name, up to ${MAX_LABEL} characters.`, 400, origin);

    // The tier limit is enforced here, server-side, which is what makes it a
    // real limit rather than a line on the pricing page.
    const plan  = await getPlan(userId);
    const limit = storeLimitFor(plan);
    const count = await countStores(userId);
    if (count >= limit) {
      return errResponse(
        limit === 1
          ? 'Your plan covers one store. Upgrade to Scale to run Ephermal across multiple stores.'
          : `Your plan covers ${limit} stores.`,
        403, origin, { limit, current: count },
      );
    }

    const { data, error } = await supabase
      .from('stores')
      .insert({
        user_id:    userId,
        label,
        // First store an account creates becomes the default, so there is
        // always exactly one and resolveStore never comes back empty.
        is_default: count === 0,
      })
      .select('id, label, is_default, currency, shopify_shop, shopify_token, meta_token, google_refresh_token')
      .single();

    if (error) {
      console.error('stores-api create error:', error.message);
      return errResponse('Could not create the store.', 500, origin);
    }
    return okResponse({ store: toSummary(data as Record<string, unknown>) }, origin);
  }

  if (action === 'rename') {
    const label = cleanLabel(body.label);
    if (!label) return errResponse(`Give the store a name, up to ${MAX_LABEL} characters.`, 400, origin);

    const store = await resolveStore(userId, storeId, origin);
    if (store instanceof Response) return store;

    const { error } = await supabase
      .from('stores')
      .update({ label, updated_at: new Date().toISOString() })
      .eq('id', store.id)
      .eq('user_id', userId);

    if (error) {
      console.error('stores-api rename error:', error.message);
      return errResponse('Could not rename the store.', 500, origin);
    }
    return okResponse({ success: true, id: store.id, label }, origin);
  }

  if (action === 'set_default') {
    const store = await resolveStore(userId, storeId, origin);
    if (store instanceof Response) return store;

    // A partial unique index allows only one default per user, so the old one
    // has to be cleared before the new one is set or the update is rejected.
    const { error: clearErr } = await supabase
      .from('stores')
      .update({ is_default: false })
      .eq('user_id', userId)
      .neq('id', store.id);

    if (clearErr) {
      console.error('stores-api set_default clear error:', clearErr.message);
      return errResponse('Could not switch the default store.', 500, origin);
    }

    const { error } = await supabase
      .from('stores')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', store.id)
      .eq('user_id', userId);

    if (error) {
      console.error('stores-api set_default error:', error.message);
      return errResponse('Could not switch the default store.', 500, origin);
    }
    return okResponse({ success: true, id: store.id }, origin);
  }

  if (action === 'archive') {
    const store = await resolveStore(userId, storeId, origin);
    if (store instanceof Response) return store;

    const remaining = await countStores(userId);
    if (remaining <= 1) {
      return errResponse('This is your only store, so it cannot be removed.', 400, origin);
    }

    // Archived rather than deleted: campaigns, products and revenue history
    // reference this store, and an agency losing a client's reporting because
    // someone tidied up the store list would be the wrong outcome.
    const { error } = await supabase
      .from('stores')
      .update({ archived_at: new Date().toISOString(), is_default: false })
      .eq('id', store.id)
      .eq('user_id', userId);

    if (error) {
      console.error('stores-api archive error:', error.message);
      return errResponse('Could not remove the store.', 500, origin);
    }

    // Removing the default leaves the account without one, so promote the
    // oldest surviving store rather than leaving resolveStore to guess.
    if (store.is_default) {
      const survivors = await listStores(userId);
      if (survivors.length) {
        await supabase
          .from('stores')
          .update({ is_default: true })
          .eq('id', survivors[0].id)
          .eq('user_id', userId);
      }
    }
    return okResponse({ success: true, id: store.id }, origin);
  }

  return errResponse('Unknown action', 400, origin);
});
