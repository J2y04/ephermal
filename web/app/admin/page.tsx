'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession, useUser } from '@clerk/clerk-react';
import Link from 'next/link';
import { Badge } from '@tremor/react';
import { adminFetch, isLocalDev } from './lib/adminFetch';
import { getWayneGreeting } from './lib/wayneQuotes';
import Reveal from './lib/Reveal';
import Squircle from './lib/Squircle';
import { SectionCards } from '@/components/section-cards';
import { ChartAreaInteractive } from '@/components/chart-area-interactive';

interface RevenueData {
  signups: { date: string; count: number }[];
  generated_at?: string;
}
interface SignupUser {
  id: string;
  email: string;
  created_at: string;
  banned: boolean;
  plan: string;
}
interface UsersData { users: SignupUser[]; total: number }

// Local-preview-only sample data — never used on a real deployment (see
// isLocalDev in ./lib/adminFetch). Lets the actual chart/layout code be
// visually checked without a live Clerk session, which localhost can't have.
function buildMockRevenue(): RevenueData {
  const signups = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date: d, count: Math.round(Math.random() * 4) };
  });
  return { signups, generated_at: new Date().toISOString() };
}

// Mirrors the shape list_users actually returns (see supabase/functions/admin-api's
// handleListUsers) — just the fields this page reads. Offsets are fixed, not random,
// so the "recent signups" ordering is stable to eyeball during local review.
const MOCK_SIGNUP_OFFSETS_MS = [
  22 * 60_000, 3 * 3_600_000, 9 * 3_600_000, 27 * 3_600_000,
  52 * 3_600_000, 76 * 3_600_000, 100 * 3_600_000, 150 * 3_600_000,
];
function buildMockUsers(): UsersData {
  const emails = [
    'sneaker-drop@example.com', 'flagged-account@example.com', 'candle-co@example.com',
    'gadget-hub@example.com', 'store-owner@example.com', 'newsignup@example.com',
    'test-shop@example.com', 'small-batch-goods@example.com',
  ];
  const plans = ['starter', 'starter', 'growth', 'starter', 'scale', 'starter', 'growth', 'starter'];
  const users: SignupUser[] = emails.map((email, i) => ({
    id: `user_mock${i}`,
    email,
    created_at: new Date(Date.now() - MOCK_SIGNUP_OFFSETS_MS[i]).toISOString(),
    banned: i === 1,
    plan: plans[i],
  }));
  return { users, total: 37 };
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const PLAN_BADGE_COLOR: Record<string, string> = { starter: 'gray', growth: 'cyan', scale: 'violet' };

/**
 * Overview intentionally shows only what's independent of Stripe — Total
 * Users, Signups, and the recent-signups feed all come from Clerk (via
 * list_users/get_revenue), not Stripe, so a missing STRIPE_SECRET_KEY must
 * never block them from loading. Anything Stripe-derived (Gross MRR, active
 * subscriptions, plan-tier breakdown) lives on the separate Finance page
 * instead, which can show its own "not connected" state without dragging
 * this page down with it.
 */
export default function AdminOverviewPage() {
  const { session } = useSession();
  const { user } = useUser();
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [userTotal, setUserTotal] = useState<number | null>(null);
  const [usersList, setUsersList] = useState<SignupUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Picked once per page load, not on every re-render — a quote that changes
  // mid-session would be a distraction, not a feature.
  const wayne = useMemo(() => getWayneGreeting(user?.firstName), [user?.firstName]);

  useEffect(() => {
    if (!session) {
      if (isLocalDev()) {
        setRevenue(buildMockRevenue());
        const mockUsers = buildMockUsers();
        setUserTotal(mockUsers.total);
        setUsersList(mockUsers.users);
        setLoading(false);
      }
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      const [rev, users] = await Promise.all([
        adminFetch<RevenueData>(session, 'get_revenue', { days: 30 }),
        adminFetch<UsersData>(session, 'list_users'),
      ]);
      if (cancelled) return;

      // Total Users, the recent-signups feed, and Signups both come from Clerk —
      // show them regardless of whether the Stripe-derived part of get_revenue
      // succeeded. Each can fail independently, so each gets its own error path —
      // previously a list_users failure was silently swallowed and the Total Users
      // KPI just sat on '-' forever, indistinguishable from still loading.
      if (users.ok && users.data) {
        setUserTotal(users.data.total);
        setUsersList(users.data.users);
      } else {
        setError(prev => prev ?? (users.error ?? 'Failed to load users'));
      }
      if (rev.ok && rev.data) {
        setRevenue(rev.data);
      } else {
        setError(prev => prev ?? (rev.error ?? 'Failed to load signups'));
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [session]);

  const signups = revenue?.signups ?? [];
  const totalSignups30d = signups.reduce((s, r) => s + r.count, 0);

  const last7 = signups.slice(-7);
  const prev7 = signups.slice(-14, -7);
  const signups7d = last7.reduce((s, r) => s + r.count, 0);
  const signups7dPrev = prev7.reduce((s, r) => s + r.count, 0);

  // Week-over-week trend badge — null when there's not enough signal to compare
  // (no prior-week signups at all) rather than showing a misleading +/-Infinity%.
  const wowDelta = useMemo(() => {
    if (!revenue) return null;
    if (signups7dPrev === 0) return signups7d > 0 ? { pct: null as number | null, positive: true } : null;
    const pct = Math.round(((signups7d - signups7dPrev) / signups7dPrev) * 100);
    return { pct, positive: pct >= 0 };
  }, [revenue, signups7d, signups7dPrev]);

  const bannedCount = usersList.filter(u => u.banned).length;

  const recentSignups = useMemo(
    () => [...usersList].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 6),
    [usersList],
  );

  return (
    <div className="mx-auto max-w-[1600px] px-10 py-10">
      <Reveal>
        <div className="text-[32px] font-semibold tracking-tight text-eph-primary">{wayne.greeting}</div>
        <div className="mt-0.5 text-sm italic text-eph-subtle">&ldquo;{wayne.quote}&rdquo;</div>
      </Reveal>

      <Reveal delay={0.03} className="mt-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-eph-text">Overview</h1>
          <p className="mt-1 text-sm text-eph-muted">Live from Clerk, no cached values. Revenue lives on the Finance page.</p>
        </div>
        {!loading && revenue?.generated_at && (
          <div className="flex items-center gap-2 text-xs text-eph-subtle">
            <span className="h-1.5 w-1.5 rounded-full bg-eph-success" />
            Updated {new Date(revenue.generated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </Reveal>

      {error && (
        <div className="mt-6 rounded-2xl border border-eph-danger/30 bg-eph-danger/10 px-4 py-3 text-sm text-eph-danger">
          {error}
        </div>
      )}

      {/* Real shadcn dashboard-01 block components (npx shadcn add), restyled into
          Ephermal's palette via admin.css's CSS variables, fed real Clerk-derived
          data instead of the block's own placeholder numbers. */}
      <Reveal delay={0.05} className="mt-7">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[104px] animate-pulse rounded-xl bg-eph-surface2" />
            ))}
          </div>
        ) : (
          <SectionCards
            data={{
              totalUsers: userTotal ?? 0,
              signups30d: totalSignups30d,
              signups7d,
              wowDeltaPct: wowDelta?.pct ?? null,
              bannedCount,
            }}
          />
        )}
      </Reveal>

      {/* Primary chart + recent-signups feed side by side — real data: signups over
          time from get_revenue (via the real shadcn chart component), and the
          newest rows from list_users (already fetched for the Total Users KPI
          above, just not previously kept around). */}
      <div className="mt-6 grid grid-cols-12 gap-5">
        <Reveal delay={0.1} className="col-span-12 lg:col-span-8">
          {loading || !revenue ? (
            <div className="h-[420px] animate-pulse rounded-3xl bg-eph-surface2" />
          ) : (
            <ChartAreaInteractive data={signups} />
          )}
        </Reveal>

        <Reveal delay={0.13} className="col-span-12 lg:col-span-4">
          <Squircle cornerRadius={32} className="shine widget-shadow flex h-full flex-col border border-eph-border bg-eph-surface p-7">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">Recent signups</div>
              {!loading && usersList.length > 0 && (
                <span className="text-xs text-eph-subtle">{usersList.length} total</span>
              )}
            </div>

            <div className="mt-5 flex-1 divide-y divide-eph-border/60">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="my-1.5 h-12 animate-pulse rounded-xl bg-eph-surface2" />
                ))
              ) : recentSignups.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-eph-muted">No signups yet</div>
              ) : (
                recentSignups.map(u => (
                  <div key={u.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-eph-text">{u.email || '(no email)'}</div>
                      <div className="mt-0.5 text-xs text-eph-subtle">{relativeTime(u.created_at)}</div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      {u.banned && <Badge color="rose">banned</Badge>}
                      <Badge color={PLAN_BADGE_COLOR[u.plan] ?? 'gray'}>{u.plan}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>

            <Link
              href="/admin/users"
              className="mt-5 block rounded-xl border border-eph-border py-2 text-center text-xs font-semibold text-eph-muted transition-colors hover:border-eph-primary/40 hover:text-eph-primary"
            >
              View all users
            </Link>
          </Squircle>
        </Reveal>
      </div>
    </div>
  );
}
