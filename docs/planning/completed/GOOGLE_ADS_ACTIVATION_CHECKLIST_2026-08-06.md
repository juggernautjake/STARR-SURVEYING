# Google Ads — what is hooked up, and what only the account owner can do

> **Status: engineering complete 2026-08-06. Filed under `completed/` because there is no code work
> left, NOT because the integration is live.**
>
> §3 is a live checklist of **account-owner actions** and none of them are done. Until they are, the
> two nightly crons run and upload nothing. This is filed as completed the same way the platform
> audit was — the build shipped, the remainder is owner-gated and cannot be closed from the
> codebase — so that `in-progress/` continues to mean "somebody is writing code against this".
>
> **Read §3 before assuming conversions are reaching Google.** If any of it changes what the code
> should do, move this back to `in-progress/`.

**Audit date:** 2026-08-06. Owner asked: *"What do we need to do to make sure that we are tracking all
of the Google Ads and conversions on the website? Is everything hooked up?"*

Short answer: **the website half is hooked up and working. The Google-API half is built but inert**,
because eight environment variables have never been set. Nothing is half-written — the code is
finished and tested; it is waiting on account credentials that only you can obtain.

---

## 1. Verified working right now

Each of these was checked in the code on 2026-08-06, not taken from the previous plan doc.

| Thing | Where | Evidence |
|---|---|---|
| Google Ads tag (`AW-17921491739`) loads | `app/components/GoogleAdsScript.tsx`, mounted in `Footer.tsx` | Footer renders on every public route; `LayoutShell` suppresses it only on `/admin`, `/platform`, `/register` and the test harnesses |
| Click source recorded on arrival | `AttributionCapture` in `app/layout.tsx` | Captures `gclid` / `gbraid` / `wbraid` / UTM / referrer on the **landing** page, not the form page — first-write-wins, 90-day window |
| Form conversions fire | `/contact`, `/` (home), pricing calculator | All three pass the submission reference as `transaction_id`, so a resubmit cannot double-count |
| Offline conversion pipeline | `lib/integrations/google-ads/`, `/api/cron/google-ads-upload` (daily 07:00 UTC) | Scheduled in `vercel.json` |
| Ad spend import | `/api/cron/google-ads-spend` (daily 07:30 UTC) | Scheduled in `vercel.json` |
| Dashboards | `/admin/marketing`, `/marketing/spend`, `/marketing/exports`, `/marketing/uploads` | All four registered in the route registry (reachable, not orphaned) |

### The CSV path works today with no API access

`/admin/marketing/exports` produces an upload file you can hand to Google Ads → Goals → Conversions →
Uploads **right now**, without a developer token. If the API application drags, this is the fallback
that still gets valued conversions into the account.

---

## 2. Fixed during this audit

**A phantom conversion.** `SurveyCalculator.tsx` fired a conversion inside its `catch` branch — the
path taken when the POST *failed* and the page fell back to opening a `mailto:`. Nothing had reached
the server, so there was no lead, no reference and no stored click id: the conversion could not be
deduped, matched, valued or corrected, and it trained Smart Bidding toward clicks that never became
leads. Removed; the mailto fallback still works, it simply is not counted until it arrives.

**A latent double-count.** `app/components/ContactForm.tsx` called `trackConversion()` with no dedupe
key. It is not currently rendered anywhere (see §5), so nothing was being double-counted in
production — but it has been kept in step with the live forms across three commits, and would have
started double-counting the day anyone wired it up.

**A guard so neither returns.** `__tests__/marketing/conversion-firing-points.test.ts` scans every
`trackConversion` call site and fails if any lacks a dedupe key or sits in a `catch` block. Verified
by reintroducing the bug and watching it fail.

**A silent no-op made loud.** `credentialProblem()` checked two of the required credentials and
stopped. With `GOOGLE_ADS_DEVELOPER_TOKEN` and `GOOGLE_ADS_CUSTOMER_ID` set and OAuth connected,
`/admin/marketing/uploads` reported a healthy connection and the nightly job reported success — while
`selectConversions` skipped **every** event, because no conversion action had been configured for any
milestone. Those skips were counted into `skipped.noAction` and displayed nowhere.

That is the state you land in immediately after Step 3 if you set the token and customer id but not
the four resource names, so it was worth closing before you get there rather than after:

- `credentialProblem()` now returns `'missing-conversion-actions'` when none are configured, with
  help text naming the four variables and warning that Google wants **resource** names, not display
  names.
- `conversionActionStatus()` reports which milestones are configured and which are not, and
  `/admin/marketing/uploads` shows a warning for the **partial** case — one action set, three not.
  That case is not an error, the job succeeds, and Google hears about leads while never hearing that
  any of them got paid, which trains value-based bidding on the cheapest milestone only.

---

## 3. What only you can do — in order

Nothing below can be done from the codebase. Items 1–3 gate everything else.

### Step 1 — Create four conversion actions in Google Ads
Google Ads → **Goals → Conversions → New conversion action → Import → Manual/API**.

| Create this action | Fires when | Value |
|---|---|---|
| Inquiry | A form is submitted | 0 (or a nominal lead value) |
| Quoted | A quote is sent to the customer | Quote amount |
| Job Won | The quote is accepted and a job is created | Job amount |
| Job Paid | Payment is received | Amount actually collected |

For each one: set the **click-through conversion window to its maximum (90 days)**, and note the
**resource name** (looks like `customers/1234567890/conversionActions/98765`) — not the display name.
Those four resource names become four of the environment variables in Step 3.

> A new conversion action needs **4–6 hours** before uploads land normally. Create them, then wait
> before judging the first upload.

### Step 2 — Apply for a Google Ads API developer token
Google Ads → **Tools → API Center**. Ask for **Basic access** (Test access cannot touch the live
account). Approval commonly takes several business days and they may ask what the integration does —
the honest answer is "uploading our own offline conversions and reading our own spend."

**While you wait, use `/admin/marketing/exports`** — the CSV path needs none of this.

### Step 3 — Set eight environment variables in Vercel
All currently unset. Until they are, the two nightly crons run and do nothing.

```
GOOGLE_ADS_DEVELOPER_TOKEN     # from Step 2
GOOGLE_ADS_CUSTOMER_ID         # the Ads account id, digits only, no dashes
GOOGLE_ADS_LOGIN_CUSTOMER_ID   # the manager (MCC) account id, if the account sits under one
GOOGLE_ADS_RESOURCE_INQUIRY    # the four resource names from Step 1
GOOGLE_ADS_RESOURCE_QUOTED
GOOGLE_ADS_RESOURCE_JOB_WON
GOOGLE_ADS_RESOURCE_JOB_PAID
CRON_SECRET                    # any long random string; authenticates the scheduled jobs
```

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are **already set** and are reused for the OAuth
handshake — you will still need to authorise the Ads scope once against the Ads account.

### Step 3b — Click "Connect Google Ads"
`/admin/marketing/uploads` → **Connect**. Enter the 10-digit customer id, approve on Google's screen,
done.

> **Added 2026-08-06, and it was a blocker nobody had noticed.** `google_ads_connections` was read by
> `getAccessToken()` and updated by the nightly cron, and **written by nothing** — no insert anywhere
> in the repo. The row could only have been created by hand in Supabase, so even with all eight
> variables set, uploads would have failed forever with `not-connected` while the page displayed help
> text for that exact state and offered no way out of it.
>
> This is also the answer to *"can you set the credentials by automating a browser?"* — no, and now
> nothing needs to. The refresh token is issued by Google straight to the server after you click
> Allow. It is never displayed, never pasted, and never passes through anyone's clipboard.

### Step 4 — Accept the customer-data terms
Required before enhanced conversions (the hashed email/phone path that credits leads arriving by
phone or referral, where there is no `gclid`). Google Ads → **Admin → Account settings → Customer
data terms**.

### Step 5 — Confirm the conversion label is still current
`app/utils/gtag.ts` carries `-sTrCMb9xP8bEJuG0eFC`, supplied by Google support in March 2026. If you
recreate the website conversion action in Step 1, its label changes and this must be updated with it.
Worth confirming against Google Ads → Goals → Conversions → your web action → Tag setup.

---

## 4. How you will know it worked

- **`/admin/marketing/uploads`** — what last night's job sent and what Google rejected. Google returns
  HTTP 200 while rejecting individual rows, so this page is the only place a partial failure is
  visible. Check it the morning after the first run.
- **`/admin/marketing/spend`** — spend should appear the day after the first successful cron. It can
  also be typed in manually from the invoice, so cost-per-lead is not blocked on the API.
- **`/admin/marketing`** — the funnel, cost per stage, and repeat customers. This reads our own tables,
  so it is already correct today; the API work only improves what Google knows, not what you can see.

---

## 5. Decisions still open

**GA4 — do you want it?** There is no `G-…` property today; the site is Ads-only, deliberately. The
funnel questions you have asked (true cost per lead, per-stage timing, repeat customers, ROAS) are all
answered from our own tables at `/admin/marketing`. Adding GA4 mainly adds a second set of conversion
counts, sessionised differently, that will disagree with ours — and then somebody has to decide which
to believe. Worth doing if you want Google's audience/remarketing tooling; not worth it for reporting
alone. If you say yes, it is roughly a day: add the `G-` id to the existing tag, store `client_id`
beside `gclid`, add a Measurement Protocol sink next to the Ads one.

**Dynamic Number Insertion for calls.** Call conversions are tracked for the two paths that are
identifiable; swapping in a per-visitor tracking number (so a phone call can be tied back to the exact
click) is deferred. It needs a call-tracking number pool, which is a recurring cost.

**The unused fourth contact form.** `app/components/ContactForm.tsx` is 335 lines, kept up to date,
and rendered nowhere — `/contact`, the home page and the calculator each build their own. Either
render it and delete the two inline copies, or delete it. Your call; I have not removed it.

**A separate conversion action for the pricing calculator?** Today every web form reports the same
Inquiry action. Splitting the calculator out would let Smart Bidding optimise toward the
higher-intent surface. Cheap to do, but it changes what your bidding optimises for, so it should be a
deliberate choice rather than a default.
