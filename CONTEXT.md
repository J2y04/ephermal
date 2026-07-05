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
- `SHOPIFY_API_SECRET` — (set by user) — NOTE: function reads SHOPIFY_API_SECRET, NOT SHOPIFY_APP_SECRET
- `GOOGLE_CLIENT_ID` — `1590993825-ucshnlj9hvj6f5tf2kscfj0n5iqb6j1l.apps.googleusercontent.com`
- `GOOGLE_CLIENT_SECRET` — (set by user)
- `GOOGLE_CALLBACK_URL` — `https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/google-oauth-callback`
- `GOOGLE_ADS_DEVELOPER_TOKEN` — (optional, apply at ads.google.com/aw/apicenter)
- `META_APP_SECRET` — (set by user)
- `HIGGSFIELD_API_KEY` — (set by user after subscribing at higgsfield.ai) — used by `ugc-generate` and `creative-brief` edge functions for video/image generation
- `ANTHROPIC_API_KEY` — (set by user) — used by orchestration/brand strategy layer (Claude claude-sonnet-4-6 for store intelligence, creative briefs, ad copy)

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

### Task 28 — ANTHROPIC_API_KEY not set (blocks 3 features now)
Store Analysis (dashboard), the free public "Analyse Your Store" landing-page tool, and any
future Ephermal AI agent work all need this. Run: `npx supabase secrets set ANTHROPIC_API_KEY=<key>`
No redeploy needed after — Supabase injects secrets into the running function automatically.

### Task 2 — Stripe setup (billing is 100% broken without this)
1. Stripe Dashboard → Products → create Starter ($89), Growth ($199), Scale ($349) + 3 topup products
2. Set secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER/GROWTH/SCALE/TOPUP_5/10/20`
3. Update `window.STRIPE_PRICES` in `web/public/config.js` with real price IDs
4. Register Stripe webhook at: `https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/stripe-webhook`
   Events: `checkout.session.completed`, `customer.subscription.updated`, `payment_intent.succeeded`

### Task 3 — ✅ Clerk webhook — DONE
Registered in Clerk Dashboard. New signups get default DB rows.

### Task 4 — ✅ Resend — DONE (Jun 9 2026)
RESEND_API_KEY set, domain verified, send-email function redeployed.

### Task 5 — ✅ META_CALLBACK_URL — DONE
Secret set in Supabase. Meta OAuth callback is live.

### Task 6 — ✅ Legal placeholders — DONE (Jun 9 2026)
impressum.html + privacy.html updated with Hicham Settah, Rapsweg 18, 47906 Kempen.
USt-ID still pending — add once registered via elster.de.

### Task 7 — ✅ Cancellation UI — DONE
Cancel button added to billing section. Prefilled mailto link. EU compliant.

### Task 8 — ✅ Honest marketing copy — DONE (Jun 8 2026)
All fabricated stats, fake testimonials, and unbuilt feature claims removed from `web/app/page.tsx`.
Pushed to production as commit 65c4bb3.

### Task 9 — ✅ Clerk OTP template — REMOVED (not needed)

---
### 🟡 INTEGRATION FIXES

### Task 10 — Fix Google OAuth
Add your email as test user: console.cloud.google.com → OAuth consent screen → Test users
Also add callback URL: Google Cloud → Credentials → OAuth 2.0 Client → Authorized Redirect URIs:
`https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/google-oauth-callback`

### Task 11 — ✅ Shopify API fix — DONE (Jun 9 2026)
- API version updated `2024-01` → `2025-07` (deprecated version was breaking all calls)
- `syncProducts()` fixed — was not calling `.json()` on authFetch response
- Products now sync on first dashboard visit if cache is empty

### Task 19 — Test Shopify integration end-to-end
Connect a real/dev Shopify store via OAuth, verify products sync to dashboard, confirm ad generation uses live catalog data.
Steps:
1. Create dev store at partners.shopify.com → Stores → Development store
2. Connect via Settings → Shopify in the dashboard
3. Confirm products appear in Store Products tab
4. Confirm `shopify_products` table populated in Supabase

### Task 29 — Add dashboard.ephermal.app to Clerk allowed origins
Clerk Dashboard → your app → allowed origins. Separate from this app's own CORS (already fixed);
Clerk enforces its own origin allow-list and will reject auth from the subdomain without this.

### Task 30 — Reconnect Shopify to pick up the new read_themes scope
Any store connected before Jul 5 2026 has a token without `read_themes` — Store Analysis will
silently fall back to the weaker homepage-scrape signal for colors/logo until reconnected.
Settings → Shopify → reconnect (same OAuth flow, no data loss).

### Task 31 — Facebook Page picker (multi-page Meta accounts)
`launch_meta` now creates real ad objects (Task 27), but auto-selects the *first* Facebook Page
returned by Meta. Fine for one-page accounts; needs a picker UI in Settings if a user manages
multiple Pages, so they can choose which one ads get attached to.

### Task 32 — Verify: Competitor Radar
Was returning a swallowed generic 500 — now fixed to surface the real error (deployed, not yet
retested). Retry it and report the actual error text so we know if it's a code bug, a Meta Ad
Library permission/ID-verification issue, or something else.

### Task 33 — Verify: Audience Intelligence
Reported as "doesn't work" — reviewed the code and found no obvious bug (no silent-failure
pattern like the two confirmed elsewhere). Needs a repro: exact error toast / blank state /
console message next time it's opened.

### Task 34 — Verify: "some AI elements glitch"
Too vague to fix blind — need specifics (which page, what happens, any error shown) next session.

### Task 35 — Verify: Products tab "Generate Ad → Add to Campaign"
Root cause found and fixed (Jul 5): `creatives` table insert was silently failing — no `id` on a
NOT NULL primary key with no default, so `creative_id` always came back undefined and the
assign-to-campaign modal never had anything to open for. Should work now — needs a real retest.

### Task 36 — Animated dashboard home charts (started, not finished)
Was asked to replace the 4 home-page stat cards (ROAS/Spend/UGC Created/Conversions) with
animated line charts (grow-from-zero reveal, X=time/Y=value, 30-day default except cumulative
ad spend). Backend groundwork is done — `mrr-tracker` now tracks daily conversions
(Meta actions + Google Ads metrics.conversions) specifically for this. The frontend charts
themselves were never built — got reprioritized into the bug-fixing pass. Real next step, not
just polish: reuses the same `buildAnimatedLineChart`-style reveal already used elsewhere.

### Task 37 — General design polish
Nicer sliders/toggles, more graphs across the dashboard (not just the home page), and a pass to
find any remaining "squared, cheap-looking" raw HTML elements outside what's already been
redesigned (Launch Ads page, MRR Tracker).

### Task 38 — Ephermal AI as a tool-calling agent (scoped, not built)
Plan discussed Jul 5: swap Groq for Claude Sonnet (tool-use), expose existing edge function logic
as callable tools (campaign performance, budget calc, launch/create campaign, UGC generation,
store brief, competitor analysis), have the agent reason over real pulled data for diagnostic asks
("get me to 5x ROAS"), and require explicit user confirmation before any mutating tool call fires
(same pattern as Budget AI's apply-flow). This is a multi-session build — needs its own proper
scoping pass before starting.

### Task 39 — Verify: free public "Analyse Your Store" tool end-to-end
Built and deployed Jul 5 (`public-store-scan` + landing page section) but could not be tested live
end-to-end from the build sandbox (no outbound network access there). Confirmed the section
renders on the live site; the actual POST-a-URL-and-get-a-report flow needs a real test — try it
with a real store URL once ANTHROPIC_API_KEY is set (Task 28).

---
### 🟢 DEFERRED (don't block launch)

### Task 13 — Gewerbeanmeldung (unlocks Task 12 — do this FIRST)
Meta Business Verification requires a real registered business — a personal name/address won't
clear it. Sole-proprietor registration (Einzelunternehmen) is sufficient; no GmbH needed.
1. Gewerbeanmeldung at your local Gewerbeamt (bring ID, short walk-in form, ~€20-60)
2. Finanzamt issues a tax number shortly after — also needed for VAT/Stripe Tax
3. Business name + address on the Gewerbeschein must match Meta Business Manager exactly
4. Loop in a Steuerberater for the Kleinunternehmer-vs-VAT decision — real financial
   consequences, worth getting right rather than guessing
5. Enable Stripe Tax once registered: Stripe Dashboard → Settings → Tax

### Task 12 — Meta App Review (REQUIRED for real users to connect Meta Ads — blocked on Task 13)
Without this, only manually-added test accounts can connect. Takes 1–4 weeks.
Meta Developer Dashboard → App Review → Request advanced access: `ads_management`, `ads_read`,
`business_management`. Business Verification (Task 13's Gewerbeschein) must clear first —
submit that before starting App Review, not in parallel.

### Task 14 — Google Ads developer token (independent of Task 12/13 — no business-ID docs needed)
Google's requirement is lighter than Meta's: OAuth consent screen verification (domain
ownership + privacy policy — already have both) plus the developer token application, which
reviews use case, not legal entity. Can be pursued in parallel with Gewerbeanmeldung, no need
to wait. Apply at ads.google.com/aw/apicenter

### Task 15 — CodeRabbit automated PR review
coderabbit.ai → Sign in with GitHub → authorize J2y04/ephermal

### Task 16 — ✅ Error monitoring (Sentry) — wired, needs your DSN (Jul 5 2026)
- `dashboard.html`: loads Sentry browser SDK from CDN, initializes only if `window.SENTRY_DSN` is set
  (no-ops otherwise — safe to deploy before you have a DSN); strips `Authorization` header from
  captured request data before sending
- `config.js`: `window.SENTRY_DSN = ''` — paste your DSN here to activate
- `vercel.json` CSP: allowed `browser.sentry-cdn.com` (script) and `*.ingest.sentry.io` (beacon)
- **Still needed**: sign up free at sentry.io → New Project → Platform: Browser JavaScript →
  copy the DSN → paste into `web/public/config.js` `window.SENTRY_DSN`

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

### Task 20 — OAuth state nonce server-side storage (security hardening — deferred)
Currently nonce is checked for presence but not validated against a stored value.
Fix: Store generated nonce in a `oauth_nonces` table on initiation, delete on use.

### Task 21 — ✅ Store Intelligence (Claude Sonnet brand brief) — DONE (Jul 4 2026)
Replaced the old URL-scrape + Groq "Store Analysis" (which hallucinated brand_vibe/color_palette/typography
since the backend never actually returned those fields) with a real pipeline:
- New table `store_intelligence` (migration 019) — one row per user, permanent brand brief
- New edge function `store-intelligence` — reads connected Shopify store (shop.json + synced
  shopify_products + storefront homepage for theme-color/logo), sends to Claude Sonnet
  (`claude-sonnet-5`, requires `ANTHROPIC_API_KEY` — NOT YET SET, function 503s until set),
  returns summary/target_audience/ad_opportunities/meta_strategy/products/keywords/brand_vibe/
  color_palette/typography/ugc_visual/ugc_tone, upserts to store_intelligence
- Dashboard `page-analysis`: no longer requires a manual URL paste — uses the user's connected
  Shopify store automatically (button reads "Analyse My Store"); loads cached brief on page visit
- Fixed a real gating bug: `analysis` was missing from the `pagePaywalls` map so the Growth-plan
  paywall never actually rendered for starter users on this page — added it
- Moved the "Store Analysis" nav item out of the hidden "AI Tools" section into the visible
  "Intelligence" section (it's a real working feature now, not a stub)
- **Next**: run `npx supabase secrets set ANTHROPIC_API_KEY=<key>` to activate; then wire this
  brief into ad copy / UGC script / Higgsfield prompt generation as shared brand context

### Task 22 — ✅ MRR Tracker — DONE (Jul 5 2026)
New sidebar tab combining Shopify revenue + Meta spend + Google Ads spend into one view:
- New table `revenue_snapshots` (migration 020) — daily revenue/spend rows per user
- New edge function `mrr-tracker` — `sync` pulls last 90 days from Shopify orders + Meta
  insights + Google Ads GAQL cost, upserts daily snapshots; `get_report` returns MRR
  (trailing 30-day revenue), MoM growth %, blended ROAS, and the full time series
- New dashboard page: stat cards, Sync button, Meta vs Google spend donut, two new
  interactive SVG line charts (Revenue Over Time, ROAS Over Time) with 30d/90d toggle
- Also fixed the Analytics page charts getting stuck on a loading skeleton forever for
  accounts with zero campaigns (no distinction existed between "still loading" and
  "confirmed empty") — added a `_campaignsLoaded` flag so charts now resolve to a real
  empty state instead of spinning indefinitely

### Task 23 — ✅ dashboard.ephermal.app subdomain (alias, not full migration) — DONE (Jul 5 2026)
- `web/middleware.ts` rewrites `dashboard.ephermal.app/` → `/dashboard.html` (same deployment,
  same public/ files — everything else resolves identically on any host)
- `next.config.mjs` redirects `ephermal.app/dashboard.html` → `https://dashboard.ephermal.app/`
- **Known tradeoff (accepted)**: Clerk session + all integration tokens (Shopify/Meta/Google)
  live in `localStorage`, which is per-origin. Existing logged-in users hitting the new
  subdomain for the first time will need to log in again and reconnect integrations once —
  a full migration would move login/setup onto the same origin to avoid this, deferred.
- Fixed a real CORS bug this surfaced: `cache-proxy` and `_shared/auth.ts` only ever allowed
  `APP_URL` as the CORS origin — any request from `dashboard.ephermal.app` would have been
  silently blocked by the browser. Both now allow an explicit two-origin allow-list.
- **Still needed (Jamal, outside Claude Code's reach):**
  1. Add `dashboard.ephermal.app` as a domain on the Vercel project + point its CNAME at
     Vercel per their dashboard instructions
  2. Add `https://dashboard.ephermal.app` to Clerk Dashboard → allowed origins (Clerk enforces
     its own origin allow-list separately from this app's CORS)

### Task 24 — GEO refresh (Jul 5 2026)
- `robots.txt`: added the crawlers that actually matter for LLM answer engines —
  `ChatGPT-User`/`OAI-SearchBot` (OpenAI live citation, distinct from training-only `GPTBot`),
  `ClaudeBot` (Anthropic's current crawler name), `Google-Extended` (Gemini/AI Overviews
  grounding), `Applebot-Extended`, `CCBot`, `cohere-ai`, `Perplexity-User`
- `llms.txt`: was stale (still said "Groq only" for the AI stack) — updated to reflect Claude
  for brand strategy/store intelligence/copy, added Store Intelligence + MRR Tracker + Higgsfield
  to capabilities list
- Structured data (Organization/WebSite/SoftwareApplication/FAQPage JSON-LD in `layout.tsx`)
  was already solid — left as-is

### Task 25 — ✅ Launch Ads page (replaces old Campaigns page) — DONE (Jul 5 2026)
- Old Campaigns page (grid-row table + step wizard) removed; nav item renamed "Launch Ads"
  (kept `data-page="campaigns"` / same GATED+paywall keys to avoid touching plan-gating config)
- Meta/Google platform toggles (greyed out when not connected), campaign cards, "+ New
  Campaign" builder modal (manual ad entry or AI-generated via existing `prepare` action),
  Review/Launch modal (edit ads while draft, launch to Meta/Google, delete draft)
- `campaign-launcher`: added `save_draft`/`update`/`delete` actions, all guarded to
  `status='draft'` only — never touches an already-launched campaign; `copy.meta.ads` is now
  an array of ad variations instead of one flat ad
- Old "Live Performance" table (real Meta/Google ROAS/spend/CTR) kept underneath, unchanged
- **Known gap**: `launch_meta` still only creates the campaign + ad set shell, not individual
  Meta ad objects — that needs a connected Facebook Page (`pages_show_list` OAuth scope) which
  isn't wired up. Ads are fully stored/editable in Ephermal; finishing the ad in Meta Ads
  Manager is a manual step after launch until this is built.
- Also fixed: favicon not refreshing on some pages (browser cache) — added `?v=2` cache-bust
  to every favicon reference; Clerk login/signup now redirect straight to
  `dashboard.ephermal.app` instead of through the `/dashboard.html` redirect hop;
  `competitor-radar` was swallowing every error into a generic message — now surfaces the
  real one; Dev Tools got a raw-Shopify-API panel (no AI call) for testing without
  `ANTHROPIC_API_KEY`

### Task 26 — ✅ Free public "Analyse Your Store" landing-page tool — DONE (Jul 5 2026)
- New section on the marketing homepage (`components/StoreAnalysisTool.tsx`, inserted right
  after the hero/ticker in `app/page.tsx`) — animated input card (gradient border sweep, scan
  progress text), no login required
- New edge function `public-store-scan` — fully public (no JWT), rate-limited by IP
  (5/hour via `rateLimitIp`), results cached per-domain for 24h in new `public_store_scans`
  table to control Claude API cost from repeat/shared visits
- Pulls Shopify's public unauthenticated `/products.json` endpoint (works for any standard
  Shopify storefront — no OAuth needed) + homepage meta tags (og:image, theme-color,
  title/description), sends to Claude Sonnet for the same brief schema as the authenticated
  Store Analysis, renders as a polished report (color swatches, brand vibe, keywords) with a
  "Start Free — Automate This" CTA into signup

### Task 27 — ✅ Meta ad-creative gap closed — DONE (Jul 5 2026)
Closes the gap flagged in Task 25: `launch_meta` now creates real Meta ad objects, not just
the campaign/ad set shell.
- Meta OAuth scope extended with `pages_show_list` (`setup.html` + `dashboard.html`)
- `meta-oauth-callback`: fetches the user's Facebook Pages via `/me/accounts` (each page comes
  with its own access token) and stores the first page (`meta_page_id`/`meta_page_name`/
  `meta_page_token`, migration 023) — same auto-select-first pattern already used for ad
  accounts, no page-picker UI built yet (fine for one-page accounts, a real gap for anyone
  managing multiple Pages — flag if this comes up)
- `campaign-launcher.launchToMeta`: for each ad in `copy.meta.ads[]` (up to 5), creates a real
  ad creative (`object_story_spec` with the connected page + link to the connected Shopify
  store) and a real ad object, not just campaign+adset
- Fixed a CORS gap `claim-oauth` had its own hardcoded origin allow-list (separate from
  `_shared/auth.ts`) that was missed in the earlier dashboard.ephermal.app CORS fix — added
- **Still needed if a user manages multiple Facebook Pages**: build a page picker in Settings;
  right now the first page returned by Meta is auto-selected

---

## Recent Commits (latest first)

```
956e3e9 feat: Shopify section — SVG top centred, animated green title, content below
e1fa8bc fix: restore original Shopify section layout, swap to official full SVG
4a6806a feat: replace all emoji with clean SVG icons across frontend
866efb6 fix: Shopify product sync, official Shopify logo section, dashboard UI polish
faa04b5 chore: update CONTEXT.md — mark completed tasks, add UGC pipeline notes
65c4bb3 fix: honest marketing copy — remove fabricated stats, fake testimonials, unbuilt feature claims
243766a feat: wire UGC generation pipeline — fix both broken dashboard buttons
70b1c00 security: rate limit oauth-state-init, fix timing attack in send-email, tighten CSP
9c6b62  security: HMAC-signed OAuth state, XSS fixes, billing fix, Next.js CVE patch
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
