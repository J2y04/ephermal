'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@clerk/clerk-react';
import { DonutChart, BarList } from '@tremor/react';
import { adminFetch, isLocalDev } from '../lib/adminFetch';
import Reveal from '../lib/Reveal';
import Squircle from '../lib/Squircle';

interface TierCount { starter: number; growth: number; scale: number }
interface ExpiringGrant { user_id: string; plan: string; period_end: string }
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
    by_status: { draft: number; active: number; paused: number; failed: number };
    by_platform: { meta: number; google: number; both: number };
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

// Local-preview-only sample data — never used on a real deployment.
function buildMockStats(): PlatformStats {
  return {
    generated_at: new Date().toISOString(),
    plans: {
      by_tier: { starter: 12, growth: 5, scale: 2 },
      manual_grants: 3,
      expiring_soon: [
        { user_id: 'user_mock1', plan: 'growth', period_end: new Date(Date.now() + 4 * 86_400_000).toISOString() },
      ],
    },
    integrations: { total_users_with_row: 19, shopify_connected: 14, meta_connected: 9, meta_page_linked: 6, google_connected: 3 },
    auren: { messages_this_week: 42, active_users_this_week: 6, messages_all_time: 311, topups_purchased: 2, topup_messages_granted: 100, topup_distinct_users: 2 },
    shopify: { products_synced: 187, stores_with_products: 14, cogs_coverage_pct: 38.5, avg_price_cents: 4520 },
    campaigns: { total: 21, by_status: { draft: 8, active: 6, paused: 4, failed: 3 }, by_platform: { meta: 15, google: 5, both: 1 }, launched_count: 13, total_daily_budget: 640 },
    funnel: { public_store_scans: 58, store_intelligence_runs: 17, creative_briefs_generated: 9, optimizer_runs: 4 },
    ugc: { credits_used_this_month: 22, active_users_this_month: 5 },
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

function SectionCard({
  title, subtitle, children, className,
}: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <Squircle cornerRadius={28} className={`shine widget-shadow border border-eph-border bg-eph-surface p-7 ${className ?? ''}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">{title}</div>
      {subtitle && <div className="mt-1 text-xs text-eph-muted">{subtitle}</div>}
      <div className="mt-5">{children}</div>
    </Squircle>
  );
}

// All money in this app is stored in EUR (see supabase/functions/fx-rate/index.ts) — this used
// to say $, mislabeling real EUR product prices/ad spend as USD.
function fmtCents(cents: number): string {
  return `€${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AdminPlatformPage() {
  const { session } = useSession();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      if (isLocalDev()) { setStats(buildMockStats()); setLoading(false); }
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await adminFetch<PlatformStats>(session, 'get_platform_stats');
      if (cancelled) return;
      if (res.ok && res.data) setStats(res.data);
      else setError(res.error ?? 'Failed to load platform stats');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session]);

  const s = stats;

  const planDonut = s
    ? Object.entries(s.plans.by_tier).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k[0].toUpperCase() + k.slice(1), value: v }))
    : [];

  const integrationBars = s
    ? [
        { name: 'Shopify', value: s.integrations.shopify_connected },
        { name: 'Meta', value: s.integrations.meta_connected },
        { name: 'Meta Page', value: s.integrations.meta_page_linked },
        { name: 'Google Ads', value: s.integrations.google_connected },
      ]
    : [];

  const campaignStatusBars = s
    ? Object.entries(s.campaigns.by_status).map(([k, v]) => ({ name: k[0].toUpperCase() + k.slice(1), value: v }))
    : [];

  const campaignPlatformDonut = s
    ? Object.entries(s.campaigns.by_platform).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k[0].toUpperCase() + k.slice(1), value: v }))
    : [];

  const funnelBars = s
    ? [
        { name: 'Public store scans (pre-signup)', value: s.funnel.public_store_scans },
        { name: 'Store Analysis runs', value: s.funnel.store_intelligence_runs },
        { name: 'Creative briefs generated', value: s.funnel.creative_briefs_generated },
        { name: 'ROAS optimizer runs', value: s.funnel.optimizer_runs },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1600px] px-10 py-10">
      <Reveal>
        <h1 className="text-[22px] font-semibold tracking-tight text-eph-text">Platform</h1>
        <p className="mt-1 text-sm text-eph-muted">Every product signal we can read: integrations, Auren usage, Shopify catalog health, campaigns, and top-of-funnel activity. Live, no Stripe dependency.</p>
      </Reveal>

      {error && (
        <div className="mt-6 rounded-2xl border border-eph-danger/30 bg-eph-danger/10 px-4 py-3 text-sm text-eph-danger">
          {error}
        </div>
      )}

      {/* KPI strip */}
      <Reveal delay={0.05}>
        <Squircle cornerRadius={28} className="mt-7 border border-eph-border bg-eph-surface/60">
          <div className="flex flex-wrap divide-x divide-eph-border">
            <KpiCell label="Auren msgs (7d)" value={loading || !s ? '-' : s.auren.messages_this_week} />
            <KpiCell label="Auren active users (7d)" value={loading || !s ? '-' : s.auren.active_users_this_week} />
            <KpiCell label="Shopify connected" value={loading || !s ? '-' : s.integrations.shopify_connected} />
            <KpiCell label="Campaigns launched" value={loading || !s ? '-' : s.campaigns.launched_count} />
            <KpiCell
              label="Manual grants"
              value={loading || !s ? '-' : s.plans.manual_grants}
              sub={!loading && s && s.plans.expiring_soon.length > 0 ? (
                <span className="rounded-full bg-eph-warning/10 px-2 py-0.5 text-[11px] font-semibold text-eph-warning">
                  {s.plans.expiring_soon.length} expiring &le;7d
                </span>
              ) : null}
            />
          </div>
        </Squircle>
      </Reveal>

      <div className="mt-6 grid grid-cols-12 gap-5">
        {/* Plan mix */}
        <Reveal delay={0.08} className="col-span-12 lg:col-span-4">
          <SectionCard title="Plan mix" subtitle="From user_plans, independent of Stripe.">
            {loading || !s ? (
              <div className="h-44 animate-pulse rounded-2xl bg-eph-surface2" />
            ) : planDonut.length === 0 ? (
              <div className="flex h-44 items-center justify-center text-sm text-eph-muted">No users yet</div>
            ) : (
              <DonutChart
                className="h-44"
                data={planDonut}
                category="value"
                index="name"
                colors={['slate', 'cyan', 'violet']}
              />
            )}
          </SectionCard>
        </Reveal>

        {/* Integrations funnel */}
        <Reveal delay={0.1} className="col-span-12 lg:col-span-4">
          <SectionCard title="Integrations connected" subtitle={loading || !s ? undefined : `${s.integrations.total_users_with_row} users with a settings row`}>
            {loading || !s ? (
              <div className="h-44 animate-pulse rounded-2xl bg-eph-surface2" />
            ) : (
              <BarList data={integrationBars} color="cyan" />
            )}
          </SectionCard>
        </Reveal>

        {/* Auren usage */}
        <Reveal delay={0.12} className="col-span-12 lg:col-span-4">
          <SectionCard title="Auren usage">
            {loading || !s ? (
              <div className="h-44 animate-pulse rounded-2xl bg-eph-surface2" />
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-eph-muted">Messages all-time</span>
                  <span className="tabular-nums font-semibold text-eph-text">{s.auren.messages_all_time}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-eph-muted">Top-ups purchased</span>
                  <span className="tabular-nums font-semibold text-eph-text">{s.auren.topups_purchased}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-eph-muted">Top-up messages granted</span>
                  <span className="tabular-nums font-semibold text-eph-text">{s.auren.topup_messages_granted}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-eph-muted">Distinct top-up buyers</span>
                  <span className="tabular-nums font-semibold text-eph-text">{s.auren.topup_distinct_users}</span>
                </div>
              </div>
            )}
          </SectionCard>
        </Reveal>

        {/* Campaign status */}
        <Reveal delay={0.08} className="col-span-12 lg:col-span-5">
          <SectionCard title="Campaigns by status" subtitle={loading || !s ? undefined : `${s.campaigns.total} total · €${s.campaigns.total_daily_budget.toLocaleString()} combined daily budget`}>
            {loading || !s ? (
              <div className="h-44 animate-pulse rounded-2xl bg-eph-surface2" />
            ) : s.campaigns.total === 0 ? (
              <div className="flex h-44 items-center justify-center text-sm text-eph-muted">No campaigns launched yet</div>
            ) : (
              <BarList data={campaignStatusBars} color="violet" />
            )}
          </SectionCard>
        </Reveal>

        {/* Campaign platform split */}
        <Reveal delay={0.1} className="col-span-12 lg:col-span-3">
          <SectionCard title="Campaigns by platform">
            {loading || !s ? (
              <div className="h-44 animate-pulse rounded-2xl bg-eph-surface2" />
            ) : campaignPlatformDonut.length === 0 ? (
              <div className="flex h-44 items-center justify-center text-sm text-eph-muted">No data yet</div>
            ) : (
              <DonutChart className="h-44" data={campaignPlatformDonut} category="value" index="name" colors={['blue', 'emerald', 'amber']} />
            )}
          </SectionCard>
        </Reveal>

        {/* Shopify catalog health */}
        <Reveal delay={0.12} className="col-span-12 lg:col-span-4">
          <SectionCard title="Shopify catalog health">
            {loading || !s ? (
              <div className="h-44 animate-pulse rounded-2xl bg-eph-surface2" />
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-eph-muted">Products synced</span>
                  <span className="tabular-nums font-semibold text-eph-text">{s.shopify.products_synced}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-eph-muted">Stores with products</span>
                  <span className="tabular-nums font-semibold text-eph-text">{s.shopify.stores_with_products}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-eph-muted">COGS coverage</span>
                  <span className={`tabular-nums font-semibold ${s.shopify.cogs_coverage_pct < 30 ? 'text-eph-warning' : 'text-eph-text'}`}>
                    {s.shopify.cogs_coverage_pct}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-eph-muted">Avg. product price</span>
                  <span className="tabular-nums font-semibold text-eph-text">{fmtCents(s.shopify.avg_price_cents)}</span>
                </div>
              </div>
            )}
          </SectionCard>
        </Reveal>

        {/* Funnel */}
        <Reveal delay={0.08} className="col-span-12 lg:col-span-8">
          <SectionCard title="Funnel: anonymous → activated" subtitle="Public scans happen before signup — the earliest interest signal we have.">
            {loading || !s ? (
              <div className="h-44 animate-pulse rounded-2xl bg-eph-surface2" />
            ) : (
              <BarList data={funnelBars} color="fuchsia" />
            )}
          </SectionCard>
        </Reveal>

        {/* UGC usage */}
        <Reveal delay={0.1} className="col-span-12 lg:col-span-4">
          <SectionCard title="UGC generation (this month)">
            {loading || !s ? (
              <div className="h-44 animate-pulse rounded-2xl bg-eph-surface2" />
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-eph-muted">Credits used</span>
                  <span className="tabular-nums font-semibold text-eph-text">{s.ugc.credits_used_this_month}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-eph-muted">Active users</span>
                  <span className="tabular-nums font-semibold text-eph-text">{s.ugc.active_users_this_month}</span>
                </div>
              </div>
            )}
          </SectionCard>
        </Reveal>

        {/* Expiring grants */}
        {!loading && s && s.plans.expiring_soon.length > 0 && (
          <Reveal delay={0.12} className="col-span-12">
            <SectionCard title="Manual grants expiring within 7 days" subtitle="Auto-reverts to Starter when period_end passes (see admin → Users to extend).">
              <div className="divide-y divide-eph-border/60">
                {s.plans.expiring_soon.map(g => (
                  <div key={g.user_id} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-mono text-xs text-eph-muted">{g.user_id}</span>
                    <span className="text-eph-text">{g.plan}</span>
                    <span className="text-eph-warning">{fmtDate(g.period_end)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </Reveal>
        )}
      </div>

      {!loading && s && (
        <div className="mt-6 text-xs text-eph-subtle">
          Generated {new Date(s.generated_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      )}
    </div>
  );
}
