# Ephermal Security & Risk Assessment

**Date:** 17-18 August 2026, with a second verification pass on 19-20 August 2026 (see "Follow-up pass" at the end, which resolves two of the three open decisions and adds five findings)
**Scope:** Full application security audit ahead of production push, requested to support a risk conversation with the Steuerberater.
**Method:** Not a black-box scanner run (OWASP ZAP / Burp Suite were not run as standalone tools this pass). Instead, a structured audit across 9 attack-surface dimensions, each independently researched against the live codebase and live database, then every medium-or-higher finding was adversarially re-checked by three separate reviewers who tried to disprove it before it was accepted as real. This catches more than a generic scanner would (scanners don't understand this app's authorization logic), at the cost of not testing infrastructure-level things (network config, TLS setup) that a tool like ZAP is built for.

## Bottom line

**No finding in this audit exposes user data to another user, and no finding allows an outside party to break into an account.** The three things you specifically asked about are answered directly below. The real, confirmed risk in this app right now is **financial, not data-breach**: two endpoints could accept an unbounded ad-spend budget from an authenticated user before today, which is now fixed. Everything confirmed real has already been fixed and deployed to production as of this report, except two items that are explicitly your call, not a code fix (see "Needs your decision" below).

### Your three specific questions

- **"Can someone break in?"** No auth bypass found. All sign-in/sign-up goes through Clerk (a managed identity provider); the codebase has zero custom password-handling code that could be weaker than Clerk's own. Every admin action is re-checked server-side against Clerk's role data on every request, not just hidden in the UI.
- **"Can someone steal another user's data?"** Checked two ways: (1) live database policies (Row-Level Security) on all 26 tables holding user data, and (2) every backend function that takes an ID from a request and reads/writes data by that ID. Two real gaps were found (both about *changing someone's ad campaign*, not reading their data) and are detailed below; one is fixed, one was found to not actually be exploitable on closer inspection (see IDOR section).
- **"Can someone change an ID in the URL and get another user's dashboard?"** No. Every dashboard-facing data table's database policy checks the requester's own identity, not a value the client can supply. This was tested against the live database, not just read in code.

## Risk register — confirmed findings

| # | Finding | Severity | Financial/legal exposure | Status |
|---|---|---|---|---|
| 1 | Google Ads budget endpoint accepted any budget value with no upper limit (a bad or malicious value could set a live campaign to an ~unlimited daily budget) | **Critical** | Direct financial: could authorize real ad spend far beyond what a merchant intended, on their own connected Google Ads account | **Fixed & deployed** |
| 2 | Meta campaign-creation endpoint accepted a budget with zero validation (no minimum, maximum, or invalid-number check) | **Critical** | Same as above, for Meta/Facebook ad accounts | **Fixed & deployed** |
| 3 | Creative-brief history view didn't escape two text fields before displaying them (a form of XSS — cross-site scripting) | Medium | Currently inert (the two fields are never populated by the backend today), but would become exploitable the moment that changes | **Fixed & deployed** |
| 4 | No account-wide/global cap on AI feature usage, only a per-account cap; since new accounts are free to create, this is theoretically stackable | Medium | Could inflate the AI provider bill (Anthropic/Higgsfield) if abused at scale | **Flagged for your decision — see below, not auto-fixed** |
| 5 | Bulk cost-of-goods (COGS) update endpoint accepted invalid numbers, silently corrupting profit-margin data for up to 500 products at once | Medium | Data-integrity risk to your own Profit Tracker feature, not a security breach of user data | **Fixed & deployed** |
| 6 | Campaign name field had no length limit | Medium | Low practical impact (storage bloat, oversized admin responses), included for completeness | **Fixed & deployed** |
| 7 | Two backend actions (creating a lookalike audience, assigning a creative to a campaign) didn't verify the target resource belonged to the calling user before acting on it | Low | Narrow: bounded by the user's own connected ad-account access; not a path to another user's actual data | **Fixed & deployed** |
| 8 | Several smaller input-validation gaps (a Meta audience "ratio" parameter, ROAS-optimizer thresholds, AI-generation counts, a Shopify API page-size limit) accepted out-of-range or non-numeric values without rejecting them | Low | Mostly reliability (a bad value causes a failed API call to Meta/Google/Shopify), not a security hole | **Fixed & deployed** |
| 9 | Three small spots in the dashboard's HTML rendering skipped the escaping helper other, near-identical code already uses | Low/informational | Defense-in-depth only; the data reaching these spots is server-controlled today, not free user text | **Fixed & deployed** |
| 10 | One database table (`creative_briefs`) had two access policies written with a different, incompatible pattern than the other 19 tables use | Low | Not exploitable today (that table is only touched by trusted backend code, never directly by the browser), but would silently break for any real user if a future feature read it directly | **Fixed & deployed** |
| 11 | ~10 changes have been applied directly to the live database over time with no matching file checked into the codebase | Low (process, not security) | Means the code repository alone can't be trusted to show the database's real current state | **Not fixed — flagged as cleanup, see below** |

## Confirmed clean (checked, not assumed)

- **SQL injection:** none found. The app uses Supabase's query builder everywhere instead of raw SQL strings; the one place that builds a different kind of query (Google's GAQL language) already validates its inputs are numeric before use.
- **CSRF (cross-site request forgery):** not applicable to this app's design. Every request authenticates with a token sent in a header, not an automatic browser cookie, which is the standard defense against this exact attack.
- **Secrets/configuration exposure:** no hardcoded API keys or credentials found in the codebase; `.env` files are correctly excluded from version control.
- **Row-Level Security (database access control):** all 26 tables holding user data have it enabled and correctly scoped to the requester's own identity, checked live against the database, not just the code.
- **Brute-force/account takeover:** all login/password handling goes through Clerk (a managed provider with its own brute-force protection); no custom, weaker path exists alongside it.
- **Session/token handling:** the JWT (session token) verification logic is centralized in one shared file used by all 25 backend functions that need auth, so a fix applied once can't silently regress in one function while staying fixed in another. Checked and confirmed correct.

## Needs your decision (not something I can fix unilaterally)

1. ~~**AI-usage global rate limit.**~~ **Resolved 19 August.** The open question was whether Clerk already had bot/spam-signup protection, which would mean the "create many free accounts to stack per-account AI limits" path was already substantially blocked. Checked directly in the Clerk dashboard: **Bot sign-up protection was already enabled** (browser verification via Cloudflare Turnstile), as were Lockout policy, Device Trust and User enumeration protection. Two anti-abuse rules were **off** and have now been switched on: **Block email subaddresses** (stops one mailbox spawning unlimited accounts via `you+1@`, `you+2@`, which is the cheapest version of this attack) and **Block sign-ups using disposable email addresses**. With all five active, mass free-account creation now requires defeating a CAPTCHA and sourcing genuinely distinct, non-disposable mailboxes per account. That reduces this from a plausible cost-inflation route to an expensive and slow one. A shared cross-account daily AI cap remains a reasonable belt-and-braces addition later, but is no longer load-bearing.
2. **Google Ads campaign ownership check.** One finding here (whether a Google Ads campaign mutation could be tricked into targeting another Ephermal user's campaign) was investigated and found to not currently be exploitable in practice — a Google Ads customer account is only ever linked to one Ephermal user at a time in how the app is built today, so the theoretical gap has no real path to it right now. Worth being aware of if you ever support a shared/agency ad-account setup in the future, but not an action item today.
3. ~~**Database migration history reconciliation.**~~ **Resolved 19 August (commit `2e9140f`).** Done properly, by comparing the live migration ledger against local files *by actual SQL content* rather than by filename. The real gap was **11** files, not the ~25 an earlier estimate suggested: 8 apparently-missing entries turned out to already exist locally under the older hand-numbered naming scheme. All 11 are now committed. Nothing was changed on the live database.

   Two things surfaced while doing it, both now handled or recorded:
   - A **replay-ordering defect** that this reconciliation itself exposed, fixed 20 August. See finding 14 below.
   - Local migrations `001` through `016` still have **no entry in the ledger at all**. The live schema is correct and verified; this is a bookkeeping gap from before migration tracking was in place, not a schema problem. Worth knowing because a future `supabase link` will report those 14 as "not applied" even though they are. Left alone deliberately rather than fabricating history.

## What this audit did not cover

- No literal OWASP ZAP or Burp Suite scan was run against the live site. Those tools test infrastructure-level and generic-vulnerability-pattern issues (outdated dependencies, missing security headers, known CVEs) that this code-and-database-level audit doesn't replicate one-for-one. If you want that specific coverage as a second, complementary pass, it's a reasonable follow-up, and would need a runnable local Docker environment for ZAP specifically.
- Load testing / denial-of-service resilience was not in scope for this pass (tracked separately as a pre-scale item, not a current risk at today's user volume).

## Follow-up pass, 19-20 August 2026

A second, narrower pass run specifically because the first one's conclusions were about to be used in a liability conversation, and claims that carry legal weight deserve re-checking rather than restating. Five specialist reviews (authorization/injection, personal-data exposure, silent failures, database schema and access control, and concurrency on the new AI approval gate), each required to verify findings against the **live** database rather than against migration files, since those two had already been shown to drift. Everything below was then re-verified by hand before being written down.

The main subject of this pass is a feature that did not exist during the first audit: **Auren's human-approval gate**, which requires an explicit human click before the AI assistant may change anything on a live Meta or Google ad account.

### Additional findings

| # | Finding | Severity | Exposure | Status |
|---|---------|----------|----------|--------|
| 12 | "Allow for this chat" was scoped to the campaign but not to the **value approved**. Approving "scale campaign X by 1.15" also authorised any later scale of campaign X at any multiplier for 60 minutes, with no second confirmation. Equivalently, approving a *pause* silently authorised a later *enable*, and approving one budget figure authorised any other. | **High** | Direct financial: ad spend on the merchant's own account that they never specifically approved | **Fixed** (`21913ba`) |
| 13 | The daily-budget ceiling ($10,000/day) that every other budget path enforces was **not applied to the scale path at all**. It validated only the multiplier, then wrote the product straight to Meta. A campaign at $2,000/day scaled to $20,000/day in one call, and the call repeats. | **High** | Direct financial, and the practical amplifier for finding 12 | **Fixed** (`895721a`) |
| 14 | Migration files replay in filename order, and the hand-numbered files all sort before the timestamped ones. On a from-scratch rebuild this replays one RLS fix *before* the change it was written to correct, leaving a restored database with a permanently-false access predicate on one table. | Medium | Disaster-recovery correctness. Fails closed (blocks access) rather than open (leaks), and does not affect live production | **Fixed** (`21913ba`) |
| 15 | An approved action claimed mid-execution could be stranded permanently if the server was interrupted, unresolvable and invisible, with no scheduled job covering it. | Medium | Operational: the user cannot tell whether their change reached the ad platform | **Fixed** (`21913ba`) |
| 16 | On a dropped connection the approval card asserted the action had **failed**, though the server calls Meta/Google before replying, so it may well have succeeded. This invites re-running a non-idempotent change. | Medium | Financial, indirectly: encourages a duplicate budget change | **Fixed** (`21913ba`) |

Findings 12 and 15 were each independently identified by two separate reviewers working from different angles, which is the strongest signal available short of a live reproduction. Finding 13 was found not by the automated pass at all, but while verifying a "$10,000/day ceiling" claim before writing it into this document. That is worth recording honestly: had the claim been restated from the earlier audit rather than re-checked, this document would have asserted a protection that did not exist on the path that most needed it.

### Materially important context on findings 12, 13, 15 and 16

The live database shows **zero pending actions ever created**, and none stranded. The approval gate has not yet been exercised in production by anyone. Every one of these was a **latent** defect in a recently shipped feature, closed before it was ever reached in anger, not an incident with realised harm. There is nothing here to disclose to anyone and no affected party.

### Re-confirmed clean in this pass

- **Cross-tenant data access.** The five tables that grant `SELECT` to logged-in users were checked live: all five have row-level security on, with a policy restricting each user to their own rows. The grant alone is not a read path to anyone else's data.
- **The two new approval tables** are locked to the server role. No logged-in user can read or write them directly, so nobody can mark their own or anyone else's pending action approved.
- **Approval integrity.** What executes on approval is re-read from the stored record, never taken from the approving request, so a user cannot be shown one action and have a different one run. Ownership and plan entitlement are both re-checked at approval time.
- **The local-development authentication shim** cannot activate in production. It is gated on a build-time constant that is always "production" in a real deployment.
- **No personal data or access tokens in logs** in any of the new code.

## For your Steuerberater conversation

### The short version

This software's distinctive risk is **not** a data breach. Two rounds of audit found no path by which one customer's personal data, payment details, or ad account can be reached by another customer or an outside attacker. The distinctive risk is that **Ephermal spends its customers' money on their own ad accounts**, automatically, on their instruction. That is what makes its liability profile different from ordinary software, and it is the honest centre of gravity for a *Haftung* discussion.

### Where liability could actually arise, in order of realism

1. **Causing ad spend a merchant did not authorise.** This is the real one. Ephermal holds delegated access to the merchant's Meta and Google accounts and can change budgets. If a defect causes spend the merchant did not sanction, that is a concrete, immediately quantifiable claim, and unlike most software faults it converts directly into a number. Both audits found their most serious issues in exactly this category, which suggests the category is correctly identified rather than theoretical.

   **What bounds it today:** every budget-changing path is now clamped to a **$10,000/day per campaign** ceiling, verified across all four places that can write a budget. Until 20 August one path, the scale path, was outside that ceiling entirely (finding 13). Campaigns are always created **paused**. AI-initiated changes to a live account require an explicit human click.

2. **Personal data (GDPR / DSGVO).** Ephermal stores merchant contact details, store and revenue data, and OAuth tokens for Meta, Google and Shopify. Access control has been verified live, twice, at the database level. No breach and no cross-customer exposure has been found. The residual exposure here is the ordinary controller obligation every business carries, not a specific open hole.

3. **Acting inside third-party platforms.** Ephermal operates within Meta's and Google's advertising APIs on merchants' behalf. That relationship carries its own terms, and a breach of them is a risk to the *business* (loss of API access) more than a liability to *customers*.

4. **Decisions taken on Ephermal's numbers.** The Profit Tracker and ROAS reporting inform real spending decisions. A calculation defect could lead a merchant to spend badly. One such defect (COGS corruption) was found and fixed in an earlier round. This is a plausible but considerably weaker claim route than category 1.

### Present scale, stated plainly

There is currently **one** real account with connected integrations, and it is yours. Realised third-party exposure today is effectively nil. This matters for the *Haftung* question in a specific way: the decision is not about damage already done, it is about **the shape and ceiling of exposure as the customer count grows**, when the same defect class is multiplied across many merchants' ad accounts rather than one.

### What I am not able to tell you

I can tell you accurately what the software does, what it is capable of spending, and what has been verified. I cannot tell you which legal form to register, what your personal liability would be under any of them, or how German law would apportion responsibility for an automated overspend between an operator, a merchant, and an ad platform. Those are precisely the questions your Steuerberater is asking you to bring answers to, and they are theirs to answer, not mine. What is above should be enough for them to reason about magnitude and category with real numbers instead of guesses.

One suggestion worth raising with them explicitly, since it follows directly from category 1: ask whether the ceiling that bounds worst-case automated spend should be **contractual as well as technical**. A limitation-of-liability clause in the Terms, and a stated cap on automated spend, address the same risk from the other side, and unlike code they do not depend on the next audit catching everything.
