'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isLocalDev } from './lib/adminFetch';
import { IconGrid, IconUsers, IconDatabase, IconCreditCard, IconShield, IconTriangle, IconArrowLeft } from './lib/icons';
import Squircle from './lib/Squircle';
import './admin.css';

/**
 * Admin panel chrome + client-side gate.
 *
 * This gate is UX only — it decides what renders, nothing more. It cannot
 * grant or deny actual access to data: every real admin-api call is
 * independently checked server-side by requireAdmin() (role + email, both
 * verified fresh against Clerk), so a tampered client here can look at
 * whatever it wants but every fetch will just come back 403.
 *
 * `dark` class on the root wrapper switches Tremor's built-in dark palette
 * on — Ephermal has no light mode anywhere else in the product either.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const pathname = usePathname();
  const [redirecting, setRedirecting] = useState(false);
  // Starts false (matching what the server renders, since window doesn't exist
  // there) and only flips inside useEffect — i.e. after the first client render
  // — so the very first client paint matches the server-rendered HTML exactly.
  // Computing isLocalDev() directly during render would make the client's
  // first paint differ from the server's on localhost, causing a hydration
  // mismatch (React would detect real vs. expected DOM disagreeing and force
  // a full client-side re-render, harmless but noisy and worth avoiding).
  const [localDev, setLocalDev] = useState(false);

  const role = user?.publicMetadata?.role as string | undefined;
  const looksAuthorized = role === 'ceo' || role === 'admin';

  useEffect(() => {
    setLocalDev(isLocalDev());
  }, []);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !redirecting && !localDev) {
      setRedirecting(true);
      window.location.href = 'https://dashboard.ephermal.app/auth/login.html';
    }
  }, [isLoaded, isSignedIn, redirecting, localDev]);

  if (!localDev && (!isLoaded || redirecting)) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-eph-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-eph-border border-t-eph-primary" />
      </div>
    );
  }

  if (!localDev && !isSignedIn) {
    // useEffect above is already redirecting — render nothing in the meantime.
    return <div className="dark min-h-screen bg-eph-bg" />;
  }

  if (!localDev && !looksAuthorized) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-eph-bg font-sans text-eph-text">
        <Squircle cornerRadius={28} className="widget-shadow max-w-sm border border-eph-border bg-eph-surface p-9 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Not authorized</h1>
          <p className="mt-2 text-sm text-eph-muted">This account doesn&apos;t have admin access.</p>
          <a href="https://dashboard.ephermal.app" className="mt-5 inline-block text-sm font-semibold text-eph-primary">
            Back to dashboard
          </a>
        </Squircle>
      </div>
    );
  }

  const nav = [
    { href: '/admin', label: 'Overview', Icon: IconGrid },
    { href: '/admin/users', label: 'Users', Icon: IconUsers },
  ];

  // Real, honest "Dev Tools" — quick links out to the actual dashboards this
  // platform already runs on, not fake in-app tooling. Kept visually dimmed
  // and separated from the analytics nav (per the design spec's sidebar
  // section: Dev Tools recedes, it doesn't compete with the main nav).
  const devTools = [
    { href: 'https://supabase.com/dashboard/project/twfgnqddoqeqrjhgioxd', label: 'Supabase', Icon: IconDatabase },
    { href: 'https://dashboard.stripe.com', label: 'Stripe', Icon: IconCreditCard },
    { href: 'https://dashboard.clerk.com', label: 'Clerk', Icon: IconShield },
    { href: 'https://vercel.com/nr-jayks-projects/ephermal', label: 'Vercel', Icon: IconTriangle },
  ];

  return (
    <div className="dark flex min-h-screen bg-eph-bg font-sans text-eph-text">
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-eph-border bg-eph-surface px-4 py-6">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Squircle cornerRadius={10} className="h-8 w-8 flex-shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ephermal.jpg" alt="" className="h-8 w-8 object-cover" />
          </Squircle>
          <span className="text-sm font-semibold tracking-tight">Ephermal Admin</span>
        </div>

        <nav className="flex flex-col gap-1">
          {nav.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex h-9 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white/[0.06] text-eph-primary'
                    : 'text-eph-muted hover:bg-white/[0.05] hover:text-eph-text'
                }`}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 border-t border-eph-border pt-4">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">
            Dev Tools
          </div>
          <nav className="flex flex-col gap-1">
            {devTools.map(({ href, label, Icon }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 items-center gap-3 rounded-xl px-3 text-sm font-medium text-eph-subtle opacity-60 transition-opacity hover:opacity-100 hover:text-eph-text"
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                {label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex-1" />

        <a
          href="https://dashboard.ephermal.app"
          className="flex h-9 items-center gap-3 rounded-xl px-3 text-sm font-medium text-eph-muted transition-colors hover:bg-white/[0.05] hover:text-eph-text"
        >
          <IconArrowLeft className="h-[18px] w-[18px] flex-shrink-0" />
          Back to dashboard
        </a>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
