# The surveying backend — full analysis, and what to do about it

**Status:** COMPLETE · opened and finished 2026-08-01 — every slice in Phases A–E shipped · owner-directed · **stop-hook doc — work it slice by slice**
**Owner ask:** *"I want you to do a full and complete analysis of everything on it and see if you can find any
ways it can be improved for future use."*

> **How to work this doc.** Take the **lowest-numbered unchecked slice in the lowest unchecked phase** and do
> it. One slice = one commit, ending green: `tsc --noEmit`, the relevant `vitest` scope, `eslint`. UI slices
> are **driven in a browser** before being ticked — the standing rule here, and this document contains three
> fresh examples of why. Tick the box, write one line of what actually shipped, move on.
> **Do not renumber slices.** Insert as `A3-2b` rather than shifting everything below.

---

## What this thing actually is, measured

Every number below was counted, not estimated.

| | |
| --- | --- |
| Pages | **216** |
| API routes | **521** total — **380** business, 141 D&D |
| Admin API routes | **340** |
| Library modules | **849** `.ts` files |
| Live Postgres tables | **277** |
| Seed files | **299** |
| Test files | **1,370** — 603 D&D, **767** business |
| Whole suite | **20,206 passing**, 30 skipped, ~57s |

**This is not a small app, and it is not a prototype.** 340 admin API routes and 277 live tables is the
surface area of a mature internal platform. The analysis below is therefore about *risk and leverage* rather
than about building missing features — most of what a surveying firm needs is already here.

---

## The three findings that matter

Ordered by what they would cost if left alone. Each was **verified against the code**, and one of them
started life as a false alarm that verification killed — which is recorded because it is the more useful
half of the story.

### 🔴 F1 — Public endpoints have NO abuse protection of any kind

**Measured:** rate limiting exists on **27 routes, all of them D&D**. Business routes: **zero**. The two
genuinely public endpoints have no rate limit, no captcha, no honeypot, no per-IP throttle:

| Endpoint | What an abuser gets |
| --- | --- |
| `POST /api/contact` | Sends **three emails per submission** (info@, the Yahoo account, Hank personally), **uploads attachments** to Supabase storage, and writes a `leads` row. Unbounded. |
| `GET /api/public/invoice/[number]` | Invoice-number **enumeration**, returning customer name, amounts and balances. |

The contact form is the sharper of the two: a script pointed at it fills Hank's inbox, burns the Resend
quota (which, once exhausted, silently stops **real customer enquiries** from being emailed at all), and
fills the storage bucket. The lead table would also fill with junk, which is where the office looks for work.

**Ironically the machinery already exists** — `lib/dnd/rate-limit.ts` and `seeds/456_dnd_rate_limits.sql`
were built for the hobby project and never applied to the business. That is the whole fix: lift it out of
`lib/dnd/` and put it in front of the public surface.

### 🟠 F2 — The D&D project has better engineering hygiene than the business it lives inside

Not a criticism of the D&D work — it is genuinely well built — but the asymmetry is the finding:

| | D&D | Business |
| --- | --- | --- |
| Rate limiting | 27 routes | **0** |
| Route-authorization sweeps | done, with a source-scanning guard | never run |
| Browser-verified UI passes | standing rule, ~130 slices | ad hoc |
| Planning docs | 5 live, slice-by-slice | this is the first |

**The business backend is where the money is**, and it is the half with less coverage. F1 exists because
nobody ever swept the business routes the way the D&D routes were swept. The phases below are largely that
sweep.

### 🟡 F3 — Two live-money defects found in one afternoon, by looking

Both were found incidentally while doing something else, which is the argument for doing this deliberately:

- **Google Ads was double-counting every `/contact` lead** (fixed 2026-07-31). Two conversion paths fired
  for one submission, and Smart Bidding had been training on a lead count roughly twice reality.
- **The invoice portal rendered completely unstyled** (fixed 2026-07-31) — the stylesheet was imported by a
  page that a guard skips, so the customer-facing payment page shipped as raw HTML with its heading behind
  the logo. **On the page where customers pay.**

Neither had a failing test. Both had *passing* ones — the payment test asserted the header component was
mounted, which it was, invisibly, behind the site logo.

> ### ⚪ The finding that wasn't: 328 "unauthenticated" admin routes
>
> A first sweep reported that **328 of 340 admin API routes had no auth call**, which would have been a
> catastrophic finding. It was wrong: the grep looked for `getServerSession`, and this repo uses
> `auth()` / `isAdmin` from `lib/auth`. Re-measured with the right predicate: **340 of 340 are gated. Zero
> gaps.**
>
> It is recorded because the near-miss is instructive. A confident wrong number in a document like this
> would have sent someone on a week-long audit of a problem that does not exist — and the only thing that
> stopped it was opening one of the files to see what it actually did. **Check the tool before believing the
> measurement**, especially when the measurement is alarming.

---

## Phase A — close the public surface (F1)

*Highest value per hour in the entire document. Nothing here is speculative.*

- [x] **A1-1 — Promote the rate limiter out of `lib/dnd/`. SHIPPED 2026-08-01.** Moved to
      `lib/rate-limit.ts`; `lib/dnd/rate-limit.ts` is now a re-export, so all 27 call sites are untouched.
      The counter table moved with it — `dnd_rate_limits` → `rate_limits` (seed **502, applied live**) —
      and there was nothing to migrate, because counter rows belong to windows that expire. **Not forked:**
      two copies is how one gets the fix and the other does not, which this repo has learned three times
      (the two `MAX_BYTES`, the fourth roll log, the stage token three of four stylesheets read).
      *Five source-scanning tests read the old path and were repointed; they are the reason the move was
      provably complete rather than probably complete.*

- [x] **A1-2 — Throttle `POST /api/contact`. SHIPPED 2026-08-01.** Two buckets, both per IP because there
      is no user: **5 per 10 minutes** stops a burst, **20 per day** stops the slow grind that never trips
      the burst limit. Checked burst-first so a customer who simply resubmitted gets the actionable message
      rather than the 24-hour one.
      **Placed above `parseRequest`**, which matters more than it looks: parsing a multipart body reads the
      uploaded files into memory, so throttling after that point still makes us do the expensive part.

- [x] **A1-3 — A honeypot field on every intake form. SHIPPED 2026-08-01.** `lib/leads/honeypot.ts`
      (13 tests) + `HoneypotFields`, on **all four** surfaces.
      **A trapped submission is told it SUCCEEDED.** A bot that gets an error retries, mutates, and finds
      the shape that works; one that gets a 200 goes away and learns nothing. The price of that choice is
      that a false positive is **invisible to the customer** — they believe they contacted us and nobody
      has — which is why the checks are deliberately loose (a missing timestamp is never a trap) and why
      every trip is logged.
      *Rendering the inputs turned out not to be enough:* every form builds its body from React state, not
      the DOM, so a hidden input nothing reads is submitted by nobody. `honeypotValuesFrom` closes that,
      and takes any container rather than a form — the calculator submits from a button and has no form.
      **Browser-verified both ways:** a real customer's submission carries the timestamp and no honeypot; a
      filled honeypot is transmitted so the server can trap it.

- [x] **A1-4 — Throttle the public invoice lookup. SHIPPED 2026-08-01.** 30 per 5 minutes — enough to
      fumble an invoice number repeatedly without noticing.
      The route's own header said the slug "prevents enumeration". True of the slug; **not** true of
      `invoice_number`, which the same handler also accepts because it is what is printed on the paper
      invoice the customer is holding. *(Equal-time responses for hit and miss remain open — see A1-4b.)*

- [x] **A1-4b — Make a hit and a miss take the same time. SHIPPED 2026-08-01.** Two mechanisms, and the
      first is the real one.
      **The same round trips either way.** A miss that skipped the payments query is structurally faster,
      and a difference that scales with how busy the database is cannot be padded away — so that query
      now runs on both paths, looking up an id that exists nowhere when there is no invoice.
      **And a floor** (`lib/http/constant-time.ts`), applied to *every* terminal path rather than the
      404 alone: one unpadded `return` reinstates the leak, and the next one added would be an early
      refusal, which is the shape that returns fastest. A test asserts there are none.
      *Measured on the running app, and it corrected this file's own first draft:* hit and miss came back
      at a **median of 515 ms and 522 ms** — seven apart on five hundred. **The equal-work change did
      that; the floor never fired**, because the real work already exceeded it. The floor earns its place
      in the other regime, where both paths are tens of milliseconds and a residual 15 ms is 60% rather
      than 1% — proportion is what an attacker averages, not absolute time. The comment now says so
      instead of claiming the floor sits above the slow path.

- [x] **A1-5 — Cap the storage a single IP can consume. SHIPPED 2026-08-01.** `UPLOAD_LIMITS` caps one
      file and `QUOTE_ATTACHMENT_MAX_TOTAL_BYTES` caps one submission at 25 MB. Nothing capped a DAY, and
      A1-2 allows 20 submissions per address — so the real uncapped figure was **500 MB from one
      connection**, discoverable only via a storage bill or a quota wall.
      **Counted in MEGABYTES, which is why the limiter gained a `cost`.** A per-submission limit cannot
      express "a lot of small ones", and a per-request limit set low enough to bound the bytes would
      refuse the customer who legitimately sends one big site plan. 60 MB/day is far above a real enquiry
      — a survey request is a few photographs and a PDF — and far below what makes filling the bucket
      worth anyone's time.
      The charge is `Math.max(1, Math.ceil(mb))`: the counter stores integers, so a thousand 0.4 MB
      uploads would otherwise cost nothing, and a zero cost would make the check free to bypass. The
      default stays 1, so the seven buckets that were counting requests before `cost` existed still do.
      *Necessarily after `parseRequest`*, unlike A1-2's burst limit — the sizes are the thing being
      limited and they do not exist until the body is read. Acceptable precisely because the burst limit
      sits above it: an abuser gets five parses per ten minutes to reach this wall.

## Phase B — sweep the business routes the way the D&D routes were swept

**ALL FOUR SHIPPED 2026-08-01.** `scripts/audit-route-auth.mjs` + `__tests__/security/route-authorization.test.ts`.

### ⚠ The near-miss this document opens with happened AGAIN, to someone who had read the warning

The first sweep in this repo reported 328 of 340 admin routes as unauthenticated because it grepped for
`getServerSession` and the code uses `auth()`. Building the sweep above, the second version of the
predicate was `/(auth()|…)/` — and **a `` after `)` cannot match**, because the next character is
`;` or a newline and neither is a word character. It reported **246 of 613 admin handlers as ungated.**

Same class of error, different mechanism, one document away from the warning. So the script now **prints
its predicates with every run**, and a test asserts they still recognise the gates this codebase actually
uses. A predicate that stops matching does not fail loudly — it quietly grows the hole list until someone
decides the list is normal.

### What the sweep actually does differently

- **Per HANDLER, not per file.** A file whose `GET` is public and whose `DELETE` is ungated is not a
  "gated route", and per-file counting is exactly how a hole hides inside a mostly-safe file. 867
  handlers across 533 route files.
- **A route with no gate needs a written REASON.** `INTENTIONALLY_PUBLIC` maps each to why, and the
  script exits non-zero for anything ungated and unexplained. That is the ratchet: "nobody got round to
  it" cannot be written down.

### The result

| Area | Handlers | Gated | Public by design | Ungated |
| --- | --- | --- | --- | --- |
| admin | 613 | 613 | 0 | **0** |
| business | 23 | 18 | 5 | **0** |
| cron | 16 | 16 | 0 | **0** |
| dnd | 206 | 198 | 8 | **0** |
| public | 7 | 2 | 5 | **0** |
| webhooks | 2 | 2 | 0 | **0** |

**The admin surface really is 613/613**, which confirms the analysis's own re-measurement.

- [x] **B1-1 — Authorization sweep over every business route. SHIPPED.** And it found something the
      payment plan did not: **the four public `…/invoice/[number]/*` payment routes had no rate limit at
      all.** A1-4 threw one around the LOOKUP and these were never given one — and they are the worse
      half: `POST …/intent` makes a paid Stripe call per request, `POST …/attempt` **emails the office**,
      `POST …/receipt` **emails a receipt**. Two of them send mail, which is **F1's finding arriving on a
      different endpoint**: an exhausted Resend quota does not merely stop receipts, it stops real
      customer enquiries being emailed at all. All four now use a `public-payment` bucket (10 per 15
      minutes per IP), checked FIRST so a script cannot make us do the expensive part before being
      refused.

- [x] **B1-2 — Every destructive handler, specifically. SHIPPED.** 117 destructive handlers, **0
      ungated**, pinned by the sweep. The one flagged as destructive-and-public is
      `POST /api/signup/complete`, and its `DELETE` is a **rollback of the organisation it created two
      statements earlier** — read before being excused, not assumed.

- [x] **B1-3 — Webhook signature verification, and replay. SHIPPED.** The Stripe webhook was already
      right on all three counts: a constant-time signature comparison, a **five-minute timestamp
      tolerance** (a valid signature is otherwise valid forever, so a captured request can be resent
      tomorrow), and a `processed_webhook_events` dedup ledger for Stripe's own legitimate retries —
      which is a different problem from replay, and a money bug rather than a security one.
      **The inbound-email webhook was not.** It compared its shared secret with `!==`, which
      short-circuits at the first differing character and leaks how much of the secret a caller has
      right — only worth exploiting against an endpoint anyone may call as often as they like, which is
      exactly what a webhook is. It now compares in constant time, like the Stripe route beside it. The
      difference between the two was not a decision anyone made.

- [x] **B1-4 — Service-role audit. SHIPPED.** `supabaseAdmin` bypasses RLS entirely, so on an ungated
      route it is not "a missing login" — it is direct table access for anyone who finds the URL. **808
      handlers use it; 0 are ungated.** The count is printed with every run, so it cannot drift
      unnoticed.

## Phase C — the money path

**ALL THREE SHIPPED 2026-08-01.** `lib/payments/reconcile.ts`, `__tests__/payments/money-path.test.ts`
(23 tests), `GET /api/admin/payment-attempts/unreconciled`, and a panel on the payments inbox.

- [x] **C1-1 — End-to-end test of the invoice lifecycle. SHIPPED.** Walked as a SEQUENCE rather than as
      isolated cases, because the interesting failures are transitions: the second payment on an invoice
      with an upfront, the payment that exactly clears the balance, the one after that. The analysis said
      the six live `TEST-000n` invoices *"should be driven by a test, not only by hand"* — driving by hand
      proves it worked once, on one afternoon, for whoever was looking.
      Four boundaries the tests pin, each a plausible way to be wrong:
      **"at least the upfront" includes EQUAL** (the most common off-by-one in a rule like this);
      **the upfront is a FIRST-payment rule, not a per-payment minimum** — applying it again would refuse
      a customer paying off the rest in instalments;
      **a zero-total invoice is already paid**, not payable for nothing (TEST-0004's shape);
      **an upfront larger than the total is clamped, not enforced** — otherwise a data-entry slip makes
      an invoice unpayable, with every amount simultaneously below the minimum and above the balance.

- [x] **C1-2 — Reconcile `payment_attempts` against real payments. SHIPPED.** The problem exactly as
      stated: a claim is not a fact, and a pledge looks identical in the queue on day one and day forty.
      **A WORKLIST, NOT AN ALERT**, and that decision runs through the whole slice. Almost every row is a
      customer who genuinely paid and an office that has not reconciled the bank yet; roughly none are
      fraud. So it is ordered **oldest-first** (the oldest is the most likely to have been forgotten, and
      newest-first buries exactly the rows that need attention), every sentence says *"check the bank"*
      rather than "unpaid", and a test asserts the wording contains none of `unpaid|fraud|owes`.
      **Five days, not immediately.** A Zelle can take three business days; flagging at once would put
      every honest customer on the list and train the office to ignore it — which is the failure that
      matters, because a list nobody reads is worse than no list, having cost the work of building it.
      **A claim is cleared by money OR by the office linking it.** The second rule stops the list filling
      with claims that were reconciled by simply recording the payment, which is what an office actually
      does rather than going back to tick off the claim. And money that arrived BEFORE the claim does not
      count — that is an earlier instalment, and counting it would clear a claim with somebody else's
      money, hiding precisely the case worth catching.
      **A shortfall is reported separately from a no-show**, because they need different actions: nothing
      arrived is a question for the customer, less arrived than claimed is a question for the statement.
      **It lives on the page the office already opens**, below the queue it is about, and is SILENT when
      there is nothing to say — so it costs no attention on the days it has no news, which is most days.
      A failed request, though, is shown loudly: *"it is not saying there is nothing to reconcile, it is
      saying it could not look."* A reconciliation control that renders nothing on failure is
      indistinguishable from one saying everything is fine, which is the worst thing it could do.
      *Verified live:* 403 anonymous; a 12-day-old claim with nothing recorded flagged with the right
      sentence; a 1-day-old claim left alone; test rows removed afterwards.

- [x] **C1-3 — Receipt on every path. SHIPPED.** Asserted structurally rather than by sending seven
      emails: the receipt endpoint **must not branch on a method id**, and every method in
      `PAYMENT_METHODS` must be describable by `describePaymentForReceipt`. The failure this guards is a
      receipt that works for Stripe and silently does nothing for a check — which nobody notices, because
      the person who would notice is the customer who did not get one.

## Phase D — the leads-to-cash loop (feeds the Google work)

**ALL THREE SHIPPED 2026-08-01.** `lib/leads/follow-up.ts` (18 tests),
`GET /api/admin/leads/follow-ups`, a queue and an attribution chip on `/admin/leads`.

- [x] **D1-1 — Lead → job conversion is one action. CONFIRMED, already built.** The lead detail page has
      a **→ Convert to job** button that opens `/admin/jobs/new?fromLead=…`; the job stamps
      `origin_lead_id`; `recordMilestone` carries the `leadId` on `job_created`, which is what the
      `job_secured` upload depends on; and `origin-lead` reads the forward link with the reverse scan
      kept as a fallback for rows the seed-506 backfill did not reach. **Read before being rebuilt** —
      the alternative was a second conversion path beside the first.

- [x] **D1-2 — Stale-lead surfacing. SHIPPED.** This is the only item in this document that finds money
      already on the floor rather than preventing a loss: the lead has been paid for, and then sits with
      a date in the past because the column was shown on one detail page and asked about nowhere.
      **Overdue and due-today are separated, deliberately.** Yesterday's call is a mistake and today's is
      a plan; merged, the list is red every morning before anyone has done anything wrong — and the
      honest response to a list that is always red is to stop reading it. That failure mode has already
      shaped one control in this document (C1-2's wording) and it shapes this one too.
      **A converted or closed lead outranks its date.** Nobody clears a follow-up when they convert —
      they create the job and move on, which is correct — so a chaser that ignored the conversion would
      fill with customers who are already being surveyed.
      **A date is not an instant**, and the test that proves it runs at four hours of the day. A bare
      `YYYY-MM-DD` parses as UTC midnight, which is the previous evening in every American timezone: a
      call due today would have read as overdue from 6pm the night before, so every one of tomorrow's
      calls was red before anyone went home.
      Sorted most-overdue first, **then by value** — two calls equally late are not equally urgent, and a
      $12,000 boundary survey outranks a $400 lot stake when the office has ten minutes before lunch. The
      phone number is IN the row, because a queue that makes you open a detail page to find it is a queue
      that gets worked when there is time, which is never.
      *Verified against the live database:* 403 anonymous; three real leads given dates produced exactly
      `{overdue: 1, today: 1, upcoming: 1}` with the right sentences; original values restored afterwards.

- [x] **D1-3 — Source attribution on the leads board. SHIPPED, once.** *"Also G1-4 in the Google doc — do
      it once."* So it is one function that both the board and the follow-up queue call: two
      implementations would disagree about where a lead came from on two screens, and the one the office
      believed would be whichever they opened second.
      **Ordered by how much each field is worth believing**, which is the whole design: `gclid` (Google
      handed it to us — `utm_medium: cpc` is a claim, a gclid is a receipt), then `utm_*`, then what the
      **customer** said, then the referrer host, and **the office dropdown LAST** because it is accurate
      about intent and useless for spend. A board showing only `source` reports every paid click as
      "Website", which is precisely how a business concludes its advertising does nothing.
      **Nothing at all is "Unattributed", never "Direct".** Calling a lead we failed to attribute direct
      traffic is the same mistake wearing a friendlier word.
      *And it immediately said something true:* all four live leads currently resolve to the office
      dropdown. There is no ad attribution on any lead in the database yet — which is the fact the
      Google work needs to know, and which a `source`-only board would have hidden behind "Website".

## Phase E — durability

**ALL THREE SHIPPED 2026-08-01.** `scripts/verify-backup-posture.mjs`, `lib/errors/budget.ts` (14 tests),
`GET /api/admin/errors/budget`, a banner on `/admin/error-log`, and the contact route stamping a failed
send onto the lead.

- [x] **E1-1 — Where are the backups? PART VERIFIED, part named as uncheckable — and the split is the
      point.** *"An unrehearsed backup is a belief."* A script that printed "backups: OK" from the three
      settings it CAN read would turn that belief into a green tick, which is worse than no script.
      **Verified against the live database:** `wal_level = logical` and `archive_mode = on` (so
      point-in-time recovery is *possible* — WAL carries enough to replay and is being archived), the
      database generating WAL, **291 public tables, 125 MB**, and the oldest business row dating to
      **2026-06-17** — which is how far back a restore has to reach to lose nothing.
      **Named as not checkable from a database connection**, with where to look and what for: the PITR
      retention window, the snapshot schedule and the age of the newest one, whether a restore of the
      ROWS has ever been performed, and — the one most likely to be forgotten — **Supabase Storage is
      not covered by the database backup at all.** A restored database with no files is a lead whose
      site plan is a broken link.
      **And the half that IS rehearsable has been rehearsed.** A restore has two parts, the schema and
      the rows. The schema part is rebuildable from this repo and now runs clean end to end **twice** —
      after two seeds were fixed that had never been run a second time (see the top of Phase A's commit
      history). That is the part that used to be quietly broken.

- [x] **E1-2 — What happens when Resend is down? SHIPPED.** The analysis asks two things and the answers
      were different. *Is the lead still captured?* — **already yes**, Slice Q1 writes the row regardless
      of the email outcome. *Does anyone know the email did not send?* — **no**: a `console.error`, which
      on a serverless host is a line in a log nobody reads, about a customer nobody replied to.
      So a failed send is now stamped **on the lead**, and the lead is given a follow-up date of TODAY —
      which drops it straight into the queue D1-2 built one phase earlier. **A failure that becomes a
      task in a list somebody already works is worth more than an alert to an inbox nobody configured.**
      The warning goes at the HEAD of the notes, because a note appended below a long enquiry is a note
      nobody scrolls to. The existing notes are READ rather than reconstructed from the intake input,
      which would have silently dropped the reference-number line — the one thing that lets the office
      match an inbox email to a row. And the whole update is fire-and-forget: the customer has already
      been told their enquiry was received, and it HAS been, so failing this must not turn a captured
      lead into a 500 for someone who did nothing wrong.

- [x] **E1-3 — Error budget. SHIPPED.** `/admin/error-log` was real, `apiErrorHandler` records to
      `error_reports` faithfully, and the answer to both halves of the question was no: nothing alerted,
      and the page showed you every error while leaving you to work out whether that was a lot.
      **A BUDGET, NOT A THRESHOLD**, because "alert when errors > N" is the shape that gets muted. A
      small app throws a handful of errors a week from bots hitting dead URLs; an alarm that fires on
      those is one somebody turns off in month two, after which nothing works and everything looks fine.
      **The signal is the CHANGE.** Forty a week steady is a known quantity; forty against six is a
      deploy that broke something. A spike is relative AND has a floor — without the floor, going from
      one error to two is an infinite proportional increase and the quietest possible week produces the
      loudest possible alarm.
      Grouped by ROUTE rather than by message, because ten stack traces from one broken endpoint are one
      problem and a message-keyed list shows them as ten. The sentence is built server-side so the API
      and the banner cannot word the same numbers two different ways — the same rule C1-2 and D1-2
      follow. And the quiet case says *"No errors recorded in the last 7 days"* rather than rendering
      nothing, because "no news" and "nothing was checked" look identical unless one of them says so.

---

## What is deliberately NOT in this document

- **A rewrite of anything.** Nothing here is architecturally wrong. The app's shape is sound and the
  problems are gaps, not misdesigns.
- **The D&D platform.** It has five planning docs of its own.
- **Feature requests.** The owner asked what could be *improved*, and the honest answer is that the highest
  value available is closing a public form that anyone can point a script at — not new features.

## Why this ordering

Phase A is first because it is the only phase where the *downside is unbounded*: everything else costs time,
while an unthrottled contact form can exhaust an email quota and take real customer enquiries down with it.
Phase B is second because it is the sweep that would have caught A. C and D are revenue. E is the one that
matters most on the day it matters at all.
