/**
 * Ephermal — Contact form (Supabase Edge Function)
 *
 * POST { email, message, name?, company?, website? }
 *
 * Public and unauthenticated, because the whole point is that someone who does
 * not have an account can reach us. Everything here exists because of that:
 *
 *   - 3 sends per IP per hour, and a global daily ceiling, so one bad actor
 *     cannot turn this into an outbound spam relay or run up the Resend bill
 *   - `website` is a honeypot. It is hidden from real users, so anything that
 *     fills it in is a bot. Those get a 200 and are silently dropped, because a
 *     visible rejection just teaches the bot to try again without it.
 *   - fields are length-capped and the message is delivered as plain text, so
 *     nothing a stranger types can shape the HTML of the email Jamal opens
 *
 * Replaces the mailto: link, which testers reported doing nothing on machines
 * with no desktop mail client configured. Most people browsing on a phone or a
 * work laptop are in exactly that position.
 *
 * Deploy: supabase functions deploy contact-sales
 */

import { corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitIp, rateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SALES_INBOX = Deno.env.get('SALES_INBOX') ?? 'hello@ephermal.app';

function clean(v: unknown, max: number): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const ipLimit = await rateLimitIp(req, 'contact-sales', 3, 3600);
  if (!ipLimit.allowed) return rateLimitResponse(origin, ipLimit.resetIn);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  // Honeypot. A human never sees this field, so a value means automation.
  // Answer 200 so the bot records a success and does not adapt.
  if (clean(body.website, 200)) return okResponse({ ok: true }, origin);

  const email = clean(body.email, 200).toLowerCase();
  const message = String(body.message ?? '').trim().slice(0, 4000);
  const name = clean(body.name, 120);
  const company = clean(body.company, 160);

  if (!EMAIL_RE.test(email)) return errResponse('Please enter a valid email address', 400, origin);
  if (message.length < 10) return errResponse('Please add a little more detail so we can actually help', 400, origin);

  // Ceiling across everyone. A distributed flood still cannot run the bill up.
  const globalLimit = await rateLimit('global', 'contact-sales-daily', 200, 86400);
  if (!globalLimit.allowed) return rateLimitResponse(origin, globalLimit.resetIn);

  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template: 'contact_enquiry',
        to: SALES_INBOX,
        subject: `Ephermal enquiry from ${name || email}`,
        // send-email HTML-escapes every var when rendering the template, so
        // nothing a stranger types can reshape the email.
        vars: {
          name: name || 'Someone',
          from_email: email,
          company_suffix: company ? ` · ${company}` : '',
          message,
        },
        // Replies go to the person who wrote in, not back to our own inbox.
        reply_to: email,
      }),
    });
    if (!res.ok) {
      console.error('[contact-sales] send-email failed:', res.status, (await res.text()).slice(0, 300));
      return errResponse('We could not send that just now. Please email hello@ephermal.app directly.', 502, origin);
    }
  } catch (e) {
    console.error('[contact-sales]', (e as Error).message);
    return errResponse('We could not send that just now. Please email hello@ephermal.app directly.', 502, origin);
  }

  return okResponse({ ok: true }, origin);
});
