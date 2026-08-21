# Meta app: what to fix, in order. 2026-08-21

App ID `1504672747779574`. Everything below was read live from the Meta API just
now, not from memory.

## Your question first: can you add testers without them signing up?

**Yes.** Nothing has to happen in Ephermal first. Meta app roles are attached to a
Facebook account, not to your app's user table, so you can add all of them today
and they will work the moment they connect Meta in Ephermal.

Two things to know before you try:

- **They must accept.** Adding someone creates a request. Until they accept it at
  `developers.facebook.com/requests`, they are not a tester and the connect flow
  will still fail for them. Tell them to expect it.
- **Search is by Facebook account, not reliably by email.** The Add People box
  looks people up by name or Facebook username. If you only have an email and it
  does not resolve, ask them for the name on their Facebook account or their
  profile URL. Do not assume the email will find them.

You have **0 of 50 tester slots used**, and testers work in Development Mode with
no App Review at all. So this alone unblocks Muteeb and Muhammad Basit for Meta.

## Current state, read live

| Setting | Value now | Needs doing |
|---|---|---|
| App status | `dev_mode`, `is_live: false` | Stays until review passes. Fine for testers. |
| Contact email | jamalsettah2604@gmail.com | **Not verified.** Blocks review. |
| Data deletion URL | **null** | **Empty.** The page exists, it is just not entered here. |
| Privacy policy URL | `/privacy.html` | Works (301 to `/privacy`, returns 200). Worth cleaning up. |
| Terms URL | `/terms.html` | Works (301 to `/terms`, returns 200). Worth cleaning up. |
| Business verification | `false` | **The real gate.** Needs the business registered. |
| Review history | no submissions, never reviewed | Nothing is pending, despite what one endpoint claims. |

One correction to something I told you earlier in the session: the requirements
endpoint returns "Cannot submit while a previous submission is in review". That
is stale. The history endpoint returns `submissions: []` and
`has_been_previously_reviewed: false`, so nothing has ever actually been
submitted. I checked rather than repeat it.

## Do these now, in this order

### 1. Add your two testers (2 minutes, unblocks them today)

App Dashboard → **App Roles** → **Roles** → **Add People** → choose **Tester**.

Add Muteeb Tahir and Muhammad Basit. Then message them: *"Accept the Meta
developer request at developers.facebook.com/requests, then the Meta connect
button will work."*

Without this step they hit a wall on Meta and only the Google side works.

### 2. Verify the contact email (1 minute)

Settings → **Basic** → next to Contact Email there is a verify prompt. Click it,
open the email Meta sends, click the link. This is a hard requirement for review
and it currently reads `contact_email_verified: false`.

### 3. Set the data deletion URL (1 minute)

Settings → **Basic** → **User Data Deletion** → choose *Data Deletion URL* and
paste:

```
https://ephermal.app/data-deletion
```

Confirmed live, returns 200, no redirect. This is required for review and is
currently empty.

### 4. Clean up privacy and terms URLs (1 minute, optional)

Both currently point at the old `.html` paths. They work, but they 301 first, and
a crawler that does not follow redirects sees a non-200. Replace with:

```
https://ephermal.app/privacy
https://ephermal.app/terms
```

### 5. Business verification (the actual blocker, not today)

`business_verification_passes: false`. This needs the business registered, which
is the Steuerberater conversation. Nothing else can be done here until that
happens, so do not lose time on it now.

## What is NOT blocking you

App Review itself. Every permission still needs a screencast, an API pre-check
and a data use checkup, and business verification has to pass first anyway.
None of that matters for testers, because Development Mode grants your requested
permissions to anyone in a role on the app.

So: steps 1 to 4 take about five minutes and unblock everything you actually need
this week. Step 5 waits on the accountant.
