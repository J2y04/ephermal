'use client';

/**
 * Ephermal — Admin panel fetch wrapper
 *
 * Calls the admin-api Supabase Edge Function directly (never through
 * cache-proxy — admin data must never be client-cached). Every edge
 * function in this app is deployed with verify_jwt: true, which requires
 * a valid `apikey` header (the Supabase anon key — public/safe to expose,
 * already served in cleartext to every visitor via /config.js) in addition
 * to `Authorization: Bearer <token>`, which the function's own extractUserId
 * check independently verifies as a real Clerk RS256 JWT. This exact
 * two-header pattern is the same one cache-proxy already uses when
 * forwarding to every other edge function (see
 * supabase/functions/cache-proxy/index.ts's forwardHeaders).
 *
 * Real admin authorization is NOT this file's job — admin-api's own
 * requireAdmin() check (role + email, verified server-side against Clerk)
 * is the only thing that actually gates access. This wrapper just carries
 * the caller's real Clerk session token.
 */

// Public, safe-to-expose values — same convention already used in
// web/components/Providers.tsx (hardcodes the Clerk publishable key) and
// web/public/config.js (serves these exact values in cleartext already).
const SUPABASE_URL = 'https://twfgnqddoqeqrjhgioxd.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3ZmducWRkb3FlcXJqaGdpb3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MTk3MjMsImV4cCI6MjA5NTE5NTcyM30.Qosoe62X7ZyPEArhm5Tbg2p97LBo8KQ5NQu9SsqE8k4';

const ADMIN_API_URL = `${SUPABASE_URL}/functions/v1/admin-api`;

/**
 * True only on localhost — same hostname-gated dev-preview convention already
 * established in web/public/dashboard.html's boot sequence. Clerk's production
 * publishable key rejects non-ephermal.app origins outright, so there is no
 * way to get a real signed-in session on localhost regardless; this only
 * controls whether the UI shows its real "loading/signed-out" states or a
 * local preview shell. It changes nothing about admin-api itself — every
 * real data call and mutation is still independently gated server-side by
 * requireAdmin(), on every host, including localhost.
 */
export function isLocalDev(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

interface AdminFetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

/**
 * session: the Clerk Session object from useSession() — needs .getToken().
 * action: the admin-api action name (list_users, get_revenue, set_plan, ban_user, unban_user).
 * args: any extra fields the action needs (query, days, target_user_id, plan, ...).
 */
export async function adminFetch<T = unknown>(
  session: { getToken: () => Promise<string | null> } | null | undefined,
  action: string,
  args: Record<string, unknown> = {},
): Promise<AdminFetchResult<T>> {
  if (!session) {
    return { ok: false, status: 0, data: null, error: 'Not signed in' };
  }

  let token: string | null;
  try {
    token = await session.getToken();
  } catch {
    return { ok: false, status: 0, data: null, error: 'Could not get session token' };
  }
  if (!token) {
    return { ok: false, status: 0, data: null, error: 'No session token' };
  }

  try {
    const res = await fetch(ADMIN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON,
      },
      body: JSON.stringify({ action, ...args }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const message = (data && typeof data === 'object' && 'error' in data)
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
      return { ok: false, status: res.status, data: null, error: message };
    }

    return { ok: true, status: res.status, data: data as T, error: null };
  } catch {
    return { ok: false, status: 0, data: null, error: 'Network error — could not reach admin-api' };
  }
}
