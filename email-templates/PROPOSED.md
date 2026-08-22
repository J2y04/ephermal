# Emails Ephermal does not send yet

Twelve templates exist. This is what is missing, found by tracing the actual
lifecycle against the code rather than listing what SaaS products usually have.

Each entry says what triggers it, why it matters, what it needs, and where it
would be wired. Ordered by real impact, not by how easy it is.

**Not needed:** password reset, email verification, magic links. Clerk owns
authentication and already sends those. Adding ours would duplicate them.

---

## 1. `campaign_ready` — the biggest hole

**Trigger:** `campaign-launcher` finishes creating a campaign.

**Why this is first.** Every campaign Ephermal creates launches **PAUSED**. That
is a deliberate safety rule and it should stay. But it means the product does
its most valuable work and then waits for a human to go and press start, and
right now **nothing tells the human.** A store owner who does not log in that
day has an ad set built, targeted and written, sitting idle, and no idea. The AI
did the work and the user never found out.

This is not a notification. It is the completion of the core loop.

**Wiring:** `campaign-launcher/index.ts`, after a successful create. Currently
has zero `send-email` references.

| Variable | Example |
|---|---|
| `name` | Jamal |
| `campaign_name` | Sage 6-quart, Meta prospecting |
| `platform` | Meta / Google Search |
| `daily_budget` | €25.00 |
| `product_name` | The 6-quart |
| `review_url` | dashboard link straight to the campaign |

**Tone:** it is ready, not it is running. The CTA is "Review and launch", never
"View campaign". The distinction is the whole point of the paused rule.

---

## 2. `integration_disconnected` — a silent failure

**Trigger:** a Shopify, Meta or Google token stops working.

**Why.** There is no detection path for this today. When a token expires or is
revoked, Ephermal simply stops being able to manage the ads, and the user finds
out whenever they next look. For a product whose promise is "it runs your ads
for you", going quiet is the worst possible failure mode: the customer keeps
paying and assumes it is working.

Same argument as routing errors to Sentry. A failure nobody is told about has
not been handled.

**Wiring:** needs a detector first. `meta-api` and `google-api` already surface
auth errors; those paths need to distinguish "expired credential" from
"transient failure" and record it, then this fires once per disconnection rather
than on every failed call.

| Variable | Example |
|---|---|
| `name` | Jamal |
| `platform` | Meta |
| `store_name` | ephermal-test |
| `disconnected_at` | 22 August, 14:30 |
| `affected_campaigns` | 3 |
| `reconnect_url` | dashboard settings deep link |

**Tone:** urgent but not alarmed. Say plainly what stopped, what it affects, and
the one action that fixes it.

---

## 3. `weekly_digest` — the retention lever

**Trigger:** scheduled, Monday morning, per user with an active campaign.

**Why.** Ephermal's own pitch is that you do not have to watch it. The
consequence is a user who has no reason to open it, and a subscription with
nothing reminding them it is earning its money. A weekly summary is the single
highest-leverage retention email a tool like this can send, because it turns
invisible work into visible value.

It also carries the product's actual differentiator: this is where contribution
margin and true profit belong, not ROAS.

**Wiring:** new scheduled function. `revenue_snapshots` and `launched_campaigns`
already hold the data.

| Variable | Example |
|---|---|
| `name` | Jamal |
| `week_range` | 15 to 21 August |
| `spend` | €412.00 |
| `revenue` | €1,840.00 |
| `contribution_margin` | 30.1% |
| `profit` | €142.00 |
| `best_campaign` | Sage 6-quart, Meta |
| `worst_campaign` | Retargeting, broad |
| `actions_taken` | 4 |
| `dashboard_url` | link |

**Tone:** a report, not a celebration. Lead with profit. If the week was bad,
say so, because a digest that is only ever good news stops being read.

**Must have an unsubscribe that actually works**, separately from transactional
mail. This is the one genuinely optional email in the set.

---

## 4. `subscription_cancelled`

**Trigger:** `customer.subscription.deleted` in `stripe-webhook`.

**Why.** The event is already handled, the plan is already downgraded, and the
customer is told nothing. At minimum they deserve confirmation of what they
cancelled, what happens to their data, and when access ends. It is also the only
natural moment to ask why, which is the most valuable feedback a solo founder
can get at this stage.

**Wiring:** `stripe-webhook/index.ts`, the existing `customer.subscription.deleted`
branch. Zero email references there today.

| Variable | Example |
|---|---|
| `name` | Jamal |
| `plan` | Growth |
| `access_until` | 14 September |
| `data_retention_note` | what is kept and for how long |
| `feedback_url` | one question, not a survey |

**Tone:** gracious, zero guilt-tripping, no discount ambush. Confirm, state the
dates, leave the door open.

---

## 5. `invite_redeemed` — to Jamal, not the tester

**Trigger:** a tester invite is successfully redeemed in `redeem-invite`.

**Why.** Right now there are **3 invites out and 0 redeemed**, and the only way
to discover a signup is to go and look. When the first real tester arrives, that
is the moment to reach out personally, and it is worth knowing within minutes
rather than whenever the admin panel next gets opened.

Cheap to build, and directly serves the thing currently blocking the product,
which is getting real users on it.

**Wiring:** `redeem-invite/index.ts`, after the successful atomic claim.

| Variable | Example |
|---|---|
| `tester_email` | someone@example.com |
| `redeemed_at` | 22 August, 21:40 |
| `invite_label` | the note attached when created |
| `admin_url` | link to Test Users |

---

## 6. `trial_ending`

**Trigger:** `customer.subscription.trial_will_end`, three days out.

**Why.** Blocked: the 7-day trial is not built. Listed so it is not forgotten
when it is, because a trial that converts silently and charges without warning
is how a product earns chargebacks and bad reviews.

`stripe-webhook` currently handles four events; this is not one of them.

| Variable | Example |
|---|---|
| `name` | Jamal |
| `trial_ends` | 25 August |
| `plan` | Growth |
| `amount` | €199.00 |
| `manage_url` | link |

---

## 7. `optimizer_summary`

**Trigger:** `roas-optimizer` or `budget-ai` takes a real action.

**Why.** Auren makes changes. The user consented to that, but consent is not the
same as knowledge, and the marketing page promises full transparency in exactly
these words: see what the AI decided and why. An email when something material
changed is that promise kept.

**Batch it.** One digest of the day's actions, never one email per change, or it
becomes noise and gets filtered, taking the important mail with it.

| Variable | Example |
|---|---|
| `name` | Jamal |
| `actions_count` | 3 |
| `actions_list` | rendered rows: what, why, effect |
| `net_effect` | budget shifted toward the profitable set |
| `dashboard_url` | link |

---

## Shape notes

Everything here follows the existing templates: table layout, inline styles, no
web fonts, 600px cap, light ground. See `README.md`.

Two structural things worth carrying into all of them:

**Transactional and marketing are different.** 1, 2, 4, 5 and 6 are
transactional: the user cannot opt out of being told their integration broke.
3 and 7 are informational and need a real unsubscribe. Mixing them into one
preference is how a whole domain ends up in spam.

**One action per email.** Every template above has exactly one primary button.
If a second seems necessary, the email is doing two jobs and should be two
emails, or one of them is not important.

---

## Build order

1. `campaign_ready` — closes the core loop, and the loop is currently open
2. `invite_redeemed` — cheap, and serves the live bottleneck
3. `subscription_cancelled` — the webhook branch already exists
4. `integration_disconnected` — needs the detector built first
5. `weekly_digest` — needs a scheduled function
6. `optimizer_summary` — after the digest, shares its data
7. `trial_ending` — when the trial ships
