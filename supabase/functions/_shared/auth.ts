/**
 * Ephermal — Auth helpers (shared)
 *
 * Verifies Clerk RS256 JWTs against the public JWKS endpoint.
 * JWKS keys are cached in-process for 1 hour; stale cache used on network error.
 */

// ── JWKS verification ─────────────────────────────────────────────────────────

type JwkEntry = { kid?: string; kty: string; n: string; e: string; alg?: string; use?: string };
type JwksResponse = { keys: JwkEntry[] };

const _jwksCache: { keys: Map<string, CryptoKey>; ts: number } = { keys: new Map(), ts: 0 };
const JWKS_TTL_MS = 3_600_000; // 1 hour

async function refreshJwksOnce(): Promise<void> {
  const url = Deno.env.get('CLERK_JWKS_URL') ?? 'https://clerk.ephermal.app/.well-known/jwks.json';
  // 8s (was 4s) — a cold-starting isolate under load can be slow on its first
  // outbound fetch; 4s was tight enough to cause spurious 401s on otherwise-valid
  // tokens whenever a fresh instance got unlucky on network setup.
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const jwks = await res.json() as JwksResponse;
  const newKeys = new Map<string, CryptoKey>();
  for (const k of jwks.keys) {
    if (k.kty !== 'RSA' || !k.kid) continue;
    const key = await crypto.subtle.importKey(
      'jwk',
      k as unknown as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    newKeys.set(k.kid, key);
  }
  _jwksCache.keys = newKeys;
  _jwksCache.ts   = Date.now();
}

/** Fetch JWKS with one immediate retry — a single transient network blip on a
 *  cold-starting instance used to permanently 401 every request until the next
 *  cache-eligible attempt; a retry absorbs that without waiting on the caller. */
async function refreshJwks(): Promise<void> {
  try {
    await refreshJwksOnce();
  } catch (e) {
    console.warn('[auth] JWKS fetch failed, retrying once —', e instanceof Error ? e.message : String(e));
    await refreshJwksOnce();
  }
}

async function getPublicKey(kid: string): Promise<{ key: CryptoKey | null; jwksError?: string }> {
  const age = Date.now() - _jwksCache.ts;
  let jwksError: string | undefined;
  if (age > JWKS_TTL_MS || !_jwksCache.keys.has(kid)) {
    try {
      await refreshJwks();
    } catch (e) {
      // Use stale cache on network error — better than a total outage
      jwksError = e instanceof Error ? e.message : String(e);
    }
  }
  return { key: _jwksCache.keys.get(kid) ?? null, jwksError };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify a Clerk RS256 JWT and return the user ID (sub), or null on failure.
 * Pass `diag` (a plain object you own, e.g. `{}`) to have the specific rejection
 * reason written to `diag.reason` — useful for turning an opaque 401 into an
 * actionable error message instead of it just vanishing client-side.
 */
export async function extractUserId(
  authHeader: string | null,
  diag?: { reason?: string },
): Promise<string | null> {
  const fail = (reason: string) => { if (diag) diag.reason = reason; return null; };

  if (!authHeader?.startsWith('Bearer ')) return fail('missing_token');
  const token = authHeader.slice(7);
  if (token.length < 20) return fail('malformed_token');

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return fail('malformed_token');

    const headerJson  = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payloadJson = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

    // Validate issuer — must be our Clerk domain
    const expectedIss = Deno.env.get('CLERK_ISSUER') ?? 'https://clerk.ephermal.app';
    if (!payloadJson.iss || payloadJson.iss !== expectedIss) {
      console.warn('[auth] rejected: issuer mismatch — token iss:', payloadJson.iss, 'expected:', expectedIss);
      return fail('issuer_mismatch');
    }

    // Validate expiry and not-before, with a leeway for clock skew between
    // Clerk's issuing server and this edge function's container clock — without
    // it, a token that is genuinely still valid can get rejected purely because
    // the two clocks disagree by a few seconds.
    const CLOCK_SKEW_LEEWAY_SEC = 90;
    const now = Math.floor(Date.now() / 1000);
    if (!payloadJson.exp || now > payloadJson.exp + CLOCK_SKEW_LEEWAY_SEC) {
      console.warn('[auth] rejected: expired — exp:', payloadJson.exp, 'now:', now);
      return fail('token_expired');
    }
    if (payloadJson.nbf && now < payloadJson.nbf - CLOCK_SKEW_LEEWAY_SEC) {
      console.warn('[auth] rejected: not yet valid — nbf:', payloadJson.nbf, 'now:', now);
      return fail('token_not_yet_valid');
    }

    // Verify RS256 signature
    const { key, jwksError } = await getPublicKey(headerJson.kid);
    if (!key) {
      console.warn('[auth] rejected: no matching JWKS key for kid:', headerJson.kid, jwksError ? `(fetch error: ${jwksError})` : '');
      return fail(jwksError ? 'jwks_unavailable' : 'unknown_signing_key');
    }

    const signingInput = `${parts[0]}.${parts[1]}`;
    const sigBytes     = Uint8Array.from(
      atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0),
    );

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      sigBytes,
      new TextEncoder().encode(signingInput),
    );

    if (!valid) {
      console.warn('[auth] rejected: signature verification failed for kid:', headerJson.kid);
      return fail('bad_signature');
    }
    return payloadJson.sub ?? fail('missing_sub');
  } catch (e) {
    console.warn('[auth] rejected: exception during verification —', e instanceof Error ? e.message : String(e));
    return fail('verification_exception');
  }
}

/** Standard CORS headers — locked to APP_URL and its dashboard subdomain */
export function corsHeaders(origin?: string | null): Record<string, string> {
  const appUrl = Deno.env.get('APP_URL') ?? 'https://ephermal.app';
  const allowed = [appUrl, 'https://dashboard.ephermal.app', 'https://admin.ephermal.app'];
  return {
    'Access-Control-Allow-Origin':  origin && allowed.includes(origin) ? origin : appUrl,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-Meta-Token, X-Meta-Account, X-Shopify-Token, X-Shopify-Store, X-Google-Token, X-Google-Account',
    'Access-Control-Max-Age':       '86400',
  };
}

/** Return a JSON error response. Optional `extra` is merged into the body — e.g. structured
 *  upsell data ({ out_of_credits: true, topup_prices: {...} }) the frontend can act on
 *  without string-parsing the error message. */
export function errResponse(
  message: string, status: number, origin?: string | null, extra?: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify({ error: message, ...(extra ?? {}) }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

/** Sign OAuth state with HMAC-SHA256. Message: userId:platform:page:nonce */
export async function signOAuthState(
  secret: string,
  userId: string,
  platform: string,
  page: string,
  nonce: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${userId}:${platform}:${page}:${nonce}`),
  );
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two hex strings */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Return a JSON success response */
export function okResponse(data: unknown, origin?: string | null, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin), ...(extra ?? {}) },
  });
}
