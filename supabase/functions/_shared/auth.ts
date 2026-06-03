/**
 * Ephermal — Auth helpers (shared)
 *
 * Extracts Clerk user ID from JWT without full verification.
 * Full verification is done by Clerk's JWKS endpoint in production
 * via Supabase's third-party auth integration.
 */

/** Extract Clerk user ID (sub) from a Bearer JWT — no network call */
export function extractUserId(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  if (token.length < 20) return null;
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.sub ?? null;
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

/** Return a JSON success response */
export function okResponse(data: unknown, origin?: string | null, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin), ...(extra ?? {}) },
  });
}
