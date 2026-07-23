'use client';

import { useEffect, useMemo, useState } from 'react';
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

const PLANS = ['starter', 'growth', 'scale'] as const;

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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

  async function handleSetPlan(user: AdminUser, plan: string) {
    if (plan === user.plan) return;
    if (!window.confirm(`Set ${user.email}'s plan to "${plan}"?`)) return;
    setBusyId(user.id);
    const res = await adminFetch(session, 'set_plan', { target_user_id: user.id, plan });
    setBusyId(null);
    if (!res.ok) { alert(res.error ?? 'Failed to update plan'); return; }
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, plan } : u));
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
                  <th className="px-7 py-4 font-semibold">Status</th>
                  <th className="px-7 py-4 font-semibold">Signed up</th>
                  <th className="px-7 py-4 font-semibold">Last active</th>
                  <th className="px-7 py-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-7 py-12 text-center text-eph-muted">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-7 py-12 text-center text-eph-muted">No users found.</td></tr>
                ) : (
                  filtered.map(u => (
                    <tr key={u.id} className="border-b border-eph-border/60 transition-colors last:border-0 hover:bg-white/[0.025]">
                      <td className="px-7 py-4">
                        <div className="font-medium text-eph-text">{u.email || '(no email)'}</div>
                        {u.role && <div className="text-xs text-eph-muted">{u.role}</div>}
                      </td>
                      <td className="px-7 py-4">
                        <select
                          value={u.plan}
                          disabled={busyId === u.id}
                          onChange={(e) => handleSetPlan(u, e.target.value)}
                          className="rounded-xl border border-eph-border bg-eph-surface2 px-2.5 py-1.5 text-sm text-eph-text disabled:opacity-50"
                        >
                          {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        {!u.is_paying && (
                          <Badge className="ml-2" color="amber">manual grant</Badge>
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
