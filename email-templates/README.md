# Ephermal email templates

Every transactional email Ephermal sends, as standalone HTML you can open in a
browser or drop into Claude Design.

## Read this before editing

**These files are not what gets sent.** The live copy is inlined as string
constants in `supabase/functions/send-email/templates.ts`, and that is
deliberate: Supabase's CLI falls back to server-side (`--use-api`) bundling
whenever Docker is not running locally, and that mode does not ship static
files at all. For a while every deploy silently dropped the template directory,
so `Deno.readTextFile()` 404'd on every send and **no transactional email had
ever actually reached a user**, despite all the calling code being correct.
Inlining removed that whole failure mode.

So: design here, then paste the result back into `templates.ts`. Changing only
these files changes nothing that a customer receives.

There used to be a second copy at `supabase/functions/send-email/templates/`.
It had drifted, missing `contact_enquiry` and `tester_invite`. It is gone; this
folder replaces it.

A correction worth recording: the first extraction of this folder matched
template keys with `[a-z_]+`, which silently skipped `ai_limit_80` because of
the digits, and it was wrongly described as dead. It is live and wired, sent
from `ai-assistant` when a user crosses 80% of their AI budget. All twelve are
here now.

## The templates

| File | Subject | Variables |
|---|---|---|
| `welcome.html` | Welcome to Ephermal | `name` |
| `plan_activated_starter.html` | Your Starter plan is live | `name` |
| `plan_activated_growth.html` | Your Growth plan is live | `name` |
| `plan_activated_scale.html` | Your Scale plan is live | `name` |
| `tester_invite.html` | Your Ephermal tester invite | `name`, `invite_url`, `expires_days` |
| `contact_enquiry.html` | New enquiry | `name`, `from_email`, `message`, `company_suffix` |
| `fatigue_alert.html` | Creative fatigue detected | none |
| `ai_limit_hit.html` | AI credit limit reached | `name` |
| `ai_topup_receipt.html` | Your AI credit top-up | `name`, `credits` |
| `ugc_video_topup_receipt.html` | Your UGC video top-up | `name`, `credits` |
| `payment_failed.html` | Payment failed | `name`, `attempt` |
| `ai_limit_80.html` | AI credits 80% used | none |

`unsubscribe_url` is injected automatically by `send-email` and is available to
every template without being passed.

`_manifest.json` carries the same data machine-readably, generated from the
runtime source.

## Variables

Substitution is `{{ variable_name }}`, replaced by `renderTemplate()` in
`send-email/index.ts`. Values are HTML-escaped on the way in, so a name
containing `<` cannot inject markup.

A variable with no value provided renders as an empty string rather than
leaving the raw `{{ name }}` on screen.

## Testing one

Templates are allowlisted server-side, so only the keys above are accepted:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/send-email" \
  -H "Content-Type: application/json" \
  -H "x-send-email-secret: $SEND_EMAIL_SECRET" \
  -d '{"template":"welcome","to":"you@example.com","vars":{"name":"Jamal"}}'
```

## Design notes for these specifically

Email HTML is not web HTML. What is already true of these and should stay true:

- Table-based layout, because Outlook does not do flexbox or grid.
- Inline styles only. Gmail strips `<style>` blocks in several clients.
- No web fonts. The stack falls back through system faces.
- Width capped around 600px, the safe maximum across desktop clients.
- Dark mode is not assumed; these are designed light and legible on a light
  ground, since client dark-mode handling is inconsistent and often inverts
  colours on its own.
