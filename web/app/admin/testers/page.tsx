'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
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
  created_at: string;
  last_active_at: string | null;
  banned: boolean;
  role: string | null;
}

interface UserDetail {
  id: string;
  email: string;
  created_at: string;
  last_active_at: string | null;
  role: string | null;
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
  };
  campaigns: { id: string; platform: string; status: string; budget_daily: number; launched_at: string | null }[];
  cost_log_recent: { credit_type: string; provider: string; cost_eur: number; created_at: string }[];
  cost_log_total_eur: number;
}

interface ActivityItem {
  label: string;
  sublabel: string;
  date: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function timeAgo(iso: string | null): string {
  if (!iso) return '-';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

const PROVIDER_LABEL: Record<string, string> = {
  anthropic:  'Auren / AI script',
  higgsfield: 'Higgsfield video',
};

function buildActivity(detail: UserDetail): ActivityItem[] {
  const costItems: ActivityItem[] = (detail.cost_log_recent ?? []).map(r => ({
    label: `${PROVIDER_LABEL[r.provider] ?? r.provider} · ${r.credit_type}`,
    sublabel: `€${Number(r.cost_eur ?? 0).toFixed(3)}`,
    date: r.created_at,
  }));
  const campaignItems: ActivityItem[] = (detail.campaigns ?? [])
    .filter(c => c.launched_at)
    .map(c => ({
      label: `Launched ${c.platform} campaign`,
      sublabel: `${c.status} · €${Number(c.budget_daily ?? 0).toFixed(2)}/day`,
      date: c.launched_at as string,
    }));
  return [...costItems, ...campaignItems]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 25);
}

// Local-preview-only sample rows — never used on a real deployment (see isLocalDev in ../lib/adminFetch).
function buildMockUsers(): AdminUser[] {
  return [
    { id: 'user_mock1', email: 'jamalsettah2604@gmail.com', plan: 'scale', is_paying: false, created_at: '2026-06-06', last_active_at: '2026-08-06', banned: false, role: 'ceo' },
    { id: 'user_mock2', email: 'beta-tester@example.com', plan: 'growth', is_paying: false, created_at: '2026-08-01', last_active_at: '2026-08-05', banned: false, role: 'testuser' },
    { id: 'user_mock3', email: 'store-owner@example.com', plan: 'growth', is_paying: true, created_at: '2026-07-01', last_active_at: '2026-07-21', banned: false, role: null },
  ];
}

export default function AdminTestersPage() {
  const { session } = useSession();
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addBusy, setAddBusy] = useState<string | null>(null);

  async function load() {
    if (!session) {
      if (isLocalDev()) { setAllUsers(buildMockUsers()); setLoading(false); }
      return;
    }
    setLoading(true);
    setError(null);
    const res = await adminFetch<{ users: AdminUser[]; total: number }>(session, 'list_users');
    if (res.ok && res.data) setAllUsers(res.data.users);
    else setError(res.error ?? 'Failed to load users');
    setLoading(false);
  }

  useEffect(() => { load(); }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const testers = useMemo(() => allUsers.filter(u => u.role === 'testuser'), [allUsers]);

  const addMatches = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allUsers.filter(u => u.role !== 'testuser' && u.email.toLowerCase().includes(q)).slice(0, 6);
  }, [allUsers, addQuery]);

  async function handleMakeTester(user: AdminUser) {
    if (!window.confirm(`Make ${user.email} a test user? This grants the Growth plan for free, unless they already have a real Stripe subscription.`)) return;
    setAddBusy(user.id);
    const res = await adminFetch<{ granted_plan: string | null }>(session, 'set_role', { target_user_id: user.id, role: 'testuser' });
    setAddBusy(null);
    if (!res.ok) { alert(res.error ?? 'Failed to add test user'); return; }
    setAddQuery('');
    load();
  }

  async function handleRemoveTester(user: AdminUser) {
    if (!window.confirm(`Remove test-user status from ${user.email}? Their plan stays as-is — this only clears the role.`)) return;
    setBusyId(user.id);
    const res = await adminFetch(session, 'set_role', { target_user_id: user.id, role: null });
    setBusyId(null);
    if (!res.ok) { alert(res.error ?? 'Failed to update role'); return; }
    if (expandedId === user.id) { setExpandedId(null); setDetail(null); }
    load();
  }

  async function toggleExpand(user: AdminUser) {
    if (expandedId === user.id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(user.id);
    setDetail(null);
    setDetailLoading(true);
    const res = await adminFetch<UserDetail>(session, 'get_user_detail', { target_user_id: user.id });
    setDetailLoading(false);
    if (res.ok && res.data) setDetail(res.data);
    else alert(res.error ?? 'Failed to load user detail');
  }

  return (
    <div className="mx-auto max-w-[1600px] px-10 py-10">
      <Reveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-eph-text">Test Users</h1>
            <p className="mt-1 text-sm text-eph-muted">
              {testers.length} active — real accounts on the Growth plan for testing, no Stripe charge.
            </p>
          </div>
        </div>
      </Reveal>

      {error && (
        <div className="mt-4 rounded-2xl border border-eph-danger/30 bg-eph-danger/10 px-4 py-3 text-sm text-eph-danger">
          {error}
        </div>
      )}

      <Reveal delay={0.05}>
        <Squircle cornerRadius={28} className="widget-shadow mt-7 border border-eph-border bg-eph-surface p-6">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">Add a test user</div>
          <TextInput
            placeholder="Search an existing account by email…"
            value={addQuery}
            onValueChange={setAddQuery}
            className="[&>input]:bg-eph-surface2 [&>input]:text-eph-text"
          />
          {addQuery.trim().length >= 2 && (
            <div className="mt-3 space-y-1.5">
              {addMatches.length === 0 ? (
                <div className="px-1 py-2 text-sm text-eph-muted">No matching account. They need to sign up first.</div>
              ) : (
                addMatches.map(u => (
                  <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-eph-border/60 bg-eph-surface2 px-4 py-2.5">
                    <div>
                      <div className="text-sm text-eph-text">{u.email}</div>
                      <div className="text-xs text-eph-subtle">currently {u.plan}{u.role ? ` · role: ${u.role}` : ''}</div>
                    </div>
                    <button
                      onClick={() => handleMakeTester(u)}
                      disabled={addBusy === u.id}
                      className="rounded-lg border border-eph-primary/30 px-3 py-1.5 text-xs font-semibold text-eph-primary transition-colors hover:bg-eph-primary/10 disabled:opacity-50"
                    >
                      {addBusy === u.id ? 'Adding…' : 'Make test user'}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </Squircle>
      </Reveal>

      <Reveal delay={0.1}>
        <Squircle cornerRadius={32} className="widget-shadow mt-7 overflow-hidden border border-eph-border bg-eph-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-eph-border text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">
                <tr>
                  <th className="px-7 py-4 font-semibold">Email</th>
                  <th className="px-7 py-4 font-semibold">Plan</th>
                  <th className="px-7 py-4 font-semibold">Signed up</th>
                  <th className="px-7 py-4 font-semibold">Last active</th>
                  <th className="px-7 py-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-7 py-12 text-center text-eph-muted">Loading…</td></tr>
                ) : testers.length === 0 ? (
                  <tr><td colSpan={5} className="px-7 py-12 text-center text-eph-muted">No test users yet — add one above.</td></tr>
                ) : (
                  testers.map(u => (
                    <Fragment key={u.id}>
                      <tr className="border-b border-eph-border/60 transition-colors last:border-0 hover:bg-white/[0.025]">
                        <td className="px-7 py-4">
                          <button
                            onClick={() => toggleExpand(u)}
                            className="font-medium text-eph-text underline decoration-dotted underline-offset-4 hover:text-eph-primary"
                          >
                            {u.email || '(no email)'}
                          </button>
                        </td>
                        <td className="px-7 py-4">
                          <Badge color="emerald">{u.plan}</Badge>
                        </td>
                        <td className="px-7 py-4 text-eph-muted">{fmtDate(u.created_at)}</td>
                        <td className="px-7 py-4 text-eph-muted">{timeAgo(u.last_active_at)}</td>
                        <td className="px-7 py-4">
                          <button
                            onClick={() => handleRemoveTester(u)}
                            disabled={busyId === u.id}
                            className="rounded-xl border border-eph-border px-3 py-1.5 text-xs font-semibold text-eph-text transition-colors hover:border-eph-danger hover:text-eph-danger disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                      {expandedId === u.id && (
                        <tr className="border-b border-eph-border/60 bg-white/[0.015]">
                          <td colSpan={5} className="px-7 py-6">
                            {detailLoading ? (
                              <div className="text-sm text-eph-muted">Loading…</div>
                            ) : !detail ? (
                              <div className="text-sm text-eph-muted">Failed to load.</div>
                            ) : (
                              <div className="grid grid-cols-3 gap-8 text-sm">
                                <div>
                                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">Connected accounts</div>
                                  <div className="space-y-2">
                                    {(['shopify', 'meta', 'google'] as const).map(p => {
                                      const connected = detail.integrations[`${p}_connected` as 'shopify_connected'];
                                      return (
                                        <div key={p} className="flex items-center justify-between gap-3">
                                          <span className="capitalize text-eph-text">{p}</span>
                                          {connected ? <Badge color="emerald">connected</Badge> : <Badge color="gray">not connected</Badge>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div className="mt-5 space-y-1.5 text-eph-muted">
                                    <div>Plan: <span className="text-eph-text">{detail.plan.plan}</span></div>
                                    <div>AI script credits used: <span className="text-eph-text">{detail.credits.script_used_this_month}</span></div>
                                    <div>UGC video credits used: <span className="text-eph-text">{detail.credits.video_used_this_month}</span></div>
                                    <div>Total provider cost logged: <span className="text-eph-text">€{detail.cost_log_total_eur.toFixed(2)}</span></div>
                                  </div>
                                </div>
                                <div className="col-span-2">
                                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-eph-subtle">Recent activity</div>
                                  {(() => {
                                    const activity = buildActivity(detail);
                                    if (activity.length === 0) {
                                      return <div className="text-eph-muted">No activity yet.</div>;
                                    }
                                    return (
                                      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-2">
                                        {activity.map((a, i) => (
                                          <div key={i} className="flex items-center justify-between gap-3 rounded-lg bg-eph-surface2 px-3.5 py-2.5">
                                            <span className="text-eph-text">{a.label}</span>
                                            <div className="flex items-center gap-3 text-xs text-eph-muted">
                                              <span>{a.sublabel}</span>
                                              <span className="text-eph-subtle">{timeAgo(a.date)}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Squircle>
      </Reveal>
    </div>
  );
}
