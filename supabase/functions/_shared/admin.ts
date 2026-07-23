/**
 * Ephermal — Admin gate (shared)
 *
 * Restricts the admin panel (admin.ephermal.app) to a single operator.
 * Two independent checks must BOTH pass — role is not enough on its own,
 * email is not enough on its own:
 *
 *   1. The Clerk user's publicMetadata.role is 'ceo' or 'admin' (same
 *      convention already used client-side in dashboard.html's isAdmin()).
 *   2. Their primary email is in the hardcoded ADMIN_EMAILS allowlist below.
 *
 * Role is NOT present in the Clerk JWT (extractUserId in ./auth.ts only
 * verifies signature/iss/exp/nbf and returns `sub`), so this fetches the
 * user fresh from Clerk's Backend API. Fails closed on any error — a
 * network hiccup or malformed response denies access, never grants it.
 *
 * Required env var: CLERK_SECRET_KEY
 */

// Hardcoded backstop — deliberately not an env var, so changing who has admin
// access requires a code change + review, not just a Supabase secrets edit.
const ADMIN_EMAILS = new Set(['jamalsettah2604@gmail.com']);

interface ClerkUser {
  id: string;
  public_metadata?: { role?: string };
  email_addresses?: { id: string; email_address: string }[];
  primary_email_address_id?: string | null;
}

interface AdminCheck {
  ok: boolean;
  email?: string;
}

// Short in-process cache so a burst of admin-api calls (e.g. loading the
// overview page, which fires list_users + get_revenue together) doesn't
// each round-trip to Clerk. Bounded staleness is fine for a single-operator
// gate — 60s is short enough that revoking access takes effect almost
// immediately.
const _cache = new Map<string, { result: AdminCheck; ts: number }>();
const CACHE_TTL_MS = 60_000;

export async function requireAdmin(userId: string): Promise<AdminCheck> {
  const cached = _cache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.result;

  const result = await checkAdmin(userId);
  _cache.set(userId, { result, ts: Date.now() });
  return result;
}

async function checkAdmin(userId: string): Promise<AdminCheck> {
  const secret = Deno.env.get('CLERK_SECRET_KEY');
  if (!secret) {
    console.error('[admin] CLERK_SECRET_KEY not configured — denying by default');
    return { ok: false };
  }

  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${secret}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.warn('[admin] Clerk user lookup failed:', res.status);
      return { ok: false };
    }
    const user = await res.json() as ClerkUser;

    const role = user.public_metadata?.role;
    const hasRole = role === 'ceo' || role === 'admin';

    const email = user.email_addresses?.find(
      e => e.id === user.primary_email_address_id,
    )?.email_address;
    const hasAllowedEmail = !!email && ADMIN_EMAILS.has(email);

    if (!hasRole || !hasAllowedEmail) {
      console.warn('[admin] access denied — role match:', hasRole, 'email match:', hasAllowedEmail);
      return { ok: false };
    }

    return { ok: true, email };
  } catch (e) {
    console.error('[admin] requireAdmin exception:', e instanceof Error ? e.message : String(e));
    return { ok: false };
  }
}
