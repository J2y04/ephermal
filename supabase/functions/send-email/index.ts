/**
 * Ephermal — Send Email (Supabase Edge Function)
 *
 * Sends transactional emails via Resend.
 * Reads HTML templates from ./templates/, substitutes {{variables}}.
 *
 * Deploy: supabase functions deploy send-email
 *
 * Required secrets:
 *   RESEND_API_KEY  — re_... from resend.com/api-keys
 *   FROM_EMAIL      — e.g. "Ephermal <hello@ephermal.app>"
 *                     Domain must be verified in Resend dashboard.
 *
 * POST body:
 *   {
 *     "template": "welcome",          // filename without .html
 *     "to":       "user@example.com",
 *     "subject":  "Welcome to Ephermal",
 *     "vars":     { "name": "Jamal", "unsubscribe_url": "https://..." }
 *   }
 *
 * Internal calls only — no user-facing auth required.
 * Call from other Edge Functions or n8n using the service role key.
 */

import { TEMPLATE_HTML } from './templates.ts';
import { captureError } from '../_shared/sentry.ts';

const RESEND_API = 'https://api.resend.com/emails';

function timingSafeEqual(a: string, b: string): boolean {
  const ae = new TextEncoder().encode(a);
  const be = new TextEncoder().encode(b);
  if (ae.length !== be.length) return false;
  let diff = 0;
  for (let i = 0; i < ae.length; i++) diff |= ae[i] ^ be[i];
  return diff === 0;
}

// Template registry — maps template name → subject default
const TEMPLATES: Record<string, { subject: string }> = {
  welcome:                   { subject: 'Welcome to Ephermal 🚀' },
  plan_activated_starter:    { subject: 'Your Starter plan is live — let\'s make your first ad' },
  plan_activated_growth:     { subject: '⚡ Growth is live — your AI ad engine is unlocked' },
  plan_activated_scale:      { subject: '🚀 Scale is live — the full operator stack is yours' },
  fatigue_alert:             { subject: '⚠️ Ad fatigue detected — take action now' },
  ai_limit_80:               { subject: 'You\'re running low on AI messages' },
  ai_limit_hit:              { subject: 'AI message limit reached — top up to continue' },
  ai_topup_receipt:          { subject: 'AI top-up confirmed — your messages are ready' },
  ugc_video_topup_receipt:   { subject: 'UGC video credits added — ready to generate' },
  payment_failed:            { subject: 'Payment failed — update your card to keep Ephermal running' },
  tester_invite:             { subject: 'Your Ephermal tester access — 3 months of Growth, free' },
  campaign_ready:            { subject: 'Your campaign is ready to review' },
  contact_enquiry:           { subject: 'New enquiry from ephermal.app' },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Replace {{variable}} placeholders in a template string, HTML-escaping all values */
function renderTemplate(html: string, vars: Record<string, string> = {}): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(vars[key] ?? ''));
}

// Basic RFC-5321 email format guard — prevents header injection
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // ── Auth: only service-role callers may send email ──────────────────────
  // All callers (stripe-webhook, clerk-webhook, n8n) pass the service role key.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader     = req.headers.get('Authorization') ?? '';
  const callerToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!serviceRoleKey || !timingSafeEqual(callerToken, serviceRoleKey)) {
    // Generic 401 — don't reveal whether the key exists
    return new Response('Unauthorized', { status: 401 });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'Ephermal <hello@ephermal.app>';

  if (!resendKey) {
    captureError('send-email', 'RESEND_API_KEY not set');
    return new Response('Email service not configured', { status: 503 });
  }

  let body: { template: string; to: string; subject?: string; vars?: Record<string, string>; reply_to?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { template, to, subject, vars = {}, reply_to } = body;

  if (!template || !to) {
    return new Response('Missing required fields: template, to', { status: 400 });
  }

  // ── Validate email format to prevent header injection ───────────────────
  if (typeof to !== 'string' || !EMAIL_RE.test(to.trim()) || to.length > 320) {
    return new Response('Invalid email address', { status: 400 });
  }

  // ── Template allowlist prevents filesystem traversal ────────────────────
  if (!TEMPLATES[template]) {
    return new Response('Unknown template', { status: 400 });
  }

  // Template HTML is inlined in templates.ts (see that file's docblock for why) — not read
  // from the filesystem, so this can never fail due to a bundling/deploy quirk.
  const templateHtml = TEMPLATE_HTML[template];
  if (!templateHtml) {
    captureError('send-email', `Template not found in TEMPLATE_HTML: ${template}`);
    return new Response('Template not found', { status: 500 });
  }

  // Render — substitute {{variables}}
  const html = renderTemplate(templateHtml, {
    unsubscribe_url: 'https://ephermal.app/unsubscribe',
    ...vars,
  });

  const emailSubject = subject ?? TEMPLATES[template].subject;

  // Reject a malformed reply_to outright rather than silently dropping it: a
  // caller that asked for one and did not get it would look like a working send
  // whose replies quietly go nowhere useful.
  const replyTo = typeof reply_to === 'string' ? reply_to.trim() : '';
  if (replyTo && (!EMAIL_RE.test(replyTo) || replyTo.length > 320)) {
    return new Response('Invalid reply_to address', { status: 400 });
  }

  // Send via Resend
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    fromEmail,
      to:      [to],
      subject: emailSubject,
      html,
      // Only set for enquiry mail, where a reply has to reach the person who
      // wrote in rather than our own from-address. Validated against the same
      // regex as `to`, so it cannot be used to inject a header.
      ...(replyTo ? { reply_to: [replyTo] } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    captureError('send-email', 'Resend error:', res.status, err);
    return new Response('Failed to send email', { status: 502 });
  }

  const data = await res.json();
  console.log(`✓ Email sent [${template}] to ${to} — id: ${data.id}`);

  return new Response(JSON.stringify({ sent: true, id: data.id }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
