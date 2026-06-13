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

async function refreshJwks(): Promise<void> {
  const url = Deno.env.get('CLERK_JWKS_URL') ?? 'https://clerk.ephermal.app/.well-known/jwks.json';
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
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

async function getPublicKey(kid: string): Promise<CryptoKey | null> {
  const age = Date.now() - _jwksCache.ts;
  if (age > JWKS_TTL_MS || !_jwksCache.keys.has(kid)) {
    try {
      await refreshJwks();
    } catch {
      // Use stale cache on network error — better than a total outage
    }
  }
  return _jwksCache.keys.get(kid) ?? null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Verify a Clerk RS256 JWT and return the user ID (sub), or null on failure. */
export async function extractUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  if (token.length < 20) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const headerJson  = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payloadJson = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

    // Validate issuer — must be our Clerk domain
    const expectedIss = Deno.env.get('CLERK_ISSUER') ?? 'https://clerk.ephermal.app';
    if (payloadJson.iss && payloadJson.iss !== expectedIss) return null;

    // Validate expiry and not-before
    const now = Math.floor(Date.now() / 1000);
    if (payloadJson.exp && now > payloadJson.exp) return null;
    if (payloadJson.nbf && now < payloadJson.nbf) return null;

    // Verify RS256 signature
    const key = await getPublicKey(headerJson.kid);
    if (!key) return null;

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

    return valid ? (payloadJson.sub ?? null) : null;
  } catch {
    return null;
  }
}

/** Standard CORS headers — locked to APP_URL env var */
export function corsHeaders(origin?: string | null): Record<string, string> {
  const appUrl = Deno.env.get('APP_URL') ?? 'https://ephermal.app';
  return {
    'Access-Control-Allow-Origin':  origin === appUrl ? origin : appUrl,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Meta-Token, X-Meta-Account, X-Shopify-Token, X-Shopify-Store, X-Google-Token, X-Google-Account',
    'Access-Control-Max-Age':       '86400',
  };
}

/** Return a JSON error response */
export function errResponse(message: string, status: number, origin?: string | null): Response {
  return new Response(JSON.stringify({ error: message }), {
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
