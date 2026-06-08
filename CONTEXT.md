# Ephermal — Session Context

> Drop this file into a new Claude Code session with:
> `claude --context CONTEXT.md`
> or just paste it as the first message. Continue exactly where we left off.

---

## Project

**Ephermal** — AI advertising agent for Shopify stores. Reads your catalog, writes ads, generates UGC, launches across Meta and Google Ads.

**Production URL**: https://ephermal.app  
**GitHub**: https://github.com/J2y04/ephermal.git  
**Project path**: `C:\Users\jamal settah\Desktop\Projects\Ephermal\`

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js (server mode, NOT static export) + static HTML pages in `web/public/` |
| Auth | Clerk v5 browser SDK — publishable key `pk_live_Y2xlcmsuZXBoZXJtYWwuYXBwJA` |
| Database | Supabase (project `twfgnqddoqeqrjhgioxd`) — Third-Party Auth with Clerk (no JWT template) |
| Backend | Supabase Edge Functions (Deno/TypeScript) in `supabase/functions/` |
| Deployment | Vercel — Root Directory = `web`, production branch = `master` |
| Payments | Stripe (not yet configured — price IDs are placeholders) |

**Critical**: Vercel has TWO branches. `master` = production. `main` = preview. Always push to `origin/HEAD:master` for production.

---

## Git push pattern
```bash
git push origin HEAD:master   # production
git push origin HEAD:main     # preview only
```

---

## Key Files

| File | Purpose |
|------|---------|
| `web/public/dashboard.html` | Main app dashboard — all JS inline |
| `web/public/setup.html` | Onboarding / OAuth connection flow |
| `web/public/auth/login.html` | Clerk sign-in page |
| `web/public/auth/register.html` | Clerk sign-up page |
| `web/public/config.js` | Client-side config (API keys, URLs — no secrets) |
| `web/app/page.tsx` | Next.js landing page |
| `web/app/globals.css` | Landing page CSS |
| `supabase/functions/` | All Edge Functions |
| `supabase/migrations/` | DB migrations (run in Supabase SQL Editor) |

---

## Supabase Config

```
URL:  https://twfgnqddoqeqrjhgioxd.supabase.co
Anon: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3ZmducWRkb3FlcXJqaGdpb3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MTk3MjMsImV4cCI6MjA5NTE5NTcyM30.Qosoe62X7ZyPEArhm5Tbg2p97LBo8KQ5NQu9SsqE8k4
```

Supabase secrets that must be set (`supabase secrets set KEY=value`):
- `SHOPIFY_APP_KEY` — `1be2b522a704c34e1949034e774cf34d`
- `SHOPIFY_APP_SECRET` — (set by user)
- `GOOGLE_CLIENT_ID` — `1590993825-ucshnlj9hvj6f5tf2kscfj0n5iqb6j1l.apps.googleusercontent.com`
- `GOOGLE_CLIENT_SECRET` — (set by user)
- `GOOGLE_CALLBACK_URL` — `https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/google-oauth-callback`
- `GOOGLE_ADS_DEVELOPER_TOKEN` — (optional, apply at ads.google.com/aw/apicenter)
- `META_APP_SECRET` — (set by user)

---

## OAuth Architecture

All OAuth uses **server-side auth code flow** — tokens never in URLs.

### Pattern (Meta / Shopify / Google)
1. Browser generates `state = userId~sourcePage~nonce`, stores nonce in localStorage
2. Redirect to platform's OAuth URL
3. Platform redirects to Supabase Edge Function callback
4. Edge Function exchanges code → tokens, stores in `user_integrations` table
5. Creates one-time `oauth_claims` record (5-min TTL, UUID)
6. Redirects browser to `dashboard.html?platform_connected=1&claim=UUID&state=...`
7. Browser exchanges claim code via `claim-oauth` Edge Function → gets token payload
8. Token stored in localStorage, claim deleted

### Google OAuth
- Client ID in `config.js` → `window.GOOGLE_OAUTH_CLIENT_ID`
- Callback Edge Function: `google-oauth-callback`
- Scopes: `https://www.googleapis.com/auth/adwords`
- Refresh token stored in `user_integrations.google_refresh_token`

### Shopify OAuth
- App Key in `config.js` → `window.SHOPIFY_APP_KEY`
- Callback Edge Function: `shopify-oauth-callback`
- App URL: `https://ephermal.app`
- Redirect URL: `https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/shopify-oauth-callback`
- NOT embedded (standalone SaaS)

---

## Dashboard Auth / Redirect Logic

The dashboard has had a persistent redirect loop that was fixed across multiple commits.

### Current correct boot flow (`dashboard.html` boot IIFE):
1. Wait for `window.__clerkPending` (Clerk SDK load)
2. Call `window.Clerk.load()`, get user — if not found after 8s → show **inline** "Sign in →" card (NO redirect)
3. Set `window.__clerk = window.Clerk`
4. Run `loadPlanFromSupabase()`, `loadCreditsFromSupabase()`, `loadIntegrationsFromSupabase()` in parallel
5. Check OAuth return params (`?meta_connected=1`, `?shopify_connected=1`, `?google_connected=1`)
6. Setup redirect: only if `!oauthReturn && !setup_complete && !shopify_token && !meta_token && !google_account && !sessionStorage._setup_seen` → redirect to `/setup.html` once, set `_setup_seen`
7. Render dashboard

### `authFetch()` — NEVER redirects (this was the root cause of the loop)
- On missing token → return null silently
- On 401 → `console.warn` and return null
- The boot IIFE handles all auth; API calls must never redirect

### `login.html` behavior
- If Clerk user already present → immediately `window.location.replace('/dashboard.html')`
- This means ANY redirect to login.html from a logged-in user = infinite loop
- That's why authFetch must never redirect to login.html

---

## Pending Tasks

---
### 🔴 LAUNCH BLOCKERS

### Task 1 — ✅ GROQ_API_KEY — DONE
Set by user. All AI features (UGC generate, AI assistant, budget AI) are live.

### Task 2 — Stripe setup (billing is 100% broken without this)
1. Stripe Dashboard → Products → create Starter ($89), Growth ($199), Scale ($349) + 3 topup products
2. Set secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER/GROWTH/SCALE/TOPUP_5/10/20`
3. Update `window.STRIPE_PRICES` in `web/public/config.js` with real price IDs
4. Register Stripe webhook at: `https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/stripe-webhook`
   Events: `checkout.session.completed`, `customer.subscription.updated`, `payment_intent.succeeded`

### Task 3 — Register Clerk webhook in Clerk Dashboard
Even though CLERK_WEBHOOK_SECRET is set as Supabase secret, the endpoint must also be registered:
Clerk Dashboard → Webhooks → Add Endpoint → URL: `https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/clerk-webhook`
Subscribe to: `user.created`
Without this, new signups don't get default DB rows → 406 errors on first login.

### Task 4 — Resend setup (no emails sending without this)
```bash
supabase secrets set RESEND_API_KEY=re_...
```
Sign up at resend.com → verify domain `ephermal.app` → create API key.

### Task 5 — Set META_CALLBACK_URL as Supabase secret
```bash
supabase secrets set META_CALLBACK_URL=https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/meta-oauth-callback
```
Also add this URL to Meta App → Facebook Login → Valid OAuth Redirect URIs.

### Task 6 — Fill in legal placeholder fields (required in Germany)
Open these files, fill in the amber `[YOUR NAME]` / `[ADDRESS]` fields:
- `web/public/impressum.html` — your full name, street address, PLZ + city
- `web/public/privacy.html` — your name as Data Controller, address
- `web/public/terms.html` — your name as contracting party
Commit and push after editing.

### Task 7 — ✅ Cancellation UI — DONE
Cancel button added to billing section. Prefilled mailto link. EU compliant.

### Task 8 — ✅ Honest marketing copy — DONE (Jun 8 2026)
All fabricated stats, fake testimonials, and unbuilt feature claims removed from `web/app/page.tsx`.
Pushed to production as commit 65c4bb3.

### Task 9 — Clerk 2FA email template (visual branding)
The OTP/verification code emails sent by Clerk are plain white. Styled template is at:
`supabase/functions/send-email/templates/clerk_otp.html`
Steps to apply:
1. Go to Clerk Dashboard → Customization → Emails
2. Click "Sign-in code" template → Edit
3. Switch to "Custom" mode → paste the HTML from `clerk_otp.html`
4. Replace `{{code}}` — Clerk uses this exact variable name
5. Repeat for "Email verification code" and "Magic link" templates

---
### 🟡 INTEGRATION FIXES

### Task 10 — Fix Google OAuth
Add your email as test user: console.cloud.google.com → OAuth consent screen → Test users
Also add callback URL: Google Cloud → Credentials → OAuth 2.0 Client → Authorized Redirect URIs:
`https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/google-oauth-callback`

### Task 11 — Fix Shopify OAuth
Create dev store at partners.shopify.com → Stores → Development store
Confirm `SHOPIFY_APP_KEY` + `SHOPIFY_API_SECRET` are set as Supabase secrets

---
### 🟢 DEFERRED (don't block launch)

### Task 12 — Meta App Review (REQUIRED for real users to connect Meta Ads)
Without this, only manually-added test accounts can connect. Takes 1–4 weeks.
Meta Developer Dashboard → App Review → Request advanced access: `ads_management`, `ads_read`, `business_management`

### Task 13 — German VAT registration
- Gewerbeanmeldung at local Gewerbeamt (if not done)
- USt-ID via Finanzamt / elster.de
- Enable Stripe Tax: Stripe Dashboard → Settings → Tax

### Task 14 — Google Ads developer token
Apply at ads.google.com/aw/apicenter — needed before Google campaign launch works

### Task 15 — CodeRabbit automated PR review
coderabbit.ai → Sign in with GitHub → authorize J2y04/ephermal

### Task 16 — Error monitoring (Sentry)
Add Sentry free tier to dashboard.html — one script tag. Catches production errors before users report them.

### Task 17 — ✅ UGC text pipeline — DONE (Jun 8 2026)
Both dashboard UGC buttons now work end-to-end:
- `submitUGC()` modal → POST `{ action: 'generate', description, preset, aspect_ratio }` → 4-step Groq pipeline → saved to creatives table as pending_review
- `createUGCForNewProduct()` → POST `{ action: 'create', product_title, product_id, product_image }` → same pipeline
- Creatives tab fixed: no longer blocked when Meta is not connected
Video generation NOT yet built — needs HIGGSFIELD_API_KEY

### Task 18 — Higgsfield video generation (upgrade UGC from scripts to real videos)
Text pipeline works (scripts, copy, hooks generated). Need to add video render step.
Requires: `HIGGSFIELD_API_KEY` set as Supabase secret.
Entry point: `supabase/functions/ugc-generate/index.ts` — add step after copy generation.

### Task 9 — JWT signature verification (security hardening — deferred)
Currently Edge Functions decode JWT payload without verifying RS256 signature.
Fix: Fetch Clerk JWKS from `https://clerk.ephermal.app/.well-known/jwks.json` and verify.
Impact: Low risk since Supabase RLS + Clerk session management provides layered protection.

### Task 11 — Legal pages: fill in your name and address
Files already created with [PLACEHOLDER] highlights:
- `web/public/impressum.html` — add your full name, street address, PLZ + city, USt-ID (once registered)
- `web/public/privacy.html` — add your name as Data Controller, address
- `web/public/terms.html` — add your name as contracting party
These are visible as amber-highlighted fields in the rendered HTML.

### Task 12 — Register for German VAT (Umsatzsteuer)
- File Gewerbeanmeldung with local Gewerbeamt (if not done)
- Apply for Umsatzsteuer-Identifikationsnummer via Finanzamt or elster.de
- Enable Stripe Tax in Stripe Dashboard → Settings → Tax

### Task 10 — OAuth state nonce server-side storage (security hardening — deferred)
Currently nonce is checked for presence but not validated against a stored value.
Fix: Store generated nonce in a `oauth_nonces` table on initiation, delete on use.

---

## Recent Commits (latest first)

```
65c4bb3 fix: honest marketing copy — remove fabricated stats, fake testimonials, unbuilt feature claims
243766a fix: UGC pipeline — wire generate+create actions, fix Creatives tab without Meta
a63fd7c fix: grant DML to service_role on all tables + fix ugc_credits tracking
4926c37 fix: grant service_role DML on core tables + fix clerk-webhook verify_jwt
9280824 fix: remove false social proof + add cancellation UI for EU compliance
522e796 feat: complete email template suite — all Ephermal-branded dark theme
```

---

## Rules (from CLAUDE.md)

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary — prefer editing existing files
- NEVER create documentation files unless explicitly requested
- NEVER save working files or tests to root — use `/src`, `/tests`, `/docs`, `/config`, `/scripts`
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- Keep files under 500 lines
- Do NOT make frontend changes unless explicitly asked

---

## Pricing (updated this session)

Growth plan: **$199/month** (was $159 — updated in `web/app/page.tsx` and `web/app/layout.tsx`)

---

## Welcome Banner (just shipped)

Added `renderWelcomeBanner()` in `dashboard.html`. Shows above stat cards:
- Small date line (e.g. "Wednesday, May 30")
- Large gradient phrase using indigo→purple→teal (same as landing page "We Scale It")
- 30 phrases across 6 time buckets, random on each reload
- Renders inside `loadUser()` once Clerk user is available
