# Lead-to-cash attribution & Google Ads offline conversions — 2026-07-31

**Status:** IN PROGRESS · activated 2026-08-01 · **this is the live Google doc** — stop-hook driven.

> ## ⚖ RECONCILED 2026-08-01 — this doc absorbs `GOOGLE_INTEGRATION_2026-07-31.md`, not the other way round
>
> On 2026-07-31 a second Google plan was written (`GOOGLE_INTEGRATION_2026-07-31.md`) without noticing this
> one sitting in `pending/`. **That was the duplicate-work failure this repo keeps having**, and it is worth
> saying plainly rather than quietly deleting one of them.
>
> **This doc wins, because it is better.** Its A0 audit found six things; the other found three, and all
> three of those are in here too (the missing `gclid`, the double-firing conversion, the existing OAuth
> pattern). The three it found that the other missed are each load-bearing:
>
> - **Finding 4 — there is no `customers` table.** Client identity is free text copied onto every row, so
>   *"track recurring customers"* is currently unanswerable. That is a prerequisite, not polish.
> - **Finding 5 — the 90-day window decides the bid target, and the other plan got this WRONG.** It made
>   *Job Secured* **and** *Final Invoice Paid* both primary conversions. A boundary survey routinely runs
>   quote → delivery → payment past 90 days, and Google rejects uploads outside the window — so a
>   payment-keyed primary conversion would silently under-report the best jobs, which are usually the
>   slowest. **Primary is `Job Created (quote accepted)` at `quote_amount`;** later milestones are
>   conversion *adjustments* where the window allows, and internal analytics where it does not.
> - **Finding 6 — the phone is the biggest hole after `gclid`.** `leads.source` defaults to `'Phone'`; a
>   phone lead has no click to key on. Scoped as A13 and deliberately off the critical path, but nobody
>   should read the funnel dashboard as full coverage.
>
> `GOOGLE_INTEGRATION_2026-07-31.md` has moved to `obsolete/` with a pointer here. **What it SHIPPED is
> real and is recorded against A1/A2 below** — the code exists, is tested, and is deployed.

### What is already built, and where it deviates from this plan

**A1 and A2 shipped on 2026-07-31** under the other doc's numbering. Three deliberate deviations, each
recorded here rather than left for someone to discover as a discrepancy:

| This plan said | What shipped | Why |
| --- | --- | --- |
| Cookie `ss_attr`, 90 days | **`localStorage`**, 90 days (`lib/leads/attribution.ts`) | A client-set cookie is capped at **7 days by Safari's ITP**, which would silently lose most of a 90-day window on iPhones. A cookie also rides on every request — including images and API calls — for something only the form reads. |
| Seed **469** | Seed **500** (`500_lead_attribution.sql`, applied live) | 469 was not free by the time the slice ran. **A2's claimed seed numbers below are stale — check before use.** |
| `email_sha256` / `phone_sha256` stored on the lead at insert | **Not stored.** Hashing lives in `lib/integrations/google/hash.ts` and runs at enqueue time | Open question, not a decided deviation — see the note under A3. Storing at insert keeps the ability to hash after an email is edited or erased; computing at upload guarantees the normalisation is current. **The plan's version is probably right and this should be revisited in A3.** |
| Three intake forms | **Four** (`/contact`, home, `ContactForm`, `SurveyCalculator`) | "The three intake forms" was already an undercount when this plan was written. |

Also shipped beyond A1/A2: `seeds/501_google_conversions.sql` (the outbox — A7/A8's queue, applied live),
`lib/integrations/google/hash.ts` with 16 tests, and — from `SURVEYING_BACKEND_ANALYSIS_2026-08-01` — a
rate limiter and honeypot in front of the same intake forms.

**Owner ask, verbatim:**

> *"We also need to be able to integrate with the website on the backend to track which all jobs are actual
> conversions. I have it set up on the backend so that each inquiry that comes in creates a query underneath
> the potential customer's name. The information is saved. Once Daddy has talked to the potential client and
> gotten more info, he can give the official quote, which he will record. If they accept, Then he will create
> the job and start the research phase. Then we would do the job and curate the deliverables and get them to
> the customer and secure the final payment. I want to integrate it into google so that we can track every
> step of the job process so that we can track exactly what is happening with each lead an get a better idea
> of the true lead costs and life cycle of a job. We can also track reoccurring customers as well. I want to
> be able to track all of this on my website as well as integrate google so that it can also keep track of
> everything so that we can make our ad campaigns and stuff as good as possible."*

**Google support's reply, and what it got right:** the agent correctly named the mechanism — *Offline
Conversion Imports* / *Enhanced Conversions for Leads* — and correctly said Google can't build it, because it
is backend work in our codebase. Their two links are the right references and are cited in A7/A8 below. Nothing
in their answer changes the design; it confirms it.

---

## The one idea this is built on

**Attribution is a stamp taken once at the front door, carried by one identity, all the way to the last dollar.**

Everything that makes this hard is a consequence of *not* doing that. Today the pipeline is four disconnected
things: a `leads` row, a `jobs` row joined by a nullable FK, a `customer_invoices` row, and a `gtag` call fired
from a React component that knows nothing about any of them. The click that paid for the lead is never written
down anywhere, so by the time the job is delivered there is no way — none, at any price — to say which ad
bought it.

So the build is not "add Google tracking to the pipeline." It is:

1. **Capture the click** at first touch and never lose it.
2. **Give the customer an identity** so a second job from the same person is recognisably the same person.
3. **Write one lifecycle event stream** that every stage transition appends to.
4. **Make Google a downstream consumer** of that stream — an exporter, not a sprinkling of tag calls.

The fourth step is the easy one. It is only easy *because* of the first three, and it is impossible without
them. If this plan gets cut for time, cut from the back.

### Ground rules

- **G1 — Attribution is captured once, at the door, and never re-derived.** `gclid` / `gbraid` / `wbraid`,
  UTMs, referrer, and landing page are read on the *first* page view of a session and held in a first-party
  cookie until a form is submitted. **There is no backfill.** A click not captured on the day it happened is
  gone forever — which is why A1 ships before anything else, even though it's the least interesting slice.
- **G2 — One event stream.** Every milestone appends to `lead_lifecycle_events`. Google exporters, the funnel
  dashboard, and the lead timeline all read *that table* and nothing else. No consumer re-derives a stage by
  joining six date columns.
- **G3 — Exports are idempotent and replayable.** Every uploaded row carries a stable dedupe key. Re-running
  yesterday's export must never double-count a conversion or double-count a dollar.
- **G4 — Our database is the truth; Google is a copy.** If an upload is rejected, our funnel numbers stay
  correct and the row stays queued. We never mutate business state to satisfy an export.
- **G5 — Raw PII never leaves the building.** Email and phone are normalised then SHA-256 hashed before they
  enter any Google payload, per Google's own spec. The hash is computed server-side, not in the browser.
- **G6 — Nothing fires a conversion by watching the DOM.** The current polling snippet is retired in A2.
- **G7 — A customer is a row, not a string.** "Reoccurring customers" is unanswerable while the client is six
  free-text columns copied onto every job.
- **G8 — Every dollar has exactly one definition.** `quote_amount`, `final_amount`, and `amount_paid` are three
  different numbers. Each conversion action declares which one it sends, in writing, in the exporter.

---

## A0 — The audit. DONE 2026-07-31, and it changes three assumptions in the ask.

### What already exists (and it is more than expected)

| Thing | Reality |
| --- | --- |
| `leads` | `seeds/292_leads.sql`. `status` ∈ `new/contacted/quoted/accepted/declined/lost`, plus `source`, `quote_amount`, `survey_type`, `estimated_acreage`, `assigned_to`, `follow_up_date`, `converted_job_id` → `jobs(id)`. |
| Lead intake | `lib/leads/intake.ts` — the public form at `app/api/contact/route.ts` INSERTs a lead *and* emails. Also `lead_replies` (319), `lead_notes` (320), attachments + bucket (317/318). |
| `jobs` | `seeds/000_baseline_tables.sql:686`. Already carries the **entire lifecycle**: `stage`, `stage_changed_at`, and `date_received / date_quoted / date_accepted / date_started / date_fieldwork_complete / date_drawing_complete / date_legal_complete / date_delivered`, plus `quote_amount`, `final_amount`, `amount_paid`, `payment_status`, and `result` ∈ `won/lost/abandoned`. |
| Stages | `quote → research → fieldwork → drawing → legal → delivery → completed`, plus `cancelled` / `on_hold` (`lib/hub/widgets/my-jobs/index.tsx:87`). This **already matches the owner's described process exactly.** |
| `job_stages_history` | Exists: `from_stage`, `to_stage`, `changed_by`, `notes`, `created_at`. A stage-transition log is already there. |
| Money | `customer_invoices` (`seeds/323_payment_foundations.sql`) with `total_cents`, `status`, `paid_at`, `job_id`. Final payment is already an observable event. |
| Lead → job | `app/admin/jobs/new/page.tsx:124-136` creates the job and stamps `converted_job_id` back onto the lead. `app/api/admin/jobs/[id]/origin-lead/route.ts` reads it back. |
| Google Ads today | Account **`AW-17921491739`**, one conversion label `-sTrCMb9xP8bEJuG0eFC` (`app/utils/gtag.ts`). `GoogleAdsScript` is mounted **in the Footer** (`app/components/Footer.tsx:104`), so gtag.js loads on every public page. |
| Conversion fires | Three client-side call sites: `ContactForm.tsx:78`, `SurveyCalculator.tsx:310` and `:326`, `app/page.tsx:231`. All fire the *same* label with no value and no identifiers. |
| Google OAuth pattern | Already solved once: `lib/integrations/google-calendar.ts` + `google_calendar_connections` (297) — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, refresh-token storage, expiry refresh. **A8 copies this wholesale.** |
| Config + cron | `app_settings` (key → JSONB, seed 294) for settings; 14 existing cron routes under `app/api/cron/*` as the pattern for the upload job. |

### Finding 1 — the pipeline the owner describes is already built. The *attribution* is what's missing.

`jobs.stage` + the eight `date_*` columns + `job_stages_history` already model inquiry → quote → accept →
research → fieldwork → drawing → legal → delivery → paid. **This plan does not need to build the lifecycle.**
It needs to (a) normalise it into one queryable stream, and (b) attach a click to the front of it. That makes
this a substantially smaller build than the ask implies — and it means the risky, time-sensitive part is A1.

### Finding 2 — there is no `gclid`, no UTM, and no referrer stored anywhere. Not one.

A repo-wide grep for `gclid|gbraid|wbraid|utm_` returns **zero** hits outside `rel="noopener noreferrer"`.
Offline conversion import is keyed on `gclid` (or, for the Enhanced-Conversions path, on hashed user data).
Neither is captured. Every lead currently in the table is **permanently unattributable** — nothing in A1–A14
can recover it. Attribution history starts the day A1 ships, and the owner should know that before we begin.

### Finding 3 — the contact page fires its conversion twice.

`ContactForm.tsx:78` calls `trackConversion()` on a successful POST. Independently,
`GoogleAdsScript.tsx:54-75` polls the DOM once a second on `/contact` and fires **the same label** when
`.contact-form-section__success-text` appears (`app/contact/page.tsx:330`). One submission, two `gtag` events.
Depending on the conversion action's counting setting this is either inflating the count or being silently
deduped — either way the number in the Ads UI does not mean what it appears to mean, and every
cost-per-conversion figure derived from it is suspect. Fixed in A2.

### Finding 4 — "reoccurring customers" is currently unanswerable.

There is no `customers` or `clients` table. Client identity is free text copied onto each row
(`jobs.client_name / client_email / client_phone / client_company`, and `leads.name / email / phone`). Two jobs
for the same landowner are two unrelated strings. A3 is not optional polish; it is the prerequisite for repeat
rate, lifetime value, and for the "is this lead actually new?" question at intake.

### Finding 5 — the 90-day window will bite, and it decides which milestone is the bid target.

Google's click-conversion window maxes out at 90 days, and offline uploads are rejected outside the configured
window. A boundary survey routinely runs quote → delivery → final payment past that. **Therefore: the primary
bidding conversion must be `Job Created (quote accepted)`, valued at `quote_amount`** — the last milestone that
reliably lands inside the window — with the delivered/paid milestones handled as *conversion adjustments*
(restatements) where the window allows, and as internal-only analytics where it doesn't.

> **Verify before building A7/A8:** exact current limits for the conversion window, the minimum 6-hour
> click-to-upload delay, and the adjustment (restatement/retraction) window. These numbers move. This plan must
> not encode a remembered figure — read them off Google's docs at build time and put the date read in a comment.

### Finding 6 — the phone is the biggest hole after `gclid`.

For this business a large share of inquiries arrive by phone, and `leads.source` defaults to `'Phone'`. A phone
lead has no click to key on. The contact form already collects `how_heard`, which is self-reported and weak but
better than nothing. Google's call-reporting / call-tracking numbers are the real answer. Scoped as A13, and
deliberately *not* on the critical path — but flagged now so nobody reads the funnel dashboard as complete
coverage.

---

## The pipeline, named once

This is the vocabulary every slice uses. Left column is the owner's words; right column is where it already
lives.

| # | Milestone | Owner's words | Where it lives today |
| --- | --- | --- | --- |
| 1 | `inquiry_received` | "each inquiry that comes in creates a query" | `leads` INSERT, `status='new'` |
| 2 | `contacted` | "once Daddy has talked to the potential client" | `leads.status='contacted'` |
| 3 | `quoted` | "he can give the official quote, which he will record" | `leads.status='quoted'` + `quote_amount`; `jobs.date_quoted` |
| 4 | `quote_accepted` | "if they accept" | `leads.status='accepted'` |
| 5 | `job_created` | "then he will create the job" | `jobs` INSERT + `leads.converted_job_id` |
| 6 | `research_started` | "and start the research phase" | `jobs.stage='research'` |
| 7 | `fieldwork_complete` | "then we would do the job" | `jobs.date_fieldwork_complete` |
| 8 | `deliverables_sent` | "curate the deliverables and get them to the customer" | `jobs.stage='delivery'`, `date_delivered` |
| 9 | `payment_received` | "secure the final payment" | `customer_invoices.paid_at` / `jobs.payment_status` |
| ✗ | `lost` | (implicit) | `leads.status ∈ declined/lost`; `jobs.result='lost'` |

**Which of these become Google conversion actions:** only four. Google's bidding degrades when fed a dozen
overlapping actions.

| Google conversion action | Milestone | Value sent | Primary for bidding? |
| --- | --- | --- | --- |
| `Lead — Inquiry` | 1 | none | No (observation only) |
| `Lead — Quoted` | 3 | `quote_amount` | No |
| **`Job — Won`** | 5 | `quote_amount` | **Yes** |
| `Job — Paid` | 9 | `amount_paid` (as an *adjustment* restating `Job — Won` where the window allows) | No |

Milestones 2, 6, 7, 8 stay internal — they drive the cycle-time dashboard, not the bid.

---

## Slices

Ordered by dependency. **A1 first, always** — every day it isn't shipped is a day of clicks we can never
attribute.

### A1 — Capture the click at the door
*The whole plan rests on this slice. It is also the smallest.*

- `lib/attribution/capture.ts` — pure functions: read `gclid` / `gbraid` / `wbraid` / `utm_source` /
  `utm_medium` / `utm_campaign` / `utm_term` / `utm_content` from the URL; capture `document.referrer` and the
  landing path. **First-touch wins** — a returning visitor's later organic visit must not overwrite the paid
  click that started it. Cookie `ss_attr`, 90 days, `SameSite=Lax`, first-party.
- Every public intake form posts the cookie's payload as a hidden field: `ContactForm`, `app/page.tsx`'s form,
  `SurveyCalculator`.
- `app/api/contact/route.ts` writes it through `lib/leads/intake.ts` onto the new lead row.
- **Seed 469** — `leads` gains `gclid`, `gbraid`, `wbraid`, `utm_source`, `utm_medium`, `utm_campaign`,
  `utm_term`, `utm_content`, `referrer`, `landing_page`, `first_seen_at`, plus `email_sha256` /
  `phone_sha256` (G5, computed server-side at insert).
- Tests: first-touch-wins, malformed/absent params, cookie round-trip, hash normalisation
  (lowercase + trim for email; E.164 for phone).

**Acceptance:** submit the contact form from a URL carrying `?gclid=TEST123&utm_source=google`, then read the
`leads` row back and see `TEST123`. That single check is the slice.

### A2 — One conversion path, no DOM polling ✅ SHIPPED 2026-07-31

> **Done.** The polling script is deleted and `trackConversion(transactionId)` carries the submission
> reference as `transaction_id`, so a retry or a bfcache restore cannot double-count either. **GA4 remains
> the open owner decision** — there is still no `G-` measurement ID, so nothing is receiving GA4 events.
- Delete the polling script from `GoogleAdsScript.tsx` (Finding 3). The React call sites are the only path.
- `trackConversion()` gains an optional `{ value, transactionId }` so the browser-side lead event carries the
  dedupe key that A7's offline upload will reuse (G3).
- Decide GA4: today only `AW-` is configured, no `G-` measurement ID, so there is **no GA4 property receiving
  anything**. Either stand one up here or record explicitly that Ads-only is the choice. *(Owner decision — see
  Open questions.)*
- Test: one submit → exactly one `gtag('event','conversion')`.

### A3 — A customer is a row ✅ SHIPPED 2026-08-01
- **Seed 470** — `customers` (`id`, `display_name`, `primary_email`, `primary_phone`, `company`,
  `email_sha256`, `phone_sha256`, `first_lead_at`, `job_count`, `lifetime_value_cents`, `is_repeat`) plus
  `customer_id` FKs on `leads` and `jobs`.
- `lib/customers/identity.ts` — normalise + match on email, then phone, then (name + address) as a suggestion
  only. **Auto-merge on exact email/phone; everything weaker is a suggested merge an admin confirms.** Silent
  fuzzy merging of two landowners is worse than a duplicate.
- Backfill from existing leads and jobs; report the match rate rather than asserting it.
- Intake shows "⟳ Returning customer — 2 previous jobs" on the lead detail page.

> **Done.** `seeds/503_customers.sql` (applied live — the doc's claimed 470 was taken; **its seed numbers
> are stale, check `ls seeds/` before claiming one**), `lib/customers/identity.ts` with 14 tests, the
> backfill script, and the badge on the lead detail page.
>
> **The auto-merge rule is the whole slice, and the tests are weighted to it.** Same normalised email or
> phone → merge. Same *name*, same *company*, same *address* → a row in `customer_merge_suggestions` and a
> human decision. There are more tests pinning what must NOT merge than what must, because a duplicate row
> is untidy and reversible while a wrong merge puts one landowner's invoices and balance under another
> person's name — and nobody finds out until somebody is billed for a survey they never ordered.
>
> **Email beats phone** where both could match: a phone is far likelier to be shared (a household, a
> switchboard, a spouse) than an address.
>
> **It hashes with the Ads module** (`lib/integrations/google/hash.ts`), not a local normaliser, so a
> customer's match key and their conversion key can never be computed two different ways — the Gmail rule
> is exactly the detail that would end up subtly right in one file and subtly wrong in the other. That also
> **settles the open deviation flagged at the top of this doc**: the hashes ARE stored on the row, as the
> plan wanted, because they do double duty and because computing them at upload would make a customer who
> later corrects or erases their email retroactively unattributable.
>
> **Backfill reported rather than asserted, exactly as this slice asked:** 4 of 4 leads matched and linked
> (100%); **0 of 2 jobs**, because both carry no usable email or phone and are therefore *permanently*
> unlinkable by identity. That is a fact about the historical data, not a failure — and it is the kind of
> number a backfill that just printed "done" would have hidden. Re-running scans 0 rows, so it is idempotent.
>
> ⚠ **Not browser-verified.** `/admin` needs a Starr staff session this environment does not have, so the
> badge was never rendered on screen. `__tests__/customers/lead-repeat-badge.test.ts` locks the chain that
> the "authored but not shipped" defect actually breaks — column selected → API returns it → client reads
> it → badge conditional on `is_repeat` → the class has styling behind it — but **someone should look at
> it** the next time they are signed in as staff.

### A4 — The lifecycle event stream ✅ SHIPPED 2026-08-01

> **Done.** `seeds/504_lead_lifecycle_events.sql` (applied live), `lib/pipeline/events.ts` with 14 tests,
> writers on the intake path and the leads PATCH route, and `scripts/backfill-lifecycle.mjs`.
>
> **Nothing here is a new fact about the business** — the lifecycle was already recorded across eight
> `jobs.date_*` columns, `job_stages_history`, six `leads.status` values and `customer_invoices.paid_at`.
> What did not exist was one place to ASK about it. The value of the table is not the data; it is that
> there is now exactly one definition of "quoted" instead of one per consumer.
>
> **The backfill's flag is the part that matters.** All 10 derived milestones carry
> `metadata.pre_attribution = true`, because Finding 2 is real: not one lead before 2026-07-31 has a
> `gclid`, a UTM or a referrer. Without the flag the funnel would average them into cost-per-lead and
> report a number that is arithmetically clean and completely false — real conversions divided by ad spend
> that never bought them. **The dashboard (A12) must exclude them, which means it has to be able to see
> them.**
>
> **Idempotency was proved, not assumed:** first run inserted 10, second inserted 0 and found 10 present.
> The keys come from `dedupeKeyFor`, the same function the live writers use — if the backfill built keys
> its own way, a re-run would duplicate every historical milestone, and a duplicated `job_created` is a
> job counted twice in the revenue signal Smart Bidding trains on.
>
> **Two judgements worth recording:**
> - `payment_received` is keyed on the **invoice**, not the job. A job can be invoiced more than once, and
>   keying on the job would silently drop every payment after the first.
> - `job_created` uses `date_accepted` in preference to `created_at` — the event Google should attribute is
>   when the customer said yes, not when someone got round to typing it in.
>
> Statuses whose exact instant is not recorded anywhere are backfilled at `updated_at` and flagged
> `approximate_time`, rather than being given a timestamp that looks precise and is not.
- **Seed 471** — `lead_lifecycle_events` (`id`, `lead_id`, `job_id`, `customer_id`, `milestone`, `occurred_at`,
  `value_cents`, `actor`, `source_table`, `source_id`, `metadata jsonb`, `dedupe_key UNIQUE`).
- `lib/pipeline/events.ts` — one `recordMilestone()` writer. Called from: the leads PATCH route, the job-create
  route, the job stage-change path, and the invoice-paid path. Idempotent on `dedupe_key`.
- **Backfill** from what already exists: `job_stages_history`, the eight `jobs.date_*` columns,
  `customer_invoices.paid_at`, `leads.created_at/updated_at`. Historical rows get milestones but no
  attribution — that's Finding 2, and the dashboard must label them "pre-attribution" rather than folding them
  into cost-per-lead maths.

### A5 — The official quote, recorded as an object ✅ SHIPPED 2026-08-01
*The owner names this step explicitly; today it's one nullable number that a revision overwrites.*

> **Done.** `seeds/505_lead_quotes.sql` (applied live), `lib/leads/quotes.ts` with 17 tests,
> `/api/admin/leads/[id]/quotes` (GET/POST/PATCH), and `QuotesCard` on the lead detail page.
>
> **What this recovers is INFORMATION, not arithmetic.** With one overwritable number, the moment a
> customer said "can you do it for less?" we lost what we first asked for — and with it the discount rate,
> every decline reason, and the question of which figure a won job should report to Google.
>
> **A revision is a new row, never an edit**, and `(lead_id, version)` is UNIQUE at the database level so
> history cannot be quietly rewritten. Verified against the live database: v1 $1,500 → superseded, v2
> $1,200 → sent, and a duplicate v2 refused with a unique violation. (Test rows removed afterwards.)
>
> **A decline must carry a reason, and the module refuses one without it.** That is the only moment the
> reason is knowable — nobody reconstructs "why did we lose that one" a month later — and accepting a
> blank would produce a "why we lose" report full of empty strings, which reads as data and is not. The
> form asks for it in the same breath rather than letting someone press Decline and be rejected.
>
> **Zero is a valid quote.** A no-charge survey — a favour, a warranty revisit, a goodwill callback — is a
> real thing this business does, and rejecting it would push the office into typing a fake number.
>
> **`leads.quote_amount` survives as a derived mirror**, because the leads board, the detail page, the
> conversion flow and at least one report read it. A mirror can drift, which is a real cost accepted
> knowingly: the alternative was touching every reader. It is written in the same function that writes the
> quote and nowhere else. It goes NULL when the only quote was declined — leaving the declined figure
> would show a number nobody is offering.
>
> Milestones 3 and 4 land in A4's stream, and a decline records `lost` — the funnel is as interested in
> where leads stop as where they finish.
>
> ⚠ **Not browser-verified** (same reason as A3: `/admin` needs a staff session). The lifecycle was
> exercised directly against the live database instead, which covers the versioning and the constraint;
> what has NOT been seen is the card rendering.

- **Seed 472** — `lead_quotes` (`lead_id`, `version`, `amount_cents`, `scope_notes`, `quoted_by`, `quoted_at`,
  `status ∈ draft/sent/accepted/declined/expired`, `expires_at`, `decline_reason`).
- Admin UI on the lead detail page: record a quote, revise it (new version, old one kept), mark accepted or
  declined with a reason. `leads.quote_amount` becomes a derived mirror of the latest accepted/sent version so
  nothing existing breaks.
- Emits milestones 3 and 4 into A4's stream. Decline reasons become the "why we lose" report.

### A6 — Lead → job conversion carries everything
- `app/admin/jobs/new/page.tsx` currently copies contact fields and stamps `converted_job_id`. Extend it to
  carry `customer_id`, the accepted quote, and the attribution stamp onto the job.
- Make the FK bidirectional and indexed; today `converted_job_id` is looked up by reverse scan
  (`origin-lead/route.ts:47`).
- Emits milestone 5 — **the primary bidding conversion**.

### A7 — Google Ads export, CSV first
*Ships value with zero Google API access and no developer-token wait.*

- `lib/integrations/google-ads/offline.ts` — build upload rows from A4's stream: `Google Click ID`,
  `Conversion Name`, `Conversion Time` (Ads' required format, with timezone), `Conversion Value`,
  `Conversion Currency`, `Order ID` (= our dedupe key).
- `/admin/marketing/exports` — pick a date range and a conversion action, download the CSV, upload it in Google
  Ads → Goals → Conversions → Uploads. Rows already uploaded are marked so a second export doesn't re-send them
  (G3).
- Also emit the **Enhanced Conversions for Leads** variant (hashed email/phone, no `gclid`) for the
  phone/referral leads — the same stream, a different column set.
- References: `support.google.com/google-ads/answer/15713840` (how matching works),
  `support.google.com/google-ads/answer/15479486` (implementation). Read both at build time; record the read
  date and the observed limits in the module header (Finding 5).
- **Prerequisite, owner action:** in Google Ads create the four conversion actions from the table above, set
  each one's click-through window to the maximum, and accept the customer-data terms for the
  enhanced-conversions path.

### A8 — Automate it via the Google Ads API
- **Seed 473** — `google_ads_connections` (mirrors `google_calendar_connections`) and
  `conversion_upload_log` (`event_id`, `conversion_action`, `payload_hash`, `uploaded_at`, `status`,
  `error_code`, `error_detail`, `attempts`).
- `lib/integrations/google-ads/client.ts` — OAuth + refresh, copied from `lib/integrations/google-calendar.ts`
  (that pattern already works in this codebase; do not invent a second one). Needs `GOOGLE_ADS_DEVELOPER_TOKEN`,
  `GOOGLE_ADS_CUSTOMER_ID`, and login-customer-id if under an MCC.
- `ConversionUploadService.UploadClickConversions` with `partial_failure=true`; per-row failures are logged, not
  thrown, and are retried with backoff. Rejections are surfaced in the admin UI with Google's own error text —
  a silent failed upload is worse than no upload.
- `app/api/cron/google-ads-upload/route.ts` — nightly, follows the 14 existing cron routes' shape. Respects the
  6-hour minimum click-to-upload delay.
- **Lead-time risk:** the Ads API developer token requires an application and approval. Start that on day one
  of this plan; A7's CSV path exists precisely so the build is not blocked behind it.

### A9 — Adjustments: restate the value when the real number lands
- When `final_amount` / `amount_paid` differs from the `quote_amount` we already reported, upload a
  **restatement** against the original `Order ID`.
- Cancelled or refunded job → **retraction**.
- Both are window-bound (Finding 5); outside the window we record `adjustment_skipped_window` on the event and
  keep the internal number correct. G4: our books never bend to fit Google's window.

### A10 — GA4 offline events *(optional, decide in A2)*
- If a GA4 property exists, mirror the same stream through the Measurement Protocol keyed on the stored
  `client_id`. Same source table, different sink — no second source of truth.

### A11 — Ad spend import, so "true lead cost" is a real number
*The owner asked for true lead costs. Without spend, we have conversions and no denominator.*

- **Seed 474** — `ad_spend_daily` (`date`, `platform`, `campaign_id`, `campaign_name`, `ad_group_id`,
  `impressions`, `clicks`, `cost_micros`, `conversions`).
- Pull via the Ads API reporting query (same client as A8), nightly.
- Manual-entry fallback in the admin UI for any month the API isn't connected — a rough denominator beats none.

### A12 — The dashboard: `/admin/marketing`
Everything above exists to make this page honest.

- **Funnel** — inquiry → contacted → quoted → accepted → job → delivered → paid, with conversion rate and
  **median days in each stage** (the "life cycle of a job" the owner asked for).
- **True cost per stage** — spend ÷ leads, spend ÷ quotes, **spend ÷ won jobs**, and **spend ÷ revenue
  (ROAS)** — sliced by campaign, source, service type, and county.
- **Repeat customers** — repeat rate, lifetime value, months-between-jobs, and which campaign originally bought
  each repeat customer (a lead whose second job arrives direct was still *bought* by the first ad).
- **Attribution coverage meter** — % of leads with a `gclid`, % matched by hashed email/phone, % unattributable.
  Displayed permanently and prominently. Every other number on the page is only as good as this one, and
  Finding 6 means it will not be 100%.
- **Per-lead timeline** on `/admin/leads/[id]` — first click → every milestone → dollars, on one vertical
  timeline. This is the "track exactly what is happening with each lead" ask, and it is the screen Daddy will
  actually use.

### A13 — Phone-call attribution *(scoped, not on the critical path)*
- Google forwarding numbers / call reporting; a dynamic-number-insertion snippet on the public site.
- Wire `how_heard` (already collected by `ContactForm`) into `leads` as a self-reported fallback dimension.
- Manual "which ad did they mention?" field on the lead detail page for phone intake.

### A14 — QA and verification
- Unit: attribution capture, hashing, dedupe keys, CSV row builder, upload retry/partial-failure handling.
- Integration: full lifecycle fixture — click → form → quote → accept → job → deliver → pay — asserting the
  exact event stream and the exact export rows.
- Browser pass (standing lesson in this repo — a green suite has repeatedly missed "authored but not wired"):
  submit the real form with a fake `gclid`, watch the network call, read the DB row, walk the lead through
  every stage in the admin UI, generate the CSV, confirm Google accepts it.
- Verify in Google Ads that a test upload lands, and that the double-fire from Finding 3 is gone.

---

## Risks, stated plainly

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| **Every existing lead is unattributable** (Finding 2) | No historical ROI, ever | Say so up front; label pre-A1 data as such in the dashboard; ship A1 immediately |
| **90-day window** (Finding 5) | Delivered/paid milestones may never reach Google | Bid on `Job — Won` at quote value; adjustments where the window allows |
| **Ads API developer token lead time** | A8 blocked for weeks | A7's CSV path ships first and is fully functional |
| **Phone leads have no click** (Finding 6) | Coverage well under 100% | Enhanced Conversions on hashed phone/email; A13; coverage meter always visible |
| **PII in a Google payload** | Policy violation | G5 — server-side SHA-256, never raw, never client-side |
| **Double-counted conversions** (Finding 3) | Bidding trained on wrong data *today* | A2, and it is cheap — do it alongside A1 |
| **Consent / privacy** | Compliance exposure | Attribution cookie is first-party and functional; add a consent gate if the site ever serves a jurisdiction that requires it |

---

## Open questions for the owner

1. **GA4 — yes or no?** No `G-` measurement ID is configured today, so there is no analytics property behind
   the Ads tag. Stand one up in A2, or stay Ads-only?
2. **What counts as "won" for bidding** — quote accepted (recommended: inside the window, and it's the decision
   that matters), or job delivered?
3. **Deposit vs final payment** — `customer_invoices` supports deposits. Does milestone 9 fire on the deposit,
   or only on payment in full?
4. **Repeat-customer credit** — should a repeat job's revenue be credited back to the campaign that bought the
   *original* lead? (Recommended: yes, and shown as a separate "assisted revenue" figure so it never inflates
   the raw ROAS number.)
5. **Who does the Google-side setup** — creating the four conversion actions, setting windows, accepting the
   customer-data terms, and starting the developer-token application. This is account-owner work that no slice
   can do from the codebase.

---

## Seed numbers claimed

`469` attribution columns on `leads` · `470` `customers` · `471` `lead_lifecycle_events` · `472` `lead_quotes` ·
`473` `google_ads_connections` + `conversion_upload_log` · `474` `ad_spend_daily`.

Highest currently used is `468`; **`499_baseline_fks.sql` is taken** — do not walk into it.

---

## Definition of done

A visitor clicks a Google ad, submits the contact form, gets a call from Daddy, receives a quote, accepts it,
has the job researched, surveyed, drawn, delivered, and paid — and `/admin/marketing` shows, on one screen:
which campaign that click came from, what the lead cost, how many days each stage took, what was quoted, what
was actually collected, and whether that customer has come back. Google Ads receives a valued conversion for
the won job, keyed to the original click, exactly once.
