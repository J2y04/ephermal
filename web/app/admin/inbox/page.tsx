'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/components/clerk-react';
import { Badge } from '@tremor/react';
import { inboxFetch, isLocalDev } from '../lib/adminFetch';
import { IconMail } from '../lib/icons';

interface InboxMessage {
  uid: string;
  subject: string;
  from: string;
  from_email: string;
  to: string;
  date: string;
  seen: boolean;
}

interface ListResponse {
  messages: InboxMessage[];
  mailbox: string;
  scanned: number;
  filtered_out: number;
}

interface MessageResponse extends InboxMessage {
  body: string;
}

function relativeDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw || '';
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function fullDate(raw: string): string {
  const d = new Date(raw);
  return isNaN(d.getTime())
    ? raw
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Deterministic initials, so a sender keeps the same avatar between renders. */
function initials(name: string, email: string): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s.@_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default function InboxPage() {
  const { session } = useSession();

  // isLocalDev() reads window, so calling it during render makes the server and
  // the client disagree on which branch to draw and React throws out the whole
  // tree. Every other admin page only ever calls it inside an effect; this one
  // resolves it after mount for the same reason.
  const [localDev, setLocalDev] = useState(false);
  useEffect(() => { setLocalDev(isLocalDev()); }, []);

  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [meta, setMeta] = useState<{ scanned: number; filtered_out: number; mailbox: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [detail, setDetail] = useState<MessageResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await inboxFetch<ListResponse>(session, 'list');
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Could not load the inbox.');
      setMessages([]);
    } else {
      setMessages(res.data.messages);
      setMeta({ scanned: res.data.scanned, filtered_out: res.data.filtered_out, mailbox: res.data.mailbox });
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    if (!session) { setLoading(false); return; }
    load();
  }, [session, load]);

  const openMessage = useCallback(async (uid: string) => {
    setActiveUid(uid);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    const res = await inboxFetch<MessageResponse>(session, 'message', { uid });
    if (!res.ok || !res.data) setDetailError(res.error ?? 'Could not open this message.');
    else setDetail(res.data);
    setDetailLoading(false);
  }, [session]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(m =>
      m.subject.toLowerCase().includes(q) ||
      m.from.toLowerCase().includes(q) ||
      m.from_email.toLowerCase().includes(q),
    );
  }, [messages, query]);

  if (localDev && !session) {
    return (
      <div className="eph-inbox">
        <Header count={0} />
        <div className="eph-inbox-empty">
          <IconMail className="eph-inbox-empty-icon" />
          <h3>Sign in to read the inbox</h3>
          <p>Local preview has no Clerk session, so there is no admin token to send.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="eph-inbox">
      <Header count={messages.length} mailbox={meta?.mailbox} onRefresh={load} refreshing={loading} />

      {meta && !loading && !error && (
        <p className="eph-inbox-note">
          Showing mail addressed to <strong>@ephermal.app</strong> only.
          {meta.filtered_out > 0
            ? ` ${meta.filtered_out} of ${meta.scanned} messages in the label were addressed elsewhere and are hidden.`
            : ` All ${meta.scanned} messages in the label qualified.`}
        </p>
      )}

      {error && (
        <div className="eph-inbox-error">
          <h3>The mailbox did not answer</h3>
          <p>{error}</p>
          <button type="button" onClick={load} className="eph-inbox-retry">Try again</button>
        </div>
      )}

      {!error && (
        <div className="eph-inbox-split">
          <div className="eph-inbox-listcol">
            <div className="eph-inbox-list">
              <div className="eph-inbox-search">
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search sender or subject"
                  aria-label="Search the inbox"
                />
              </div>

              {loading && (
                <ul className="eph-inbox-rows" aria-busy="true">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <li key={i} className="eph-inbox-row is-skeleton">
                      <span className="eph-inbox-avatar sk" />
                      <span className="eph-inbox-rowbody">
                        <span className="sk-line sk-line-a" />
                        <span className="sk-line sk-line-b" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {!loading && filtered.length === 0 && (
                <div className="eph-inbox-empty inline">
                  <IconMail className="eph-inbox-empty-icon" />
                  <h3>{query ? 'Nothing matches that' : 'No mail yet'}</h3>
                  <p>
                    {query
                      ? 'Try a different sender or subject.'
                      : 'Anything sent to an @ephermal.app address will land here.'}
                  </p>
                </div>
              )}

              {!loading && filtered.length > 0 && (
                <ul className="eph-inbox-rows">
                  {filtered.map(m => (
                    <li key={m.uid}>
                      <button
                        type="button"
                        onClick={() => openMessage(m.uid)}
                        className={`eph-inbox-row${activeUid === m.uid ? ' is-active' : ''}${m.seen ? '' : ' is-unread'}`}
                        aria-current={activeUid === m.uid ? 'true' : undefined}
                      >
                        <span className="eph-inbox-avatar" aria-hidden="true">
                          {initials(m.from, m.from_email)}
                        </span>
                        <span className="eph-inbox-rowbody">
                          <span className="eph-inbox-rowtop">
                            <span className="eph-inbox-from">{m.from || m.from_email}</span>
                            <time className="eph-inbox-when" dateTime={m.date}>{relativeDate(m.date)}</time>
                          </span>
                          <span className="eph-inbox-subject">{m.subject}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="eph-inbox-readcol">
            <div className="eph-inbox-reader">
              {!activeUid && (
                <div className="eph-inbox-empty inline">
                  <IconMail className="eph-inbox-empty-icon" />
                  <h3>Nothing open</h3>
                  <p>Pick a message on the left to read it here.</p>
                </div>
              )}

              {activeUid && detailLoading && (
                <div className="eph-inbox-readskeleton" aria-busy="true">
                  <span className="sk-line sk-line-title" />
                  <span className="sk-line sk-line-meta" />
                  {Array.from({ length: 7 }).map((_, i) => (
                    <span key={i} className="sk-line sk-line-body" />
                  ))}
                </div>
              )}

              {activeUid && detailError && (
                <div className="eph-inbox-empty inline">
                  <h3>Could not open this message</h3>
                  <p>{detailError}</p>
                </div>
              )}

              {activeUid && detail && !detailLoading && (
                <article className="eph-inbox-article">
                  <h2>{detail.subject}</h2>
                  <div className="eph-inbox-meta">
                    <span className="eph-inbox-avatar lg" aria-hidden="true">
                      {initials(detail.from, detail.from_email)}
                    </span>
                    <div>
                      <p className="eph-inbox-metaname">
                        {detail.from || detail.from_email}
                        {detail.from_email && detail.from !== detail.from_email && (
                          <span className="eph-inbox-metaaddr">{detail.from_email}</span>
                        )}
                      </p>
                      <p className="eph-inbox-metato">
                        to <span>{detail.to || '(unknown)'}</span>
                      </p>
                    </div>
                    <time className="eph-inbox-metadate" dateTime={detail.date}>{fullDate(detail.date)}</time>
                  </div>

                  <div className="eph-inbox-bodywrap">
                    {/* Rendered as plain text on purpose. Inbound mail is
                        untrusted input, so no HTML and no remote images are
                        ever put on the page. */}
                    <pre className="eph-inbox-body">{detail.body || '(this message has no readable text part)'}</pre>
                  </div>

                  <p className="eph-inbox-replyhint">
                    Replies go from Gmail for now.{' '}
                    <a href={`mailto:${detail.from_email}?subject=${encodeURIComponent('Re: ' + detail.subject)}`}>
                      Open a reply
                    </a>
                  </p>
                </article>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({
  count, mailbox, onRefresh, refreshing,
}: { count: number; mailbox?: string; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <header className="eph-inbox-head">
      <div>
        <h1>Inbox</h1>
        <p>
          The <code>{mailbox ?? 'Ephermal'}</code> label, read over IMAP.
          {count > 0 && <Badge className="eph-inbox-count">{count}</Badge>}
        </p>
      </div>
      {onRefresh && (
        <button type="button" onClick={onRefresh} disabled={refreshing} className="eph-inbox-refresh">
          {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      )}
    </header>
  );
}
