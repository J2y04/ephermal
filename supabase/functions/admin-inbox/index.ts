/**
 * Ephermal — Admin Inbox (Supabase Edge Function)
 *
 * Reads the `Ephermal` Gmail label over IMAP and renders it in the admin panel,
 * so support mail does not live in a second browser tab.
 *
 * POST { action: 'list' }              -> newest messages, filtered
 * POST { action: 'message', uid: '..' } -> one message body
 *
 * THE FILTER IS THE POINT. Only mail addressed to an @ephermal.app address is
 * returned. The Gmail label is a routing convenience and catches more than
 * that, so the label alone is not trusted: every message is checked against its
 * own recipient headers, and anything that does not name an @ephermal.app
 * address is dropped before it reaches the client. Filtering happens here, on
 * the server, not in the UI, so a message that should not be visible is never
 * sent over the wire in the first place.
 *
 * Read-only throughout: the IMAP client issues EXAMINE rather than SELECT and
 * peeks bodies, so nothing is marked read, moved or deleted. This is Jamal's
 * personal mailbox.
 *
 * Required env vars:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *   CLERK_SECRET_KEY, APP_URL
 *   GMAIL_IMAP_USER, GMAIL_IMAP_APP_PASSWORD
 */

import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { requireAdmin } from '../_shared/admin.ts';
import { rateLimitTiered, rateLimitResponse } from '../_shared/rate-limit.ts';
import { ImapClient, extractEmail, type Envelope } from '../_shared/imap.ts';
import { captureError } from '../_shared/sentry.ts';
const MAILBOX = 'Ephermal';
const FETCH_WINDOW = 60;   // messages pulled from the server
const RETURN_MAX   = 40;   // messages returned after filtering
const OUR_DOMAIN   = '@ephermal.app';

/**
 * Does this message actually belong in the Ephermal inbox?
 *
 * Checks every recipient-ish header, not just To. ImprovMX forwards
 * @ephermal.app mail into Gmail and rewrites envelope routing, so the original
 * recipient often survives only in Delivered-To or X-Forwarded-To. Checking one
 * header would silently drop real support mail.
 *
 * Deliberately does NOT look at From: who sent it is irrelevant, what matters
 * is that it was addressed to us.
 */
function addressedToUs(env: Envelope): boolean {
  return env.to.toLowerCase().includes(OUR_DOMAIN);
}

function safeSnippet(raw: string, max = 200): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/=\r?\n/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Quoted-printable shows up constantly in forwarded mail; decode it for display. */
function decodeQP(s: string): string {
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)));
}

async function withClient<T>(fn: (c: ImapClient) => Promise<T>): Promise<T> {
  const user = Deno.env.get('GMAIL_IMAP_USER');
  const pass = Deno.env.get('GMAIL_IMAP_APP_PASSWORD');
  if (!user || !pass) throw new Error('IMAP credentials not configured');

  const client = new ImapClient({ host: 'imap.gmail.com', port: 993, user, pass });
  try {
    await client.connect();
    await client.login();
    return await fn(client);
  } finally {
    await client.logout();
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const userId = await extractUserId(req.headers.get('Authorization'));
  if (!userId) return errResponse('Unauthorized', 401, origin);

  const admin = await requireAdmin(userId);
  if (!admin.ok) return errResponse('Forbidden', 403, origin);

  // Each call opens a real TLS connection to Gmail, so this is capped tighter
  // than a normal read endpoint.
  const rl = await rateLimitTiered(userId, 'admin-inbox', [
    { max: 12,  window: 60   },
    { max: 120, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }
  const action = String(body.action ?? '');

  try {
    if (action === 'list') {
      const result = await withClient(async (c) => {
        const total = await c.examine(MAILBOX);
        const envelopes = await c.fetchRecent(total, FETCH_WINDOW);
        return { total, envelopes };
      });

      const kept = result.envelopes.filter(addressedToUs).slice(0, RETURN_MAX);
      return okResponse({
        messages: kept.map(m => ({
          uid: m.uid,
          subject: m.subject,
          from: m.from,
          from_email: m.fromEmail,
          to: m.to,
          date: m.date,
          seen: m.seen,
        })),
        mailbox: MAILBOX,
        scanned: result.envelopes.length,
        filtered_out: result.envelopes.length - kept.length,
      }, origin);
    }

    if (action === 'message') {
      const uid = String(body.uid ?? '');
      if (!/^\d+$/.test(uid)) return errResponse('Invalid message id', 400, origin);

      const data = await withClient(async (c) => {
        const total = await c.examine(MAILBOX);
        // Re-check the envelope rather than trusting the uid the client sent.
        // Without this, an admin could read any message in the mailbox by
        // guessing a uid, which would defeat the whole filter.
        const envelopes = await c.fetchRecent(total, FETCH_WINDOW);
        const match = envelopes.find(e => e.uid === uid);
        if (!match || !addressedToUs(match)) return null;
        const raw = await c.fetchBody(uid);
        return { match, raw };
      });

      if (!data) return errResponse('Message not found', 404, origin);

      return okResponse({
        uid,
        subject: data.match.subject,
        from: data.match.from,
        from_email: data.match.fromEmail,
        to: data.match.to,
        date: data.match.date,
        // Plain text only. The body is untrusted input rendered in an admin
        // panel, so no HTML and no remote images ever reach the page.
        body: safeSnippet(decodeQP(data.raw), 20000),
      }, origin);
    }

    if (action === 'mailboxes') {
      const boxes = await withClient(c => c.listMailboxes());
      return okResponse({ mailboxes: boxes }, origin);
    }

    return errResponse('Unknown action', 400, origin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    captureError('admin-inbox', e, 'action:', action);

    if (msg.includes('credentials not configured')) {
      return errResponse('Inbox is not configured yet. Set GMAIL_IMAP_USER and GMAIL_IMAP_APP_PASSWORD.', 503, origin);
    }
    if (msg.includes('LOGIN')) {
      return errResponse('Gmail rejected the app password. Regenerate it and update the secret.', 502, origin);
    }
    if (msg.includes('EXAMINE')) {
      return errResponse(`Could not open the "${MAILBOX}" label. Check the label exists and is visible in IMAP.`, 502, origin);
    }
    return errResponse('Could not reach the mailbox.', 502, origin);
  }
});
