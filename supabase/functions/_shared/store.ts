/**
 * Ephermal — Store resolution (shared)
 *
 * Multi-store turns "which rows belong to this caller?" from a one-part
 * question into a two-part one. Before, user_id alone was the whole answer and
 * a caller could not ask for anything that was not theirs. Now a request can
 * name a store_id, and that is the one new place where a user could reach
 * another account's data.
 *
 * So there is exactly one rule, and it lives here rather than in thirteen
 * separate handlers: a store_id coming off the wire is never trusted. It is
 * looked up by (id, user_id) together, and a store belonging to someone else
 * is indistinguishable from one that does not exist.
 *
 * Usage in a handler, right after extractUserId():
 *
 *   const store = await resolveStore(userId, body.store_id, origin);
 *   if (store instanceof Response) return store;
 *   // ...then filter every query by .eq('store_id', store.id)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { errResponse } from './auth.ts';

export interface Store {
  id: string;
  user_id: string;
  label: string | null;
  shopify_shop: string | null;
  shopify_token: string | null;
  shopify_shop_name: string | null;
  meta_token: string | null;
  meta_account: string | null;
  meta_page_id: string | null;
  meta_page_name: string | null;
  meta_page_token: string | null;
  google_refresh_token: string | null;
  google_ads_customer_id: string | null;
  currency: string;
  fee_payment_pct: number | string;
  fee_payment_fixed_cents: number;
  fee_shipping_cents: number;
  fee_other_pct: number | string;
  is_default: boolean;
}

const STORE_COLS =
  'id, user_id, label, shopify_shop, shopify_token, shopify_shop_name, ' +
  'meta_token, meta_account, meta_page_id, meta_page_name, meta_page_token, ' +
  'google_refresh_token, google_ads_customer_id, currency, ' +
  'fee_payment_pct, fee_payment_fixed_cents, fee_shipping_cents, fee_other_pct, is_default';

let _supabase: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }
  return _supabase;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every live store for a user, default first then oldest first. */
export async function listStores(userId: string): Promise<Store[]> {
  const { data } = await getClient()
    .from('stores')
    .select(STORE_COLS)
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  return (data ?? []) as unknown as Store[];
}

/**
 * Resolve the store a request is operating on.
 *
 * With an explicit storeId: looked up by id AND user_id together, so another
 * account's store simply is not found. With none: the caller's default store,
 * which keeps every existing single-store caller working unchanged.
 *
 * Returns a ready-to-return Response on failure so handlers stay flat.
 */
export async function resolveStore(
  userId: string,
  storeId: string | null | undefined,
  origin?: string | null,
): Promise<Store | Response> {
  const db = getClient();

  if (storeId) {
    // Reject anything that is not a UUID before it reaches the query, so a
    // malformed id returns the same "not found" as a valid-but-foreign one
    // rather than a Postgres cast error that confirms the id was well formed.
    if (!UUID_RE.test(storeId)) {
      return errResponse('Store not found.', 404, origin);
    }

    const { data } = await db
      .from('stores')
      .select(STORE_COLS)
      .eq('id', storeId)
      .eq('user_id', userId)
      .is('archived_at', null)
      .maybeSingle();

    // Deliberately the same message and status whether the store belongs to
    // someone else, is archived, or never existed. Nothing here tells a caller
    // that an id they guessed is real.
    if (!data) return errResponse('Store not found.', 404, origin);
    return data as unknown as Store;
  }

  const { data } = await db
    .from('stores')
    .select(STORE_COLS)
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return errResponse(
      'No store connected yet. Connect your Shopify store to get started.',
      400,
      origin,
    );
  }
  return data as unknown as Store;
}

/**
 * How many stores a tier may run at once.
 *
 * Scale is the agency tier, which is the entire reason multi-store exists.
 * Starter and Growth stay single-store, and this is the number the pricing
 * page is allowed to quote. It is enforced server-side in createStore below,
 * so the limit is real rather than a label.
 */
export const PLAN_STORE_LIMIT: Record<string, number> = {
  starter: 1,
  growth: 1,
  scale: 25,
};

export function storeLimitFor(plan: string): number {
  return PLAN_STORE_LIMIT[plan] ?? 1;
}

/** Live (non-archived) store count for a user. */
export async function countStores(userId: string): Promise<number> {
  const { count } = await getClient()
    .from('stores')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('archived_at', null);
  return count ?? 0;
}
