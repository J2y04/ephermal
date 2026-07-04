import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const DASHBOARD_HOST = 'dashboard.ephermal.app';

// dashboard.ephermal.app/ serves the same dashboard.html that lives at
// ephermal.app/dashboard.html — same deployment, same public/ files, just a
// different default page for this host. Every other path (setup.html,
// auth/login.html, config.js, etc.) already resolves identically regardless
// of hostname, so no rewrite is needed for them.
export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';
  if (host === DASHBOARD_HOST && req.nextUrl.pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard.html';
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/',
};
