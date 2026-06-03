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

// Per-user rate limit: 60 requests/minute
const RATE_LIMIT = 60;
const RATE_WINDOW = 60; // seconds

async function isRateLimited(userId: string): Promise<boolean> {
  if (!redisAvailable()) return false; // degrade gracefully if Redis is down
  const key = `rl:proxy:${userId}`;
  const count = await redis.incr(key, RATE_WINDOW);
  return count > RATE_LIMIT;
}

// TTL map by action type (0 = never cache)
const CACHE_TTL: Record<string, number> = {
  overview:   60,
  campaigns:  120,
  creatives:  120,
  audiences:  300,
  pixel:      600,
  products:   300,
  analytics:  300,
  insights:   300,
};

// Actions that mutate state — never cache, always forward
const WRITE_ACTIONS = new Set([
  'create_campaign', 'update_campaign', 'pause', 'enable', 'scale_budget',
  'create_audience', 'create_lookalike', 'sync_products', 'launch', 'approve',
  'reject', 'bulk-action',
]);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_BASE      = `${SUPABASE_URL}/functions/v1`;
const APP_URL      = Deno.env.get('APP_URL') ?? 'https://ephermal.app';

/** Map a request path prefix to the target Supabase Edge Function name */
function resolveFunctionName(path: string): string | null {
  if (/^\/(meta|campaigns|creatives|audiences|pixel)/.test(path)) return 'meta-api';
  if (/^\/(ephermal\/shopify|shopify)/.test(path)) return 'shopify-api';
  if (/^\/(ephermal\/ugc|ugc)/.test(path))         return 'ugc-generate';
  if (/^\/(ephermal\/google|google)/.test(path))   return 'google-api';
  if (path.startsWith('/ai'))                       return 'ai-assistant';
  if (path.startsWith('/fatigue'))                  return 'creative-fatigue';
  if (/^\/(optimize|roas)/.test(path))              return 'roas-optimizer';
  if (/^\/(budget)/.test(path))                     return 'budget-ai';
  if (/^\/(launch)/.test(path))                     return 'campaign-launcher';
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  APP_URL,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

/** Extract Clerk user ID from JWT claims (sub field) without full verification */
function extractUserIdFromJWT(token: string): string | null {
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.sub ?? null;
  } catch {
    return null;
  }
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
  const userId = extractUserIdFromJWT(rawToken);
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

  // Determine action for cache key + write detection
  const action = extractAction(path, reqBody ?? {});
  const isWrite = method === 'POST' && WRITE_ACTIONS.has(action);
  const ttl = isWrite ? 0 : (CACHE_TTL[action] ?? 0);
  const canCache = ttl > 0 && redisAvailable();

  // ── Cache lookup (read-only, non-AI requests) ─────────────────────────────
  if (canCache) {
    const scope = extractScope(extraHeaders);
    const key = cacheKey(userId, action, scope);
    const cached = await redis.getJSON<unknown>(key);
    if (cached !== null) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT', ...CORS_HEADERS },
      });
    }
  }

  // ── Resolve target Supabase function ─────────────────────────────────────
  const fnName = resolveFunctionName(path);
  if (!fnName) {
    return new Response(JSON.stringify({ error: `No function mapped for path: ${path}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const targetUrl = buildFunctionUrl(fnName, path);

  const forwardHeaders: Record<string, string> = {
    'Authorization':  `Bearer ${rawToken}`,
    'Content-Type':   'application/json',
    'apikey':         SUPABASE_KEY,
    ...extraHeaders,
  };

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      ...(method === 'POST' && reqBody ? { body: JSON.stringify(reqBody) } : {}),
    });
  } catch (e) {
    console.error('upstream fetch error:', e);
    return new Response('Upstream error', { status: 502, headers: CORS_HEADERS });
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text();
    return new Response(errText || 'Upstream error', {
      status: upstreamRes.status,
      headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS },
    });
  }

  const responseData = await upstreamRes.json().catch(() => null);
  if (responseData === null) {
    return new Response('Invalid upstream response', { status: 502, headers: CORS_HEADERS });
  }

  // ── Store in cache (best-effort) ──────────────────────────────────────────
  if (canCache) {
    const scope = extractScope(extraHeaders);
    const key = cacheKey(userId, action, scope);
    redis.setJSON(key, responseData, ttl).catch(() => {});
  }

  return new Response(JSON.stringify(responseData), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS', ...CORS_HEADERS },
  });
});
