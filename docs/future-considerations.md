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
  skill for premium dashboards): explicitly flagged by Jamal as "remind me of it so
  we implement it into ephermal.app." Researched all three pieces (2026-08-17):
  shadcn blocks are free/open, `transitions.dev` is a real, legitimate, low-risk
  Claude Code skill (27+ CSS transition patterns, ships with `prefers-reduced-motion`
  guards, no network/data-egress concern), but Limora is a separate paid/freemium
  web app — Jamal would need his own account there to set up brand assets and
  generate an image, it's not something installable or automatable from this side.
  Also still needs a decision on which surface (admin panel vs. main app dashboard)
  and timing before any of it is actionable.

## Working-style note (Video 18, German — "vibe coding is a trap")

Argues the fix for AI-agent code quality isn't a better model, it's a different
workflow: written requirements with testable acceptance criteria before code,
structured context management, and automated tests on every change. Worth keeping
in mind as a standing bar for how we work, not a one-time patch — this session has
leaned on adversarial verification and live testing rather than a formal
requirements-doc-first process, which has caught real bugs, but a written spec step
before larger new features (not bug fixes) is the piece closest to what this video
is actually pushing for.

## Confirmed not applicable / already covered (checked, not skipped)

- **DMCA policy (Video 1):** Ephermal doesn't host user-uploaded copyrighted content —
  it reads a merchant's own Shopify catalog, it's not a UGC platform. No DMCA
  exposure in the way the video describes.
- **Exposed-API-key anecdote (Video 16):** a cautionary story about finding someone
  else's live OpenAI keys through URL manipulation on an insecure site, not a
  specific instruction. The underlying concern (secrets never client-exposed, every
  endpoint auth-checked) is already covered by this session's RLS/rate-limiting/
  self-pentest work.
