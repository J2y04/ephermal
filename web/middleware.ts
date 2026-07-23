import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const DASHBOARD_HOST = 'dashboard.ephermal.app';
const ADMIN_HOST     = 'admin.ephermal.app';

// dashboard.ephermal.app/ serves the same dashboard.html that lives at
// ephermal.app/dashboard.html — same deployment, same public/ files, just a
// different default page for this host. Every other path (setup.html,
// auth/login.html, config.js, etc.) already resolves identically regardless
// of hostname, so no rewrite is needed for them.
//
// admin.ephermal.app/* rewrites onto the /admin route tree (a real Next.js
// App Router section, not a static file) — admin.ephermal.app/users becomes
// /admin/users, admin.ephermal.app/ becomes /admin. Access is NOT enforced
// here; that would only be a UX nicety anyway, since this middleware runs
// on Vercel's edge, not Supabase, and has no way to check Clerk's
// publicMetadata.role. Real enforcement happens server-side in the
// admin-api edge function's requireAdmin() check on every data call.
export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';
  const { pathname } = req.nextUrl;

  if (host === DASHBOARD_HOST && pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard.html';
    return NextResponse.rewrite(url);
  }

  if (host === ADMIN_HOST && !pathname.startsWith('/admin')) {
    const url = req.nextUrl.clone();
    url.pathname = pathname === '/' ? '/admin' : `/admin${pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

// Broad matcher (everything except Next's own static/image assets) so the
// admin host rewrite actually runs on sub-paths like /users, /settings,
// etc. — a matcher listing only '/' would miss them entirely. The function
// body itself no-ops for every host/path combination that isn't dashboard
// or admin, so running broadly here is cheap and avoids a path-enumeration
// bug if new /admin routes are added later.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
