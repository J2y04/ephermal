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

/**
 * Parse an RFC 5322 header block into a lowercased field map.
 *
 * This replaced a regex-per-field lookup that had a real bug: the pattern
 * `^Field:\s*(...)` used a greedy `\s*` after the colon, and `\s` includes the
 * newline. So a header with an EMPTY value swallowed the line break and
 * captured the NEXT header as its own value. A message sent with a blank
 * subject came back with its subject set to "To: hello@ephermal.app".
 *
 * Parsing line by line removes the whole class of problem: empty values stay
 * empty, folded continuation lines (RFC 5322 section 2.2.3, a line beginning
 * with space or tab) are joined onto the field they belong to, and field order
 * is irrelevant.
 */
export function parseHeaderBlock(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  let current: string | null = null;

  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '');

    // The IMAP framing around the headers, not headers themselves.
    if (/^\* \d+ FETCH /.test(line) || /^A\d+ (OK|NO|BAD)/.test(line)) { current = null; continue; }
    if (line === ')' || line === '') { current = null; continue; }

    // Folded continuation of the previous field.
    if (/^[ \t]/.test(line)) {
      if (current) out[current] = (out[current] + ' ' + line.trim()).trim();
      continue;
    }

    const colon = line.indexOf(':');
    if (colon <= 0) { current = null; continue; }

    const name = line.slice(0, colon).trim().toLowerCase();
    // A field name cannot contain whitespace; anything that does is framing.
    if (!name || /\s/.test(name)) { current = null; continue; }

    out[name] = line.slice(colon + 1).trim();
    current = name;
  }
  return out;
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

      const headers = parseHeaderBlock(block);
      const header = (field: string) => headers[field.toLowerCase()] ?? '';

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

  /**
   * Full raw text of one message by UID, peeked so it stays unread.
   *
   * This is the MIME body as sent: for anything but the simplest message that
   * means boundaries, per-part headers and encoded text. Use readableBody() to
   * turn it into something a human should look at.
   */
  async fetchBody(uid: string): Promise<string> {
    const res = await this.cmd(`UID FETCH ${uid} (BODY.PEEK[TEXT])`);
    const lit = res.indexOf('}\n');
    if (lit === -1) return '';
    const body = res.slice(lit + 2);
    return body.replace(/\n\)\n?A\d+ OK[\s\S]*$/, '').trim();
  }

  /** The Content-Type of the message itself, needed to find the MIME boundary. */
  async fetchContentType(uid: string): Promise<string> {
    const res = await this.cmd(`UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (CONTENT-TYPE CONTENT-TRANSFER-ENCODING)])`);
    const h = parseHeaderBlock(res);
    const ct = h['content-type'] ?? '';
    const cte = h['content-transfer-encoding'] ?? '';
    return cte ? `${ct} ${cte}` : ct;
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

/* ---------------------------------------------------------------------------
   MIME body decoding
   ---------------------------------------------------------------------------
   The admin inbox first shipped rendering BODY[TEXT] verbatim, which for any
   multipart message means the reader saw this:

     --0000000000003f130b06582a27e5 Content-Type: text/plain; charset="UTF-8"
     Jo was geht ich bin Noah W . --0000000000003f130b06582a27e5 ...

   The message was three words. Everything else was envelope.

   These functions turn a raw MIME body into the text a person meant to send:
   pick the readable part, decode its transfer encoding, then decode its
   charset.
   --------------------------------------------------------------------------- */

/**
 * Decode quoted-printable to BYTES, not to characters.
 *
 * The first version used String.fromCharCode on each decoded octet, which
 * turns the UTF-8 sequence for a non-breaking space (=C2=A0) into the two
 * separate characters "Â ". Every accented character in a German email came
 * out mojibaked for the same reason. Quoted-printable encodes bytes, so it has
 * to decode to bytes and let the charset decide what they mean.
 */
function decodeQuotedPrintableBytes(input: string): Uint8Array {
  // Soft line breaks: an "=" at end of line means the line was wrapped.
  const joined = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    const ch = joined[i];
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = joined.charCodeAt(i);
      // Anything above the byte range is already a decoded character; push its
      // UTF-8 bytes so the decoder below sees a consistent stream.
      if (code < 256) bytes.push(code);
      else for (const b of new TextEncoder().encode(ch)) bytes.push(b);
    }
  }
  return new Uint8Array(bytes);
}

function decodeBase64Bytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/=]/g, '');
  try {
    const bin = atob(clean);
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  } catch {
    return new TextEncoder().encode(input);
  }
}

function decodeCharset(bytes: Uint8Array, charset: string): string {
  const cs = (charset || 'utf-8').toLowerCase().replace(/["']/g, '').trim();
  try {
    return new TextDecoder(cs).decode(bytes);
  } catch {
    // Unknown or bogus charset: UTF-8 is right far more often than not.
    try { return new TextDecoder('utf-8').decode(bytes); } catch { return ''; }
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

interface MimePart {
  contentType: string;
  encoding: string;
  charset: string;
  body: string;
}

function splitPart(raw: string): MimePart {
  // Headers end at the first blank line. A part with no blank line is all body.
  const sep = raw.search(/\r?\n\r?\n/);
  if (sep === -1) {
    return { contentType: 'text/plain', encoding: '7bit', charset: 'utf-8', body: raw };
  }
  const headerText = raw.slice(0, sep);
  const body = raw.slice(sep).replace(/^\r?\n\r?\n/, '');

  const get = (name: string) => {
    const m = headerText.match(new RegExp(`^${name}:\\s*(.*(?:\\r?\\n[ \\t].*)*)`, 'im'));
    return m ? m[1].replace(/\r?\n[ \t]+/g, ' ').trim() : '';
  };

  const ct = get('Content-Type') || 'text/plain';
  const charsetMatch = ct.match(/charset\s*=\s*"?([^";\s]+)"?/i);

  return {
    contentType: ct.split(';')[0].trim().toLowerCase(),
    encoding: (get('Content-Transfer-Encoding') || '7bit').toLowerCase(),
    charset: charsetMatch ? charsetMatch[1] : 'utf-8',
    body,
  };
}

function decodePart(part: MimePart): string {
  let bytes: Uint8Array;
  if (part.encoding === 'quoted-printable') bytes = decodeQuotedPrintableBytes(part.body);
  else if (part.encoding === 'base64')      bytes = decodeBase64Bytes(part.body);
  else                                       bytes = new TextEncoder().encode(part.body);

  const text = decodeCharset(bytes, part.charset);
  return part.contentType === 'text/html' ? htmlToText(text) : text;
}

/**
 * Turn a raw MIME body into readable text.
 *
 * Prefers text/plain, falls back to text/html stripped to text, and recurses
 * into nested multiparts (multipart/alternative inside multipart/mixed is the
 * normal shape once an attachment is involved). Attachments themselves are
 * skipped: this is a reader, not a downloader.
 *
 * `contentTypeHeader` is the MESSAGE's own Content-Type, which is where the
 * boundary lives. Without it a multipart body cannot be split, which is
 * precisely why the first version rendered the boundaries as text.
 */
export function readableBody(raw: string, contentTypeHeader: string, depth = 0): string {
  if (!raw) return '';
  if (depth > 4) return raw.trim();   // pathological nesting; stop.

  const boundaryMatch = contentTypeHeader.match(/boundary\s*=\s*"?([^";\s]+)"?/i);

  if (!boundaryMatch) {
    // Single-part message: the message headers describe the body directly.
    const encMatch = contentTypeHeader.match(/\b(quoted-printable|base64)\b/i);
    const csMatch  = contentTypeHeader.match(/charset\s*=\s*"?([^";\s]+)"?/i);
    const isHtml   = /text\/html/i.test(contentTypeHeader);
    return decodePart({
      contentType: isHtml ? 'text/html' : 'text/plain',
      encoding: encMatch ? encMatch[1].toLowerCase() : '7bit',
      charset: csMatch ? csMatch[1] : 'utf-8',
      body: raw,
    }).trim();
  }

  const boundary = boundaryMatch[1];
  const chunks = raw
    .split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(--)?\\r?\\n?`))
    .filter(c => c && c.trim() && c !== '--');

  const parts = chunks.map(splitPart);

  // Nested multipart: recurse using that part's own boundary.
  for (const p of parts) {
    if (p.contentType.startsWith('multipart/')) {
      const inner = readableBody(p.body, p.contentType + '; ' + (p.body.match(/boundary="?[^";\s]+"?/i)?.[0] ?? ''), depth + 1);
      if (inner.trim()) return inner;
    }
  }

  const plain = parts.find(p => p.contentType === 'text/plain');
  if (plain) {
    const t = decodePart(plain).trim();
    if (t) return t;
  }

  const html = parts.find(p => p.contentType === 'text/html');
  if (html) {
    const t = decodePart(html).trim();
    if (t) return t;
  }

  // Nothing readable: say so rather than dumping envelope at the reader.
  return '';
}
