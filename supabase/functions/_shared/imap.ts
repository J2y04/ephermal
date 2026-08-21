/**
 * Ephermal — Minimal read-only IMAP client (shared)
 *
 * Enough IMAP to list and read a Gmail label, and deliberately no more. There
 * is no npm client here because the Supabase edge runtime is not a place to
 * find out whether a Node-targeted library's socket handling survives; raw TLS
 * was verified working against imap.gmail.com:993 before this was written.
 *
 * Read-only by construction. The only commands issued are LOGIN, EXAMINE
 * (SELECT's read-only twin, so the server itself refuses writes and \Seen flags
 * are never set), SEARCH, FETCH and LOGOUT. Nothing here can delete or alter a
 * message, which matters when the mailbox is Jamal's personal Gmail.
 */

const CRLF = '\r\n';

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface Envelope {
  uid: string;
  subject: string;
  from: string;
  fromEmail: string;
  to: string;
  date: string;
  seen: boolean;
  snippet: string;
}

/** Decode RFC 2047 encoded-words, which is how non-ASCII subjects arrive. */
export function decodeMime(input: string): string {
  if (!input) return '';
  return input.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_m, charset: string, enc: string, text: string) => {
      try {
        let bytes: Uint8Array;
        if (enc.toUpperCase() === 'B') {
          const bin = atob(text);
          bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        } else {
          const fixed = text.replace(/_/g, ' ');
          const out: number[] = [];
          for (let i = 0; i < fixed.length; i++) {
            if (fixed[i] === '=' && i + 2 < fixed.length) {
              out.push(parseInt(fixed.slice(i + 1, i + 3), 16));
              i += 2;
            } else {
              out.push(fixed.charCodeAt(i));
            }
          }
          bytes = new Uint8Array(out);
        }
        return new TextDecoder(charset.toLowerCase()).decode(bytes);
      } catch {
        return text;
      }
    },
  ).replace(/\?=\s+=\?/g, '');
}

export function extractEmail(header: string): string {
  const angle = header.match(/<([^>]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  const bare = header.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return bare ? bare[0].toLowerCase() : '';
}

export class ImapClient {
  private conn: Deno.TlsConn | null = null;
  private buf = '';
  private tag = 0;
  private dec = new TextDecoder();
  private enc = new TextEncoder();

  constructor(private cfg: ImapConfig) {}

  async connect(): Promise<void> {
    this.conn = await Deno.connectTls({ hostname: this.cfg.host, port: this.cfg.port });
    await this.readUntil(l => l.startsWith('* OK'));
  }

  private async readChunk(): Promise<boolean> {
    if (!this.conn) return false;
    const b = new Uint8Array(65536);
    const n = await this.conn.read(b);
    if (n === null) return false;
    this.buf += this.dec.decode(b.subarray(0, n));
    return true;
  }

  /** Read until a predicate matches a completed line. */
  private async readUntil(done: (line: string) => boolean, capMs = 20000): Promise<string> {
    const started = Date.now();
    let acc = '';
    for (;;) {
      const idx = this.buf.indexOf(CRLF);
      if (idx === -1) {
        if (Date.now() - started > capMs) throw new Error('IMAP read timeout');
        if (!(await this.readChunk())) throw new Error('IMAP connection closed');
        continue;
      }
      const line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 2);
      acc += line + '\n';
      if (done(line)) return acc;
    }
  }

  /**
   * Issue a command and collect everything up to its tagged completion.
   * Literals ({N}) are honoured: the server announces a byte count and the
   * bytes that follow are not line-oriented, so they are consumed by length.
   */
  private async cmd(command: string): Promise<string> {
    if (!this.conn) throw new Error('not connected');
    const tag = `A${String(++this.tag).padStart(4, '0')}`;
    await this.conn.write(this.enc.encode(`${tag} ${command}${CRLF}`));

    let acc = '';
    for (;;) {
      const idx = this.buf.indexOf(CRLF);
      if (idx === -1) {
        if (!(await this.readChunk())) throw new Error('IMAP connection closed');
        continue;
      }
      const line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 2);

      const lit = line.match(/\{(\d+)\}$/);
      if (lit) {
        const want = parseInt(lit[1], 10);
        while (this.buf.length < want) {
          if (!(await this.readChunk())) throw new Error('IMAP connection closed mid-literal');
        }
        acc += line + '\n' + this.buf.slice(0, want) + '\n';
        this.buf = this.buf.slice(want);
        continue;
      }

      acc += line + '\n';
      if (line.startsWith(`${tag} `)) {
        if (/^\S+ (NO|BAD)/.test(line)) {
          // Never echo the server's text back verbatim to a client; it can
          // contain the mailbox name and account hints.
          throw new Error(`IMAP command rejected: ${command.split(' ')[0]}`);
        }
        return acc;
      }
    }
  }

  async login(): Promise<void> {
    // Quote and escape, so a password containing a quote or backslash cannot
    // terminate the literal early.
    const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    await this.cmd(`LOGIN ${q(this.cfg.user)} ${q(this.cfg.pass)}`);
  }

  /** EXAMINE, not SELECT: the mailbox is opened read-only. */
  async examine(mailbox: string): Promise<number> {
    const res = await this.cmd(`EXAMINE "${mailbox.replace(/"/g, '\\"')}"`);
    const m = res.match(/\* (\d+) EXISTS/);
    return m ? parseInt(m[1], 10) : 0;
  }

  async listMailboxes(): Promise<string[]> {
    const res = await this.cmd('LIST "" "*"');
    const out: string[] = [];
    for (const line of res.split('\n')) {
      const m = line.match(/^\* LIST \([^)]*\) "[^"]*" (.+)$/);
      if (m) out.push(m[1].trim().replace(/^"|"$/g, ''));
    }
    return out;
  }

  /**
   * Newest `limit` messages in the open mailbox, as envelopes.
   *
   * Headers are fetched with BODY.PEEK[] rather than BODY[], because BODY[]
   * sets \Seen and would silently mark Jamal's real mail as read just because
   * an admin page rendered.
   */
  async fetchRecent(total: number, limit: number): Promise<Envelope[]> {
    if (total === 0) return [];
    const from = Math.max(1, total - limit + 1);
    const res = await this.cmd(
      `FETCH ${from}:${total} (UID FLAGS BODY.PEEK[HEADER.FIELDS (SUBJECT FROM TO CC DELIVERED-TO X-FORWARDED-TO DATE)])`,
    );

    const out: Envelope[] = [];
    // Each message begins at an untagged "* n FETCH".
    const blocks = res.split(/\n(?=\* \d+ FETCH )/);
    for (const block of blocks) {
      if (!/^\* \d+ FETCH /.test(block)) continue;
      const uid = (block.match(/UID (\d+)/) || [])[1] ?? '';
      const seen = /\\Seen/.test((block.match(/FLAGS \(([^)]*)\)/) || [])[1] ?? '');

      const header = (field: string) => {
        const re = new RegExp(`^${field}:\\s*([\\s\\S]*?)(?=\\n[A-Za-z-]+:|\\n\\)|$)`, 'im');
        const m = block.match(re);
        return m ? m[1].replace(/\s*\n\s+/g, ' ').trim() : '';
      };

      const fromRaw = decodeMime(header('From'));
      out.push({
        uid,
        subject: decodeMime(header('Subject')) || '(no subject)',
        from: fromRaw.replace(/<[^>]*>/, '').replace(/"/g, '').trim() || extractEmail(fromRaw),
        fromEmail: extractEmail(fromRaw),
        to: [header('To'), header('Cc'), header('Delivered-To'), header('X-Forwarded-To')]
          .filter(Boolean).join(', '),
        date: header('Date'),
        seen,
        snippet: '',
      });
    }
    return out.reverse();
  }

  /** Full text of one message by UID, peeked so it stays unread. */
  async fetchBody(uid: string): Promise<string> {
    const res = await this.cmd(`UID FETCH ${uid} (BODY.PEEK[TEXT])`);
    const lit = res.indexOf('}\n');
    if (lit === -1) return '';
    const body = res.slice(lit + 2);
    return body.replace(/\n\)\n?A\d+ OK[\s\S]*$/, '').trim();
  }

  async logout(): Promise<void> {
    try { if (this.conn) await this.cmd('LOGOUT'); } catch { /* closing anyway */ }
    this.close();
  }

  close(): void {
    try { this.conn?.close(); } catch { /* already gone */ }
    this.conn = null;
  }
}
