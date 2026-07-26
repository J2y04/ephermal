'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession, useUser } from '@clerk/clerk-react';
import { AreaChart } from '@tremor/react';
import { adminFetch, isLocalDev } from './lib/adminFetch';
import { getWayneGreeting } from './lib/wayneQuotes';
import Reveal from './lib/Reveal';
import Squircle from './lib/Squircle';

interface RevenueData {
  signups: { date: string; count: number }[];
}
interface UsersData { users: unknown[]; total: number }

// Local-preview-only sample data — never used on a real deployment (see
// isLocalDev in ./lib/adminFetch). Lets the actual chart/layout code be
// visually checked without a live Clerk session, which localhost can't have.
function buildMockRevenue(): RevenueData {
  const signups = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date: d, count: Math.round(Math.random() * 4) };
  });
  return { signups };
}

/** Flat KPI cell — no card border, separated by a hairline divider (Polaris/Vercel-style KPI strip). */
function KpiCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-7 py-6 first:pl-8 last:pr-8">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="tabular-nums text-[28px] font-semibold leading-none tracking-tight text-eph-text">{value}</div>
      </div>
    </div>
  );
}

/**
 * Overview intentionally shows only what's independent of Stripe — Total
 * Users and Signups come from Clerk, not Stripe, so a missing
 * STRIPE_SECRET_KEY must never block them from loading. Anything
 * Stripe-derived (Gross MRR, active subscriptions, plan-tier breakdown)
 * lives on the separate Finance page instead, which can show its own
 * "not connected" state without dragging this page down with it.
 */
export default function AdminOverviewPage() {
  const { session } = useSession();
  const { user } = useUser();
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [userTotal, setUserTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Picked once per page load, not on every re-render — a quote that changes
  // mid-session would be a distraction, not a feature.
  const wayne = useMemo(() => getWayneGreeting(user?.firstName), [user?.firstName]);

  useEffect(() => {
    if (!session) {
      if (isLocalDev()) {
        setRevenue(buildMockRevenue());
        setUserTotal(37);
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

      // Total Users and Signups both come from Clerk — show them regardless
      // of whether the Stripe-derived part of get_revenue succeeded.
      if (users.ok && users.data) setUserTotal(users.data.total);
      if (rev.ok && rev.data) {
        setRevenue(rev.data);
      } else {
        setError(rev.error ?? 'Failed to load signups');
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [session]);

  const signupSeries = revenue?.signups.map(s => ({ date: s.date, Signups: s.count })) ?? [];
  const totalSignups30d = revenue?.signups.reduce((s, r) => s + r.count, 0) ?? 0;

  return (
    <div className="mx-auto max-w-[1600px] px-10 py-10">
      <Reveal>
        <div className="text-lg font-semibold tracking-tight text-eph-text">{wayne.greeting}</div>
        <div className="mt-0.5 text-sm italic text-eph-subtle">&ldquo;{wayne.quote}&rdquo;</div>
      </Reveal>

      <Reveal delay={0.03} className="mt-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-eph-text">Overview</h1>
        <p className="mt-1 text-sm text-eph-muted">Live from Clerk, no cached values. Revenue lives on the Finance page.</p>
      </Reveal>

      {error && (
        <div className="mt-6 rounded-2xl border border-eph-danger/30 bg-eph-danger/10 px-4 py-3 text-sm text-eph-danger">
          {error}
        </div>
      )}

      {/* KPI strip — flat, no card chrome, hairline dividers only, real squircle shell */}
      <Reveal delay={0.05}>
        <Squircle cornerRadius={28} className="mt-7 border border-eph-border bg-eph-surface/60">
          <div className="flex flex-wrap divide-x divide-eph-border">
            <KpiCell label="Total Users" value={loading ? '-' : (userTotal ?? '-')} />
            <KpiCell label="Signups (30d)" value={loading || !revenue ? '-' : totalSignups30d} />
          </div>
        </Squircle>
      </Reveal>

      {/* Hero chart — full-width centerpiece, real Apple squircle corners
          (not a plain border-radius), layered Polaris-style shadow,
          restrained hover-only shine. */}
      <Reveal delay={0.1}>
        <Squircle
          cornerRadius={40}
          className="shine widget-shadow widget-shadow--hero group relative mt-6 border border-eph-border bg-eph-surface p-9"
        >
          <div className="relative flex items-baseline justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">Signups: last 30 days</div>
              <div className="tabular-nums mt-2 text-[56px] font-semibold leading-none tracking-tight text-eph-text">
                {loading || !revenue ? '-' : totalSignups30d}
              </div>
            </div>
          </div>
          {loading || !revenue ? (
            <div className="mt-9 h-[360px] animate-pulse rounded-3xl bg-eph-surface2" />
          ) : (
            <AreaChart
              className="relative mt-9 h-[360px] md:h-[400px]"
              data={signupSeries}
              index="date"
              categories={['Signups']}
              colors={['cyan']}
              showLegend={false}
              showAnimation
              curveType="monotone"
            />
          )}
        </Squircle>
      </Reveal>
    </div>
  );
}
