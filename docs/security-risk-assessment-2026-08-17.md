# Ephermal Security & Risk Assessment

**Date:** 17-18 August 2026
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

1. **AI-usage global rate limit.** Right now, spend limits on AI features are per-account only. Since creating a new account is free, someone could theoretically create many accounts to add up more usage than one account's limit allows. Before treating this as something to fix in code: do you already have bot/spam-signup protection configured on Clerk (CAPTCHA, disposable-email blocking)? If yes, this is already substantially mitigated and lower priority. If no, I'd recommend adding a shared daily cap across all AI endpoints (the pattern already exists elsewhere in the codebase, it just isn't applied here yet).
2. **Google Ads campaign ownership check.** One finding here (whether a Google Ads campaign mutation could be tricked into targeting another Ephermal user's campaign) was investigated and found to not currently be exploitable in practice — a Google Ads customer account is only ever linked to one Ephermal user at a time in how the app is built today, so the theoretical gap has no real path to it right now. Worth being aware of if you ever support a shared/agency ad-account setup in the future, but not an action item today.
3. **Database migration history reconciliation.** Not urgent, but worth doing before this becomes harder to untangle: pull the live database schema and commit the missing migration files so the repository matches reality.

## What this audit did not cover

- No literal OWASP ZAP or Burp Suite scan was run against the live site. Those tools test infrastructure-level and generic-vulnerability-pattern issues (outdated dependencies, missing security headers, known CVEs) that this code-and-database-level audit doesn't replicate one-for-one. If you want that specific coverage as a second, complementary pass, it's a reasonable follow-up, and would need a runnable local Docker environment for ZAP specifically.
- Load testing / denial-of-service resilience was not in scope for this pass (tracked separately as a pre-scale item, not a current risk at today's user volume).

## For your Steuerberater conversation

In plain terms: this audit found no path for a customer's personal data, payment information, or ad account to be exposed to another customer or an outside attacker. The real findings were about the app's own financial-safety rails (a missing ceiling on ad budgets it could push live on a merchant's behalf), which have been fixed, tested, and deployed as of this report. Nothing found rises to the level of a GDPR personal-data breach or an unauthorized-access incident under German/EU law as currently understood; the retained legal exposure is the general, ongoing kind (keeping this discipline up as the codebase grows), not a specific unresolved hole today.
