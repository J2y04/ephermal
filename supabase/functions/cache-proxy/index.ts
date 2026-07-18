/**
 * Ephermal — Cache Proxy (Supabase Edge Function)
 *
 * Sits between the dashboard frontend and Supabase Edge Functions.
 * Caches expensive read API responses in Upstash Redis.
 * Write/mutate requests are always forwarded directly (never cached).
 *
 * Deploy: supabase functions deploy cache-proxy
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL   — https://your-db.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN — your Redis REST token
 *   SUPABASE_URL             — https://xxx.supabase.co (auto-injected)
 *   APP_URL                  — https://ephermal.app
 *
 * Request format (POST from frontend):
 *   {
 *     "path":    "/meta?action=campaigns",
 *     "method":  "GET" | "POST",
 *     "body":    {...},               // optional, for POST
 *     "headers": { ... }             // x-meta-token, x-shopify-token, etc.
 *   }
 *
 * Path → Function routing:
 *   /meta*, /campaigns*, /creatives*, /audiences*, /pixel*  → meta-api
 *   /ai*                                                    → ai-assistant
 *   /fatigue*                                               → creative-fatigue
 *   /optimize*, /roas*                                      → roas-optimizer
 *   /ugc*                                                   → ugc-generate
 *   /shopify*                                               → shopify-api
 *   /store-intelligence*                                    → store-intelligence
 *
 * Cache keys: ephermal:{userId}:{action}:{scope}
 * Cache TTLs (seconds):
 *   overview    60   — dashboard KPIs, changes frequently
 *   campaigns   120  — campaign list
 *   creatives   120  — creative list
 *   audiences   300  — audience list
 *   pixel       600  — pixel status
 *   products    300  — Shopify products
 *   analytics   300  — analytics insights
 *   ai          0    — never cached (always live)
 *
 * Cache is user-scoped (by Clerk user ID) to prevent data leakage.
 */

import { redis, cacheKey, redisAvailable } from '../_shared/redis.ts';
import { extractUserId } from '../_shared/auth.ts';

// Per-user rate limit: 60 requests/minute
const RATE_LIMIT = 60;
const RATE_WINDOW = 60; // seconds

async function isRateLimited(userId: string): Promise<boolean> {
  if (!redisAvailable()) return false; // degrade gracefully if Redis is down
  const key = `rl:proxy:${userId}`;
  const count = await redis.incr(key, RATE_WINDOW);
  return count > RATE_LIMIT;
}

// TTL map — keyed as "fnName:action" (function-scoped to prevent collisions).
// Legacy bare action keys kept for any direct callers.
const CACHE_TTL: Record<string, number> = {
  // legacy bare keys
  overview:   60,
  campaigns:  120,
  creatives:  120,
  audiences:  300,
  pixel:      600,
  products:   300,
  analytics:  300,
  insights:   300,
  // function-scoped keys (used by all new cache lookups)
  'meta-api:overview':          60,
  'meta-api:campaigns':         120,
  'meta-api:creatives':         120,
  'meta-api:audiences':         300,
  'meta-api:pixel':             600,
  'meta-api:analytics':         300,
  'meta-api:insights':          300,
  'shopify-api:products':       300,
  'google-api:campaigns':       120,
  'google-api:analytics':       300,
  'creative-fatigue:analyze':   300,
  'roas-optimizer:analyze':     300,
  // competitor-radar intentionally NOT cached — cache key excludes search_terms body,
  // so caching would return the first competitor's ads for all subsequent searches.
  'ugc-generate:script':        300,
  'profit-tracker:get_report':  120,
  'creative-brief:generate':    300,
  'budget-ai:calculate':        120,
};

// Actions that mutate state — never cache, always forward
const WRITE_ACTIONS = new Set([
  'create_campaign', 'update_campaign', 'pause', 'enable', 'scale_budget',
  'create_audience', 'create_lookalike', 'sync_products', 'launch', 'approve',
  'reject', 'bulk-action',
  'set_cogs', 'bulk_set',  // profit-tracker writes
  'select_account', // meta-api: switch which Meta ad account is active
  'disconnect', // disconnect-integration: clear a platform's stored credentials
  'launch_meta', 'launch_google', 'save_draft', 'update', 'delete', // campaign-launcher writes
]);

// After a write, invalidate related read caches
const WRITE_INVALIDATES: Record<string, string[]> = {
  set_cogs:       ['profit-tracker:get_report'],
  bulk_set:       ['profit-tracker:get_report'],
  sync_products:  ['shopify-api:products'],
  create_campaign:    ['meta-api:campaigns', 'meta-api:overview', 'google-api:campaigns'],
  update_campaign:    ['meta-api:campaigns', 'meta-api:overview', 'google-api:campaigns'],
  pause:              ['meta-api:campaigns', 'meta-api:overview'],
  enable:             ['meta-api:campaigns', 'meta-api:overview'],
  scale_budget:       ['meta-api:campaigns', 'meta-api:overview'],
  'bulk-action':      ['meta-api:campaigns', 'meta-api:overview'],
  // Switching the active ad account invalidates every cached Meta read —
  // all of it was scoped to the previous account.
  select_account:     ['meta-api:overview', 'meta-api:campaigns', 'meta-api:creatives', 'meta-api:audiences', 'meta-api:pixel', 'meta-api:analytics'],
  // Disconnecting a platform could be any of the three — over-invalidate all
  // of them rather than track which platform per call; cheap and harmless.
  disconnect:         ['meta-api:overview', 'meta-api:campaigns', 'meta-api:creatives', 'meta-api:audiences', 'meta-api:pixel', 'meta-api:analytics', 'shopify-api:products', 'google-api:campaigns', 'google-api:analytics'],
  // A real launch creates a live campaign on the platform — the cached campaign
  // list must refresh immediately so the dashboard reflects it, not after the TTL.
  launch_meta:        ['meta-api:campaigns', 'meta-api:overview'],
  launch_google:      ['google-api:campaigns', 'google-api:analytics'],
};

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL') ?? '';
// Use the anon key for downstream apikey header — NOT the service role key.
// Individual edge functions verify the Clerk JWT and use their own service role key internally.
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const FN_BASE       = `${SUPABASE_URL}/functions/v1`;
const APP_URL      = Deno.env.get('APP_URL') ?? 'https://ephermal.app';

/** Map a request path prefix to the target Supabase Edge Function name */
function resolveFunctionName(path: string): string | null {
  if (/^\/(meta|campaigns|creatives|audiences|pixel)/.test(path)) return 'meta-api';
  if (/^\/(ephermal\/shopify|shopify)/.test(path)) return 'shopify-api';
  if (/^\/(ephermal\/ugc|ugc)/.test(path))         return 'ugc-generate';
  if (/^\/(ephermal\/google|google)/.test(path))   return 'google-api';
  if (path.startsWith('/ai'))                       return 'ai-assistant';
  if (/^\/(fatigue|creative-fatigue)/.test(path))   return 'creative-fatigue';
  if (/^\/(optimize|roas)/.test(path))              return 'roas-optimizer';
  if (/^\/(budget)/.test(path))                     return 'budget-ai';
  if (/^\/(launch)/.test(path))                     return 'campaign-launcher';
  if (/^\/(creative-brief)/.test(path))             return 'creative-brief';
  if (/^\/(competitor-radar)/.test(path))           return 'competitor-radar';
  if (/^\/(profit-tracker)/.test(path))             return 'profit-tracker';
  if (/^\/(store-intelligence)/.test(path))         return 'store-intelligence';
  if (/^\/(mrr-tracker)/.test(path))                return 'mrr-tracker';
  if (/^\/(disconnect)/.test(path))                 return 'disconnect-integration';
  return null;
}

// Inject a default `action` param when the path doesn't carry one
const PATH_TO_ACTION: Record<string, string> = {
  'campaigns':          'campaigns',
  'creatives':          'creatives',
  'audiences':          'audiences',
  'pixel':              'pixel',
  'meta':               'overview',
  'shopify':            'products',
  'google':             'campaigns',
  'ugc':                'script',
  'ai':                 'chat',
  'fatigue':            'analyze',
  'optimize':           'analyze',
  'roas':               'analyze',
  'budget':             'calculate',
  'launch':             'prepare',
  'creative-brief':     'generate',
  'competitor-radar':   'search',
  'profit-tracker':     'get_report',
};

/** Build the target Supabase function URL, preserving query params and injecting action */
function buildFunctionUrl(fnName: string, path: string): string {
  try {
    const parsed = new URL(`https://placeholder${path}`);
    const target = new URL(`${FN_BASE}/${fnName}`);

    // Copy all query params from the original path
    parsed.searchParams.forEach((v, k) => target.searchParams.set(k, v));

    // If no `action` param, infer from the first path segment
    if (!target.searchParams.has('action')) {
      // Strip leading slash and /ephermal/ prefix, take first segment
      const segment = path.replace(/^\/ephermal\//, '/').replace(/^\//, '').split(/[/?]/)[0];
      const inferred = PATH_TO_ACTION[segment];
      if (inferred) target.searchParams.set('action', inferred);
    }

    return target.toString();
  } catch {
    return `${FN_BASE}/${fnName}`;
  }
}

// dashboard.ephermal.app serves the same dashboard.html as a second origin
// (Vercel host-based alias) — both must be allowed to call this function.
const ALLOWED_ORIGINS = [APP_URL, 'https://dashboard.ephermal.app'];

function buildCorsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  origin && ALLOWED_ORIGINS.includes(origin) ? origin : APP_URL,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}


/** Extract the action name from a URL path/query */
function extractAction(path: string, body: Record<string, unknown>): string {
  const url = new URL(`https://placeholder${path}`);
  return (url.searchParams.get('action') || String(body?.action || 'unknown')).toLowerCase();
}

/** Extract a scope key (account/store) for cache namespacing */
function extractScope(headers: Record<string, string>): string {
  return headers['x-meta-account'] || headers['x-shopify-store'] || '';
}

Deno.serve(async (req) => {
  const CORS_HEADERS = buildCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  // ── Auth: require Clerk JWT ───────────────────────────────────────────────
  // Supabase Edge Runtime rejects RS256 (Clerk) JWTs with UNAUTHORIZED_ASYMMETRIC_JWT
  // even when verify_jwt=false. Client sends anon key in Authorization (accepted by
  // runtime) and passes Clerk JWT in the JSON body as `clerkToken`.
  const authHeader = req.headers.get('Authorization') ?? '';

  // ── Payload size guard (512 KB) ─────────────────────────────────────────────
  const cl = req.headers.get('content-length');
  if (cl && parseInt(cl, 10) > 524_288) {
    return new Response('Request too large', { status: 413, headers: CORS_HEADERS });
  }

  let body: {
    path:       string;
    method?:    string;
    body?:      Record<string, unknown>;
    headers?:   Record<string, string>;
    clerkToken?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS_HEADERS });
  }

  const { path, method = 'GET', body: reqBody, headers: extraHeaders = {}, clerkToken } = body;

  // Validate Clerk JWT: prefer body `clerkToken`, fall back to Authorization header
  const rawToken = clerkToken || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '');
  if (!rawToken || rawToken.length < 20) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }
  const userId = await extractUserId(`Bearer ${rawToken}`);
  if (!userId) {
    return new Response('Invalid token', { status: 401, headers: CORS_HEADERS });
  }

  // Server-side rate limit: 60 req/min per user
  if (await isRateLimited(userId)) {
    return new Response('Too Many Requests', { status: 429, headers: CORS_HEADERS });
  }

  if (!path || typeof path !== 'string' || !path.startsWith('/')) {
    return new Response('Invalid path', { status: 400, headers: CORS_HEADERS });
  }

  // ── Resolve target function early (needed for scoped cache keys) ─────────
  const fnName = resolveFunctionName(path);
  if (!fnName) {
    return new Response(JSON.stringify({ error: `No function mapped for path: ${path}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Determine action for cache key + write detection
  const action = extractAction(path, reqBody ?? {});
  const scopedAction = `${fnName}:${action}`;
  // isWrite is action-driven, not method-driven: a caller omitting method still invalidates caches
  const isWrite = WRITE_ACTIONS.has(action);
  // Ensure write actions are always forwarded as POST even if caller omitted method
  const effectiveMethod = isWrite && method === 'GET' ? 'POST' : method;
  const ttl = isWrite ? 0 : (CACHE_TTL[scopedAction] ?? CACHE_TTL[action] ?? 0);
  const canCache = ttl > 0 && redisAvailable();

  // ── Cache lookup (read-only, non-AI requests) ─────────────────────────────
  if (canCache) {
    const scope = extractScope(extraHeaders);
    const key = cacheKey(userId, scopedAction, scope);
    const cached = await redis.getJSON<unknown>(key);
    if (cached !== null) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT', ...CORS_HEADERS },
      });
    }
  }

  const targetUrl = buildFunctionUrl(fnName, path);

  const forwardHeaders: Record<string, string> = {
    'Authorization':  `Bearer ${rawToken}`,
    'Content-Type':   'application/json',
    'apikey':         SUPABASE_ANON,
    ...extraHeaders,
  };

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(targetUrl, {
      method: effectiveMethod,
      headers: forwardHeaders,
      ...(effectiveMethod === 'POST' && reqBody ? { body: JSON.stringify(reqBody) } : {}),
    });
  } catch (e) {
    console.error('upstream fetch error:', e);
    return new Response('Upstream error', { status: 502, headers: CORS_HEADERS });
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text();
    console.error(`[cache-proxy] upstream ${fnName} ${upstreamRes.status}:`, errText.slice(0, 500));
    if (upstreamRes.status === 429) {
      return new Response(JSON.stringify({ error: 'Too many requests — please slow down.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
    // Every edge function already returns clean, user-facing {error: "..."} strings
    // (validation messages, plan gating, sanitized Meta/Google errors) — forward that
    // message as-is instead of a generic "Upstream service error" that hides what
    // actually happened. Fall back to a generic message only if the body isn't that shape.
    let upstreamMsg = 'Upstream service error.';
    try {
      const parsed = JSON.parse(errText) as { error?: unknown };
      if (typeof parsed.error === 'string' && parsed.error) upstreamMsg = parsed.error;
    } catch { /* not JSON — keep generic message */ }
    return new Response(JSON.stringify({ error: upstreamMsg }), {
      status: upstreamRes.status,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const responseData = await upstreamRes.json().catch(() => null);
  if (responseData === null) {
    return new Response('Invalid upstream response', { status: 502, headers: CORS_HEADERS });
  }

  // ── Store in cache (best-effort) ──────────────────────────────────────────
  if (canCache) {
    const scope = extractScope(extraHeaders);
    const key = cacheKey(userId, scopedAction, scope);
    redis.setJSON(key, responseData, ttl).catch(() => {});
  }

  // ── Invalidate related caches after successful writes ─────────────────────
  if (isWrite && redisAvailable()) {
    const keysToInvalidate = WRITE_INVALIDATES[action] ?? [];
    if (keysToInvalidate.length > 0) {
      const scope = extractScope(extraHeaders);
      Promise.all(
        keysToInvalidate.map(k => redis.del(cacheKey(userId, k, scope)).catch(() => {}))
      ).catch(() => {});
    }
  }

  return new Response(JSON.stringify(responseData), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS', ...CORS_HEADERS },
  });
});
