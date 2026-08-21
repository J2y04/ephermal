/**
 * Ephermal — Error reporting (shared)
 *
 * Jamal's reason for this, verbatim: if something is crashing silently, Sentry
 * is the only one that notices. Edge functions log to a console nobody reads,
 * and the failures that matter most are exactly the ones that return a tidy
 * error to the user and never surface again.
 *
 * No SDK. The Sentry envelope endpoint is a plain HTTPS POST, and pulling a
 * browser-targeted SDK into the edge runtime to build one JSON body would be
 * more risk than it removes.
 *
 * Fails silent by design. If SENTRY_DSN is unset, malformed, or Sentry itself
 * is down, this does nothing and never throws. An error reporter that can break
 * a request is worse than no error reporter.
 */

interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

let _dsn: ParsedDsn | null | undefined;

function parseDsn(): ParsedDsn | null {
  if (_dsn !== undefined) return _dsn;

  const raw = Deno.env.get('SENTRY_DSN');
  if (!raw) { _dsn = null; return null; }

  try {
    // https://<publicKey>@<host>/<projectId>
    const u = new URL(raw);
    const projectId = u.pathname.replace(/^\//, '');
    if (!u.username || !projectId) throw new Error('incomplete DSN');
    _dsn = {
      endpoint: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
      publicKey: u.username,
    };
  } catch {
    console.error('[sentry] SENTRY_DSN is set but not a valid DSN; reporting disabled');
    _dsn = null;
  }
  return _dsn;
}

/** Strip anything that should never leave the server. */
function scrub(value: unknown): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return s
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[redacted]')
    .replace(/\b(sk_live|sk_test|rk_live|whsec)_[A-Za-z0-9]+/g, '$1_[redacted]')
    .replace(/("?(?:password|app_password|token|secret|api_?key)"?\s*[:=]\s*)"?[^",}\s]+/gi, '$1[redacted]')
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, m => {
      // Keep the domain, drop the local part: enough to tell a tester from a
      // bot, not enough to be a mailing list.
      const [, domain] = m.split('@');
      return `[email]@${domain}`;
    })
    .slice(0, 4000);
}

/**
 * Report an exception. Never throws, never blocks the caller's response.
 *
 * `context` is a flat bag of tags (function name, action, user id). Values are
 * scrubbed the same way the message is.
 */
export function captureException(err: unknown, context: Record<string, unknown> = {}): void {
  const dsn = parseDsn();
  if (!dsn) return;

  try {
    const error = err instanceof Error ? err : new Error(String(err));
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const sentAt = new Date().toISOString();

    const tags: Record<string, string> = {};
    for (const [k, v] of Object.entries(context)) {
      if (v === undefined || v === null) continue;
      tags[k] = scrub(v).slice(0, 200);
    }

    const event = {
      event_id: eventId,
      timestamp: sentAt,
      platform: 'javascript',
      level: 'error',
      logger: 'edge',
      server_name: 'supabase-edge',
      environment: Deno.env.get('SENTRY_ENVIRONMENT') ?? 'production',
      tags,
      exception: {
        values: [{
          type: error.name || 'Error',
          value: scrub(error.message),
          stacktrace: error.stack
            ? { frames: error.stack.split('\n').slice(1, 12).reverse().map(line => ({ filename: scrub(line.trim()) })) }
            : undefined,
        }],
      },
    };

    const envelope =
      JSON.stringify({ event_id: eventId, sent_at: sentAt, dsn: undefined }) + '\n' +
      JSON.stringify({ type: 'event' }) + '\n' +
      JSON.stringify(event) + '\n';

    // Deliberately not awaited. Reporting must never add latency to, or fail,
    // the request that is already going wrong.
    fetch(dsn.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': [
          'Sentry sentry_version=7',
          'sentry_client=ephermal-edge/1.0',
          `sentry_key=${dsn.publicKey}`,
        ].join(', '),
      },
      body: envelope,
    }).catch(() => { /* reporting is best effort */ });
  } catch {
    /* never let the reporter break the caller */
  }
}

/** True when reporting is actually configured, for health checks. */
export function sentryConfigured(): boolean {
  return parseDsn() !== null;
}
