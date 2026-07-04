/**
 * Ephermal — Rate Limiting (shared)
 *
 * Sliding-window rate limiter backed by Upstash Redis (INCR + EXPIRE).
 * When Redis is unavailable, falls back to an in-process Map so limits
 * are still enforced (fail-closed, not fail-open).
 *
 * Usage:
 *   const result = await rateLimit(userId, 'ai', 10, 60);   // 10 req/60s
 *   if (!result.allowed) return rateLimitResponse(origin, result.resetIn);
 */

import { redis } from './redis.ts';

// In-memory fallback: keyed same as Redis keys, auto-evicted when window expires.
const _memStore = new Map<string, { count: number; resetAt: number }>();

function _memRateLimit(key: string, maxRequests: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  let bucket = _memStore.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowSeconds * 1_000 };
    _memStore.set(key, bucket);
    // Evict expired entries when store grows large to avoid memory leak.
    if (_memStore.size > 10_000) {
      for (const [k, v] of _memStore) {
        if (now >= v.resetAt) _memStore.delete(k);
      }
    }
  }
  bucket.count += 1;
  return {
    allowed:   bucket.count <= maxRequests,
    remaining: Math.max(0, maxRequests - bucket.count),
    resetIn:   Math.ceil((bucket.resetAt - now) / 1_000),
  };
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
}

/**
 * Sliding-window rate limit. Returns { allowed: false } when count > max.
 * Key is auto-namespaced: rl:{fn}:{userId}:{window}
 */
export async function rateLimit(
  userId: string,
  fn: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const key   = `rl:${fn}:${userId}:${windowSeconds}`;
  const count = await redis.incr(key, windowSeconds);
  if (count === null) {
    // Redis unavailable — enforce limits in-process so spend-incurring endpoints stay protected.
    return _memRateLimit(key, maxRequests, windowSeconds);
  }
  const remaining = Math.max(0, maxRequests - count);
  return { allowed: count <= maxRequests, remaining, resetIn: windowSeconds };
}

/**
 * Check multiple tiers (e.g. per-minute AND per-hour) simultaneously.
 * Returns the first denied tier, or the first result if all pass.
 */
export async function rateLimitTiered(
  userId: string,
  fn: string,
  tiers: { max: number; window: number }[],
): Promise<RateLimitResult> {
  const results = await Promise.all(
    tiers.map(t => rateLimit(userId, fn, t.max, t.window)),
  );
  return results.find(r => !r.allowed) ?? results[0];
}

/**
 * IP-based rate limit for unauthenticated endpoints (OAuth callbacks).
 * Uses CF-Connecting-IP if present, falls back to X-Forwarded-For.
 */
export async function rateLimitIp(
  req: Request,
  fn: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const ip =
    req.headers.get('cf-connecting-ip') ??
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ??
    'unknown';
  return rateLimit(ip, fn, maxRequests, windowSeconds);
}

/** Standard 429 response with Retry-After header */
export function rateLimitResponse(origin: string | null, resetIn = 60): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Retry-After':  String(resetIn),
  };
  // Echo a safe CORS origin so browser JS can read the 429 status
  if (origin) {
    const appUrl = Deno.env.get('APP_URL') ?? 'https://ephermal.app';
    headers['Access-Control-Allow-Origin'] = origin === appUrl ? origin : appUrl;
  }
  return new Response(
    JSON.stringify({ error: 'Too many requests — please slow down.' }),
    { status: 429, headers },
  );
}

/** Enforce a maximum body size. Returns true if request exceeds limit. */
export function bodyTooLarge(req: Request, maxBytes = 65_536): boolean {
  const cl = req.headers.get('content-length');
  if (!cl) return false;
  return parseInt(cl, 10) > maxBytes;
}
