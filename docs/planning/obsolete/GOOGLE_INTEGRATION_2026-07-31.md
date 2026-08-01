# ⛔ SUPERSEDED — see `in-progress/LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31.md`

**Moved to `obsolete/` on 2026-08-01.** This plan was written on 2026-07-31 without noticing that a better
one for the same feature was already sitting in `pending/`. Two live docs planning one feature is the
duplicate-work failure this repo keeps having, so there is now exactly one.

**Do not build from this file.** It is kept rather than deleted for two reasons:

1. **Its shipped work is real.** G1 (click capture), the double-count fix, seeds 500/501 and the hashing
   module all exist, are tested and are deployed — they are recorded against A1/A2 of the live doc, along
   with the three places the implementation deliberately deviated from it.
2. **One of its decisions was WRONG, and the record of that is the useful part.** It made *Job Secured* and
   *Final Invoice Paid* both primary conversions. Google's click-conversion window maxes out at 90 days,
   and a boundary survey routinely runs quote → delivery → payment past that — so a payment-keyed primary
   conversion would silently under-report the slowest jobs, which are usually the biggest. The live doc's
   Finding 5 has it right: **primary is `Job Created (quote accepted)` valued at `quote_amount`**, with the
   later milestones handled as conversion *adjustments* where the window allows.

---

# Google, integrated into the surveying backend — 2026-07-31

**Status:** IN PROGRESS · opened 2026-07-31 · owner-directed
**Origin:** the owner's brief of 2026-07-31, plus the Google Ads integration methodology supplied with it.

**Owner ask, verbatim:**

> *"Please start fully building out the Google integration into our surveying business backend. I want to be
> able to track all of our ads, conversions, finances, images, videos, user accounts, etc."*

And, on the Ads half specifically:

> *"Integrating your backend database and lead tracking process with Google Ads … allows you to pass actual
> job values and offline milestones back to Google Ads, so that the Smart Bidding AI can actively seek out
> high-value clients who are ready to purchase, rather than just anyone who fills out a contact form."*
>
> *"Instead of combining all steps into a single conversion action, you should create separate conversion
> actions … for each key stage of your funnel (e.g. 'Lead Form Submitted' as secondary, and 'Job Secured' or
> 'Final Invoice Paid' as primary). This gives you complete visibility into your lead lifecycle and allows
> you to bid only on actual booked revenue."*

---

## The one idea this is built on

**A lead is worth what the job it became was worth, and Google can only learn that from us.**

Google Ads sees a click and, at best, a form submit. It cannot see that the form submit on 12 March became a
boundary survey that invoiced $4,800 in April, or that another one was a tyre-kicker who never replied. Every
part of this plan exists to close that loop: capture the click's identity at intake, carry it through the
pipeline the business already runs, and send the outcome back when the outcome is known.

That framing decides the architecture, and it is worth stating what it rules out:

- **We do not build a parallel funnel for Google.** The `leads` table already has the exact lifecycle Google
  wants to hear about (`new → contacted → quoted → accepted/declined/lost`, plus `converted_job_id` and
  `quote_amount`). Conversions are *derived from* status transitions the office already performs. If anyone
  has to remember to do something extra for Google, the data will be wrong within a month.
- **We do not send personal data we were not going to hold anyway.** Enhanced Conversions works on a SHA-256
  hash of an email or phone we already store on the lead. Nothing new is collected from the customer.
- **An upload failure never breaks a business action.** Marking a job secured must succeed whether or not
  Google is reachable. Conversions queue and retry; they do not sit inside the request path.

---

## What already exists (audit first — the standing lesson in this repo)

Checked before planning anything, because the characteristic defect here is building something that already
exists one directory over.

| Piece | State | Where |
| --- | --- | --- |
| **Google OAuth** | **Working**, with refresh-token handling, for Calendar | `lib/integrations/google-calendar.ts` — bare `fetch`, no SDK, offline + `prompt=consent` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **Set** | `.env.local`, shared with next-auth's Google provider |
| `GOOGLE_MAPS_API_KEY` | **Set**, in use | research/parcel services |
| **Lead intake** | **Working**: public forms → `leads` row + Resend mail + in-app notification | `app/api/contact/route.ts` → `lib/leads/intake.ts` |
| **`leads` table** | **Working**, with the full pipeline | `seeds/292_leads.sql` |
| **Jobs, invoices, payments** | **Working**; customer billing lives on `customer_invoices` | not the Stripe `invoices` table — see the memory note |
| **Google Ads** | **LIVE — and the audit found it wrong.** Account `AW-17921491739`, one conversion action, firing client-side | `app/utils/gtag.ts`, `app/components/GoogleAdsScript.tsx` (mounted in the Footer, so every page) |
| **GA4 / Tag Manager** | **Nothing** | — |
| **Google Business Profile** | **Nothing** | — |

**Two consequences.** First, the OAuth work is *done* — Ads, Analytics and Business Profile are new scopes on
an established pattern, not a new auth system. Second, `lib/integrations/` currently holds exactly one file,
so this work is also the moment that directory becomes a real integrations layer rather than a place one
thing happens to live.

> ### ⚠ The audit's most valuable finding: `/contact` was counting every lead TWICE
>
> This section was drafted as *"Google Ads: nothing"*, which was wrong, and the difference matters. Ads is
> live and has been for months — which means the plan is not "start tracking conversions", it is **"the
> Lead Form Submitted conversion already exists; add the offline half and fix what is there."**
>
> Two defects, both fixed 2026-07-31:
>
> **1. Double-counted conversions.** `app/contact/page.tsx` calls `trackConversion()` when the POST
> succeeds, AND a third script in `GoogleAdsScript` polled `/contact` once a second for the literal text
> *"Your request has been received. We will contact you within 24 business hours."* and fired the same
> conversion action when it appeared. Same action, no `transaction_id`, so **one submitted form produced
> two conversions.** The reporting being wrong is the smaller half: Smart Bidding has been optimising
> toward a lead count that is not true, and the account's cost-per-conversion has looked roughly half of
> what it really is.
>
> **2. One copy edit from silence.** Matching a sentence of user-facing prose means that the day someone
> rewords the thank-you message, conversion tracking stops dead, nothing errors, and the account simply
> goes quiet. Nobody would find that for a quarter.
>
> **The fix keeps the explicit call and deletes the poller.** The explicit call fires when the submission
> actually succeeded rather than when a DOM node looks a certain way, it covers **all four** intake
> surfaces rather than only `/contact`, and it now passes the submission's reference number as
> `transaction_id` — so a double-submit, a retry, or a page restored from the back/forward cache cannot
> count twice either.
>
> **What this changes downstream:** the existing conversion action becomes the *secondary* "Lead Form
> Submitted" of the funnel described below, exactly as the owner's brief lays out. It does not need to be
> recreated. And because the tag is already installed sitewide, **Enhanced Conversions can be switched on
> for it** with hashed data from the same forms — G2-2's hashing has a client-side use as well as a
> server-side one.

---

## Ground rules

1. **The office's normal workflow is the trigger.** A conversion fires because a lead's status changed, not
   because someone pressed a "send to Google" button. No parallel process.
2. **Never block a business action on an external API.** Queue, retry with backoff, surface failures on an
   admin screen. A Google outage must be invisible to Hank.
3. **Hash before it leaves the building.** Emails and phones are normalized and SHA-256'd locally. The raw
   value is never in a request body to Google.
4. **Idempotent by construction.** Every upload carries a stable key so a retry cannot double-count revenue.
   Double-counted conversions do not just look wrong; they actively mistrain Smart Bidding.
5. **Authored is not shipped.** A slice is not done until someone can see it by clicking, starting from
   `/admin`. This repo's most common defect is finishing something nobody can reach.
6. **Money is measured, never estimated.** "Job Secured" carries the accepted quote; "Invoice Paid" carries
   what was actually paid. If the two disagree, the paid figure wins and the difference is visible.

---

## Phase G1 — the identity of a click

*Without this nothing else works: a conversion Google cannot match to a click is a conversion Google ignores.*

- [x] **G1-1 — Capture the click identifiers on landing. SHIPPED 2026-07-31.**
      `lib/leads/attribution.ts` (pure rules, 18 tests) + `app/components/AttributionCapture.tsx`, mounted
      once in the root layout inside `Suspense`. **`localStorage`, not a cookie** — a cookie rides on every
      request including images and API calls for something only the form reads, and a client-set cookie is
      capped at 7 days by Safari's ITP, which would silently lose most of a 90-day window on iPhones.
      **First write wins:** an ad click is not overwritten by a later organic visit, because the ad is what
      bought that customer; a click DOES replace a UTM-only record, because it is strictly better
      information. Ninety days, matching Google's own click lookback — longer would only produce uploads
      Google rejects.

- [x] **G1-2 — Carry them through every intake form. SHIPPED 2026-07-31.**
      All **four** surfaces, not the three the plan named: `app/contact/page.tsx`, `app/page.tsx`,
      `app/components/ContactForm.tsx`, `app/components/SurveyCalculator.tsx` — and both payload shapes,
      since two of them switch to `FormData` when the customer attaches files. The route reads an explicit
      allowlist of fields rather than spreading whatever the client sent, because this is a public endpoint
      and spreading arbitrary keys into a database row is how an unexpected column gets written.

- [x] **G1-3 — `seeds/500_lead_attribution.sql`. WRITTEN 2026-07-31** (not yet applied to live).
      Thirteen nullable columns. `client_ip_hash` is a salted HMAC, never the address: an IP is personal
      data and Enhanced Conversions has no use for it. Partial indexes on `gclid` and `utm_campaign`,
      because "leads that came from an ad" is a small minority of rows and a full index would be mostly
      NULLs.

- [ ] ~~**G1-1 — Capture the click identifiers on landing.**~~ A small client module stores `gclid`, and also
      `gbraid` / `wbraid` (the iOS/app-campaign identifiers that exist precisely because `gclid` is often
      absent now), plus `utm_source/medium/campaign/term/content`, in a first-party cookie with a 90-day
      life. **Capture on the first page of the session and read at submit** — a visitor commonly lands on
      `/services` from an ad and converts from `/contact`, and a naive "read the current URL" version
      records nothing for exactly the journeys that matter most.

- [ ] ~~**G1-2 — Carry them through every intake form.**~~ `/contact`, the home-page form, and the pricing
      calculator all post to `app/api/contact/route.ts`. The fields ride along as hidden inputs, and
      `buildLeadRowFromForm` maps them onto the lead. **All three surfaces, verified individually** — the
      intake module's own history is that one form was email-only long after the others were not.

- [ ] ~~**G1-3 — `seeds/500_lead_attribution.sql`.**~~ Columns on `leads`: `gclid`, `gbraid`, `wbraid`,
      `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `landing_page`,
      `first_seen_at`, `client_user_agent`, `client_ip_hash`. All nullable — a phone lead has none of them
      and that is not an error, it is the majority of leads at a surveying firm.

- [ ] **G1-4 — Show attribution where leads are read.** `/admin/leads` gains a source column that says
      *Google Ads · campaign name* rather than the raw `gclid`. The point is not decoration: the first
      question anyone asks of this system is "did the ads actually bring this one in", and if the answer
      lives only in a database column, nobody will ever ask it.

---

## Phase G2 — conversions out

- [ ] **G2-1 — The conversion queue.** `seeds/501_google_conversions.sql`: `google_conversion_events`
      (`id`, `lead_id`, `job_id`, `action` (`lead_submitted` | `job_secured` | `invoice_paid`), `value`,
      `currency`, `occurred_at`, `gclid`/`gbraid`/`wbraid`, `hashed_email`, `hashed_phone`, `status`
      (`pending` | `sent` | `failed` | `skipped`), `attempts`, `last_error`, `google_response`,
      `idempotency_key` UNIQUE). **The unique key is the whole design** — it is what makes a retry safe.

- [ ] **G2-2 — Hashing that matches Google's rules exactly.** Lowercase, trim, strip dots and `+tags` from
      Gmail addresses, E.164 the phone. **Pure module, unit-tested against Google's published examples**,
      because a hash that is subtly wrong fails silently: Google accepts the upload, matches nothing, and
      reports a healthy-looking zero.

- [ ] **G2-3 — Enqueue on status change.** One place (`lib/integrations/google/ads-events.ts`) that the
      leads PATCH route and the invoice-paid path both call. `quoted → accepted` (or `converted_job_id`
      being set) enqueues **Job Secured** at `quote_amount`; a `customer_invoices` row going paid enqueues
      **Invoice Paid** at the amount actually paid. Lead creation enqueues **Lead Form Submitted** at 0.

- [ ] **G2-4 — The uploader.** Google Ads API `uploadClickConversions` /
      `uploadConversionAdjustments`, using the existing OAuth pattern plus a developer token and
      `login-customer-id`. Batched, exponential backoff, `PARTIAL_FAILURE` handled **per row** — a batch
      where one lead has a malformed hash must not fail the other forty-nine.

- [ ] **G2-5 — The cron.** Runs every 15 minutes over `status = 'pending'`. Lands in the existing
      `app/api/cron/` family so it inherits the schedule and auth already in place.

- [ ] **G2-6 — `/admin/integrations/google` — the screen that makes it real.** Connection status, the last
      50 events with their state, what failed and why, and a manual retry. **This is the slice that makes
      the phase honest**: without it, a silently failing uploader looks exactly like a quiet month.

- [ ] **G2-7 — The three conversion actions, documented as configuration.** *Lead Form Submitted* (secondary,
      no value), *Job Secured* (primary, value = accepted quote), *Final Invoice Paid* (primary, value =
      paid). Their Google-side resource names live in env vars, not in code — they differ per Ads account
      and hardcoding them is how a staging test writes into the live account.

- [ ] **G2-8 — A CSV fallback.** `gclid`, `conversion_name`, `conversion_time`, `conversion_value`,
      `conversion_currency`, exported from the same queue. Needed on day one, before API access is
      approved, and permanently useful as the way to verify what the API is doing.

---

## Phase G3 — Analytics, and the money in

- [ ] **G3-1 — GA4 via Tag Manager**, consent-mode aware, with the container id in env. Server-side events
      for the milestones that happen off-site (job secured, invoice paid) so GA4 and Ads tell the same story.
- [ ] **G3-2 — Ads spend into `/admin/finances`.** Daily cost pulled per campaign and stored, so cost per
      booked job is a number the business can see beside its other numbers rather than in a separate tab.
- [ ] **G3-3 — The one report worth building:** by campaign — spend, leads, quoted, secured, paid, and
      cost per secured job. Every other Google report already exists inside Google. This one cannot, because
      only we know what a lead became.

---

## Phase G4 — images, video, accounts

- [ ] **G4-1 — Google Drive** as an export target for job files and receipts, reusing the File Explorer's
      existing `mnt:` mount concept rather than a new uploader.
- [ ] **G4-2 — Photos/Video handling** for field media: thumbnails, EXIF (including GPS, which for a
      surveying firm is genuine evidence rather than metadata), and a shareable link per job.
- [ ] **G4-3 — Google sign-in for staff**, extending the next-auth provider that is already configured, with
      the role mapping the app already has.
- [ ] **G4-4 — Google Business Profile**: pull reviews into `/admin`, and prompt for one at the moment a job
      closes. The highest-value marketing integration after Ads, and the cheapest to run.

---

## Phase G5 — the thing that decides whether any of this is trusted

- [ ] **G5-1 — Reconciliation.** A weekly job that compares what we believe we uploaded against what Google
      reports. Silent divergence is the failure mode of every offline-conversion setup, and nobody notices
      for a quarter.
- [ ] **G5-2 — A test mode** that writes to a sandbox account, so the whole path can be exercised without
      touching live bidding.

---

## Slice order

**G1-1 … G1-4** (nothing works without the identifiers) → **G2-1 … G2-3** (queue + hashing + enqueue, all
testable with no Google access at all) → **G2-8** (CSV, so value is delivered before API approval) →
**G2-4 … G2-7** (the live API path) → **G3** → **G4** → **G5**.

**G1 and G2-1…G2-3 and G2-8 need no Google account access whatsoever.** That is deliberate: the credential
and developer-token approval is the slowest part of this project and it is entirely outside our control, so
the plan is arranged so that waiting on it blocks as little as possible.

## What the owner needs to supply, and when it is actually needed

Listed separately from the build so nothing is "blocked" that is not really blocked:

| Needed | For | When |
| --- | --- | --- |
| Google Ads customer ID | G2-4 | Before the live uploader, not before the queue |
| Developer token (Ads API) | G2-4 | Approval can take days — worth starting now |
| The three conversion actions, created in the Ads UI | G2-7 | Before the first live upload |
| GA4 measurement ID / GTM container | G3-1 | G3 only |

---

## Why this stays good

The conversions are **derived from the pipeline the business already runs**, so they cannot drift from
reality without the pipeline itself being wrong. The queue is **idempotent**, so the worst outcome of any
failure is a delay rather than a corrupted bidding signal. And every stage is **visible on an admin screen**,
which is the difference between an integration that is trusted and one that is quietly switched off.
