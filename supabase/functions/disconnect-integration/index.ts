/**
 * Ephermal — Disconnect Integration (Supabase Edge Function)
 *
 * Clears a connected platform's stored credentials from user_integrations.
 * This is the server-side counterpart the dashboard's "Disconnect" buttons
 * were missing — they previously only cleared localStorage, so a page
 * refresh (which re-hydrates localStorage from user_integrations) made the
 * integration appear connected again.
 *
 * POST { platform: 'meta' | 'shopify' | 'google' }
 *
 * Required env vars:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const PLATFORM_COLUMNS: Record<string, Record<string, null>> = {
  meta: {
    meta_token:      null,
    meta_account:    null,
    meta_page_id:    null,
    meta_page_name:  null,
    meta_page_token: null,
  },
  shopify: {
    shopify_token:     null,
    shopify_shop:      null,
    shopify_shop_name: null,
  },
  google: {
    google_refresh_token:   null,
    google_ads_customer_id: null,
  },
};

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const rl = await rateLimitTiered(userId, 'disconnect', [
    { max: 10, window: 60   },
    { max: 30, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const platform = String(body.platform ?? '');
  const columns = PLATFORM_COLUMNS[platform];
  if (!columns) return errResponse('platform must be meta, shopify, or google', 400, origin);

  const { error } = await supabase
    .from('user_integrations')
    .update(columns)
    .eq('user_id', userId);

  if (error) {
    console.error('disconnect-integration error:', error.message);
    return errResponse('Failed to disconnect', 500, origin);
  }

  return okResponse({ success: true, platform }, origin);
});
