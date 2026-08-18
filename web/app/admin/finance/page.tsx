'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/components/clerk-react';
import { DonutChart, BarList } from '@tremor/react';
import { adminFetch, isLocalDev } from '../lib/adminFetch';
import Reveal from '../lib/Reveal';
import Squircle from '../lib/Squircle';
import { IconCreditCard } from '../lib/icons';

interface TierStat { count: number; mrr_cents: number }
interface RevenueData {
  mrr_cents: number;
  active_subscription_count: number;
  by_tier: Record<string, TierStat>;
  generated_at: string;
  stripe_available: boolean;
  stripe_error: string | null;
}

// All money in this app is stored and billed in EUR (see supabase/functions/fx-rate/index.ts
// and create-checkout's currency: 'eur') — this used to say $, mislabeling real EUR revenue as USD.
function centsToEur(cents: number): string {
  return `€${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const TIER_LABELS: Record<string, string> = {
  starter: 'Starter', growth: 'Growth', scale: 'Scale', other: 'Other',
};

// Local-preview-only sample data — never used on a real deployment.
function buildMockRevenue(): RevenueData {
  return {
    mrr_cents: 128700,
    active_subscription_count: 9,
    by_tier: {
      starter: { count: 4, mrr_cents: 35600 },
      growth:  { count: 4, mrr_cents: 79600 },
      scale:   { count: 1, mrr_cents: 34900 },
      other:   { count: 0, mrr_cents: 0 },
    },
    generated_at: new Date().toISOString(),
    stripe_available: true,
    stripe_error: null,
  };
}

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

/**
 * Finance shows exclusively Stripe-derived data (Gross MRR, active
 * subscriptions, plan-tier breakdown). Split out from Overview so a
 * missing STRIPE_SECRET_KEY (e.g. before Jamal has a Stripe account set up)
 * only degrades this one page, not the whole admin panel.
 */
export default function AdminFinancePage() {
  const { session } = useSession();
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      if (isLocalDev()) {
        setRevenue(buildMockRevenue());
        setLoading(false);
      }
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      const res = await adminFetch<RevenueData>(session, 'get_revenue', { days: 30 });
      if (cancelled) return;

      if (!res.ok || !res.data) {
        setError(res.error ?? 'Failed to load revenue');
        setLoading(false);
        return;
      }
      setRevenue(res.data);
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

  const stripeNotConnected = !loading && revenue && !revenue.stripe_available;

  return (
    <div className="mx-auto max-w-[1600px] px-10 py-10">
      <Reveal>
        <h1 className="text-[22px] font-semibold tracking-tight text-eph-text">Finance</h1>
        <p className="mt-1 text-sm text-eph-muted">Live from Stripe, no cached values.</p>
      </Reveal>

      {error && (
        <div className="mt-6 rounded-2xl border border-eph-danger/30 bg-eph-danger/10 px-4 py-3 text-sm text-eph-danger">
          {error}
        </div>
      )}

      {stripeNotConnected && (
        <Reveal delay={0.05}>
          <Squircle cornerRadius={28} className="widget-shadow mt-7 flex items-center gap-4 border border-eph-warning/30 bg-eph-warning/10 p-7">
            <IconCreditCard className="h-8 w-8 flex-shrink-0 text-eph-warning" />
            <div>
              <div className="text-sm font-semibold text-eph-text">Stripe isn&apos;t connected yet</div>
              <div className="mt-1 text-xs leading-relaxed text-eph-muted">
                Add <code className="rounded bg-eph-surface2 px-1.5 py-0.5">STRIPE_SECRET_KEY</code> as a Supabase Edge
                Function secret once you&apos;ve signed up for Stripe, then this page fills in automatically. No
                redeploy needed. Everything else in the admin panel works independently of this.
              </div>
            </div>
          </Squircle>
        </Reveal>
      )}

      {/* KPI strip — flat, no card chrome, hairline dividers only, real squircle shell */}
      <Reveal delay={0.1}>
        <Squircle cornerRadius={28} className="mt-6 border border-eph-border bg-eph-surface/60">
          <div className="flex flex-wrap divide-x divide-eph-border">
            <KpiCell
              label="Gross MRR"
              value={loading || !revenue ? '-' : centsToEur(revenue.mrr_cents)}
              sub={
                !loading && revenue && revenue.stripe_available ? (
                  <span className="rounded-full bg-eph-success/10 px-2 py-0.5 text-[11px] font-semibold text-eph-success">
                    {revenue.active_subscription_count} paying
                  </span>
                ) : null
              }
            />
            <KpiCell label="Active Subscriptions" value={loading || !revenue ? '-' : revenue.active_subscription_count} />
          </div>
        </Squircle>
      </Reveal>

      <div className="mt-6 grid grid-cols-12 gap-5">
        <Reveal delay={0.05} className="col-span-12 lg:col-span-7">
          <Squircle cornerRadius={28} className="shine widget-shadow h-full border border-eph-border bg-eph-surface p-7">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">MRR by plan tier</div>
            {loading || !revenue ? (
              <div className="mt-6 h-56 animate-pulse rounded-2xl bg-eph-surface2" />
            ) : tierDonut.length === 0 ? (
              <div className="mt-6 flex h-56 items-center justify-center text-sm text-eph-muted">
                {revenue.stripe_available ? 'No paying subscribers yet' : 'Waiting on Stripe connection'}
              </div>
            ) : (
              <div className="mt-5 flex items-center gap-8">
                <DonutChart
                  className="h-44 w-44 flex-shrink-0"
                  data={tierDonut}
                  category="value"
                  index="name"
                  colors={['cyan', 'violet', 'amber']}
                  valueFormatter={(v) => `€${v.toLocaleString()}`}
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
              {revenue ? new Date(revenue.generated_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}
            </div>
            <div className="mt-4 text-xs leading-relaxed text-eph-subtle">
              Gross MRR is computed live from Stripe&apos;s active subscriptions, manually
              granted plans (no Stripe subscription) never inflate this number.
            </div>
          </Squircle>
        </Reveal>
      </div>
    </div>
  );
}
