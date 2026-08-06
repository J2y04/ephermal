'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@clerk/clerk-react';
import { TextInput, Badge } from '@tremor/react';
import { adminFetch, isLocalDev } from '../lib/adminFetch';
import Reveal from '../lib/Reveal';
import Squircle from '../lib/Squircle';

interface AdminUser {
  id: string;
  email: string;
  plan: string;
  is_paying: boolean;
  period_end: string | null;
  cancelling_at: string | null;
  created_at: string;
  last_active_at: string | null;
  banned: boolean;
  role: string | null;
}

interface UserDetail {
  id: string;
  email: string;
  plan: { plan: string; stripe_sub_id: string | null; period_end: string | null };
  integrations: {
    shopify_connected: boolean; shopify_shop?: string | null;
    meta_connected: boolean; meta_account?: string | null; meta_page_linked?: boolean;
    google_connected: boolean; google_customer_id?: string | null;
  };
  credits: {
    script_used_this_month: number;
    video_used_this_month: number;
    video_topup_remaining: number;
    video_topup_packs: { id: string; credits: number; used: number; created_at: string }[];
  };
  campaigns: { id: string; platform: string; status: string; budget_daily: number; launched_at: string | null }[];
  cost_log_total_eur: number;
}

const PLANS = ['starter', 'growth', 'scale'] as const;

// Quick expiry choices for a manual grant. 'permanent' omits expires_in_days entirely
// (admin-api treats that as "no expiry" and clears any previously-set one).
const EXPIRY_CHOICES = [
  { value: 'permanent', label: 'Permanent', days: null as number | null },
  { value: '7',   label: '7 days',   days: 7 },
  { value: '30',  label: '30 days',  days: 30 },
  { value: '90',  label: '90 days',  days: 90 },
  { value: '180', label: '180 days', days: 180 },
  { value: '365', label: '1 year',   days: 365 },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

// Local-preview-only sample rows — never used on a real deployment (see
// isLocalDev in ../lib/adminFetch).
function buildMockUsers(): AdminUser[] {
  return [
    { id: 'user_mock1', email: 'jamalsettah2604@gmail.com', plan: 'scale', is_paying: false, period_end: '2036-07-18', cancelling_at: null, created_at: '2026-06-06', last_active_at: '2026-07-22', banned: false, role: 'ceo' },
    { id: 'user_mock2', email: 'store-owner@example.com', plan: 'growth', is_paying: true, period_end: '2026-08-20', cancelling_at: null, created_at: '2026-07-01', last_active_at: '2026-07-21', banned: false, role: null },
    { id: 'user_mock3', email: 'test-shop@example.com', plan: 'starter', is_paying: true, period_end: '2026-08-05', cancelling_at: '2026-08-05', created_at: '2026-06-28', last_active_at: '2026-07-10', banned: false, role: null },
    { id: 'user_mock4', email: 'flagged-account@example.com', plan: 'starter', is_paying: false, period_end: null, cancelling_at: null, created_at: '2026-07-15', last_active_at: null, banned: true, role: null },
  ];
}

export default function AdminUsersPage() {
  const { session } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  // Per-row pending expiry choice for the NEXT plan grant — 'permanent' by default.
  // Read at grant time, not stored server-side until a grant actually happens.
  const [expiryChoice, setExpiryChoice] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [grantAmount, setGrantAmount] = useState('5');
  // Mirrors expandedId but readable synchronously inside async callbacks (state read via
  // closure would be stale) — lets toggleExpand/refreshDetail detect and drop a response
  // that resolves after the admin has already expanded a different row, instead of
  // clobbering the now-visible row's detail panel with the previous row's data.
  const expandedIdRef = useRef<string | null>(null);

  async function load() {
    if (!session) {
      if (isLocalDev()) { setUsers(buildMockUsers()); setLoading(false); }
      return;
    }
    setLoading(true);
    setError(null);
    const res = await adminFetch<{ users: AdminUser[]; total: number }>(session, 'list_users');
    if (res.ok && res.data) {
      setUsers(res.data.users);
    } else {
      setError(res.error ?? 'Failed to load users');
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => u.email.toLowerCase().includes(q));
  }, [users, query]);

  async function handleSetPlan(user: AdminUser, plan: string, daysOverride?: number | null) {
    if (plan === user.plan && daysOverride === undefined) return;
    const choice = daysOverride !== undefined
      ? daysOverride
      : (EXPIRY_CHOICES.find(c => c.value === (expiryChoice[user.id] ?? 'permanent'))?.days ?? null);
    const expiryLabel = choice ? `for ${choice} days` : 'permanently';
    if (!window.confirm(`Set ${user.email}'s plan to "${plan}" ${expiryLabel}?`)) return;
    setBusyId(user.id);
    const res = await adminFetch(session, 'set_plan', {
      target_user_id: user.id,
      plan,
      ...(choice ? { expires_in_days: choice } : {}),
    });
    setBusyId(null);
    if (!res.ok) { alert(res.error ?? 'Failed to update plan'); return; }
    const periodEnd = (res.data as { period_end?: string | null } | null)?.period_end ?? null;
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, plan, period_end: periodEnd } : u));
  }

  async function handleBanToggle(user: AdminUser) {
    const action = user.banned ? 'unban_user' : 'ban_user';
    const verb = user.banned ? 'Unban' : 'Ban';
    if (!window.confirm(`${verb} ${user.email}?`)) return;
    setBusyId(user.id);
    const res = await adminFetch(session, action, { target_user_id: user.id });
    setBusyId(null);
    if (!res.ok) { alert(res.error ?? `Failed to ${verb.toLowerCase()}`); return; }
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, banned: !user.banned } : u));
  }

  async function toggleExpand(user: AdminUser) {
    if (expandedId === user.id) { setExpandedId(null); setDetail(null); expandedIdRef.current = null; return; }
    setExpandedId(user.id);
    expandedIdRef.current = user.id;
    setDetail(null);
    setDetailLoading(true);
    const res = await adminFetch<UserDetail>(session, 'get_user_detail', { target_user_id: user.id });
    // A different row may have been expanded while this was in flight — drop the stale
    // response instead of showing user.id's data under whatever row is now expanded.
    if (expandedIdRef.current !== user.id) return;
    setDetailLoading(false);
    if (res.ok && res.data) setDetail(res.data);
    else alert(res.error ?? 'Failed to load user detail');
  }

  async function refreshDetail(userId: string) {
    const res = await adminFetch<UserDetail>(session, 'get_user_detail', { target_user_id: userId });
    if (expandedIdRef.current !== userId) return;
    if (res.ok && res.data) {
      setDetail(res.data);
    } else {
      // The mutation that triggered this refresh already succeeded (its own error path
      // would have returned before calling this) - only the refetch failed, so say that
      // specifically rather than leaving stale pre-mutation numbers with no indication
      // anything's out of date.
      alert('That worked, but refreshing the details failed — reopen this row to see the latest.');
    }
  }

  async function handleDisconnect(user: AdminUser, platform: 'meta' | 'shopify' | 'google') {
    if (!window.confirm(`Disconnect ${platform} for ${user.email}?`)) return;
    setBusyId(user.id);
    const res = await adminFetch(session, 'disconnect_integration', { target_user_id: user.id, platform });
    setBusyId(null);
    if (!res.ok) { alert(res.error ?? 'Failed to disconnect'); return; }
    refreshDetail(user.id);
  }

  async function handleGrantCredits(user: AdminUser) {
    const credits = Number(grantAmount);
    if (!Number.isFinite(credits) || credits <= 0) { alert('Enter a positive number of credits'); return; }
    if (!window.confirm(`Grant ${user.email} ${credits} extra UGC video credits?`)) return;
    setBusyId(user.id);
    const res = await adminFetch(session, 'grant_ugc_video_credits', { target_user_id: user.id, credits });
    setBusyId(null);
    if (!res.ok) { alert(res.error ?? 'Failed to grant credits'); return; }
    refreshDetail(user.id);
  }

  async function handleCancelSubscription(user: AdminUser) {
    if (!window.confirm(`Cancel ${user.email}'s Stripe subscription immediately? This cannot be undone from here.`)) return;
    setBusyId(user.id);
    const res = await adminFetch(session, 'cancel_subscription', { target_user_id: user.id });
    setBusyId(null);
    if (!res.ok) { alert(res.error ?? 'Failed to cancel subscription'); return; }
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, plan: 'starter', is_paying: false, period_end: null } : u));
    refreshDetail(user.id);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-10 py-10">
      <Reveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-eph-text">Users</h1>
            <p className="mt-1 text-sm text-eph-muted">{users.length} total, live from Clerk.</p>
          </div>
          <TextInput
            placeholder="Search by email…"
            value={query}
            onValueChange={setQuery}
            className="w-64 [&>input]:bg-eph-surface2 [&>input]:text-eph-text"
          />
        </div>
      </Reveal>

      {error && (
        <div className="mt-4 rounded-2xl border border-eph-danger/30 bg-eph-danger/10 px-4 py-3 text-sm text-eph-danger">
          {error}
        </div>
      )}

      <Reveal delay={0.05}>
        <Squircle cornerRadius={32} className="widget-shadow mt-7 overflow-hidden border border-eph-border bg-eph-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-eph-border text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">
                <tr>
                  <th className="px-7 py-4 font-semibold">Email</th>
                  <th className="px-7 py-4 font-semibold">Plan</th>
                  <th className="px-7 py-4 font-semibold">Expires</th>
                  <th className="px-7 py-4 font-semibold">Status</th>
                  <th className="px-7 py-4 font-semibold">Signed up</th>
                  <th className="px-7 py-4 font-semibold">Last active</th>
                  <th className="px-7 py-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-7 py-12 text-center text-eph-muted">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-7 py-12 text-center text-eph-muted">No users found.</td></tr>
                ) : (
                  filtered.map(u => {
                    const remaining = daysUntil(u.period_end);
                    return (
                    <Fragment key={u.id}>
                    <tr className="border-b border-eph-border/60 transition-colors last:border-0 hover:bg-white/[0.025]">
                      <td className="px-7 py-4">
                        <button
                          onClick={() => toggleExpand(u)}
                          className="font-medium text-eph-text underline decoration-dotted underline-offset-4 hover:text-eph-primary"
                        >
                          {u.email || '(no email)'}
                        </button>
                        {u.role && <div className="text-xs text-eph-muted">{u.role}</div>}
                      </td>
                      <td className="px-7 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select
                            value={u.plan}
                            disabled={busyId === u.id}
                            onChange={(e) => handleSetPlan(u, e.target.value)}
                            className="rounded-xl border border-eph-border bg-eph-surface2 px-2.5 py-1.5 text-sm text-eph-text disabled:opacity-50"
                          >
                            {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <select
                            value={expiryChoice[u.id] ?? 'permanent'}
                            disabled={busyId === u.id}
                            onChange={(e) => setExpiryChoice(prev => ({ ...prev, [u.id]: e.target.value }))}
                            title="Applied on the next plan change above"
                            className="rounded-xl border border-eph-border bg-eph-surface2 px-2.5 py-1.5 text-xs text-eph-muted disabled:opacity-50"
                          >
                            {EXPIRY_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                          {!u.is_paying && u.plan !== 'starter' && (
                            <Badge color="amber">manual grant</Badge>
                          )}
                        </div>
                        <button
                          onClick={() => handleSetPlan(u, 'growth', 90)}
                          disabled={busyId === u.id}
                          className="mt-1.5 rounded-lg border border-eph-primary/30 px-2 py-1 text-[11px] font-semibold text-eph-primary transition-colors hover:bg-eph-primary/10 disabled:opacity-50"
                        >
                          Reward: 3mo Growth
                        </button>
                      </td>
                      <td className="px-7 py-4 text-eph-muted">
                        {!u.period_end ? '-' : u.is_paying ? (
                          // A real Stripe subscriber's period_end is just their next renewal
                          // date (written on every subscription create/update, per
                          // stripe-webhook) - not an expiration, so no "Xd left" countdown.
                          <div>{fmtDate(u.period_end)}</div>
                        ) : (
                          <div>
                            <div>{fmtDate(u.period_end)}</div>
                            {remaining !== null && (
                              <div className={`text-xs ${remaining <= 7 ? 'text-eph-warning' : 'text-eph-subtle'}`}>
                                {remaining >= 0 ? `${remaining}d left` : 'expired'}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-7 py-4">
                        {u.banned
                          ? <Badge color="rose">Banned</Badge>
                          : <Badge color="emerald">Active</Badge>}
                      </td>
                      <td className="px-7 py-4 text-eph-muted">{fmtDate(u.created_at)}</td>
                      <td className="px-7 py-4 text-eph-muted">{fmtDate(u.last_active_at)}</td>
                      <td className="px-7 py-4">
                        <button
                          onClick={() => handleBanToggle(u)}
                          disabled={busyId === u.id}
                          className="rounded-xl border border-eph-border px-3 py-1.5 text-xs font-semibold text-eph-text transition-colors hover:border-eph-danger hover:text-eph-danger disabled:opacity-50"
                        >
                          {u.banned ? 'Unban' : 'Ban'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === u.id && (
                      <tr key={u.id + '-detail'} className="border-b border-eph-border/60 bg-white/[0.015]">
                        <td colSpan={7} className="px-7 py-6">
                          {detailLoading ? (
                            <div className="text-sm text-eph-muted">Loading…</div>
                          ) : !detail ? (
                            <div className="text-sm text-eph-muted">Failed to load.</div>
                          ) : (
                            <div className="grid grid-cols-3 gap-8 text-sm">
                              <div>
                                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">Integrations</div>
                                <div className="space-y-2">
                                  {(['shopify', 'meta', 'google'] as const).map(p => {
                                    const connected = detail.integrations[`${p}_connected` as 'shopify_connected'];
                                    return (
                                      <div key={p} className="flex items-center justify-between gap-3">
                                        <span className="capitalize text-eph-text">{p}</span>
                                        {connected ? (
                                          <div className="flex items-center gap-2">
                                            <Badge color="emerald">connected</Badge>
                                            <button
                                              onClick={() => handleDisconnect(u, p)}
                                              disabled={busyId === u.id}
                                              className="rounded-lg border border-eph-border px-2 py-1 text-[11px] text-eph-muted hover:border-eph-danger hover:text-eph-danger disabled:opacity-50"
                                            >
                                              Disconnect
                                            </button>
                                          </div>
                                        ) : <Badge color="gray">not connected</Badge>}
                                      </div>
                                    );
                                  })}
                                </div>
                                {u.is_paying && (
                                  <button
                                    onClick={() => handleCancelSubscription(u)}
                                    disabled={busyId === u.id}
                                    className="mt-4 rounded-lg border border-eph-danger/40 px-3 py-1.5 text-[11px] font-semibold text-eph-danger hover:bg-eph-danger/10 disabled:opacity-50"
                                  >
                                    Cancel Stripe subscription
                                  </button>
                                )}
                              </div>
                              <div>
                                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">Credits &amp; cost</div>
                                <div className="space-y-1 text-eph-muted">
                                  <div>Script credits used this month: <span className="text-eph-text">{detail.credits.script_used_this_month}</span></div>
                                  <div>UGC video used this month: <span className="text-eph-text">{detail.credits.video_used_this_month}</span></div>
                                  <div>Video top-up balance: <span className="text-eph-text">{detail.credits.video_topup_remaining}</span></div>
                                  <div>Total provider cost logged: <span className="text-eph-text">€{detail.cost_log_total_eur.toFixed(2)}</span></div>
                                </div>
                                <div className="mt-4 flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={1}
                                    value={grantAmount}
                                    onChange={(e) => setGrantAmount(e.target.value)}
                                    className="w-16 rounded-lg border border-eph-border bg-eph-surface2 px-2 py-1.5 text-xs text-eph-text"
                                  />
                                  <button
                                    onClick={() => handleGrantCredits(u)}
                                    disabled={busyId === u.id}
                                    className="rounded-lg border border-eph-primary/30 px-2.5 py-1.5 text-[11px] font-semibold text-eph-primary hover:bg-eph-primary/10 disabled:opacity-50"
                                  >
                                    Grant UGC video credits
                                  </button>
                                </div>
                              </div>
                              <div>
                                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">Recent campaigns ({detail.campaigns.length})</div>
                                {detail.campaigns.length === 0 ? (
                                  <div className="text-eph-muted">None yet.</div>
                                ) : (
                                  <div className="space-y-1.5 text-eph-muted">
                                    {detail.campaigns.slice(0, 8).map(c => (
                                      <div key={c.id} className="flex items-center justify-between gap-3">
                                        <span className="capitalize">{c.platform} · {c.status}</span>
                                        <span className="text-eph-text">€{Number(c.budget_daily ?? 0).toFixed(2)}/day</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Squircle>
      </Reveal>
    </div>
  );
}
