# Future considerations

Items from the todo's.md video-transcript pass (2026-08-16) that are real and worth
remembering, but aren't a concrete code patch right now — either because they need a
product/tooling decision first, or because they only make sense once Ephermal has
more real traffic than it does today. Revisit this list before the next scaling push
or before onboarding a meaningful batch of paying users.

## Infrastructure (revisit when real traffic shows up)

- **No AI provider fallback chain.** Every AI call goes straight to Anthropic with no
  backup provider. If Anthropic has an outage, every AI-dependent feature (Auren,
  Creative Brief, Budget AI, Store Intelligence) goes down with it. Worth a fallback
  chain (e.g. a second provider or a cached/degraded response) once AI features are
  load-bearing for paying customers, not urgent at current scale.
- **No active alerting/paging.** Errors land in Supabase/Vercel logs but nothing pages
  anyone. Needs a tool decision (Sentry, Better Stack, etc.) before it's worth
  building — not a quick patch.
- **No load testing.** Never run k6/Artillery against the live app. Reasonable to skip
  until there's real signup volume to justify it — testing for a cliff nobody's
  near yet is effort better spent elsewhere right now.
- **No async job queue for heavy operations.** UGC video generation and transactional
  email sends are synchronous today. Fine at current volume; worth revisiting if
  either starts making requests feel slow.

## Marketing/growth (belongs to the mobile client project more than Ephermal)

- Videos 21, 22, 24 (TikTok-slideshow waitlist validation, downloads-vs-retention,
  distribution-before-building): consumer mobile-app playbook. Matches the new client
  project starting soon much more than Ephermal's actual GTM (Shopify App Store +
  direct outreach). Keep in mind for that project, not this one.
- Video 11 (shadcn blocks + limora.ai custom banner images + the transitions.dev
  skill for premium dashboards): a real, doable technique, explicitly flagged by
  Jamal as "remind me of it so we implement it into ephermal.app." Targets
  *dashboards* specifically — likely the admin panel or the main app dashboard, not
  the marketing site (already redesigned separately). Needs a decision on which
  surface and when before it's actionable.

## Confirmed not applicable (checked, not skipped)

- **DMCA policy (Video 1):** Ephermal doesn't host user-uploaded copyrighted content —
  it reads a merchant's own Shopify catalog, it's not a UGC platform. No DMCA
  exposure in the way the video describes.
