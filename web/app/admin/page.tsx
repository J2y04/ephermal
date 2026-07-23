'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@clerk/clerk-react';
import { AreaChart, DonutChart, BarList } from '@tremor/react';
import { adminFetch, isLocalDev } from './lib/adminFetch';
import Reveal from './lib/Reveal';
import Squircle from './lib/Squircle';

interface TierStat { count: number; mrr_cents: number }
interface RevenueData {
  mrr_cents: number;
  active_subscription_count: number;
  by_tier: Record<string, TierStat>;
  signups: { date: string; count: number }[];
  generated_at: string;
}
interface UsersData { users: unknown[]; total: number }

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const TIER_LABELS: Record<string, string> = {
  starter: 'Starter', growth: 'Growth', scale: 'Scale', other: 'Other',
};

// Local-preview-only sample data — never used on a real deployment (see
// isLocalDev in ./lib/adminFetch). Lets the actual chart/layout code be
// visually checked without a live Clerk session, which localhost can't have.
function buildMockRevenue(): RevenueData {
  const signups = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date: d, count: Math.round(Math.random() * 4) };
  });
  return {
    mrr_cents: 128700,
    active_subscription_count: 9,
    by_tier: {
      starter: { count: 4, mrr_cents: 35600 },
      growth:  { count: 4, mrr_cents: 79600 },
      scale:   { count: 1, mrr_cents: 34900 },
      other:   { count: 0, mrr_cents: 0 },
    },
    signups,
    generated_at: new Date().toISOString(),
  };
}

/** Flat KPI cell — no card border, separated by a hairline divider (Polaris/Vercel-style KPI strip). */
function KpiCell({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="px-7 py-6 first:pl-8 last:pr-8">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="tabular-nums text-[28px] font-semibold leading-none tracking-tight text-eph-text">{value}</div>
        {sub}
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { session } = useSession();
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [userTotal, setUserTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      if (!rev.ok || !rev.data) {
        setError(rev.error ?? 'Failed to load revenue');
        setLoading(false);
        return;
      }
      setRevenue(rev.data);
      setUserTotal(users.ok && users.data ? users.data.total : null);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [session]);

  const tierBars = revenue
    ? Object.entries(revenue.by_tier)
        .filter(([, t]) => t.count > 0)
        .map(([key, t]) => ({ name: TIER_LABELS[key] ?? key, value: t.count }))
    : [];

  const tierDonut = revenue
    ? Object.entries(revenue.by_tier)
        .filter(([, t]) => t.mrr_cents > 0)
        .map(([key, t]) => ({ name: TIER_LABELS[key] ?? key, value: t.mrr_cents / 100 }))
    : [];

  const signupSeries = revenue?.signups.map(s => ({ date: s.date, Signups: s.count })) ?? [];
  const totalSignups30d = revenue?.signups.reduce((s, r) => s + r.count, 0) ?? 0;

  return (
    <div className="mx-auto max-w-[1600px] px-10 py-10">
      <Reveal>
        <h1 className="text-[22px] font-semibold tracking-tight text-eph-text">Overview</h1>
        <p className="mt-1 text-sm text-eph-muted">Live from Clerk + Stripe — no cached values.</p>
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
            <KpiCell label="Total Users" value={loading ? '—' : (userTotal ?? '—')} />
            <KpiCell
              label="Gross MRR"
              value={loading || !revenue ? '—' : centsToUsd(revenue.mrr_cents)}
              sub={
                !loading && revenue ? (
                  <span className="rounded-full bg-eph-success/10 px-2 py-0.5 text-[11px] font-semibold text-eph-success">
                    {revenue.active_subscription_count} paying
                  </span>
                ) : null
              }
            />
            <KpiCell label="Active Subscriptions" value={loading || !revenue ? '—' : revenue.active_subscription_count} />
            <KpiCell label="Signups (30d)" value={loading || !revenue ? '—' : totalSignups30d} />
          </div>
        </Squircle>
      </Reveal>

      {/* Hero chart — full-width centerpiece, pulled out of any grid, real
          Apple squircle corners (not a plain border-radius), layered Polaris-
          style shadow, restrained hover-only shine. */}
      <Reveal delay={0.1}>
        <Squircle
          cornerRadius={40}
          className="shine widget-shadow widget-shadow--hero group relative mt-6 border border-eph-border bg-eph-surface p-9"
        >
          <div className="relative flex items-baseline justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">Signups — last 30 days</div>
              <div className="tabular-nums mt-2 text-[56px] font-semibold leading-none tracking-tight text-eph-text">
                {loading || !revenue ? '—' : totalSignups30d}
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

      {/* Secondary widgets grid — smaller radius/height signals hierarchy below the hero */}
      <div className="mt-6 grid grid-cols-12 gap-5">
        <Reveal delay={0.05} className="col-span-12 lg:col-span-7">
          <Squircle cornerRadius={28} className="shine widget-shadow h-full border border-eph-border bg-eph-surface p-7">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">MRR by plan tier</div>
            {loading || !revenue ? (
              <div className="mt-6 h-56 animate-pulse rounded-2xl bg-eph-surface2" />
            ) : tierDonut.length === 0 ? (
              <div className="mt-6 flex h-56 items-center justify-center text-sm text-eph-muted">
                No paying subscribers yet
              </div>
            ) : (
              <div className="mt-5 flex items-center gap-8">
                <DonutChart
                  className="h-44 w-44 flex-shrink-0"
                  data={tierDonut}
                  category="value"
                  index="name"
                  colors={['cyan', 'violet', 'amber']}
                  valueFormatter={(v) => `$${v.toLocaleString()}`}
                />
                <div className="flex-1">
                  <BarList data={tierBars} color="cyan" />
                </div>
              </div>
            )}
          </Squircle>
        </Reveal>

        <Reveal delay={0.1} className="col-span-12 lg:col-span-5">
          <Squircle cornerRadius={28} className="shine widget-shadow flex h-full flex-col justify-center border border-eph-border bg-eph-surface p-7">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">Data freshness</div>
            <div className="mt-3 text-sm text-eph-text">
              {revenue ? new Date(revenue.generated_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
            </div>
            <div className="mt-4 text-xs leading-relaxed text-eph-subtle">
              Gross MRR is computed live from Stripe&apos;s active subscriptions — manually
              granted plans (no Stripe subscription) never inflate this number.
            </div>
          </Squircle>
        </Reveal>
      </div>
    </div>
  );
}
