/**
 * Ephermal — FX Rate (Supabase Edge Function)
 *
 * Tiny public endpoint backing the Settings currency switcher (EUR/USD display
 * preference). All money is stored and billed in EUR internally — this only
 * supplies the rate the frontend uses to convert already-known EUR amounts for
 * display, and to convert a typed USD input back to EUR before it's sent anywhere.
 *
 * GET  — returns { rate, base: 'EUR', quote: 'USD' }, Redis-cached for 12h so
 *        the upstream (Frankfurter, free/no-key/CORS) is called at most once
 *        every 12h for the whole platform, not per user.
 *
 * No auth required — this is a global, non-sensitive, non-user-scoped value,
 * same category as public-store-scan. IP rate-limited for consistency with
 * every other unauthenticated endpoint in this codebase.
 *
 * Required env vars: none beyond auto-injected Supabase vars (Redis is optional —
 * falls back to a live fetch every call if Upstash isn't configured).
 */

import { corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitIp } from '../_shared/rate-limit.ts';
import { redis, redisAvailable } from '../_shared/redis.ts';
import { captureError } from '../_shared/sentry.ts';

const FX_CACHE_KEY = 'ephermal:fx:eur:usd';
const FX_CACHE_TTL = 12 * 60 * 60; // 12h — a display preference doesn't need to be fresher than this
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?from=EUR&to=USD';

async function fetchLiveRate(): Promise<number | null> {
  try {
    const res = await fetch(FRANKFURTER_URL);
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.rates?.USD;
    return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch (e) {
    captureError('fx-rate', '[fx-rate] Frankfurter fetch threw:', e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'GET') return errResponse('Method not allowed', 405, origin);

  // Cheap, Redis-cached lookup - generous limit is still worth having so a
  // misbehaving client can't hammer the upstream rate provider via this proxy.
  const rl = await rateLimitIp(req, 'fx-rate', 30, 60);
  if (!rl.allowed) return errResponse('rate_limited', 429, origin);

  if (redisAvailable()) {
    const cached = await redis.getJSON<{ rate: number }>(FX_CACHE_KEY);
    if (cached?.rate) {
      return okResponse({ rate: cached.rate, base: 'EUR', quote: 'USD' }, origin);
    }
  }

  const rate = await fetchLiveRate();
  if (rate === null) {
    // Frontend always has its own hardcoded fallback rate for exactly this case —
    // never block rendering on this endpoint being reachable.
    return errResponse('fx_unavailable', 502, origin);
  }

  if (redisAvailable()) {
    redis.setJSON(FX_CACHE_KEY, { rate }, FX_CACHE_TTL).catch(() => {});
  }

  return okResponse({ rate, base: 'EUR', quote: 'USD' }, origin);
});
