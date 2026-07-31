/**
 * Ephermal — Clerk Webhook Handler (Supabase Edge Function)
 *
 * Listens for Clerk user lifecycle events and triggers
 * transactional emails via the send-email Edge Function.
 *
 * Deploy: supabase functions deploy clerk-webhook
 *
 * verify_jwt is deliberately OFF — Clerk never sends a Supabase JWT, only
 * svix-* headers. This function's own verifyClerkSignature() (HMAC-SHA256
 * over svix-id.svix-timestamp.body, constant-time compare, 5-minute replay
 * window) IS the real auth boundary. Leaving verify_jwt:true here silently
 * rejects every real Clerk delivery with 401 before this code ever runs —
 * the same class of platform-gateway bug already found and fixed on
 * admin-api (see supabase/functions/admin-api/index.ts).
 *
 * Required secrets:
 *   CLERK_WEBHOOK_SECRET  — "whsec_..." from Clerk Dashboard → Webhooks → Signing Secret
 *
 * Auto-injected by Supabase:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Setup in Clerk Dashboard:
 *   1. Go to: Dashboard → Webhooks → Add Endpoint
 *   2. URL: https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/clerk-webhook
 *   3. Events to subscribe: user.created, user.deleted
 *   4. Copy the Signing Secret → add as CLERK_WEBHOOK_SECRET secret in Supabase
 */

import Stripe from 'https://esm.sh/stripe@14';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { USER_OWNED_TABLES } from '../_shared/user-owned-tables.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
    _stripe = new Stripe(key, { apiVersion: '2024-04-10' });
  }
  return _stripe;
}

// ── Constant-time string comparison (prevents timing attacks) ────────────────
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Clerk webhook signature verification (no external deps) ─────────────────
// Clerk signs webhooks using svix: HMAC-SHA256 over "{id}.{timestamp}.{body}"
// Secret is "whsec_" + base64-encoded key
async function verifyClerkSignature(
  body: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): Promise<boolean> {
  // Strip "whsec_" prefix and decode the raw key bytes
  const base64Key = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const keyBytes  = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );

  // Signed content format required by svix
  const signed    = `${svixId}.${svixTimestamp}.${body}`;
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signed));
  const computed  = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

  // svix-signature header format: "v1,<base64sig1> v1,<base64sig2>"
  const provided = svixSignature.split(' ')
    .filter(s => s.startsWith('v1,'))
    .map(s => s.slice(3));

  // Use constant-time comparison to prevent timing side-channel attacks
  return provided.some(sig => timingSafeEqual(sig, computed));
}

// ── Types ────────────────────────────────────────────────────────────────────
interface ClerkEmailAddress {
  email_address: string;
  verification?: { status: string };
}

interface ClerkUserCreatedEvent {
  type: 'user.created';
  data: {
    id: string;
    first_name: string | null;
    last_name:  string | null;
    email_addresses: ClerkEmailAddress[];
    primary_email_address_id: string;
    image_url?: string;
    created_at: number;
  };
}

interface ClerkUserDeletedEvent {
  type: 'user.deleted';
  data: { id: string; deleted?: boolean };
}

type ClerkEvent = ClerkUserCreatedEvent | ClerkUserDeletedEvent | { type: string; data: unknown };

// Out-of-band cleanup: the app's own delete-account endpoint (supabase/functions/
// delete-account/index.ts) already handles the normal self-serve deletion flow (Stripe
// cancel + row wipe + Clerk identity delete) triggered directly from the dashboard. This
// handler exists for the gap that leaves — a user removed straight from the Clerk Dashboard
// (or any other out-of-band path) never hits that endpoint, so without this the Stripe
// subscription would keep billing and every DB row would stay orphaned to a Clerk identity
// that no longer exists. The Clerk identity itself is already gone by the time this event
// arrives, so unlike delete-account there's nothing to delete on Clerk's side here.
async function cleanupDeletedUser(userId: string): Promise<void> {
  const { data: plan } = await supabase.from('user_plans').select('stripe_sub_id').eq('user_id', userId).single();
  const subId = plan?.stripe_sub_id as string | undefined;
  if (subId) {
    try {
      await getStripe().subscriptions.cancel(subId);
      console.log(`✓ Stripe subscription ${subId} cancelled for out-of-band Clerk deletion (${userId})`);
    } catch (e) {
      console.error(`Stripe cancel failed for out-of-band Clerk deletion of ${userId}:`, e);
    }
  }

  for (const table of USER_OWNED_TABLES) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) console.error(`clerk-webhook user.deleted: failed to clear ${table} for ${userId}:`, error.message);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getPrimaryEmail(data: ClerkUserCreatedEvent['data']): string | null {
  // Prefer the primary email address
  const primary = data.email_addresses.find(
    e => e.email_address && e.verification?.status === 'verified'
  ) ?? data.email_addresses[0];
  return primary?.email_address ?? null;
}

function getFirstName(data: ClerkUserCreatedEvent['data']): string {
  return data.first_name?.trim() || 'there';
}

async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      template: 'welcome',
      to:       email,
      vars:     { name },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`send-email failed: ${res.status} ${err}`);
  }

  console.log(`✓ Welcome email sent to ${email} (${name})`);
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = Deno.env.get('CLERK_WEBHOOK_SECRET');
  if (!secret) {
    console.error('CLERK_WEBHOOK_SECRET not set');
    return new Response('Webhook not configured', { status: 503 });
  }

  // ── Verify Clerk signature ─────────────────────────────────────────────────
  const svixId        = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 });
  }

  // Reject replays older than 5 minutes
  const tsSeconds = parseInt(svixTimestamp, 10);
  if (isNaN(tsSeconds) || Math.abs(Date.now() / 1000 - tsSeconds) > 300) {
    return new Response('Webhook timestamp expired', { status: 400 });
  }

  const body = await req.text();

  const valid = await verifyClerkSignature(body, svixId, svixTimestamp, svixSignature, secret);
  if (!valid) {
    console.error('Clerk webhook signature verification failed');
    return new Response('Invalid signature', { status: 400 });
  }

  let event: ClerkEvent;
  try {
    event = JSON.parse(body) as ClerkEvent;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  // ── Handle events ──────────────────────────────────────────────────────────
  try {
    if (event.type === 'user.created') {
      const data  = (event as ClerkUserCreatedEvent).data;
      const email = getPrimaryEmail(data);
      const name  = getFirstName(data);
      const userId = data.id;

      // Seed default database rows so dashboard loads without 406s
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Prefer': 'resolution=ignore-duplicates',
      };

      const seedResults = await Promise.allSettled([
        // Default starter plan (no subscription yet)
        fetch(`${supabaseUrl}/rest/v1/user_plans`, {
          method: 'POST', headers,
          body: JSON.stringify({ user_id: userId, plan: 'starter', period_end: null }),
        }),
        // Empty integrations row
        fetch(`${supabaseUrl}/rest/v1/user_integrations`, {
          method: 'POST', headers,
          body: JSON.stringify({ user_id: userId }),
        }),
      ]);
      for (const r of seedResults) {
        if (r.status === 'rejected') {
          console.error('Default-row seed failed for', userId, ':', r.reason);
        }
      }

      if (!email) {
        console.warn('user.created event has no email — skipping welcome email', userId);
        return new Response(JSON.stringify({ received: true, skipped: 'no_email' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await sendWelcomeEmail(email, name);
    } else if (event.type === 'user.deleted') {
      const data = (event as ClerkUserDeletedEvent).data;
      if (data.id) await cleanupDeletedUser(data.id);
    }
  } catch (err) {
    // Log server-side, return 200 so Clerk doesn't retry indefinitely
    console.error('Handler error for', event.type, ':', err);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
