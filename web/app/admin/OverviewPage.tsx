'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession, useUser } from '@/components/clerk-react';
import Link from 'next/link';
import { Badge } from '@tremor/react';
import { adminFetch, isLocalDev } from './lib/adminFetch';
import { getWayneGreeting } from './lib/wayneQuotes';
import Squircle from './lib/Squircle';
import { fetchWeather } from './lib/weatherfetch';

import StatTile from './lib/charts/StatTile';
import AreaTrend from './lib/charts/AreaTrend';
import { SegmentedBar, BulletBar, RadialArc } from './lib/charts/Distribution';
import { ACCENT, CATEGORICAL, STATUS, TIER_RAMP, INK, compact } from './lib/charts/tokens';
import { GlyphUsers, GlyphSpark, GlyphPulse, GlyphShield, GlyphRocket } from './lib/charts/icons';

interface RevenueData {
  signups: { date: string; count: number }[];
  generated_at?: string;
  mrr_cents?: number;
  active_subscription_count?: number;
  stripe_available?: boolean;
}

interface SignupUser {
  id: string;
  email: string;
  created_at: string;
  banned: boolean;
  plan: string;
}

interface UsersData {
  users: SignupUser[];
  total: number;
}

interface PlatformStats {
  plans?: { by_tier?: Record<string, number>; manual_grants?: number };
  integrations?: {
    total_users_with_row?: number;
    shopify_connected?: number;
    meta_connected?: number;
    google_connected?: number;
  };
  campaigns?: {
    total?: number;
    by_status?: Record<string, number>;
    by_platform?: Record<string, number>;
    total_daily_budget?: number;
  };
  shopify?: { products_synced?: number; cogs_coverage_pct?: number };
  auren?: { messages_all_time?: number; messages_this_week?: number };
}

interface Weather {
  temperature: string;
  humidity: string;
  wind_speed: string;
  emoji: string;
}

const MOCK_BASE_TIME = Date.parse('2026-08-18T00:20:00.000Z');

function buildMockRevenue(): RevenueData {
  const counts = [
    1, 2, 1, 0, 3, 2, 4, 1, 0, 2, 1, 3, 2, 4, 1, 2, 3, 1, 0, 2, 1, 4, 2, 3, 1, 2, 0, 3, 2, 4,
  ];
  const signups = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(MOCK_BASE_TIME - (29 - i) * 86_400_000).toISOString().slice(0, 10),
    count: counts[i],
  }));
  return {
    signups,
    generated_at: new Date(MOCK_BASE_TIME).toISOString(),
    mrr_cents: 68_400,
    active_subscription_count: 9,
    stripe_available: true,
  };
}

/**
 * Local-dev preview figures. Campaign and platform splits are the REAL
 * distribution from production (18 launched campaigns: 9 draft, 8 failed,
 * 1 active; 9 google, 8 both, 1 meta) so the layout is judged against the shape
 * of the actual data rather than a flattering invention. Plan mix and
 * integrations are demo values, because production currently has exactly one
 * user and a single bar tells you nothing about whether the design works.
 */
function buildMockPlatform(): PlatformStats {
  return {
    plans: { by_tier: { starter: 21, growth: 11, scale: 5 }, manual_grants: 2 },
    integrations: {
      total_users_with_row: 37,
      shopify_connected: 24,
      meta_connected: 16,
      google_connected: 11,
    },
    campaigns: {
      total: 18,
      by_status: { draft: 9, active: 1, paused: 0, failed: 8 },
      by_platform: { meta: 1, google: 9, both: 8 },
      total_daily_budget: 412.5,
    },
    shopify: { products_synced: 17, cogs_coverage_pct: 64.7 },
    auren: { messages_all_time: 1284, messages_this_week: 96 },
  };
}

function buildMockUsers(): UsersData {
  const mk = (id: string, email: string, days: number, plan: string, banned = false) => ({
    id,
    email,
    created_at: new Date(MOCK_BASE_TIME - days * 86_400_000).toISOString(),
    banned,
    plan,
  });
  return {
    total: 37,
    users: [
      mk('u1', 'sneaker-drop@example.com', 2, 'starter'),
      mk('u2', 'flagged-account@example.com', 2, 'starter', true),
      mk('u3', 'candle-co@example.com', 2, 'growth'),
      mk('u4', 'gadget-hub@example.com', 3, 'starter'),
      mk('u5', 'store-owner@example.com', 4, 'scale'),
      mk('u6', 'newsignup@example.com', 5, 'starter'),
      mk('u7', 'ceramics@example.com', 6, 'growth'),
      mk('u8', 'outdoor-gear@example.com', 8, 'starter'),
    ],
  };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const d = Math.floor(diff / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return '1d ago';
  return `${d}d ago`;
}

const PLAN_BADGE_COLOR: Record<string, string> = {
  starter: 'gray',
  growth: 'teal',
  scale: 'indigo',
};

/** Section shell. One h2 per panel so the page stays navigable by heading. */
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
          <span className="text-xs" style={{ color: INK.muted }}>
            {hint}
          </span>
        )}
      </div>
      <div className="mt-5 flex-1">{children}</div>
    </Squircle>
  );
}

export default function AdminOverviewPage() {
  const { session } = useSession();
  const { user } = useUser();

  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [platform, setPlatform] = useState<PlatformStats | null>(null);
  const [usersList, setUsersList] = useState<SignupUser[]>([]);
  const [userTotal, setUserTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [localPreview, setLocalPreview] = useState(false);

  // getWayneGreeting reads the current hour, so server and client can disagree
  // ("Good morning" vs "Good afternoon"). React treats a text mismatch as failed
  // hydration and re-renders the whole root. Resolve after mount instead.
  const [wayne, setWayne] = useState<{ greeting: string; quote: string }>({
    greeting: '',
    quote: '',
  });

  useEffect(() => {
    setWayne(getWayneGreeting(user?.firstName));
  }, [user?.firstName]);

  useEffect(() => {
    setLocalPreview(isLocalDev());
  }, []);

  useEffect(() => {
    fetchWeather().then(setWeather).catch(console.error);
  }, []);

  const previewRevenue = useMemo(() => buildMockRevenue(), []);
  const previewUsers = useMemo(() => buildMockUsers(), []);
  const previewPlatform = useMemo(() => buildMockPlatform(), []);

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
      setError(null);

      const [rev, users, stats] = await Promise.all([
        adminFetch<RevenueData>(session, 'get_revenue', { days: 30 }),
        adminFetch<UsersData>(session, 'list_users'),
        adminFetch<PlatformStats>(session, 'get_platform_stats'),
      ]);

      if (cancelled) return;

      if (users.ok && users.data) {
        setUserTotal(users.data.total);
        setUsersList(users.data.users);
      } else {
        setError((prev) => prev ?? (users.error ?? 'Failed to load users'));
      }

      if (rev.ok && rev.data) setRevenue(rev.data);
      else setError((prev) => prev ?? (rev.error ?? 'Failed to load signups'));

      // Platform stats are supplementary: a failure here dims those panels but
      // must not blank the whole overview.
      if (stats.ok && stats.data) setPlatform(stats.data);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [localPreview, session]);

  const activeRevenue = localPreview ? previewRevenue : revenue;
  const activeUsersList = localPreview ? previewUsers.users : usersList;
  const activeUserTotal = localPreview ? previewUsers.total : userTotal ?? 0;
  const activePlatform = localPreview ? previewPlatform : platform;
  const activeLoading = localPreview ? false : loading;

  const signups = activeRevenue?.signups ?? [];
  const totalSignups30d = signups.reduce((s, r) => s + r.count, 0);
  const last7 = signups.slice(-7);
  const prev7 = signups.slice(-14, -7);
  const signups7d = last7.reduce((s, r) => s + r.count, 0);
  const signups7dPrev = prev7.reduce((s, r) => s + r.count, 0);

  const wowDelta = signups7dPrev > 0 ? ((signups7d - signups7dPrev) / signups7dPrev) * 100 : null;

  const bannedCount = activeUsersList.filter((u) => u.banned).length;

  const recentSignups = useMemo(
    () =>
      [...activeUsersList]
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .slice(0, 6),
    [activeUsersList],
  );

  const trend = signups.map((s) => ({ date: s.date, value: s.count }));
  const spark30 = signups.map((s) => s.count);

  const camp = activePlatform?.campaigns;
  const statusSegments = [
    { label: 'Active', value: camp?.by_status?.active ?? 0, color: STATUS.good },
    { label: 'Draft', value: camp?.by_status?.draft ?? 0, color: STATUS.neutral },
    { label: 'Paused', value: camp?.by_status?.paused ?? 0, color: STATUS.warning },
    { label: 'Failed', value: camp?.by_status?.failed ?? 0, color: STATUS.critical },
  ];
  const platformSegments = [
    { label: 'Google', value: camp?.by_platform?.google ?? 0, color: CATEGORICAL[0] },
    { label: 'Both', value: camp?.by_platform?.both ?? 0, color: CATEGORICAL[1] },
    { label: 'Meta', value: camp?.by_platform?.meta ?? 0, color: CATEGORICAL[2] },
  ];
  const tierSegments = [
    { label: 'Starter', value: activePlatform?.plans?.by_tier?.starter ?? 0, color: TIER_RAMP[0] },
    { label: 'Growth', value: activePlatform?.plans?.by_tier?.growth ?? 0, color: TIER_RAMP[1] },
    { label: 'Scale', value: activePlatform?.plans?.by_tier?.scale ?? 0, color: TIER_RAMP[2] },
  ];

  const campTotal = camp?.total ?? 0;
  const failed = camp?.by_status?.failed ?? 0;
  const failureRate = campTotal > 0 ? (failed / campTotal) * 100 : 0;

  const integ = activePlatform?.integrations;
  const integTotal = integ?.total_users_with_row ?? 0;

  const skeleton = (h: number, key?: string) => (
    <div key={key} className="animate-pulse rounded-[26px] bg-eph-surface2" style={{ height: h }} />
  );

  return (
    <div className="mx-auto max-w-[1560px] px-8 py-8 lg:px-10 lg:py-10">
      <div className="text-[32px] font-semibold tracking-tight text-eph-primary">
        {wayne.greeting}
      </div>

      <div className="mt-1 flex items-start justify-between gap-6">
        <div className="text-sm italic text-eph-subtle">
          {wayne.quote && <>&ldquo;{wayne.quote}&rdquo;</>}
        </div>

        {weather && (
          <div className="weather ml-auto flex items-center gap-4 self-start text-[15px] font-medium tracking-tight text-eph-text">
            <span>
              <span className="sr-only">Temperature </span>
              {weather.temperature} <span aria-hidden="true">{weather.emoji}</span>
            </span>
            <span>
              <span aria-hidden="true">💧</span>
              <span className="sr-only">Humidity </span> {weather.humidity}
            </span>
            <span>
              <span aria-hidden="true">💨</span>
              <span className="sr-only">Wind speed </span> {weather.wind_speed}
            </span>
          </div>
        )}
      </div>

      <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[22px] font-semibold tracking-tight text-eph-text">Overview</h1>
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
      </div>

      {error && (
        <div
          className="mt-4 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(186,40,64,0.10)', color: '#f2b8bf' }}
        >
          {error}
        </div>
      )}

      {/* Headline counts. Each is a magnitude at a point in time, so a number is
          the honest form. Only the 7-day tile carries a sparkline, because it is
          the only one where recent shape adds anything. */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {activeLoading ? (
          <>
            {skeleton(132, 'a')}
            {skeleton(132, 'b')}
            {skeleton(132, 'c')}
            {skeleton(132, 'd')}
          </>
        ) : (
          <>
            <StatTile
              label="Total users"
              value={compact(activeUserTotal)}
              countTo={activeUserTotal}
              format={compact}
              icon={<GlyphUsers />}
              caption="all signed-up accounts"
            />
            <StatTile
              label="Signups"
              value={compact(totalSignups30d)}
              countTo={totalSignups30d}
              format={compact}
              icon={<GlyphSpark />}
              caption="last 30 days"
            />
            <StatTile
              label="Signups"
              value={compact(signups7d)}
              countTo={signups7d}
              format={compact}
              icon={<GlyphPulse />}
              delta={wowDelta}
              caption="last 7 days"
              spark={spark30.slice(-14)}
            />
            <StatTile
              label="Banned"
              value={compact(bannedCount)}
              countTo={bannedCount}
              format={compact}
              icon={<GlyphShield />}
              invertDelta
              caption={bannedCount === 0 ? 'none flagged' : 'accounts blocked'}
              dimmed={bannedCount === 0}
            />
          </>
        )}
      </div>

      {/* The one genuine time series on this page. */}
      <div className="mt-5 grid grid-cols-12 gap-5">
        <div className="col-span-12 xl:col-span-8">
          {activeLoading ? (
            skeleton(360)
          ) : (
            <Panel title="Signups" hint="last 30 days, live from Clerk">
              <AreaTrend
                points={trend}
                fill
                height={252}
                color={ACCENT}
                format={(v) => `${v} signup${v === 1 ? '' : 's'}`}
                emptyLabel="No signups recorded in this period"
              />
            </Panel>
          )}
        </div>

        <div className="col-span-12 xl:col-span-4">
          {activeLoading ? (
            skeleton(360)
          ) : (
            <Panel
              title="Recent signups"
              hint={activeUsersList.length > 0 ? `${activeUsersList.length} total` : undefined}
            >
              <div className="flex h-full flex-col">
                {recentSignups.length === 0 ? (
                  <div className="text-sm" style={{ color: INK.muted }}>
                    No signups yet.
                  </div>
                ) : (
                  <ul className="flex-1 list-none divide-y divide-eph-border/60 p-0">
                    {recentSignups.map((u) => (
                      <li
                        key={u.id}
                        className="flex items-center justify-between gap-3 py-3 first:pt-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-eph-text">
                            {u.email || '(no email)'}
                          </div>
                          <div className="mt-0.5 text-xs" style={{ color: INK.muted }}>
                            {relativeTime(u.created_at)}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1.5">
                          {u.banned && <Badge color="rose">banned</Badge>}
                          <Badge color={PLAN_BADGE_COLOR[u.plan] ?? 'gray'}>{u.plan}</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href="/admin/users"
                  className="mt-5 block rounded-xl border border-eph-border py-2 text-center text-xs font-semibold text-eph-muted transition-colors hover:border-eph-primary/40 hover:text-eph-primary"
                >
                  View all users
                </Link>
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* Composition. None of these is a time series, so none gets an axis:
          each is a part-to-whole split meant to be read at a glance. */}
      <div className="mt-5 grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-4">
          <Panel title="Campaign health" hint={campTotal > 0 ? `${campTotal} total` : undefined}>
            <SegmentedBar segments={statusSegments} emptyLabel="No campaigns launched yet" />
            {campTotal > 0 && failureRate > 0 && (
              <div
                className="mt-5 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs"
                style={{ background: 'rgba(186,40,64,0.09)', color: '#f0aeb6' }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                <span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {failureRate.toFixed(0)}%
                  </strong>{' '}
                  of launches failed
                </span>
              </div>
            )}
          </Panel>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <Panel title="Platform mix" hint="where campaigns run">
            <SegmentedBar segments={platformSegments} emptyLabel="No campaigns launched yet" />
          </Panel>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <Panel title="Plan mix" hint="starter to scale">
            <SegmentedBar segments={tierSegments} emptyLabel="No plans recorded yet" />
          </Panel>
        </div>
      </div>

      {/* Coverage and ratios. */}
      <div className="mt-5 grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-5">
          <Panel
            title="Integration coverage"
            hint={integTotal > 0 ? `of ${integTotal} users` : undefined}
          >
            <div className="divide-y divide-eph-border/50">
              <BulletBar
                label="Shopify connected"
                value={integ?.shopify_connected ?? 0}
                total={integTotal}
                color={TIER_RAMP[0]}
              />
              <BulletBar
                label="Meta connected"
                value={integ?.meta_connected ?? 0}
                total={integTotal}
                color={CATEGORICAL[2]}
              />
              <BulletBar
                label="Google connected"
                value={integ?.google_connected ?? 0}
                total={integTotal}
                color={CATEGORICAL[0]}
              />
            </div>
          </Panel>
        </div>

        <div className="col-span-12 lg:col-span-3">
          <Panel title="COGS coverage" hint="profit accuracy">
            <div className="flex h-full items-center justify-center">
              <RadialArc
                value={activePlatform?.shopify?.cogs_coverage_pct ?? 0}
                label="of products"
                color={
                  (activePlatform?.shopify?.cogs_coverage_pct ?? 0) >= 80
                    ? STATUS.good
                    : STATUS.warning
                }
              />
            </div>
          </Panel>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <Panel title="Daily ad budget" hint="across live campaigns">
            <div className="flex h-full flex-col justify-center">
              <div
                className="text-[38px] font-semibold leading-none tracking-[-0.02em]"
                style={{ color: INK.primary, fontVariantNumeric: 'tabular-nums' }}
              >
                €
                {(camp?.total_daily_budget ?? 0).toLocaleString('en-IE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="mt-2 text-xs" style={{ color: INK.muted }}>
                combined daily spend commitment
              </div>
              <div className="mt-5 flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 place-items-center rounded-full"
                  style={{
                    background: 'rgba(6,214,199,0.10)',
                    color: ACCENT,
                    boxShadow: 'inset 0 0 0 1px rgba(6,214,199,0.18)',
                  }}
                >
                  <GlyphRocket />
                </span>
                <span className="text-xs" style={{ color: INK.secondary }}>
                  {camp?.by_status?.active ?? 0} campaign
                  {(camp?.by_status?.active ?? 0) === 1 ? '' : 's'} currently active
                </span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
