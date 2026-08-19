'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession, useUser } from '@/components/clerk-react';
import Link from 'next/link';
import { Badge } from '@tremor/react';
import { adminFetch } from './lib/adminFetch';
import { getWayneGreeting } from './lib/wayneQuotes';
import Squircle from './lib/Squircle';
import { SectionCards } from '@/components/section-cards';
import { ChartAreaInteractive } from '@/components/chart-area-interactive';
import { fetchWeather } from './lib/weatherfetch';

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

interface UsersData {
  users: SignupUser[];
  total: number;
}

interface Weather {
  temperature: string;
  humidity: string;
  wind_speed: string;
  emoji: string;
}

function buildMockRevenue(): RevenueData {
  const counts = [
    1, 2, 1, 0, 3, 2, 4, 1, 0, 2,
    1, 3, 2, 4, 1, 2, 3, 1, 0, 2,
    1, 4, 2, 3, 1, 2, 0, 3, 2, 4
  ];

  const signups = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(
      MOCK_BASE_TIME - (29 - i) * 86_400_000
    ).toISOString().slice(0, 10);

    return { date: d, count: counts[i] };
  });

  return {
    signups,
    generated_at: new Date(MOCK_BASE_TIME).toISOString(),
  };
}

const MOCK_BASE_TIME = Date.parse('2026-08-18T00:20:00.000Z');

const MOCK_SIGNUP_OFFSETS_MS = [
  22 * 60_000,
  3 * 3_600_000,
  9 * 3_600_000,
  27 * 3_600_000,
  52 * 3_600_000,
  76 * 3_600_000,
  100 * 3_600_000,
  150 * 3_600_000,
];

function buildMockUsers(): UsersData {
  const emails = [
    'sneaker-drop@example.com',
    'flagged-account@example.com',
    'candle-co@example.com',
    'gadget-hub@example.com',
    'store-owner@example.com',
    'newsignup@example.com',
    'test-shop@example.com',
    'small-batch-goods@example.com',
  ];

  const plans = [
    'starter',
    'starter',
    'growth',
    'starter',
    'scale',
    'starter',
    'growth',
    'starter',
  ];

  const users: SignupUser[] = emails.map((email, i) => ({
    id: `user_mock${i}`,
    email,
    created_at: new Date(
      MOCK_BASE_TIME - MOCK_SIGNUP_OFFSETS_MS[i]
    ).toISOString(),
    banned: i === 1,
    plan: plans[i],
  }));

  return {
    users,
    total: 37,
  };
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

const PLAN_BADGE_COLOR: Record<string, string> = {
  starter: 'gray',
  growth: 'cyan',
  scale: 'violet',
};

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

  const localPreview = process.env.NODE_ENV === 'development';

  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [userTotal, setUserTotal] = useState<number | null>(null);
  const [usersList, setUsersList] = useState<SignupUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weather, setWeather] = useState<Weather | null>(null);

  const wayne = useMemo(
    () => getWayneGreeting(user?.firstName),
    [user?.firstName]
  );

  const previewRevenue = useMemo(
    () => buildMockRevenue(),
    []
  );

  const previewUsers = useMemo(
    () => buildMockUsers(),
    []
  );

  useEffect(() => {
    fetchWeather()
      .then(setWeather)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (localPreview) {
      setRevenue(previewRevenue);
      setUserTotal(previewUsers.total);
      setUsersList(previewUsers.users);
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

      const [rev, users] = await Promise.all([
        adminFetch<RevenueData>(
          session,
          'get_revenue',
          { days: 30 }
        ),
        adminFetch<UsersData>(
          session,
          'list_users'
        ),
      ]);

      if (cancelled) return;

      if (users.ok && users.data) {
        setUserTotal(users.data.total);
        setUsersList(users.data.users);
      } else {
        setError(
          prev =>
            prev ??
            (users.error ?? 'Failed to load users')
        );
      }

      if (rev.ok && rev.data) {
        setRevenue(rev.data);
      } else {
        setError(
          prev =>
            prev ??
            (rev.error ?? 'Failed to load signups')
        );
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    localPreview,
    previewRevenue,
    previewUsers,
    session,
  ]);

  const activeRevenue = localPreview
    ? previewRevenue
    : revenue;

  const activeUsersList = localPreview
    ? previewUsers.users
    : usersList;

  const activeUserTotal = localPreview
    ? previewUsers.total
    : userTotal ?? 0;

  const activeLoading = localPreview
    ? false
    : loading;

  const signups = activeRevenue?.signups ?? [];

  const totalSignups30d = signups.reduce(
    (s, r) => s + r.count,
    0
  );

  const last7 = signups.slice(-7);
  const prev7 = signups.slice(-14, -7);

  const signups7d = last7.reduce(
    (s, r) => s + r.count,
    0
  );

  const signups7dPrev = prev7.reduce(
    (s, r) => s + r.count,
    0
  );

  const wowDelta = useMemo(() => {
    if (!activeRevenue) return null;

    if (signups7dPrev === 0) {
      return signups7d > 0
        ? {
            pct: null as number | null,
            positive: true,
          }
        : null;
    }

    const pct = Math.round(
      ((signups7d - signups7dPrev) /
        signups7dPrev) *
        100
    );

    return {
      pct,
      positive: pct >= 0,
    };
  }, [
    activeRevenue,
    signups7d,
    signups7dPrev,
  ]);

  const bannedCount = activeUsersList.filter(
    u => u.banned
  ).length;

  const recentSignups = useMemo(
    () =>
      [...activeUsersList]
        .sort((a, b) =>
          a.created_at < b.created_at
            ? 1
            : -1
        )
        .slice(0, 6),
    [activeUsersList]
  );

  return (
    <div className="mx-auto max-w-[1560px] px-8 py-8 lg:px-10 lg:py-10">

      <div className="text-[32px] font-semibold tracking-tight text-eph-primary">
        {wayne.greeting}
      </div>

      {/* Top bar */}
      <div className="mt-1 flex items-start justify-between gap-6">

        <div className="text-sm italic text-eph-subtle">
          &ldquo;{wayne.quote}&rdquo;
        </div>

        {weather && (
          <div className="weather ml-auto flex items-center gap-4 self-start text-[15px] font-medium tracking-tight text-eph-text">

            <span>
              {weather.temperature} {weather.emoji}
            </span>

            <span>
              💧 {weather.humidity}
            </span>

            <span>
              💨 {weather.wind_speed}
            </span>

          </div>
        )}

      </div>

      <div className="mt-7 flex flex-wrap items-end justify-between gap-4">

        <h1 className="text-[22px] font-semibold tracking-tight text-eph-text">
          Overview
        </h1>

        {!activeLoading &&
          activeRevenue?.generated_at && (
            <div className="rounded-full border border-eph-border bg-eph-surface px-3 py-1.5 text-xs text-eph-subtle">
              Updated{' '}
              {new Date(
                activeRevenue.generated_at
              ).toLocaleTimeString(
                'en-US',
                {
                  hour: 'numeric',
                  minute: '2-digit',
                }
              )}
            </div>
          )}

      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-eph-danger/30 bg-eph-danger/10 px-4 py-3 text-sm text-eph-danger">
          {error}
        </div>
      )}

      <div className="mt-8">

        {activeLoading ? (

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

            {Array.from({ length: 4 }).map(
              (_, i) => (
                <div
                  key={i}
                  className="h-[152px] animate-pulse rounded-[24px] bg-eph-surface2"
                />
              )
            )}

          </div>

        ) : (

          <SectionCards
            data={{
              totalUsers: activeUserTotal,
              signups30d: totalSignups30d,
              signups7d,
              wowDeltaPct:
                wowDelta?.pct ?? null,
              bannedCount,
            }}
          />

        )}

      </div>

      <div className="mt-6 grid grid-cols-12 gap-5">

        <div className="col-span-12 xl:col-span-8">

          {activeLoading ||
          !activeRevenue ? (

            <div className="h-[420px] animate-pulse rounded-[28px] bg-eph-surface2" />

          ) : (

            <ChartAreaInteractive
              data={signups}
            />

          )}

        </div>

        <div className="col-span-12 xl:col-span-4">

          <Squircle
            cornerRadius={28}
            className="widget-shadow flex h-full flex-col border border-eph-border bg-eph-surface p-6"
          >

            <div className="flex items-center justify-between">

              <div className="text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">
                Recent signups
              </div>

              {!activeLoading &&
                activeUsersList.length > 0 && (
                  <span className="text-xs text-eph-subtle">
                    {activeUsersList.length}{' '}
                    total
                  </span>
                )}

            </div>

            <div className="mt-5 flex-1 divide-y divide-eph-border/60">

              {activeLoading ? (

                Array.from({ length: 5 }).map(
                  (_, i) => (
                    <div
                      key={i}
                      className="my-1.5 h-12 animate-pulse rounded-xl bg-eph-surface2"
                    />
                  )
                )

              ) : recentSignups.length === 0 ? (

                <div className="flex h-48 items-center justify-center text-sm text-eph-muted">
                  No signups yet
                </div>

              ) : (

                recentSignups.map(u => (

                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >

                    <div className="min-w-0">

                      <div className="truncate text-sm font-medium text-eph-text">
                        {u.email ||
                          '(no email)'}
                      </div>

                      <div className="mt-0.5 text-xs text-eph-subtle">
                        {relativeTime(
                          u.created_at
                        )}
                      </div>

                    </div>

                    <div className="flex flex-shrink-0 items-center gap-1.5">

                      {u.banned && (
                        <Badge color="rose">
                          banned
                        </Badge>
                      )}

                      <Badge
                        color={
                          PLAN_BADGE_COLOR[
                            u.plan
                          ] ?? 'gray'
                        }
                      >
                        {u.plan}
                      </Badge>

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

        </div>

      </div>

    </div>
  );
}