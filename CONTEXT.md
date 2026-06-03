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

### Task 1 — Fix Google OAuth (in-progress)
**Error**: "hasn't completed the verification process"
**Cause**: OAuth consent screen is in Testing mode
**Fix**:
1. Go to console.cloud.google.com → APIs & Services → OAuth consent screen
2. Add your Google account email under "Test users"
3. Long-term: publish the app → submit for verification

### Task 2 — Fix Shopify OAuth (in-progress)
**Error**: "Oops something went wrong"
**Needs**: A real `.myshopify.com` URL — create a development store at partners.shopify.com → Stores → Add store → Development store
**Also check**: `SHOPIFY_APP_KEY` and `SHOPIFY_APP_SECRET` set as Supabase secrets

### Task 3 — Stripe setup (HIGH PRIORITY — blocks billing)
Price IDs in `config.js` and `stripe-webhook` are all placeholders (`price_REPLACE_*`).
Steps:
1. Go to Stripe Dashboard → Products → Create each plan product
2. Copy Price IDs → set as Supabase secrets: `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE`, `STRIPE_PRICE_TOPUP_5`, `STRIPE_PRICE_TOPUP_10`, `STRIPE_PRICE_TOPUP_20`
3. Update `config.js` `window.STRIPE_PRICES` with real IDs
4. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as Supabase secrets
5. Register Stripe webhook pointing to `https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/stripe-webhook`

### Task 4 — Set Supabase secrets for AI (HIGH PRIORITY — blocks Budget AI + Campaign Launcher)
```bash
supabase secrets set GROQ_API_KEY=gsk_...            # Budget AI (qwen-qwq-32b) + UGC/Launch (llama-3.3-70b)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...    # ai-assistant fallback
supabase secrets set HIGGSFIELD_API_KEY=...          # video generation (future)
supabase secrets set RESEND_API_KEY=re_...           # transactional email
supabase secrets set CLERK_WEBHOOK_SECRET=whsec_... # clerk webhook signing
```

### Task 5 — Install CodeRabbit for automated PR review
1. Go to https://coderabbit.ai
2. Sign in with GitHub → authorize J2y04/ephermal repository
3. CodeRabbit will auto-comment on every PR with code review

### Task 6 — Meta business verification (deferred)
Register as sole proprietor on Meta Business → complete App Review for Advanced Access (`ads_management`, `ads_read`, `business_management`)

### Task 7 — Google Ads developer token (deferred)
Apply at ads.google.com/aw/apicenter

### Task 8 — Build Ephermal Core AI pipeline (when API keys ready)
7-agent orchestrator: Orchestrator (claude-haiku-4-5) → Store Analyzer (llama-3.3-70b/Groq) → Audience Profiler (llama-3.3-70b/Groq) → Script Writer (claude-sonnet-4-6) → Creative Director (claude-haiku-4-5) → Video Generator (Higgsfield AI) → Performance Predictor (llama-3.1-8b-instant/Groq)
New tables needed: `ugc_jobs`, `ugc_scripts`, `ugc_predictions`
Entry point: update `ugc-generate` Edge Function as orchestrator

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
6f0f4da fix: security hardening + bug fixes across 7 edge functions
32a0748 fix: seed user_plans and user_integrations rows on signup via clerk-webhook
90411bf fix: pass Clerk JWT via body clerkToken, fix undefined token ref in forwardHeaders
3a53d8c fix: route Clerk JWT via X-Clerk-Token to bypass UNAUTHORIZED_ASYMMETRIC_JWT
06e5096 fix: grant anon table access, fix ai_topups column, add worker-src CSP
6f77adb feat: add time-aware welcome phrase banner to dashboard
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
