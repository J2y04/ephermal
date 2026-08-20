'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/components/clerk-react';
import { adminFetch, isLocalDev } from '../lib/adminFetch';
import Squircle from '../lib/Squircle';

import StatTile from '../lib/charts/StatTile';
import MultiTrend from '../lib/charts/MultiTrend';
import { SegmentedBar, BulletBar, RadialArc } from '../lib/charts/Distribution';
import {
  ACCENT,
  CATEGORICAL,
  STATUS,
  TIER_RAMP,
  INK,
  compact,
  money,
} from '../lib/charts/tokens';
import { GlyphCoin, GlyphRocket, GlyphPulse, GlyphSpark } from '../lib/charts/icons';

interface TierCount {
  starter: number;
  growth: number;
  scale: number;
}
interface ExpiringGrant {
  user_id: string;
  plan: string;
  period_end: string;
}

interface PlatformStats {
  generated_at: string;
  plans: { by_tier: TierCount; manual_grants: number; expiring_soon: ExpiringGrant[] };
  integrations: {
    total_users_with_row: number;
    shopify_connected: number;
    meta_connected: number;
    meta_page_linked: number;
    google_connected: number;
  };
  auren: {
    messages_this_week: number;
    active_users_this_week: number;
    messages_all_time: number;
    topups_purchased: number;
    topup_messages_granted: number;
    topup_distinct_users: number;
  };
  shopify: {
    products_synced: number;
    stores_with_products: number;
    cogs_coverage_pct: number;
    avg_price_cents: number;
  };
  campaigns: {
    total: number;
    by_status: Record<string, number>;
    by_platform: Record<string, number>;
    launched_count: number;
    total_daily_budget: number;
  };
  funnel: {
    public_store_scans: number;
    store_intelligence_runs: number;
    creative_briefs_generated: number;
    optimizer_runs: number;
  };
  ugc: { credits_used_this_month: number; active_users_this_month: number };
}

interface PerfPoint {
  date: string;
  revenue_cents: number;
  spend_cents: number;
  meta_spend_cents: number;
  google_spend_cents: number;
  orders: number;
  conversions: number;
  roas: number | null;
}

interface Performance {
  days: number;
  series: PerfPoint[];
  totals: {
    revenue_cents: number;
    spend_cents: number;
    meta_spend_cents: number;
    google_spend_cents: number;
    orders: number;
    conversions: number;
    roas: number | null;
    aov_cents: number | null;
    cpa_cents: number | null;
    net_cents: number;
  };
  all_zero: boolean;
  rows_found: number;
  generated_at: string;
}

const MOCK_BASE = Date.parse('2026-08-18T00:20:00.000Z');

function mockStats(): PlatformStats {
  return {
    generated_at: new Date(MOCK_BASE).toISOString(),
    plans: {
      by_tier: { starter: 21, growth: 11, scale: 5 },
      manual_grants: 2,
      expiring_soon: [
        { user_id: 'user_2xKq...9fA', plan: 'growth', period_end: new Date(MOCK_BASE + 3 * 864e5).toISOString() },
        { user_id: 'user_7mNp...2bC', plan: 'scale', period_end: new Date(MOCK_BASE + 6 * 864e5).toISOString() },
      ],
    },
    integrations: {
      total_users_with_row: 37,
      shopify_connected: 24,
      meta_connected: 16,
      meta_page_linked: 12,
      google_connected: 11,
    },
    auren: {
      messages_this_week: 96,
      active_users_this_week: 14,
      messages_all_time: 1284,
      topups_purchased: 3,
      topup_messages_granted: 900,
      topup_distinct_users: 3,
    },
    shopify: {
      products_synced: 17,
      stores_with_products: 9,
      cogs_coverage_pct: 64.7,
      avg_price_cents: 4290,
    },
    campaigns: {
      total: 18,
      by_status: { draft: 9, active: 1, paused: 0, failed: 8 },
      by_platform: { meta: 1, google: 9, both: 8 },
      launched_count: 9,
      total_daily_budget: 412.5,
    },
    funnel: {
      public_store_scans: 148,
      store_intelligence_runs: 42,
      creative_briefs_generated: 63,
      optimizer_runs: 27,
    },
    ugc: { credits_used_this_month: 31, active_users_this_month: 6 },
  };
}

function mockPerf(): Performance {
  const rev = [
    412, 388, 501, 470, 615, 588, 640, 702, 668, 590, 631, 720, 815, 762, 690, 745, 830, 902,
    864, 790, 848, 930, 1010, 964, 890, 952, 1040, 1120, 1075, 1180,
  ];
  const spd = [
    140, 132, 168, 155, 190, 182, 205, 220, 212, 190, 198, 228, 250, 240, 218, 232, 258, 275,
    266, 244, 260, 282, 305, 292, 270, 288, 312, 330, 320, 348,
  ];
  const series = rev.map((r, i) => {
    const date = new Date(MOCK_BASE - (29 - i) * 864e5).toISOString().slice(0, 10);
    const meta = Math.round(spd[i] * 100 * 0.62);
    const google = spd[i] * 100 - meta;
    return {
      date,
      revenue_cents: r * 100,
      spend_cents: spd[i] * 100,
      meta_spend_cents: meta,
      google_spend_cents: google,
      orders: Math.max(1, Math.round(r / 46)),
      conversions: Math.max(1, Math.round(r / 52)),
      roas: Math.round((r / spd[i]) * 100) / 100,
    };
  });
  const t = series.reduce(
    (a, s) => ({
      revenue_cents: a.revenue_cents + s.revenue_cents,
      spend_cents: a.spend_cents + s.spend_cents,
      meta_spend_cents: a.meta_spend_cents + s.meta_spend_cents,
      google_spend_cents: a.google_spend_cents + s.google_spend_cents,
      orders: a.orders + s.orders,
      conversions: a.conversions + s.conversions,
    }),
    { revenue_cents: 0, spend_cents: 0, meta_spend_cents: 0, google_spend_cents: 0, orders: 0, conversions: 0 },
  );
  return {
    days: 30,
    series,
    totals: {
      ...t,
      roas: Math.round((t.revenue_cents / t.spend_cents) * 100) / 100,
      aov_cents: Math.round(t.revenue_cents / t.orders),
      cpa_cents: Math.round(t.spend_cents / t.conversions),
      net_cents: t.revenue_cents - t.spend_cents,
    },
    all_zero: false,
    rows_found: 30,
    generated_at: new Date(MOCK_BASE).toISOString(),
  };
}

function Panel({
  title,
  hint,
  children,
  className = '',
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Squircle
      cornerRadius={26}
      className={`widget-shadow flex h-full flex-col border border-eph-border bg-eph-surface p-6 ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: INK.muted }}
        >
          {title}
        </h2>
        {hint && (
          <span className="whitespace-nowrap text-xs" style={{ color: INK.muted }}>
            {hint}
          </span>
        )}
      </div>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </Squircle>
  );
}

/** Compact label/value row. Used where a metric is a fact to be read, not a
 *  shape to be compared, which is most of the operational counters here. */
function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-[13px]" style={{ color: INK.secondary }}>
        {label}
      </span>
      <span
        className="text-[13px] font-semibold"
        style={{ color: tone ?? INK.primary, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IE', { day: '2-digit', month: 'short' });
}

export default function PlatformPage() {
  const { session } = useSession();
  const [s, setS] = useState<PlatformStats | null>(null);
  const [perf, setPerf] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState(false);

  useEffect(() => {
    setLocalPreview(isLocalDev());
  }, []);

  const previewStats = useMemo(() => mockStats(), []);
  const previewPerf = useMemo(() => mockPerf(), []);

  useEffect(() => {
    if (localPreview) {
      setLoading(false);
      return;
    }
    if (!session) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [stats, p] = await Promise.all([
        adminFetch<PlatformStats>(session, 'get_platform_stats'),
        adminFetch<Performance>(session, 'get_performance', { days: 30 }),
      ]);
      if (cancelled) return;
      if (stats.ok && stats.data) setS(stats.data);
      else setError(stats.error ?? 'Failed to load platform stats');
      if (p.ok && p.data) setPerf(p.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [localPreview, session]);

  const stats = localPreview ? previewStats : s;
  const performance = localPreview ? previewPerf : perf;
  const busy = localPreview ? false : loading;

  const t = performance?.totals;
  const dates = performance?.series.map((x) => x.date) ?? [];

  const campaignSegments = stats
    ? [
        { label: 'Active', value: stats.campaigns.by_status.active ?? 0, color: STATUS.good },
        { label: 'Draft', value: stats.campaigns.by_status.draft ?? 0, color: STATUS.neutral },
        { label: 'Paused', value: stats.campaigns.by_status.paused ?? 0, color: STATUS.warning },
        { label: 'Failed', value: stats.campaigns.by_status.failed ?? 0, color: STATUS.critical },
      ]
    : [];

  const platformSegments = stats
    ? [
        { label: 'Google', value: stats.campaigns.by_platform.google ?? 0, color: CATEGORICAL[0] },
        { label: 'Both', value: stats.campaigns.by_platform.both ?? 0, color: CATEGORICAL[1] },
        { label: 'Meta', value: stats.campaigns.by_platform.meta ?? 0, color: CATEGORICAL[2] },
      ]
    : [];

  const tierSegments = stats
    ? [
        { label: 'Starter', value: stats.plans.by_tier.starter, color: TIER_RAMP[0] },
        { label: 'Growth', value: stats.plans.by_tier.growth, color: TIER_RAMP[1] },
        { label: 'Scale', value: stats.plans.by_tier.scale, color: TIER_RAMP[2] },
      ]
    : [];

  const spendSplit = t
    ? [
        { label: 'Meta', value: Math.round(t.meta_spend_cents / 100), color: CATEGORICAL[2] },
        { label: 'Google', value: Math.round(t.google_spend_cents / 100), color: CATEGORICAL[0] },
      ]
    : [];

  const funnelMax = stats
    ? Math.max(
        stats.funnel.public_store_scans,
        stats.funnel.store_intelligence_runs,
        stats.funnel.creative_briefs_generated,
        stats.funnel.optimizer_runs,
        1,
      )
    : 1;

  const skel = (h: number, key?: string) => (
    <div key={key} className="animate-pulse rounded-[26px] bg-eph-surface2" style={{ height: h }} />
  );

  return (
    <div className="mx-auto max-w-[1560px] px-8 py-8 lg:px-10 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[22px] font-semibold tracking-tight text-eph-text">Platform</h1>
        <div className="flex items-center gap-3">
          {localPreview && (
            <span
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{
                color: STATUS.warning,
                background: 'rgba(174,142,0,0.12)',
                boxShadow: 'inset 0 0 0 1px rgba(174,142,0,0.28)',
              }}
            >
              Local preview: demo figures
            </span>
          )}
          {stats && (
            <span className="text-xs" style={{ color: INK.muted }}>
              Generated{' '}
              {new Date(stats.generated_at).toLocaleString('en-IE', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div
          className="mt-4 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(186,40,64,0.10)', color: '#f2b8bf' }}
        >
          {error}
        </div>
      )}

      {/* Ad performance, from revenue_snapshots. Every figure here is derived
          from stored columns; nothing is modelled or estimated. */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {busy ? (
          <>
            {skel(132, 'p1')}
            {skel(132, 'p2')}
            {skel(132, 'p3')}
            {skel(132, 'p4')}
          </>
        ) : (
          <>
            <StatTile
              label="ROAS"
              value={t?.roas != null ? `${t.roas.toFixed(2)}x` : '—'}
              countTo={t?.roas ?? null}
              format={(n) => `${n.toFixed(2)}x`}
              icon={<GlyphSpark />}
              caption={t?.roas != null ? 'revenue per €1 spent' : 'no ad spend recorded'}
              dimmed={t?.roas == null}
            />
            <StatTile
              label="Revenue"
              value={t ? money(t.revenue_cents) : '—'}
              countTo={t?.revenue_cents ?? null}
              format={money}
              icon={<GlyphCoin />}
              caption="last 30 days"
              dimmed={!t?.revenue_cents}
              spark={performance?.series.map((x) => x.revenue_cents)}
            />
            <StatTile
              label="Ad spend"
              value={t ? money(t.spend_cents) : '—'}
              countTo={t?.spend_cents ?? null}
              format={money}
              icon={<GlyphRocket />}
              caption="Meta and Google combined"
              dimmed={!t?.spend_cents}
              spark={performance?.series.map((x) => x.spend_cents)}
            />
            <StatTile
              label="After ad spend"
              value={t ? money(t.net_cents) : '—'}
              countTo={t?.net_cents ?? null}
              format={money}
              icon={<GlyphPulse />}
              caption="revenue less ad spend, not profit"
              dimmed={!t || t.net_cents === 0}
            />
          </>
        )}
      </div>

      <div className="mt-5 grid grid-cols-12 gap-5">
        <div className="col-span-12 xl:col-span-8">
          {busy ? (
            skel(400)
          ) : (
            <Panel
              title="Revenue vs ad spend"
              hint={
                performance?.all_zero
                  ? `${performance.rows_found} daily rows, all zero`
                  : 'last 30 days'
              }
            >
              <MultiTrend
                fill
                height={300}
                dates={dates}
                format={(v) => money(v)}
                emptyLabel="No revenue or ad spend recorded in this period"
                series={[
                  {
                    key: 'revenue',
                    label: 'Revenue',
                    color: '#009f91',
                    values: performance?.series.map((x) => x.revenue_cents) ?? [],
                  },
                  {
                    key: 'spend',
                    label: 'Ad spend',
                    color: CATEGORICAL[1],
                    values: performance?.series.map((x) => x.spend_cents) ?? [],
                  },
                ]}
              />
            </Panel>
          )}
        </div>

        <div className="col-span-12 xl:col-span-4">
          {busy ? (
            skel(400)
          ) : (
            <Panel title="Unit economics" hint="30-day blended">
              <div className="flex flex-1 flex-col">
                <div className="divide-y divide-eph-border/50">
                  <Fact label="Average order value" value={t?.aov_cents != null ? money(t.aov_cents) : '—'} />
                  <Fact label="Cost per conversion" value={t?.cpa_cents != null ? money(t.cpa_cents) : '—'} />
                  <Fact label="Orders" value={t ? compact(t.orders) : '—'} />
                  <Fact label="Conversions" value={t ? compact(t.conversions) : '—'} />
                </div>

                <div className="mt-5">
                  <div
                    className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: INK.muted }}
                  >
                    Spend split
                  </div>
                  <SegmentedBar segments={spendSplit} emptyLabel="No ad spend recorded" />
                </div>

                <p className="mt-auto pt-5 text-[11px] leading-relaxed" style={{ color: INK.muted }}>
                  Conversion rate is deliberately absent: it needs sessions or clicks as a
                  denominator and neither is stored, so any figure here would be invented.
                </p>
              </div>
            </Panel>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-4">
          <Panel title="Campaign health" hint={stats ? `${stats.campaigns.total} total` : undefined}>
            <SegmentedBar segments={campaignSegments} emptyLabel="No campaigns launched yet" />
            <div className="mt-auto grid grid-cols-2 gap-x-4 pt-5">
              <Fact label="Launched" value={stats ? String(stats.campaigns.launched_count) : '—'} />
              <Fact
                label="Daily budget"
                value={stats ? `€${stats.campaigns.total_daily_budget.toFixed(2)}` : '—'}
              />
            </div>
          </Panel>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <Panel title="Platform mix" hint="where campaigns run">
            <SegmentedBar segments={platformSegments} emptyLabel="No campaigns launched yet" />
            <div className="mt-auto pt-5">
              <Fact
                label="Meta page linked"
                value={stats ? `${stats.integrations.meta_page_linked}` : '—'}
              />
            </div>
          </Panel>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <Panel title="Plan mix" hint={stats ? `${stats.plans.manual_grants} manual` : undefined}>
            <SegmentedBar segments={tierSegments} emptyLabel="No plans recorded yet" />
            <div className="mt-auto pt-5">
              <Fact
                label="Expiring within 7 days"
                value={stats ? String(stats.plans.expiring_soon.length) : '—'}
                tone={stats && stats.plans.expiring_soon.length > 0 ? STATUS.warning : undefined}
              />
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-5">
          <Panel
            title="Integration coverage"
            hint={stats ? `of ${stats.integrations.total_users_with_row} users` : undefined}
          >
            <div className="divide-y divide-eph-border/50">
              <BulletBar
                label="Shopify connected"
                value={stats?.integrations.shopify_connected ?? 0}
                total={stats?.integrations.total_users_with_row ?? 0}
                color={TIER_RAMP[0]}
              />
              <BulletBar
                label="Meta connected"
                value={stats?.integrations.meta_connected ?? 0}
                total={stats?.integrations.total_users_with_row ?? 0}
                color={CATEGORICAL[2]}
              />
              <BulletBar
                label="Google connected"
                value={stats?.integrations.google_connected ?? 0}
                total={stats?.integrations.total_users_with_row ?? 0}
                color={CATEGORICAL[0]}
              />
            </div>
          </Panel>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <Panel title="Auren usage" hint="AI assistant">
            <div className="divide-y divide-eph-border/50">
              <Fact label="Messages this week" value={stats ? compact(stats.auren.messages_this_week) : '—'} />
              <Fact label="Active users this week" value={stats ? String(stats.auren.active_users_this_week) : '—'} />
              <Fact label="Messages all time" value={stats ? compact(stats.auren.messages_all_time) : '—'} />
              <Fact
                label="Top-ups purchased"
                value={stats ? `${stats.auren.topups_purchased} (${compact(stats.auren.topup_messages_granted)} msgs)` : '—'}
              />
              <Fact label="UGC credits this month" value={stats ? String(stats.ugc.credits_used_this_month) : '—'} />
            </div>
          </Panel>
        </div>

        <div className="col-span-12 lg:col-span-3">
          <Panel title="COGS coverage" hint="profit accuracy">
            <div className="flex flex-1 items-center justify-center">
              <RadialArc
                value={stats?.shopify.cogs_coverage_pct ?? 0}
                label="of products"
                color={(stats?.shopify.cogs_coverage_pct ?? 0) >= 80 ? STATUS.good : STATUS.warning}
              />
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-7">
          <Panel title="Product funnel" hint="all time">
            {/* Ranked magnitudes against a shared maximum: the comparison is
                between stages, so they share one scale rather than each being
                normalised to its own 100%. */}
            <div className="divide-y divide-eph-border/50">
              <BulletBar
                label="Public store scans"
                value={stats?.funnel.public_store_scans ?? 0}
                total={funnelMax}
                color={ACCENT}
              />
              <BulletBar
                label="Store intelligence runs"
                value={stats?.funnel.store_intelligence_runs ?? 0}
                total={funnelMax}
                color={TIER_RAMP[1]}
              />
              <BulletBar
                label="Creative briefs generated"
                value={stats?.funnel.creative_briefs_generated ?? 0}
                total={funnelMax}
                color={CATEGORICAL[2]}
              />
              <BulletBar
                label="Optimizer runs"
                value={stats?.funnel.optimizer_runs ?? 0}
                total={funnelMax}
                color={CATEGORICAL[0]}
              />
            </div>
          </Panel>
        </div>

        <div className="col-span-12 lg:col-span-5">
          <Panel title="Shopify catalog" hint={stats ? `${stats.shopify.stores_with_products} stores` : undefined}>
            <div className="divide-y divide-eph-border/50">
              <Fact label="Products synced" value={stats ? compact(stats.shopify.products_synced) : '—'} />
              <Fact label="Stores with products" value={stats ? String(stats.shopify.stores_with_products) : '—'} />
              <Fact label="Average price" value={stats ? money(stats.shopify.avg_price_cents) : '—'} />
              <Fact
                label="COGS coverage"
                value={stats ? `${stats.shopify.cogs_coverage_pct}%` : '—'}
                tone={stats && stats.shopify.cogs_coverage_pct < 80 ? STATUS.warning : undefined}
              />
              <Fact
                label="Products missing COGS"
                value={
                  stats
                    ? String(
                        Math.round(
                          stats.shopify.products_synced * (1 - stats.shopify.cogs_coverage_pct / 100),
                        ),
                      )
                    : '—'
                }
              />
            </div>

            <p className="mt-auto pt-5 text-[11px] leading-relaxed" style={{ color: INK.muted }}>
              Every product without a COGS figure is silently excluded from margin maths, so
              coverage below 100% means the Profit Tracker is reporting on a subset.
            </p>
          </Panel>
        </div>
      </div>

      {stats && stats.plans.expiring_soon.length > 0 && (
        <div className="mt-5">
          <Panel
            title="Manual grants expiring within 7 days"
            hint="auto-reverts to Starter at period_end"
          >
            <ul className="list-none divide-y divide-eph-border/50 p-0">
              {stats.plans.expiring_soon.map((g) => (
                <li key={g.user_id} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="font-mono text-xs" style={{ color: INK.muted }}>
                    {g.user_id}
                  </span>
                  <span className="text-sm" style={{ color: INK.secondary }}>
                    {g.plan}
                  </span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: STATUS.warning, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {fmtDate(g.period_end)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}
